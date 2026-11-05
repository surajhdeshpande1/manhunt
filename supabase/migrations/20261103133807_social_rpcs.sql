-- social_rpcs

create or replace function public.my_profile()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p.id is null then null else to_jsonb(p) || jsonb_build_object(
    'email', (select email from auth.users where id = auth.uid()),
    'badges', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'at', earned_at) order by earned_at), '[]'::jsonb) from badges where user_id = p.id),
    'application', (select status from organiser_applications where user_id = p.id),
    'friends_pending', (select count(*) from friendships where (a = p.id or b = p.id) and status = 'pending' and requested_by <> p.id),
    'invites', (select count(*) from invites i join rooms r on r.id = i.room_id where i.to_id = p.id and r.status = 'lobby')) end
  from profiles p where p.id = auth.uid();
$$;

create or replace function public.update_profile(p_full_name text, p_phone text, p_college text, p_branch text, p_year int)
returns void language plpgsql security definer set search_path = public as $$
begin
  update profiles set full_name = trim(p_full_name), phone = regexp_replace(p_phone, '[\s-]', '', 'g'),
         college = trim(p_college), branch = upper(trim(p_branch)), year = p_year
   where id = auth.uid();
end $$;

create or replace function public.public_profile(p_username text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'username', p.username, 'name', p.full_name, 'selfie', p.selfie_path, 'college', p.college,
    'branch', p.branch, 'year', p.year, 'matches', p.matches, 'wins', p.wins, 'catches', p.catches, 'tasks_done', p.tasks_done,
    'distance_m', round(p.distance_m::numeric),
    'badges', (select coalesce(jsonb_agg(code), '[]'::jsonb) from badges where user_id = p.id))
  from profiles p where p.username = lower(trim(p_username));
$$;

-- ORGANISERS -----------------------------------------------------------
create or replace function public.apply_organiser(p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select is_organiser from profiles where id = auth.uid()) then raise exception 'You are already an organiser'; end if;
  insert into organiser_applications (user_id, note) values (auth.uid(), left(trim(coalesce(p_note,'')), 300))
  on conflict (user_id) do update set note = excluded.note, status = 'pending', created_at = now(), decided_at = null;
end $$;

create or replace function public.owner_applications()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce((select is_owner from profiles where id = auth.uid()), false) then raise exception 'Owner only'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'note', a.note, 'status', a.status, 'at', a.created_at,
            'user', jsonb_build_object('id', p.id, 'username', p.username, 'name', p.full_name, 'selfie', p.selfie_path,
                                       'college', p.college, 'branch', p.branch, 'year', p.year, 'matches', p.matches))
            order by a.status = 'pending' desc, a.created_at desc), '[]'::jsonb)
          from organiser_applications a join profiles p on p.id = a.user_id);
end $$;

create or replace function public.owner_decide(p_app bigint, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if not coalesce((select is_owner from profiles where id = auth.uid()), false) then raise exception 'Owner only'; end if;
  update organiser_applications set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now()
   where id = p_app returning user_id into u;
  update profiles set is_organiser = p_approve where id = u and not is_owner;
end $$;

create or replace function public.owner_find_user(p_username text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce((select is_owner from profiles where id = auth.uid()), false) then raise exception 'Owner only'; end if;
  return (select jsonb_build_object('id', p.id, 'username', p.username, 'name', p.full_name, 'selfie', p.selfie_path,
            'email', u.email, 'phone', p.phone, 'is_organiser', p.is_organiser)
          from profiles p join auth.users u on u.id = p.id where p.username = lower(trim(p_username)));
end $$;

-- FRIENDS --------------------------------------------------------------
create or replace function public.friend_request(p_username text)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other uuid; f friendships;
begin
  select id into other from profiles where username = lower(trim(p_username));
  if other is null then raise exception 'No player called %', p_username; end if;
  if other = me then raise exception 'That is you'; end if;
  select * into f from friendships where a = least(me, other) and b = greatest(me, other);
  if found then
    if f.status = 'accepted' then return 'already'; end if;
    if f.requested_by <> me then update friendships set status = 'accepted' where a = f.a and b = f.b; return 'accepted'; end if;
    return 'pending';
  end if;
  insert into friendships (a, b, requested_by) values (least(me, other), greatest(me, other), me);
  return 'sent';
end $$;

create or replace function public.friend_respond(p_user uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if p_accept then
    update friendships set status = 'accepted' where a = least(me, p_user) and b = greatest(me, p_user) and requested_by = p_user;
  else
    delete from friendships where a = least(me, p_user) and b = greatest(me, p_user);
  end if;
end $$;

create or replace function public.my_friends()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'name', p.full_name, 'selfie', p.selfie_path,
           'college', p.college, 'wins', p.wins, 'matches', p.matches, 'status', f.status,
           'incoming', f.status = 'pending' and f.requested_by <> auth.uid())
           order by f.status = 'pending' desc, p.username), '[]'::jsonb)
  from friendships f join profiles p on p.id = case when f.a = auth.uid() then f.b else f.a end
  where f.a = auth.uid() or f.b = auth.uid();
