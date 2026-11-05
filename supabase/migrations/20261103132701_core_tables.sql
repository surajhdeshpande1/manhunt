-- core_tables

create extension if not exists pgcrypto with schema extensions;

-- PROFILES -------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  full_name text not null check (char_length(full_name) between 2 and 60),
  phone text not null check (phone ~ '^\+?[0-9]{10,13}$'),
  dob date not null,
  college text not null check (char_length(college) between 3 and 120),
  branch text not null check (branch ~ '^[A-Z&]{2,8}$'),
  year smallint not null check (year between 1 and 4),
  selfie_path text,
  is_organiser boolean not null default false,
  is_owner boolean not null default false,
  matches int not null default 0,
  wins int not null default 0,
  catches int not null default 0,
  tasks_done int not null default 0,
  times_caught int not null default 0,
  distance_m double precision not null default 0,
  created_at timestamptz not null default now()
);

create or replace function public.tag_mark_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select lower(email) from auth.users where id = new.id) = 'surajhdeshpande1@gmail.com' then
    new.is_owner := true; new.is_organiser := true;
  end if;
  return new;
end $$;
create trigger profiles_owner before insert on public.profiles for each row execute function public.tag_mark_owner();

create table public.organiser_applications (
  id bigint generated always as identity primary key,
  user_id uuid not null unique references public.profiles on delete cascade,
  note text check (char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- ROOMS ----------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null check (char_length(name) between 2 and 40),
  is_public boolean not null,
  password_hash text,
  admin_id uuid not null references public.profiles on delete cascade,
  max_players int not null default 50 check (max_players between 2 and 50),
  status text not null default 'lobby' check (status in ('lobby','hiding','hunt','paused','ended')),
  paused_from text,
  settings jsonb not null default '{"hide_secs":420,"tasks_per_runner":10,"cooldown_secs":30,"win_pct":70,"reveal_every":120,"reveal_for":45,"shrink_every":300,"shrink_factor":0.8,"min_zone_m":60,"match_secs":2400,"catch_radius_m":30,"buffer_m":10,"grace_secs":10,"max_acc_m":35,"curfew_at":null}'::jsonb,
  boundary jsonb,
  nogo jsonb not null default '[]'::jsonb,
  zone jsonb,
  zone_next jsonb,
  runners_at_start int not null default 0,
  hide_ends_at timestamptz,
  hunt_at timestamptz,
  ends_at timestamptz,
  next_shrink_at timestamptz,
  forced_reveal_until timestamptz,
  paused_at timestamptz,
  ended_at timestamptz,
  winner text check (winner in ('runners','hunters','none')),
  end_reason text,
  created_at timestamptz not null default now()
);
create index rooms_public_idx on public.rooms (is_public, status);

create table public.room_members (
  room_id uuid not null references public.rooms on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','left','removed')),
  role text check (role in ('runner','hunter')),
  alive boolean not null default true,
  out_reason text,
  caught_by uuid,
  out_at timestamptz,
  tasks_done int not null default 0,
  task_seed int,
  task_kind int,
  task_started_at timestamptz,
  last_task_at timestamptz,
  catches int not null default 0,
  distance_m double precision not null default 0,
  oob_since timestamptz,
  oob_reason text,
  spoof_strikes int not null default 0,
  qr_token text not null default encode(extensions.gen_random_bytes(12),'hex'),
  via_invite boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index room_members_user_idx on public.room_members (user_id);

create table public.positions (
  room_id uuid not null references public.rooms on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  lat double precision not null,
  lng double precision not null,
  acc double precision,
  at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms on delete cascade,
  kind text not null,
  vis text not null default 'all' check (vis in ('all','admin','hunters')),
  actor uuid,
  target uuid,
  data jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index events_room_idx on public.events (room_id, id);

create table public.messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms on delete cascade,
  channel text not null check (channel in ('lobby','hunters')),
  user_id uuid not null references public.profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  at timestamptz not null default now()
);
create index messages_room_idx on public.messages (room_id, channel, id);

create table public.friendships (
  a uuid not null references public.profiles on delete cascade,
  b uuid not null references public.profiles on delete cascade,
  requested_by uuid not null,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);

create table public.invites (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms on delete cascade,
  from_id uuid not null references public.profiles on delete cascade,
  to_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  unique (room_id, to_id)
);

create table public.badges (
  user_id uuid not null references public.profiles on delete cascade,
  code text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, code)
);

-- RLS: everything locked down; reads/writes go through RPCs --------------
alter table public.profiles enable row level security;
alter table public.organiser_applications enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.positions enable row level security;
alter table public.events enable row level security;
alter table public.messages enable row level security;
alter table public.friendships enable row level security;
alter table public.invites enable row level security;
alter table public.badges enable row level security;

revoke all on all tables in schema public from anon, authenticated;

-- public profile columns readable by signed-in users (phone & dob are not)
grant select (id, username, full_name, college, branch, year, selfie_path, is_organiser, matches, wins, catches, tasks_done, times_caught, distance_m, created_at)
  on public.profiles to authenticated;
grant update (selfie_path) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_selfie on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

grant select on public.badges to authenticated;
create policy badges_read on public.badges for select to authenticated using (true);

-- messages: readable by whoever may read that channel (used by realtime)
create or replace function public.tag_can_read_channel(p_room uuid, p_channel text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from rooms r where r.id = p_room and r.admin_id = auth.uid())
      or exists (select 1 from room_members m join rooms r on r.id = m.room_id
                 where m.room_id = p_room and m.user_id = auth.uid() and m.status = 'accepted'
                   and (p_channel = 'lobby' or (p_channel = 'hunters' and m.role = 'hunter' and r.status <> 'lobby')));
$$;
grant select on public.messages to authenticated;
create policy messages_read on public.messages for select to authenticated using (public.tag_can_read_channel(room_id, channel));

alter publication supabase_realtime add table public.messages;

-- selfies bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('selfies', 'selfies', true, 1048576, array['image/jpeg','image/webp'])
on conflict (id) do nothing;
create policy selfies_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'selfies' and name like auth.uid()::text || '-%');
create policy selfies_update on storage.objects for update to authenticated
  using (bucket_id = 'selfies' and name like auth.uid()::text || '-%');
