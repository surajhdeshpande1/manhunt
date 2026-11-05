-- game_engine

create or replace function public.tag_num(s jsonb, k text, lo float8, hi float8, def float8)
returns float8 language sql immutable as $$
  select greatest(lo, least(hi, coalesce(case when jsonb_typeof(s->k) = 'number' then (s->>k)::float8 end, def)))
$$;

create or replace function public.tag_clean_settings(s jsonb)
returns jsonb language plpgsql immutable as $$
declare out jsonb; c timestamptz;
begin
  begin c := (s->>'curfew_at')::timestamptz; exception when others then c := null; end;
  out := jsonb_build_object(
    'hide_secs',        round(tag_num(s,'hide_secs',30,1800,420)),
    'tasks_per_runner', round(tag_num(s,'tasks_per_runner',1,30,10)),
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
  return out;
end $$;

create or replace function public.tag_set(r public.rooms, k text)
returns float8 language sql immutable as $$ select (r.settings->>k)::float8 $$;

-- which rule (if any) a position breaks
create or replace function public.tag_violation(r public.rooms, plat float8, plng float8)
returns text language plpgsql stable as $$
declare buf float8 := coalesce(tag_set(r,'buffer_m'),10); poly jsonb;
begin
  if r.boundary is not null and not geo_contains(r.boundary, plat, plng)
     and geo_edge_dist(r.boundary, plat, plng) > buf then return 'boundary'; end if;
  if r.status = 'hunt' and r.zone is not null
     and geo_hav(plat, plng, (r.zone->>'lat')::float8, (r.zone->>'lng')::float8) - (r.zone->>'r')::float8 > buf then
     return 'zone'; end if;
  for poly in select jsonb_array_elements(coalesce(r.nogo,'[]'::jsonb)) loop
    if geo_contains(poly, plat, plng) and geo_edge_dist(poly, plat, plng) > buf then return 'nogo'; end if;
  end loop;
  return null;
end $$;

create or replace function public.tag_event(p_room uuid, p_kind text, p_vis text, p_actor uuid, p_target uuid, p_data jsonb)
returns void language sql security definer set search_path = public as $$
  insert into events (room_id, kind, vis, actor, target, data) values (p_room, p_kind, p_vis, p_actor, p_target, coalesce(p_data,'{}'::jsonb));
$$;

-- initial zone covering the boundary
create or replace function public.tag_initial_zone(poly jsonb)
returns jsonb language plpgsql immutable as $$
declare n int := jsonb_array_length(poly); i int; clat float8 := 0; clng float8 := 0; r float8 := 0;
begin
  for i in 0..n-1 loop clng := clng + (poly->i->>0)::float8; clat := clat + (poly->i->>1)::float8; end loop;
  clng := clng / n; clat := clat / n;
  for i in 0..n-1 loop r := greatest(r, geo_hav(clat, clng, (poly->i->>1)::float8, (poly->i->>0)::float8)); end loop;
  return jsonb_build_object('lat', clat, 'lng', clng, 'r', round((r + 5)::numeric, 1));
end $$;

-- pick the next smaller circle at a random spot inside the current one
create or replace function public.tag_next_zone(r public.rooms, z jsonb)
returns jsonb language plpgsql volatile as $$
declare cur_r float8 := (z->>'r')::float8; nr float8; ang float8; d float8; nlat float8; nlng float8; tries int := 0;
begin
  nr := greatest(tag_set(r,'min_zone_m'), cur_r * tag_set(r,'shrink_factor'));
  if nr >= cur_r then return z; end if;
  loop
    tries := tries + 1;
    ang := random() * 2 * pi();
    d := sqrt(random()) * (cur_r - nr);
    nlat := (z->>'lat')::float8 + d * cos(ang) / 110540;
    nlng := (z->>'lng')::float8 + d * sin(ang) / (111320 * cos(radians((z->>'lat')::float8)));
    exit when r.boundary is null or geo_contains(r.boundary, nlat, nlng) or tries >= 12;
  end loop;
  if tries >= 12 and not geo_contains(r.boundary, nlat, nlng) then
    nlat := (z->>'lat')::float8; nlng := (z->>'lng')::float8;
  end if;
  return jsonb_build_object('lat', nlat, 'lng', nlng, 'r', round(nr::numeric, 1));
end $$;

create or replace function public.tag_do_shrink(p_room uuid, p_forced boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  select * into r from rooms where id = p_room;
  if r.zone_next is null then return; end if;
  update rooms set
    zone = r.zone_next,
    zone_next = tag_next_zone(r, r.zone_next),
    next_shrink_at = case when p_forced then now() else r.next_shrink_at end + make_interval(secs => tag_set(r,'shrink_every'))
  where id = p_room;
  perform tag_event(p_room, 'shrink', 'all', null, null, jsonb_build_object('r', r.zone_next->'r', 'forced', p_forced));
  -- players caught outside the new circle start their grace timer on their next reading
end $$;

create or replace function public.tag_eliminate(p_room uuid, p_user uuid, p_reason text, p_by uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m room_members;
begin
  update room_members set alive = false, out_reason = p_reason, out_at = now(), caught_by = p_by,
         task_seed = null, task_started_at = null, oob_since = null
   where room_id = p_room and user_id = p_user and alive and status = 'accepted'
   returning * into m;
  if not found then return; end if;
  if p_reason = 'caught' then
    update room_members set catches = catches + 1 where room_id = p_room and user_id = p_by;
  end if;
  perform tag_event(p_room, case when p_reason = 'caught' then 'caught' else 'eliminated' end, 'all', p_by, p_user,
                    jsonb_build_object('reason', p_reason, 'role', m.role));
end $$;

create or replace function public.tag_progress(p_room uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r rooms; done int; alive_r int; all_r int; alive_h int; total int; pct float8; maxp float8;
begin
  select * into r from rooms where id = p_room;
  select coalesce(sum(tasks_done) filter (where alive),0), count(*) filter (where alive), count(*)
    into done, alive_r, all_r
    from room_members where room_id = p_room and status = 'accepted' and role = 'runner';
  select count(*) filter (where alive) into alive_h from room_members where room_id = p_room and status = 'accepted' and role = 'hunter';
  total := greatest(1, coalesce(nullif(r.runners_at_start,0), all_r) * tag_set(r,'tasks_per_runner')::int);
  pct := 100.0 * done / total;
  maxp := 100.0 * alive_r * tag_set(r,'tasks_per_runner') / total;
  return jsonb_build_object('done', done, 'total', total, 'pct', round(pct::numeric,1), 'max_pct', round(maxp::numeric,1),
    'mark', tag_set(r,'win_pct'), 'runners_alive', alive_r, 'runners', all_r, 'hunters_alive', alive_h);
end $$;

create or replace function public.tag_finish(p_room uuid, p_winner text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms; m record;
begin
  update rooms set status = 'ended', ended_at = now(), winner = p_winner, end_reason = p_reason
   where id = p_room and status <> 'ended' returning * into r;
  if not found then return; end if;
  -- location data is deleted the moment the match ends
  delete from positions where room_id = p_room;
  update events set data = data - 'lat' - 'lng' where room_id = p_room and kind = 'sos';
  perform tag_event(p_room, 'end', 'all', null, null, jsonb_build_object('winner', p_winner, 'reason', p_reason, 'progress', tag_progress(p_room)));

  for m in select * from room_members where room_id = p_room and status = 'accepted' and role is not null loop
    update profiles set
      matches = matches + 1,
      wins = wins + case when (p_winner = 'runners' and m.role = 'runner') or (p_winner = 'hunters' and m.role = 'hunter') then 1 else 0 end,
      catches = catches + m.catches,
      tasks_done = tasks_done + m.tasks_done,
      times_caught = times_caught + case when m.out_reason = 'caught' then 1 else 0 end,
      distance_m = distance_m + m.distance_m
    where id = m.user_id;

    if m.catches >= 1 then insert into badges values (m.user_id, 'first_blood') on conflict do nothing; end if;
    if m.catches >= 3 then insert into badges values (m.user_id, 'hat_trick') on conflict do nothing; end if;
    if m.role = 'runner' and m.alive then insert into badges values (m.user_id, 'ghost') on conflict do nothing; end if;
    if m.role = 'runner' and m.tasks_done >= tag_set(r,'tasks_per_runner') then insert into badges values (m.user_id, 'full_clear') on conflict do nothing; end if;
    if (p_winner = 'runners' and m.role = 'runner') or (p_winner = 'hunters' and m.role = 'hunter') then
      insert into badges values (m.user_id, 'first_win') on conflict do nothing; end if;
    if (select matches from profiles where id = m.user_id) >= 10 then insert into badges values (m.user_id, 'veteran') on conflict do nothing; end if;
    if (select distance_m from profiles where id = m.user_id) >= 5000 then insert into badges values (m.user_id, 'marathon') on conflict do nothing; end if;
    if m.distance_m >= 2000 then insert into badges values (m.user_id, 'road_runner') on conflict do nothing; end if;
  end loop;
end $$;

-- timers, sweeps and win conditions; safe to call repeatedly
create or replace function public.tag_advance(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms; p jsonb; i int := 0; m record; c timestamptz;
begin
  select * into r from rooms where id = p_room for update;
  if r.status not in ('hiding','hunt') then return; end if;

  c := (r.settings->>'curfew_at')::timestamptz;
  if c is not null and now() >= c then perform tag_finish(p_room, 'none', 'curfew'); return; end if;

  -- players whose grace ran out (also catches phones that went quiet while outside)
  for m in select user_id, oob_reason from room_members
            where room_id = p_room and alive and status = 'accepted' and oob_since is not null
              and oob_since <= now() - make_interval(secs => tag_set(r,'grace_secs')) loop
    perform tag_eliminate(p_room, m.user_id, coalesce(m.oob_reason,'boundary'), null);
  end loop;

  if r.status = 'hunt' then
    while r.next_shrink_at is not null and r.next_shrink_at <= now() and i < 5 loop
      perform tag_do_shrink(p_room, false);
      select * into r from rooms where id = p_room;
      i := i + 1;
    end loop;

    p := tag_progress(p_room);
    if (p->>'runners_alive')::int = 0 then perform tag_finish(p_room, 'hunters', 'all_caught'); return; end if;
    if (p->>'pct')::float8 >= (p->>'mark')::float8 then perform tag_finish(p_room, 'runners', 'tasks'); return; end if;
    if (p->>'max_pct')::float8 < (p->>'mark')::float8 then perform tag_finish(p_room, 'hunters', 'mark_unreachable'); return; end if;
    if (p->>'hunters_alive')::int = 0 then perform tag_finish(p_room, 'runners', 'no_hunters'); return; end if;
    if now() >= r.ends_at then perform tag_finish(p_room, 'hunters', 'time'); return; end if;
  elsif r.status = 'hiding' then
    p := tag_progress(p_room);
    if (p->>'runners_alive')::int = 0 then perform tag_finish(p_room, 'hunters', 'all_caught'); return; end if;
    if (p->>'hunters_alive')::int = 0 then perform tag_finish(p_room, 'runners', 'no_hunters'); return; end if;
  end if;
end $$;

-- lock internal helpers away from clients
revoke execute on function public.tag_mark_owner() from public, anon, authenticated;
revoke execute on function public.tag_event(uuid,text,text,uuid,uuid,jsonb) from public, anon, authenticated;
revoke execute on function public.tag_do_shrink(uuid,boolean) from public, anon, authenticated;
revoke execute on function public.tag_eliminate(uuid,uuid,text,uuid) from public, anon, authenticated;
revoke execute on function public.tag_progress(uuid) from public, anon, authenticated;
revoke execute on function public.tag_finish(uuid,text,text) from public, anon, authenticated;
revoke execute on function public.tag_advance(uuid) from public, anon, authenticated;
revoke execute on function public.tag_next_zone(public.rooms,jsonb) from public, anon, authenticated;
