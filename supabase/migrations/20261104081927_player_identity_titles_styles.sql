-- player_identity_titles_styles

alter table public.profiles add column if not exists title text not null default 'rookie';
alter table public.profiles add column if not exists card_style text not null default 'ember';
grant select (title, card_style) on public.profiles to authenticated;

-- which titles / card styles a player has unlocked
create or replace function public.tag_unlocks(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'titles', (select jsonb_agg(t) from (
        select 'rookie' t
        union all select 'ghost' where exists (select 1 from badges where user_id = p.id and code = 'ghost')
        union all select 'shadow' where exists (select 1 from badges where user_id = p.id and code = 'full_clear')
        union all select 'marathoner' where exists (select 1 from badges where user_id = p.id and code = 'marathon')
        union all select 'bloodhound' where p.catches >= 5
        union all select 'phantom' where p.wins >= 3
        union all select 'veteran' where p.matches >= 10
        union all select 'legend' where p.wins >= 10
        union all select 'chief' where p.is_organiser) x),
    'styles', (select jsonb_agg(s) from (
        select 'ember' s union all select 'police' union all select 'midnight'
        union all select 'gold' where p.wins >= 1) y))
  from profiles p where p.id = p_user;
$$;

create or replace function public.set_identity(p_title text, p_style text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); u jsonb;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  u := tag_unlocks(uid);
  if p_title is not null then
    if not (u->'titles') ? p_title then raise exception 'That title is still locked'; end if;
    update profiles set title = p_title where id = uid;
  end if;
  if p_style is not null then
    if not (u->'styles') ? p_style then raise exception 'That card style is still locked'; end if;
    update profiles set card_style = p_style where id = uid;
  end if;
  return u;
end $$;
revoke all on function public.set_identity(text, text) from public, anon;
grant execute on function public.set_identity(text, text) to authenticated;
revoke all on function public.tag_unlocks(uuid) from public, anon, authenticated;

-- my_profile also reports what is unlocked
create or replace function public.my_profile()
returns jsonb language sql stable security definer set search_path = public as $function$
  select case when p.id is null then null else to_jsonb(p) || jsonb_build_object(
    'email', (select email from auth.users where id = auth.uid()),
    'badges', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'at', earned_at) order by earned_at), '[]'::jsonb) from badges where user_id = p.id),
    'application', (select status from organiser_applications where user_id = p.id),
    'friends_pending', (select count(*) from friendships where (a = p.id or b = p.id) and status = 'pending' and requested_by <> p.id),
    'invites', (select count(*) from invites i join rooms r on r.id = i.room_id where i.to_id = p.id and r.status = 'lobby'),
    'unlocks', tag_unlocks(p.id)) end
  from profiles p where p.id = auth.uid();
$function$;

-- room_state: include each player's title so it can be shown on the map and rosters
do $$
declare d text;
begin
  d := pg_get_functiondef('public.room_state(uuid,double precision,double precision,double precision,boolean,bigint)'::regprocedure);
  if position('''title'', p.title' in d) = 0 then
    d := replace(d, '''branch'', p.branch, ''year'', p.year,', '''branch'', p.branch, ''year'', p.year, ''title'', p.title,');
    execute d;
  end if;
end $$;