create policy selfies_delete on storage.objects for delete to authenticated
  using (bucket_id = 'selfies' and name like auth.uid()::text || '-%');

-- GEO HELPERS (points are [lng, lat]) -----------------------------------
create or replace function public.geo_hav(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable as $$
  select 2*6371000*asin(least(1, sqrt(power(sin(radians(lat2-lat1)/2),2)
         + cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lng2-lng1)/2),2))))
$$;

create or replace function public.geo_contains(poly jsonb, plat float8, plng float8)
returns boolean language plpgsql immutable as $$
declare n int; i int; j int; xi float8; yi float8; xj float8; yj float8; inside boolean := false;
begin
  if poly is null or jsonb_typeof(poly) <> 'array' then return false; end if;
  n := jsonb_array_length(poly);
  if n < 3 then return false; end if;
  j := n - 1;
  for i in 0..n-1 loop
    xi := (poly->i->>0)::float8; yi := (poly->i->>1)::float8;
    xj := (poly->j->>0)::float8; yj := (poly->j->>1)::float8;
    if ((yi > plat) <> (yj > plat)) and (plng < (xj - xi) * (plat - yi) / (yj - yi) + xi) then
      inside := not inside;
    end if;
    j := i;
  end loop;
  return inside;
end $$;

create or replace function public.geo_edge_dist(poly jsonb, plat float8, plng float8)
returns float8 language plpgsql immutable as $$
declare n int; i int; k float8 := cos(radians(plat)) * 111320;
  ax float8; ay float8; bx float8; by_ float8; dx float8; dy float8; t float8; d float8; best float8 := 1e12;
begin
  if poly is null or jsonb_typeof(poly) <> 'array' then return 1e12; end if;
  n := jsonb_array_length(poly);
  if n < 2 then return 1e12; end if;
  for i in 0..n-1 loop
    ax := ((poly->i->>0)::float8 - plng) * k;          ay := ((poly->i->>1)::float8 - plat) * 110540;
    bx := ((poly->((i+1)%n)->>0)::float8 - plng) * k;  by_ := ((poly->((i+1)%n)->>1)::float8 - plat) * 110540;
    dx := bx - ax; dy := by_ - ay;
    if dx = 0 and dy = 0 then t := 0; else t := greatest(0, least(1, -(ax*dx + ay*dy) / (dx*dx + dy*dy))); end if;
    d := sqrt(power(ax + t*dx, 2) + power(ay + t*dy, 2));
    if d < best then best := d; end if;
  end loop;
  return best;
end $$;

create or replace function public.geo_valid_poly(poly jsonb)
returns boolean language plpgsql immutable as $$
declare n int; i int;
begin
  if poly is null or jsonb_typeof(poly) <> 'array' then return false; end if;
  n := jsonb_array_length(poly);
  if n < 3 or n > 60 then return false; end if;
  for i in 0..n-1 loop
    if jsonb_typeof(poly->i) <> 'array' or jsonb_array_length(poly->i) <> 2 then return false; end if;
    if abs((poly->i->>0)::float8) > 180 or abs((poly->i->>1)::float8) > 90 then return false; end if;
  end loop;
  return true;
end $$;
