-- developer access: one NAME + PASSWORD set by the owner unlocks the in-app DEMO section.
-- Only a bcrypt hash is stored. Sessions are random tokens that expire after 30 days.
create table if not exists public.dev_access (
  id int primary key default 1 check (id = 1),
  name text not null,
  pw_hash text not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.dev_sessions (
  token text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create table if not exists public.dev_attempts (
  id bigserial primary key,
  at timestamptz not null default now(),
  ok boolean not null
);
alter table public.dev_access enable row level security;
alter table public.dev_sessions enable row level security;
alter table public.dev_attempts enable row level security;
revoke all on public.dev_access, public.dev_sessions, public.dev_attempts from anon, authenticated;

create or replace function public.dev_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce((select is_owner from profiles where id = auth.uid()), false) then raise exception 'Owner only'; end if;
  return (select jsonb_build_object('set', count(*) > 0, 'name', max(name), 'updated_at', max(updated_at)) from dev_access);
end $$;

create or replace function public.set_dev_credentials(p_name text, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not coalesce((select is_owner from profiles where id = auth.uid()), false) then raise exception 'Owner only'; end if;
  if char_length(trim(coalesce(p_name,''))) < 3 then raise exception 'NAME needs at least 3 characters'; end if;
  if char_length(coalesce(p_password,'')) < 8 then raise exception 'PASSWORD needs at least 8 characters'; end if;
  insert into dev_access (id, name, pw_hash, updated_at) values (1, lower(trim(p_name)), crypt(p_password, gen_salt('bf', 10)), now())
  on conflict (id) do update set name = excluded.name, pw_hash = excluded.pw_hash, updated_at = now();
  delete from dev_sessions where true; -- changing the password signs every device out of developer mode
end $$;

create or replace function public.dev_login(p_name text, p_password text)
returns text language plpgsql volatile security definer set search_path = public, extensions as $$
declare a dev_access; fails int; tok text;
begin
  select count(*) into fails from dev_attempts where not ok and at > now() - interval '15 minutes';
  if fails >= 8 then raise exception 'Too many wrong tries. Wait 15 minutes.'; end if;
  select * into a from dev_access where id = 1;
  if a.id is null then perform pg_sleep(0.4); raise exception 'Developer access is not set up yet'; end if;
  if a.name <> lower(trim(coalesce(p_name,''))) or a.pw_hash <> crypt(coalesce(p_password,''), a.pw_hash) then
    insert into dev_attempts (ok) values (false);
    perform pg_sleep(0.6);
    raise exception 'Wrong NAME or PASSWORD';
  end if;
  insert into dev_attempts (ok) values (true);
  delete from dev_attempts where at < now() - interval '1 day';
  delete from dev_sessions where expires_at < now();
  tok := encode(gen_random_bytes(24), 'hex');
  insert into dev_sessions (token, expires_at) values (tok, now() + interval '30 days');
  return tok;
end $$;

create or replace function public.dev_check(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from dev_sessions where token = p_token and expires_at > now());
$$;

revoke all on function public.dev_status() from public, anon;
revoke all on function public.set_dev_credentials(text,text) from public, anon;
grant execute on function public.dev_status() to authenticated;
grant execute on function public.set_dev_credentials(text,text) to authenticated;
revoke all on function public.dev_login(text,text) from public;
revoke all on function public.dev_check(text) from public;
grant execute on function public.dev_login(text,text) to anon, authenticated;
grant execute on function public.dev_check(text) to anon, authenticated;
