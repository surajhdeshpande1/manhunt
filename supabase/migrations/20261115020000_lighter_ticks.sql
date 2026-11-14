-- Lighter ticks. Every player calls room_state every 2 s. The room details and the member list rarely change
-- during a match yet made up most of each reply (a 30-player hunt: ~13 KB a tick, ~70% of it the members).
-- Each reply now carries short fingerprints of those two parts; the phone sends back the ones it holds
-- (p_have = {"r": room fingerprint, "m": members fingerprint}) and the server leaves out whatever is unchanged.
-- Positions are rounded to ~10 cm. A phone that sends no p_have (an older app version) gets the full reply,
-- exactly as before. Everything else is the live definition, unchanged.

drop function if exists public.room_state(uuid, double precision, double precision, double precision, boolean, bigint);

create function public.room_state(p_room uuid, p_lat double precision default null, p_lng double precision default null,
                                  p_acc double precision default null, p_mock boolean default false, p_after bigint default 0,
                                  p_have jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r rooms; me room_members; is_admin boolean; is_member boolean := false;
  prev positions; d float8; dt float8; viol text; strikes int; v_all boolean; v_reveal boolean := false;
  t timestamptz; elapsed float8; cyc float8; reveal_until timestamptz; next_reveal timestamptz; can_see boolean;
  v_room jsonb; v_members jsonb; h_room text; h_members text;
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

  v_room := jsonb_build_object('id', r.id, 'code', case when can_see then r.code end, 'name', r.name, 'is_public', r.is_public,
        'status', r.status, 'paused_from', r.paused_from, 'settings', r.settings, 'boundary', r.boundary, 'nogo', r.nogo,
        'zone', r.zone, 'zone_next', r.zone_next, 'hide_ends_at', r.hide_ends_at, 'hunt_at', r.hunt_at, 'ends_at', r.ends_at,
        'next_shrink_at', r.next_shrink_at, 'paused_at', r.paused_at, 'ended_at', r.ended_at, 'winner', r.winner,
        'end_reason', r.end_reason, 'max_players', r.max_players,
        'admin', (select jsonb_build_object('id', id, 'username', username, 'name', full_name, 'selfie', selfie_path) from profiles where id = r.admin_id));
  v_members := case when not can_see then '[]'::jsonb else (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', p.id, 'username', p.username, 'name', p.full_name, 'selfie', p.selfie_path, 'college', p.college,
          'branch', p.branch, 'year', p.year, 'title', p.title, 'status', m.status,
          'role', case when is_admin or r.status <> 'lobby' then m.role end,
          'alive', m.alive, 'out_reason', m.out_reason, 'tasks', m.tasks_done, 'catches', m.catches,
          'distance', case when r.status = 'ended' then round(m.distance_m::numeric) end,
          'phone', case when is_admin then p.phone end,
          'oob', case when is_admin then m.oob_since is not null end,
          'invite', m.via_invite, 'ready', m.ready) order by m.joined_at), '[]'::jsonb)
        from room_members m join profiles p on p.id = m.user_id
        where m.room_id = p_room and (m.status = 'accepted' or (is_admin and m.status = 'pending')
              or (r.status = 'ended' and m.role is not null and m.status in ('accepted','left','removed')))) end;
  h_room := md5(v_room::text);
  h_members := md5(v_members::text);

  return jsonb_build_object(
    'now', now(),
    'is_admin', is_admin,
    'room', case when p_have->>'r' = h_room then null else v_room end,
    'me', case when me.user_id is null then null else jsonb_build_object(
        'status', me.status, 'role', case when r.status <> 'lobby' then me.role end, 'alive', me.alive, 'out_reason', me.out_reason,
        'tasks', me.tasks_done, 'catches', me.catches, 'distance', round(me.distance_m::numeric),
        'cooldown_until', me.last_task_at + make_interval(secs => tag_set(r,'cooldown_secs')),
        'task_active', me.task_seed is not null, 'oob_since', me.oob_since, 'oob_reason', me.oob_reason, 'strikes', me.spoof_strikes,
        'qr', case when r.status in ('hiding','hunt','paused') and me.role = 'runner' and me.alive and me.status = 'accepted' then me.qr_token end) end,
    'reveal', jsonb_build_object('active', v_reveal, 'until', reveal_until, 'next_at', next_reveal),
    'progress', case when r.status <> 'lobby' and can_see then tag_progress(p_room) end,
    'members', case when p_have->>'m' = h_members then null else v_members end,
    'positions', case when not can_see or r.status in ('lobby','ended') then '[]'::jsonb else (
        select coalesce(jsonb_agg(jsonb_build_object('id', ps.user_id, 'lat', round(ps.lat::numeric, 6), 'lng', round(ps.lng::numeric, 6),
                                                     'acc', round(ps.acc::numeric, 1), 'at', ps.at, 'role', m.role)), '[]'::jsonb)
        from positions ps join room_members m on m.room_id = ps.room_id and m.user_id = ps.user_id
        where ps.room_id = p_room and m.alive and m.status = 'accepted'
          and (ps.user_id = uid or v_all or m.role = me.role or (me.role = 'hunter' and m.role = 'runner' and v_reveal))) end,
    'events', case when not can_see then '[]'::jsonb else (
        select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]'::jsonb) from (
          select id, kind, actor, target, data, at from events
          where room_id = p_room and id > coalesce(p_after, 0)
            and (vis = 'all' or (vis = 'admin' and is_admin) or (vis = 'hunters' and (is_admin or me.role = 'hunter')))
          order by id desc limit 60) e) end,
    'hashes', jsonb_build_object('r', h_room, 'm', h_members)
  );
end $$;

revoke all on function public.room_state(uuid, double precision, double precision, double precision, boolean, bigint, jsonb) from public, anon;
grant execute on function public.room_state(uuid, double precision, double precision, double precision, boolean, bigint, jsonb) to authenticated, service_role;
