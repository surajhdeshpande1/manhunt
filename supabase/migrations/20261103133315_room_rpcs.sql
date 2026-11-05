-- room_rpcs

create or replace function public.tag_gen_code() returns text language plpgsql volatile as $$
declare alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text; i int;
begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from rooms where code = c);
  end loop;
  return c;
end $$;
revoke execute on function public.tag_gen_code() from public, anon, authenticated;

create or replace function public.tag_admin_room(p_room uuid) returns public.rooms
language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  select * into r from rooms where id = p_room for update;
  if not found then raise exception 'Room not found'; end if;
  if r.admin_id <> auth.uid() then raise exception 'Only the room admin can do that'; end if;
  return r;
end $$;
revoke execute on function public.tag_admin_room(uuid) from public, anon, authenticated;

-- ROOM CREATION & SETUP ------------------------------------------------
create or replace function public.create_room(p_name text, p_public boolean, p_password text default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); org boolean; rid uuid;
begin
  select is_organiser into org from profiles where id = uid;
  if org is null then raise exception 'Finish your profile first'; end if;
  if p_public and not org then raise exception 'Only approved organisers can host public rooms'; end if;
  if not p_public and (p_password is null or char_length(p_password) < 4) then raise exception 'Private rooms need a password of at least 4 characters'; end if;
  if (select count(*) from rooms where admin_id = uid and status <> 'ended') >= 3 then raise exception 'You already host 3 open rooms. End one first.'; end if;
  insert into rooms (code, name, is_public, password_hash, admin_id)
  values (tag_gen_code(), trim(p_name), p_public, case when p_public then null else crypt(p_password, gen_salt('bf')) end, uid)
  returning id into rid;
  return rid;
end $$;

create or replace function public.update_room(p_room uuid, p_name text default null, p_settings jsonb default null, p_password text default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare r rooms;
begin
  r := tag_admin_room(p_room);
  if r.status <> 'lobby' then raise exception 'Settings lock once the match starts'; end if;
  update rooms set
    name = coalesce(nullif(trim(p_name),''), name),
    settings = case when p_settings is null then settings else tag_clean_settings(settings || p_settings) end,
    password_hash = case when not is_public and p_password is not null and char_length(p_password) >= 4 then crypt(p_password, gen_salt('bf')) else password_hash end
  where id = p_room;
end $$;

create or replace function public.set_area(p_room uuid, p_boundary jsonb, p_nogo jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms; poly jsonb;
begin
  r := tag_admin_room(p_room);
  if r.status <> 'lobby' then raise exception 'The play area locks once the match starts'; end if;
  if not geo_valid_poly(p_boundary) then raise exception 'The boundary needs 3 to 60 points'; end if;
  if jsonb_typeof(coalesce(p_nogo,'[]')) <> 'array' or jsonb_array_length(coalesce(p_nogo,'[]')) > 10 then raise exception 'Up to 10 no-go zones'; end if;
  for poly in select jsonb_array_elements(coalesce(p_nogo,'[]')) loop
    if not geo_valid_poly(poly) then raise exception 'Each no-go zone needs 3 to 60 points'; end if;
  end loop;
  update rooms set boundary = p_boundary, nogo = coalesce(p_nogo,'[]'), zone = tag_initial_zone(p_boundary) where id = p_room;
end $$;

-- DISCOVERY ------------------------------------------------------------
create or replace function public.list_public_rooms()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'status') = 'lobby' desc, (x->>'created_at') desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', r.id, 'name', r.name, 'status', r.status, 'max', r.max_players, 'created_at', r.created_at,
      'players', (select count(*) from room_members m where m.room_id = r.id and m.status = 'accepted'),
      'admin', jsonb_build_object('username', p.username, 'selfie', p.selfie_path, 'college', p.college),
      'has_area', r.boundary is not null,
      'my_status', (select status from room_members m where m.room_id = r.id and m.user_id = auth.uid()),
      'is_admin', r.admin_id = auth.uid()) x
    from rooms r join profiles p on p.id = r.admin_id
    where r.is_public and r.status <> 'ended' and r.created_at > now() - interval '3 days'
  ) s;
$$;