$$;

create or replace function public.invite_friend(p_room uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r rooms;
begin
  select * into r from rooms where id = p_room;
  if not found or r.status <> 'lobby' then raise exception 'You can only invite while the room is in the lobby'; end if;
  if r.admin_id <> me and not exists (select 1 from room_members where room_id = p_room and user_id = me and status = 'accepted') then
    raise exception 'Join the room first'; end if;
  if not exists (select 1 from friendships where a = least(me, p_user) and b = greatest(me, p_user) and status = 'accepted') then
    raise exception 'You can only invite friends'; end if;
  insert into invites (room_id, from_id, to_id) values (p_room, me, p_user) on conflict (room_id, to_id) do nothing;
end $$;

create or replace function public.my_invites()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'room_id', r.id, 'room', r.name, 'is_public', r.is_public, 'at', i.created_at,
           'from', jsonb_build_object('username', p.username, 'selfie', p.selfie_path),
           'players', (select count(*) from room_members m where m.room_id = r.id and m.status = 'accepted'))
           order by i.created_at desc), '[]'::jsonb)
  from invites i join rooms r on r.id = i.room_id join profiles p on p.id = i.from_id
  where i.to_id = auth.uid() and r.status = 'lobby'
    and not exists (select 1 from room_members m where m.room_id = r.id and m.user_id = auth.uid() and m.status in ('accepted','pending'));
$$;

create or replace function public.dismiss_invite(p_id bigint)
returns void language sql security definer set search_path = public as $$
  delete from invites where id = p_id and to_id = auth.uid();
$$;

-- LEADERBOARDS ---------------------------------------------------------
create or replace function public.leaderboard(p_kind text, p_metric text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare col text := case p_metric when 'catches' then 'catches' when 'tasks' then 'tasks_done' when 'distance' then 'distance_m' else 'wins' end;
  res jsonb;
begin
  if p_kind = 'colleges' then
    execute format($q$
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object('college', college, 'value', round(sum(%1$I)::numeric), 'players', count(*), 'matches', sum(matches)) x
        from profiles where matches > 0 group by college order by sum(%1$I) desc, count(*) desc limit 50) s $q$, col) into res;
  else
    execute format($q$
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object('id', id, 'username', username, 'name', full_name, 'selfie', selfie_path, 'college', college,
               'branch', branch, 'value', round(%1$I::numeric), 'matches', matches, 'me', id = auth.uid()) x
        from profiles where matches > 0 order by %1$I desc, matches asc limit 50) s $q$, col) into res;
  end if;
  return res;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'my_profile()','update_profile(text,text,text,text,int)','public_profile(text)','apply_organiser(text)','owner_applications()',
    'owner_decide(bigint,boolean)','owner_find_user(text)','friend_request(text)','friend_respond(uuid,boolean)','my_friends()',
    'invite_friend(uuid,uuid)','my_invites()','dismiss_invite(bigint)','leaderboard(text,text)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- geo/settings helpers are harmless but keep them off the anon API too
revoke execute on function public.geo_hav(float8,float8,float8,float8) from anon;
revoke execute on function public.geo_contains(jsonb,float8,float8) from anon;
revoke execute on function public.geo_edge_dist(jsonb,float8,float8) from anon;
revoke execute on function public.geo_valid_poly(jsonb) from anon;
revoke execute on function public.tag_num(jsonb,text,float8,float8,float8) from anon;
revoke execute on function public.tag_clean_settings(jsonb) from anon;
revoke execute on function public.tag_set(public.rooms,text) from anon;
revoke execute on function public.tag_violation(public.rooms,float8,float8) from anon;
revoke execute on function public.tag_initial_zone(jsonb) from anon;
