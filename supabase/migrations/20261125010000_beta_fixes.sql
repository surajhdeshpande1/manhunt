-- Fixes from beta testing (21 Nov 2026 match).
-- 1. Smooth tasks. A finished task is saved even on a weak connection: the phone keeps the result and retries until
--    the server answers. A retry of a task the server already counted is accepted (it used to say "That task has
--    expired", which the app then showed as "Your session expired"), so a dropped reply can no longer turn a win into
--    a failure.
-- 2. Runner chat: a 'runners' channel, readable and writable only by runners still in the game (and the host), so
--    it closes the moment a runner is caught.
-- 3. Catches: a runner hiding where GPS is weak stops sending positions, and scanning their QR face to face used to
--    fail ("GPS has not updated in the last 30 s"). An older last-known position now counts, with the allowed
--    distance growing only at walking pace since that fix, so a photo of a QR used from far away still fails.

alter table public.room_members add column if not exists last_done_seed int;

create or replace function public.complete_task(p_room uuid, p_seed integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r rooms; m room_members; k text;
begin
  perform tag_advance(p_room);
  select * into r from rooms where id = p_room;
  select * into m from room_members where room_id = p_room and user_id = uid and status = 'accepted' for update;
  if not found or m.role <> 'runner' then raise exception 'Only runners do tasks'; end if;
  -- the same task sent again because the first reply never reached the phone: it already counts
  if p_seed is not null and m.last_done_seed = p_seed then return tag_progress(p_room); end if;
  if r.status <> 'hunt' then raise exception 'The hunt is not on right now'; end if;
  if not m.alive then raise exception 'You cannot do tasks right now'; end if;
  if m.task_seed is null or m.task_seed <> p_seed then raise exception 'That task is no longer open. Start a new one.'; end if;
  if m.oob_since is not null then raise exception 'Tasks are locked while you are outside the zone'; end if;
  if now() < m.task_started_at + interval '4 seconds' then raise exception 'Too fast'; end if;
  k := coalesce(m.task_kind, 0)::text;
  update profiles set task_mastery = jsonb_set(coalesce(task_mastery, '{}'::jsonb), array[k], to_jsonb(coalesce((task_mastery->>k)::int, 0) + 1))
   where id = uid;
  update room_members set tasks_done = tasks_done + 1, last_task_at = now(), last_task_kind = m.task_kind, last_done_seed = p_seed,
         task_seed = null, task_kind = null, task_started_at = null
   where room_id = p_room and user_id = uid;
  perform tag_event(p_room, 'task', 'admin', uid, null, jsonb_build_object('n', m.tasks_done + 1, 'kind', m.task_kind));
  perform tag_advance(p_room);
  return tag_progress(p_room);
end $$;

-- ---------- 2. runner chat ----------
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.messages'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%channel%' loop
    execute format('alter table public.messages drop constraint %I', c);
  end loop;
end $$;
alter table public.messages add constraint messages_channel_check check (channel in ('lobby', 'hunters', 'runners'));

create or replace function public.tag_can_read_channel(p_room uuid, p_channel text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from rooms r where r.id = p_room and r.admin_id = auth.uid())
      or exists (select 1 from room_members m join rooms r on r.id = m.room_id
                 where m.room_id = p_room and m.user_id = auth.uid() and m.status = 'accepted'
                   and (p_channel = 'lobby'
                        or (p_channel = 'hunters' and m.role = 'hunter' and r.status <> 'lobby')
                        or (p_channel = 'runners' and m.role = 'runner' and m.alive and r.status in ('hiding', 'hunt', 'paused'))));
$$;

-- ---------- 3. catches face to face, even when GPS has gone quiet ----------
create or replace function public.catch_runner(p_room uuid, p_token text, p_lat double precision default null, p_lng double precision default null, p_acc double precision default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r rooms; h room_members; t room_members; hp positions; tp positions; d float8; rad float8; slack float8 := 0;
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
  if tp.user_id is null or tp.at < now() - interval '5 minutes' then
    raise exception 'The runner''s GPS hasn''t been seen for over 5 minutes. Ask the admin to confirm this catch.'; end if;
  -- a fix older than 10 s: allow for walking pace (2 m/s) since then
  slack := 2.0 * greatest(0, extract(epoch from now() - tp.at) - 10);
  if p_lat is not null and p_lng is not null and p_acc is not null and p_acc <= tag_set(r,'max_acc_m') * 2 then
    d := geo_hav(p_lat, p_lng, tp.lat, tp.lng);
  else
    select * into hp from positions where room_id = p_room and user_id = uid;
    if hp.user_id is null or hp.at < now() - interval '5 minutes' then raise exception 'Your GPS signal is too weak to confirm a catch. Step into the open and try again.'; end if;
    slack := slack + 2.0 * greatest(0, extract(epoch from now() - hp.at) - 10);
    d := geo_hav(hp.lat, hp.lng, tp.lat, tp.lng);
  end if;
  if d > rad + slack then raise exception 'Too far: GPS puts you % m apart. Get within % m.', round(d), round(rad + slack); end if;
  perform tag_eliminate(p_room, t.user_id, 'caught', uid);
  perform tag_advance(p_room);
  return jsonb_build_object('caught', t.user_id, 'username', (select username from profiles where id = t.user_id), 'distance', round(d));
end $$;
