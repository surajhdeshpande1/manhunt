-- 20 task types: the admin picks which are in play and how many per runner (1-99);
-- difficulty grows with each player's mastery of a type and with their progress in the match.
-- Lobby ready-up. Freehand play areas (up to 200 points).

alter table public.room_members add column if not exists last_task_kind int;
alter table public.room_members add column if not exists ready boolean not null default false;
alter table public.profiles add column if not exists task_mastery jsonb not null default '{}'::jsonb;

create or replace function public.tag_clean_settings(s jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare out jsonb; c timestamptz; kinds jsonb;
begin
  begin c := (s->>'curfew_at')::timestamptz; exception when others then c := null; end;
  out := jsonb_build_object(
    'hide_secs',        round(tag_num(s,'hide_secs',30,1800,420)),
    'tasks_per_runner', round(tag_num(s,'tasks_per_runner',1,99,10)),
    'cooldown_secs',    round(tag_num(s,'cooldown_secs',0,600,30)),
    'win_pct',          round(tag_num(s,'win_pct',10,100,70)),
    'reveal_every',     round(tag_num(s,'reveal_every',30,1800,120)),
    'reveal_for',       round(tag_num(s,'reveal_for',5,600,45)),
    'shrink_every',     round(tag_num(s,'shrink_every',60,3600,300)),
    'shrink_factor',    tag_num(s,'shrink_factor',0.3,0.95,0.8),
    'min_zone_m',       round(tag_num(s,'min_zone_m',20,2000,60)),
    'match_secs',       round(tag_num(s,'match_secs',300,14400,2400)),
    'catch_radius_m',   round(tag_num(s,'catch_radius_m',5,200,30)),
    'buffer_m',         round(tag_num(s,'buffer_m',0,100,10)),
    'grace_secs',       round(tag_num(s,'grace_secs',3,120,10)),
    'max_acc_m',        round(tag_num(s,'max_acc_m',10,200,35)),
    'curfew_at',        to_jsonb(c));
  if (out->>'reveal_for')::float8 > (out->>'reveal_every')::float8 then
    out := jsonb_set(out, '{reveal_for}', out->'reveal_every');
  end if;
  select coalesce(jsonb_agg(distinct k order by k), '[]'::jsonb) into kinds
    from (select case when v ~ '^[0-9]{1,2}$' then v::int end as k
            from jsonb_array_elements_text(case when jsonb_typeof(s->'task_kinds') = 'array' then s->'task_kinds' else '[]'::jsonb end) as t(v)) x
   where k between 0 and 19;
  if jsonb_array_length(kinds) = 0 then kinds := (select jsonb_agg(g) from generate_series(0,19) g); end if;
  out := out || jsonb_build_object(
    'event', case when s->>'event' in ('diwali','halloween','fest','holi') then s->>'event' else 'none' end,
    'task_kinds', kinds,
    'task_difficulty', case when s->>'task_difficulty' in ('easy','hard') then s->>'task_difficulty' else 'normal' end);
  return out;
end $$;

update public.rooms set settings = public.tag_clean_settings(settings) where status <> 'ended';

create or replace function public.tag_task_level(r rooms, m room_members, uid uuid)
returns int language sql stable security definer set search_path = public as $$
  select greatest(1, least(5,
    1 + least(2, coalesce((select (task_mastery->>(m.task_kind::text))::int from profiles where id = uid), 0) / 3)
      + least(2, m.tasks_done / 4)
      + case coalesce(r.settings->>'task_difficulty','normal') when 'easy' then -1 when 'hard' then 1 else 0 end));
$$;
revoke all on function public.tag_task_level(rooms, room_members, uuid) from public, anon, authenticated;

create or replace function public.start_task(p_room uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r rooms; m room_members; cd timestamptz; per int; kinds int[]; pick int;
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
    select coalesce(array_agg(k), '{}') into kinds
      from (select case when v ~ '^[0-9]{1,2}$' then v::int end as k
              from jsonb_array_elements_text(coalesce(r.settings->'task_kinds', '[]'::jsonb)) as t(v)) x
     where k between 0 and 19;
    if coalesce(array_length(kinds, 1), 0) = 0 then kinds := array(select generate_series(0, 19)); end if;
    -- never the same type twice in a row
    if array_length(kinds, 1) > 1 and m.last_task_kind is not null then kinds := array_remove(kinds, m.last_task_kind); end if;
    pick := kinds[1 + floor(random() * array_length(kinds, 1))::int];
    update room_members set task_seed = floor(random() * 2000000000)::int, task_kind = pick, task_started_at = now()
     where room_id = p_room and user_id = uid returning * into m;
  end if;
  return jsonb_build_object('seed', m.task_seed, 'kind', m.task_kind, 'index', m.tasks_done + 1, 'of', per,
    'started_at', m.task_started_at, 'level', tag_task_level(r, m, uid));
end $$;

create or replace function public.complete_task(p_room uuid, p_seed integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r rooms; m room_members; k text;
begin
  perform tag_advance(p_room);
  select * into r from rooms where id = p_room;
  if r.status <> 'hunt' then raise exception 'The hunt is not on right now'; end if;
  select * into m from room_members where room_id = p_room and user_id = uid and status = 'accepted' for update;
  if not found or m.role <> 'runner' or not m.alive then raise exception 'You cannot do tasks right now'; end if;
  if m.task_seed is null or m.task_seed <> p_seed then raise exception 'That task has expired. Start a new one.'; end if;
  if m.oob_since is not null then raise exception 'Tasks are locked while you are outside the zone'; end if;
  if now() < m.task_started_at + interval '4 seconds' then raise exception 'Too fast'; end if;
  k := coalesce(m.task_kind, 0)::text;
  update profiles set task_mastery = jsonb_set(coalesce(task_mastery, '{}'::jsonb), array[k], to_jsonb(coalesce((task_mastery->>k)::int, 0) + 1))
   where id = uid;
  update room_members set tasks_done = tasks_done + 1, last_task_at = now(), last_task_kind = m.task_kind,
         task_seed = null, task_kind = null, task_started_at = null
   where room_id = p_room and user_id = uid;
  perform tag_event(p_room, 'task', 'admin', uid, null, jsonb_build_object('n', m.tasks_done + 1, 'kind', m.task_kind));
  perform tag_advance(p_room);
  return tag_progress(p_room);
end $$;

create or replace function public.fail_task(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r rooms;
begin
  select * into r from rooms where id = p_room;
  update room_members set last_task_kind = task_kind, task_seed = null, task_kind = null, task_started_at = null,
         last_task_at = now() - make_interval(secs => tag_set(r,'cooldown_secs')) + interval '10 seconds'
   where room_id = p_room and user_id = uid and task_seed is not null;
end $$;

-- freehand outlines carry more points
create or replace function public.geo_valid_poly(poly jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare n int; i int;
begin
  if poly is null or jsonb_typeof(poly) <> 'array' then return false; end if;
  n := jsonb_array_length(poly);
  if n < 3 or n > 200 then return false; end if;
  for i in 0..n-1 loop
    if jsonb_typeof(poly->i) <> 'array' or jsonb_array_length(poly->i) <> 2 then return false; end if;
    if jsonb_typeof(poly->i->0) <> 'number' or jsonb_typeof(poly->i->1) <> 'number' then return false; end if;
    if abs((poly->i->>0)::float8) > 180 or abs((poly->i->>1)::float8) > 90 then return false; end if;
  end loop;
  return true;
end $$;

create or replace function public.set_area(p_room uuid, p_boundary jsonb, p_nogo jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms; poly jsonb;
begin
  r := tag_admin_room(p_room);
  if r.status <> 'lobby' then raise exception 'The play area locks once the match starts'; end if;
  if not geo_valid_poly(p_boundary) then raise exception 'The boundary needs 3 to 200 points'; end if;
  if jsonb_typeof(coalesce(p_nogo,'[]')) <> 'array' or jsonb_array_length(coalesce(p_nogo,'[]')) > 10 then raise exception 'Up to 10 no-go zones'; end if;
  for poly in select jsonb_array_elements(coalesce(p_nogo,'[]')) loop
    if not geo_valid_poly(poly) then raise exception 'Each no-go zone needs 3 to 200 points'; end if;
  end loop;
  update rooms set boundary = p_boundary, nogo = coalesce(p_nogo,'[]'), zone = tag_initial_zone(p_boundary) where id = p_room;
end $$;

-- lobby ready-up
create or replace function public.set_ready(p_room uuid, p_ready boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = p_room and status = 'lobby') then raise exception 'The match has already started'; end if;
  update room_members set ready = coalesce(p_ready, false)
   where room_id = p_room and user_id = auth.uid() and status = 'accepted';
  if not found then raise exception 'You are not in this room yet'; end if;
end $$;
revoke all on function public.set_ready(uuid, boolean) from public, anon;
grant execute on function public.set_ready(uuid, boolean) to authenticated;

-- a player who (re)joins starts not ready
create or replace function public.tag_reset_ready()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status then new.ready := false; end if;
  return new;
end $$;
drop trigger if exists room_members_reset_ready on public.room_members;
create trigger room_members_reset_ready before update of status on public.room_members
  for each row execute function public.tag_reset_ready();

-- room_state: members carry their ready flag
do $$
declare d text; d2 text;
begin
  select pg_get_functiondef('public.room_state(uuid,double precision,double precision,double precision,boolean,bigint)'::regprocedure) into d;
  if position('''ready'', m.ready' in d) > 0 then return; end if;
  d2 := replace(d, '''invite'', m.via_invite)', '''invite'', m.via_invite, ''ready'', m.ready)');
  if d2 = d then raise exception 'room_state patch point not found'; end if;
  execute d2;
end $$;