create or replace function public.my_rooms()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) from (
    select jsonb_build_object('id', r.id, 'name', r.name, 'status', r.status, 'is_public', r.is_public, 'created_at', r.created_at,
      'is_admin', r.admin_id = auth.uid(),
      'my_status', m.status,
      'players', (select count(*) from room_members mm where mm.room_id = r.id and mm.status = 'accepted')) x
    from rooms r left join room_members m on m.room_id = r.id and m.user_id = auth.uid()
    where (r.admin_id = auth.uid() or m.status in ('accepted','pending'))
      and (r.status <> 'ended' or r.ended_at > now() - interval '3 hours')
  ) s;
$$;

-- JOINING --------------------------------------------------------------
create or replace function public.request_join(p_room uuid default null, p_code text default null, p_password text default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); r rooms; m room_members; invited boolean;
begin
  if not exists (select 1 from profiles where id = uid and selfie_path is not null) then raise exception 'Add your selfie before joining a room'; end if;
  if p_room is not null then select * into r from rooms where id = p_room;
  else select * into r from rooms where code = upper(trim(coalesce(p_code,''))); end if;
  if not found then raise exception 'Wrong room ID or password'; end if;
  if r.admin_id = uid then return r.id; end if;
  select * into m from room_members where room_id = r.id and user_id = uid;
  if found and m.status in ('accepted','pending') then return r.id; end if;
  if found and m.status = 'removed' then raise exception 'The admin removed you from this room'; end if;
  if r.status <> 'lobby' then raise exception 'This match has already started'; end if;
  invited := exists (select 1 from invites where room_id = r.id and to_id = uid);
  if not r.is_public and not invited then
    if p_password is null or r.password_hash is null or r.password_hash <> crypt(p_password, r.password_hash) then
      raise exception 'Wrong room ID or password';
    end if;
  end if;
  if (select count(*) from room_members where room_id = r.id and status = 'accepted') >= r.max_players then raise exception 'This room is full'; end if;
  insert into room_members (room_id, user_id, status, via_invite) values (r.id, uid, 'pending', invited)
  on conflict (room_id, user_id) do update set status = 'pending', role = null, via_invite = excluded.via_invite, joined_at = now();
  return r.id;
end $$;

create or replace function public.leave_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r rooms; m room_members;
begin
  select * into r from rooms where id = p_room for update;
  if r.admin_id = uid then raise exception 'You are the admin. End the match instead.'; end if;
  select * into m from room_members where room_id = p_room and user_id = uid;
  if not found then return; end if;
  if r.status in ('hiding','hunt','paused') and m.status = 'accepted' and m.alive then
    perform tag_eliminate(p_room, uid, 'left', null);
  end if;
  update room_members set status = 'left' where room_id = p_room and user_id = uid and status <> 'removed';
  delete from positions where room_id = p_room and user_id = uid;
  if r.status in ('hiding','hunt') then perform tag_advance(p_room); end if;
end $$;

-- ADMIN: LOBBY ---------------------------------------------------------
create or replace function public.decide_request(p_room uuid, p_user uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  r := tag_admin_room(p_room);
  if r.status <> 'lobby' then raise exception 'The match has started'; end if;
  if p_accept and (select count(*) from room_members where room_id = p_room and status = 'accepted') >= r.max_players then
    raise exception 'Room is full (% players)', r.max_players; end if;
  update room_members set status = case when p_accept then 'accepted' else 'rejected' end
   where room_id = p_room and user_id = p_user and status = 'pending';
end $$;

create or replace function public.accept_all(p_room uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r rooms; free int; n int;
begin
  r := tag_admin_room(p_room);
  if r.status <> 'lobby' then raise exception 'The match has started'; end if;
  free := r.max_players - (select count(*) from room_members where room_id = p_room and status = 'accepted');
  with picked as (select user_id from room_members where room_id = p_room and status = 'pending' order by joined_at limit greatest(free,0))
  update room_members m set status = 'accepted' from picked where m.room_id = p_room and m.user_id = picked.user_id;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.set_role(p_room uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  r := tag_admin_room(p_room);
  if r.status <> 'lobby' then raise exception 'Roles lock once the match starts'; end if;
  if p_role is not null and p_role not in ('runner','hunter') then raise exception 'Unknown role'; end if;
  update room_members set role = p_role where room_id = p_room and user_id = p_user and status = 'accepted';
end $$;

create or replace function public.shuffle_roles(p_room uuid, p_hunters int)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms; n int;
begin
  r := tag_admin_room(p_room);
  if r.status <> 'lobby' then raise exception 'Roles lock once the match starts'; end if;
  select count(*) into n from room_members where room_id = p_room and status = 'accepted';
  if p_hunters < 1 or p_hunters >= n then raise exception 'Pick between 1 and % hunters', greatest(n-1,1); end if;
  with ranked as (select user_id, row_number() over (order by random()) rn from room_members where room_id = p_room and status = 'accepted')
  update room_members m set role = case when ranked.rn <= p_hunters then 'hunter' else 'runner' end
    from ranked where m.room_id = p_room and m.user_id = ranked.user_id;
end $$;

create or replace function public.remove_member(p_room uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  r := tag_admin_room(p_room);
  if r.status in ('hiding','hunt','paused') then perform tag_eliminate(p_room, p_user, 'removed', null); end if;
  update room_members set status = 'removed' where room_id = p_room and user_id = p_user;
  delete from positions where room_id = p_room and user_id = p_user;
  if r.status in ('hiding','hunt') then perform tag_advance(p_room); end if;
end $$;

-- ADMIN: MATCH FLOW ----------------------------------------------------
create or replace function public.start_match(p_room uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare r rooms; nh int; nr int; nx int;
begin
  r := tag_admin_room(p_room);
  if r.status <> 'lobby' then raise exception 'Already started'; end if;
  if r.boundary is null then raise exception 'Draw the play-area boundary first'; end if;
  select count(*) filter (where role = 'hunter'), count(*) filter (where role = 'runner'), count(*) filter (where role is null)
    into nh, nr, nx from room_members where room_id = p_room and status = 'accepted';
  if nx > 0 then raise exception 'Assign a role to every player (% left)', nx; end if;
  if nh < 1 or nr < 1 then raise exception 'You need at least 1 hunter and 1 runner'; end if;
  update room_members set status = 'rejected' where room_id = p_room and status = 'pending';
  update room_members set alive = true, out_reason = null, out_at = null, caught_by = null, tasks_done = 0,
         task_seed = null, task_kind = null, task_started_at = null, last_task_at = null, catches = 0, distance_m = 0,
         oob_since = null, oob_reason = null, spoof_strikes = 0, qr_token = encode(gen_random_bytes(12),'hex')
   where room_id = p_room and status = 'accepted';
  delete from positions where room_id = p_room;
  update rooms set status = 'hiding', hide_ends_at = now() + make_interval(secs => tag_set(r,'hide_secs')),
         zone = tag_initial_zone(r.boundary), zone_next = null, runners_at_start = nr,
         hunt_at = null, ends_at = null, next_shrink_at = null, forced_reveal_until = null, winner = null, end_reason = null
   where id = p_room;
  perform tag_event(p_room, 'match_start', 'all', auth.uid(), null, jsonb_build_object('hunters', nh, 'runners', nr));
end $$;

create or replace function public.start_hunt(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  r := tag_admin_room(p_room);
  if r.status <> 'hiding' then raise exception 'The hunt can only start after the hide phase'; end if;
  if now() < r.hide_ends_at - interval '2 seconds' then raise exception 'The hide timer is still running'; end if;
  update rooms set status = 'hunt', hunt_at = now(), ends_at = now() + make_interval(secs => tag_set(r,'match_secs')),
         next_shrink_at = now() + make_interval(secs => tag_set(r,'shrink_every')),
         zone_next = tag_next_zone(r, r.zone)
   where id = p_room;
  perform tag_event(p_room, 'hunt', 'all', auth.uid(), null, '{}');
end $$;

create or replace function public.pause_match(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  r := tag_admin_room(p_room);
  if r.status not in ('hiding','hunt') then raise exception 'Nothing to pause'; end if;
  update rooms set paused_from = status, status = 'paused', paused_at = now() where id = p_room;
  update room_members set oob_since = null where room_id = p_room;
  perform tag_event(p_room, 'pause', 'all', auth.uid(), null, '{}');
end $$;

create or replace function public.resume_match(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms; dur interval;
begin
  r := tag_admin_room(p_room);
  if r.status <> 'paused' then raise exception 'The match is not paused'; end if;
  dur := now() - r.paused_at;
  update rooms set status = paused_from, paused_from = null, paused_at = null,
         hide_ends_at = hide_ends_at + dur, hunt_at = hunt_at + dur, ends_at = ends_at + dur,
         next_shrink_at = next_shrink_at + dur, forced_reveal_until = forced_reveal_until + dur
   where id = p_room;
  update room_members set oob_since = null, last_task_at = last_task_at + dur where room_id = p_room;
  perform tag_event(p_room, 'resume', 'all', auth.uid(), null, '{}');
end $$;

create or replace function public.force_reveal(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  r := tag_admin_room(p_room);
  if r.status <> 'hunt' then raise exception 'Reveals only work during the hunt'; end if;
  update rooms set forced_reveal_until = now() + make_interval(secs => tag_set(r,'reveal_for')) where id = p_room;
  perform tag_event(p_room, 'reveal', 'all', auth.uid(), null, jsonb_build_object('forced', true));
end $$;

create or replace function public.force_shrink(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  r := tag_admin_room(p_room);
  if r.status <> 'hunt' then raise exception 'The zone only shrinks during the hunt'; end if;
  perform tag_do_shrink(p_room, true);
end $$;

create or replace function public.end_match(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  r := tag_admin_room(p_room);
  if r.status = 'lobby' then update rooms set status = 'ended', ended_at = now(), winner = 'none', end_reason = 'closed' where id = p_room; return; end if;
  if r.status = 'ended' then return; end if;
  perform tag_finish(p_room, 'none', 'admin');
end $$;

create or replace function public.broadcast(p_room uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  r := tag_admin_room(p_room);
  if char_length(trim(coalesce(p_text,''))) not between 1 and 200 then raise exception 'Keep announcements to 200 characters'; end if;
  perform tag_event(p_room, 'broadcast', 'all', auth.uid(), null, jsonb_build_object('text', trim(p_text)));
end $$;

create or replace function public.admin_mark_caught(p_room uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  r := tag_admin_room(p_room);
  if r.status not in ('hunt','paused') then raise exception 'Only during the hunt'; end if;
  perform tag_eliminate(p_room, p_user, 'caught', null);
  perform tag_advance(p_room);
end $$;

-- PLAYER ACTIONS -------------------------------------------------------
create or replace function public.catch_runner(p_room uuid, p_token text, p_lat float8 default null, p_lng float8 default null, p_acc float8 default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r rooms; h room_members; t room_members; hp positions; tp positions; d float8; rad float8;
begin
  perform tag_advance(p_room);
  select * into r from rooms where id = p_room for update;
  if r.status <> 'hunt' then raise exception 'The hunt is not on right now'; end if;
  select * into h from room_members where room_id = p_room and user_id = uid and status = 'accepted';
  if not found or h.role <> 'hunter' then raise exception 'Only hunters can catch runners'; end if;
  if not h.alive then raise exception 'You are out of this match'; end if;
  select * into t from room_members where room_id = p_room and qr_token = p_token and status = 'accepted';
  if not found or t.role <> 'runner' then raise exception 'That QR does not belong to a runner in this match'; end if;
  if not t.alive then raise exception 'That runner is already out'; end if;
  rad := tag_set(r,'catch_radius_m');
  select * into tp from positions where room_id = p_room and user_id = t.user_id;
  if tp.user_id is null or tp.at < now() - interval '30 seconds' then
    raise exception 'The runner''s GPS has not updated in the last 30 s. Ask the admin to confirm this catch.'; end if;
  if p_lat is not null and p_lng is not null and p_acc is not null and p_acc <= tag_set(r,'max_acc_m') * 2 then
    d := geo_hav(p_lat, p_lng, tp.lat, tp.lng);
  else
    select * into hp from positions where room_id = p_room and user_id = uid;
    if hp.user_id is null or hp.at < now() - interval '30 seconds' then raise exception 'Your GPS signal is too weak to confirm a catch. Step into the open and try again.'; end if;
    d := geo_hav(hp.lat, hp.lng, tp.lat, tp.lng);
  end if;
  if d > rad then raise exception 'Too far: GPS puts you % m apart. Get within % m.', round(d), round(rad); end if;
  perform tag_eliminate(p_room, t.user_id, 'caught', uid);
  perform tag_advance(p_room);
  return jsonb_build_object('caught', t.user_id, 'username', (select username from profiles where id = t.user_id), 'distance', round(d));
end $$;

create or replace function public.start_task(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r rooms; m room_members; cd timestamptz; per int;
begin
  perform tag_advance(p_room);
  select * into r from rooms where id = p_room;
  if r.status <> 'hunt' then raise exception 'Tasks unlock when the hunt begins'; end if;
  select * into m from room_members where room_id = p_room and user_id = uid and status = 'accepted' for update;
  if not found or m.role <> 'runner' then raise exception 'Only runners do tasks'; end if;
  if not m.alive then raise exception 'You are out of this match'; end if;
  if m.oob_since is not null then raise exception 'Tasks are locked while you are outside the zone'; end if;
  per := tag_set(r,'tasks_per_runner')::int;
  if m.tasks_done >= per then raise exception 'All your tasks are done'; end if;
  cd := m.last_task_at + make_interval(secs => tag_set(r,'cooldown_secs'));
  if m.task_seed is null and cd > now() then raise exception 'Cooldown: % s left', ceil(extract(epoch from cd - now())); end if;
  if m.task_seed is null then
    update room_members set task_seed = floor(random() * 2000000000)::int,
           task_kind = (m.tasks_done + abs(hashtext(p_room::text || uid::text))) % 5,
           task_started_at = now()
     where room_id = p_room and user_id = uid returning * into m;
  end if;
  return jsonb_build_object('seed', m.task_seed, 'kind', m.task_kind, 'index', m.tasks_done + 1, 'of', per, 'started_at', m.task_started_at);
end $$;

create or replace function public.complete_task(p_room uuid, p_seed int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r rooms; m room_members;
begin
  perform tag_advance(p_room);
  select * into r from rooms where id = p_room;
  if r.status <> 'hunt' then raise exception 'The hunt is not on right now'; end if;
  select * into m from room_members where room_id = p_room and user_id = uid and status = 'accepted' for update;
  if not found or m.role <> 'runner' or not m.alive then raise exception 'You cannot do tasks right now'; end if;
  if m.task_seed is null or m.task_seed <> p_seed then raise exception 'That task has expired. Start a new one.'; end if;
  if m.oob_since is not null then raise exception 'Tasks are locked while you are outside the zone'; end if;
  if now() < m.task_started_at + interval '4 seconds' then raise exception 'Too fast'; end if;
  update room_members set tasks_done = tasks_done + 1, last_task_at = now(), task_seed = null, task_kind = null, task_started_at = null
   where room_id = p_room and user_id = uid;
  perform tag_event(p_room, 'task', 'admin', uid, null, jsonb_build_object('n', m.tasks_done + 1));
  perform tag_advance(p_room);
  return tag_progress(p_room);
end $$;

create or replace function public.fail_task(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r rooms;
begin
  select * into r from rooms where id = p_room;
  update room_members set task_seed = null, task_kind = null, task_started_at = null,
         last_task_at = now() - make_interval(secs => tag_set(r,'cooldown_secs')) + interval '10 seconds'
   where room_id = p_room and user_id = uid and task_seed is not null;
end $$;

create or replace function public.send_sos(p_room uuid, p_lat float8, p_lng float8)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if not exists (select 1 from room_members where room_id = p_room and user_id = uid and status = 'accepted') then raise exception 'Not in this room'; end if;
  perform tag_event(p_room, 'sos', 'admin', uid, null,
    jsonb_build_object('lat', p_lat, 'lng', p_lng, 'username', (select username from profiles where id = uid), 'phone', (select phone from profiles where id = uid)));
end $$;

create or replace function public.send_message(p_room uuid, p_channel text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not tag_can_read_channel(p_room, p_channel) then raise exception 'You cannot post in this channel'; end if;
  if char_length(trim(coalesce(p_body,''))) not between 1 and 300 then raise exception 'Messages are 1 to 300 characters'; end if;
  insert into messages (room_id, channel, user_id, body) values (p_room, p_channel, auth.uid(), trim(p_body));
end $$;

-- THE TICK: report position, advance the game, return everything this viewer may see
create or replace function public.room_state(p_room uuid, p_lat float8 default null, p_lng float8 default null,
                                             p_acc float8 default null, p_mock boolean default false, p_after bigint default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r rooms; me room_members; is_admin boolean; is_member boolean := false;
  prev positions; d float8; dt float8; viol text; strikes int; v_all boolean; v_reveal boolean := false;
  t timestamptz; elapsed float8; cyc float8; reveal_until timestamptz; next_reveal timestamptz; can_see boolean;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  perform tag_advance(p_room);
  select * into r from rooms where id = p_room;
  if not found then raise exception 'Room not found'; end if;
  is_admin := r.admin_id = uid;
  select * into me from room_members where room_id = p_room and user_id = uid;
  is_member := found and me.status = 'accepted';

  if is_member and me.alive and r.status in ('hiding','hunt') and p_lat is not null and p_lng is not null
     and abs(p_lat) <= 90 and abs(p_lng) <= 180 then
    strikes := me.spoof_strikes + case when p_mock then 3 else 0 end;
    if p_acc is not null and p_acc > 0 and p_acc <= tag_set(r,'max_acc_m') then
      select * into prev from positions where room_id = p_room and user_id = uid;
      if prev.user_id is not null then
        d := geo_hav(prev.lat, prev.lng, p_lat, p_lng);
        dt := greatest(0.5, extract(epoch from now() - prev.at));
        if dt <= 20 and d > 80 and d / dt > 15 then strikes := strikes + 1; end if;
        if d >= 3 and d / dt < 12 then update room_members set distance_m = distance_m + d where room_id = p_room and user_id = uid; end if;
      end if;
      insert into positions (room_id, user_id, lat, lng, acc, at) values (p_room, uid, p_lat, p_lng, p_acc, now())
        on conflict (room_id, user_id) do update set lat = excluded.lat, lng = excluded.lng, acc = excluded.acc, at = excluded.at;
      viol := tag_violation(r, p_lat, p_lng);
      update room_members set spoof_strikes = strikes,
             oob_since = case when viol is null then null else coalesce(oob_since, now()) end, oob_reason = viol
       where room_id = p_room and user_id = uid;
    else
      update room_members set spoof_strikes = strikes where room_id = p_room and user_id = uid;
    end if;
    if strikes >= 3 then perform tag_eliminate(p_room, uid, 'spoof', null); end if;
    perform tag_advance(p_room);
    select * into r from rooms where id = p_room;
    select * into me from room_members where room_id = p_room and user_id = uid;
  end if;

  can_see := is_admin or is_member;
  v_all := is_admin or (is_member and not me.alive) or r.status = 'ended';
  t := case when r.status = 'paused' then r.paused_at else now() end;
  if (r.status = 'hunt' or (r.status = 'paused' and r.paused_from = 'hunt')) and r.hunt_at is not null then
    elapsed := greatest(0, extract(epoch from t - r.hunt_at)); cyc := tag_set(r,'reveal_every');
    if r.status = 'hunt' and elapsed >= cyc and mod(elapsed::numeric, cyc::numeric) < tag_set(r,'reveal_for')::numeric then
      v_reveal := true;
      reveal_until := r.hunt_at + make_interval(secs => floor(elapsed / cyc) * cyc + tag_set(r,'reveal_for'));
    end if;
    if r.status = 'hunt' and r.forced_reveal_until > now() then
      v_reveal := true; reveal_until := greatest(coalesce(reveal_until, r.forced_reveal_until), r.forced_reveal_until);
    end if;
    next_reveal := r.hunt_at + make_interval(secs => (floor(elapsed / cyc) + 1) * cyc);
  end if;

  return jsonb_build_object(
    'now', now(),
    'is_admin', is_admin,
    'room', jsonb_build_object('id', r.id, 'code', case when can_see then r.code end, 'name', r.name, 'is_public', r.is_public,
        'status', r.status, 'paused_from', r.paused_from, 'settings', r.settings, 'boundary', r.boundary, 'nogo', r.nogo,
        'zone', r.zone, 'zone_next', r.zone_next, 'hide_ends_at', r.hide_ends_at, 'hunt_at', r.hunt_at, 'ends_at', r.ends_at,
        'next_shrink_at', r.next_shrink_at, 'paused_at', r.paused_at, 'ended_at', r.ended_at, 'winner', r.winner,
        'end_reason', r.end_reason, 'max_players', r.max_players,
        'admin', (select jsonb_build_object('id', id, 'username', username, 'name', full_name, 'selfie', selfie_path) from profiles where id = r.admin_id)),
    'me', case when me.user_id is null then null else jsonb_build_object(
        'status', me.status, 'role', case when r.status <> 'lobby' then me.role end, 'alive', me.alive, 'out_reason', me.out_reason,
        'tasks', me.tasks_done, 'catches', me.catches, 'distance', round(me.distance_m::numeric),
        'cooldown_until', me.last_task_at + make_interval(secs => tag_set(r,'cooldown_secs')),
        'task_active', me.task_seed is not null, 'oob_since', me.oob_since, 'oob_reason', me.oob_reason, 'strikes', me.spoof_strikes,
        'qr', case when r.status in ('hiding','hunt','paused') and me.role = 'runner' and me.alive and me.status = 'accepted' then me.qr_token end) end,
    'reveal', jsonb_build_object('active', v_reveal, 'until', reveal_until, 'next_at', next_reveal),
    'progress', case when r.status <> 'lobby' and can_see then tag_progress(p_room) end,
    'members', case when not can_see then '[]'::jsonb else (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', p.id, 'username', p.username, 'name', p.full_name, 'selfie', p.selfie_path, 'college', p.college,
          'branch', p.branch, 'year', p.year, 'status', m.status,
          'role', case when is_admin or r.status <> 'lobby' then m.role end,
          'alive', m.alive, 'out_reason', m.out_reason, 'tasks', m.tasks_done, 'catches', m.catches,
          'distance', case when r.status = 'ended' then round(m.distance_m::numeric) end,
          'phone', case when is_admin then p.phone end,
          'oob', case when is_admin then m.oob_since is not null end,
          'invite', m.via_invite) order by m.joined_at), '[]'::jsonb)
        from room_members m join profiles p on p.id = m.user_id
        where m.room_id = p_room and (m.status = 'accepted' or (is_admin and m.status = 'pending')
              or (r.status = 'ended' and m.role is not null and m.status in ('accepted','left','removed')))) end,
    'positions', case when not can_see or r.status in ('lobby','ended') then '[]'::jsonb else (
        select coalesce(jsonb_agg(jsonb_build_object('id', ps.user_id, 'lat', ps.lat, 'lng', ps.lng, 'acc', ps.acc, 'at', ps.at, 'role', m.role)), '[]'::jsonb)
        from positions ps join room_members m on m.room_id = ps.room_id and m.user_id = ps.user_id
        where ps.room_id = p_room and m.alive and m.status = 'accepted'
          and (ps.user_id = uid or v_all or m.role = me.role or (me.role = 'hunter' and m.role = 'runner' and v_reveal))) end,
    'events', case when not can_see then '[]'::jsonb else (
        select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]'::jsonb) from (
          select id, kind, actor, target, data, at from events
          where room_id = p_room and id > coalesce(p_after, 0)
            and (vis = 'all' or (vis = 'admin' and is_admin) or (vis = 'hunters' and (is_admin or me.role = 'hunter')))
          order by id desc limit 60) e) end
  );
end $$;

-- grants: client RPCs for signed-in users only
do $$
declare f text;
begin
  foreach f in array array[
    'create_room(text,boolean,text)','update_room(uuid,text,jsonb,text)','set_area(uuid,jsonb,jsonb)','list_public_rooms()','my_rooms()',
    'request_join(uuid,text,text)','leave_room(uuid)','decide_request(uuid,uuid,boolean)','accept_all(uuid)','set_role(uuid,uuid,text)',
    'shuffle_roles(uuid,int)','remove_member(uuid,uuid)','start_match(uuid)','start_hunt(uuid)','pause_match(uuid)','resume_match(uuid)',
    'force_reveal(uuid)','force_shrink(uuid)','end_match(uuid)','broadcast(uuid,text)','admin_mark_caught(uuid,uuid)',
    'catch_runner(uuid,text,float8,float8,float8)','start_task(uuid)','complete_task(uuid,int)','fail_task(uuid)',
    'send_sos(uuid,float8,float8)','send_message(uuid,text,text)','room_state(uuid,float8,float8,float8,boolean,bigint)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.tag_can_read_channel(uuid,text) from anon;
