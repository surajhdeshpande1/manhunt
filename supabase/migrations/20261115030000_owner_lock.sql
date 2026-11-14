-- Owner lock. The Owner account belongs only to whoever controls surajhdeshpande1@gmail.com.
-- 1. Signing up with that address needs a 6-digit code emailed to it first (the signup function + signup_codes).
-- 2. Owner status is granted only by the signup function after that check, never by a plain insert.
-- 3. The developer login (DEMO) works only for the signed-in Owner, and its sessions belong to that account.

create table if not exists public.signup_codes (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  sent_at timestamptz not null default now(),
  tries int not null default 0
);
alter table public.signup_codes enable row level security;
revoke all on public.signup_codes from anon, authenticated;

-- a new profile never starts as Owner, whatever the insert says
drop trigger if exists profiles_owner on public.profiles;
drop function if exists public.tag_mark_owner();
create or replace function public.tag_profile_not_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.is_owner := false;
  return new;
end $$;
create trigger profiles_not_owner before insert on public.profiles for each row execute function public.tag_profile_not_owner();

-- the signup function calls this after the emailed code checks out
create or replace function public.tag_grant_owner(p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select lower(email) from auth.users where id = p_user), '') <> 'surajhdeshpande1@gmail.com' then return false; end if;
  update profiles set is_owner = true, is_organiser = true where id = p_user;
  return found;
end $$;
revoke all on function public.tag_grant_owner(uuid) from public, anon, authenticated;
grant execute on function public.tag_grant_owner(uuid) to service_role;

-- who holds an address in auth, and whether a TAG profile exists for it
create or replace function public.tag_auth_user(p_email text) returns table (id uuid, has_profile boolean)
language sql stable security definer set search_path = public as $$
  select u.id, exists (select 1 from profiles p where p.id = u.id)
  from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
$$;
revoke all on function public.tag_auth_user(text) from public, anon, authenticated;
grant execute on function public.tag_auth_user(text) to service_role;

-- developer login: only for the signed-in Owner
alter table public.dev_sessions add column if not exists user_id uuid references auth.users on delete cascade;
delete from public.dev_sessions where user_id is null;

create or replace function public.dev_login(p_name text, p_password text)
returns text language plpgsql volatile security definer set search_path = public, extensions as $$
declare a dev_access; fails int; tok text;
begin
  if not coalesce((select is_owner from profiles where id = auth.uid()), false) then
    raise exception 'Developer login works only for the owner''s account. Sign in as the owner first.';
  end if;
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
  insert into dev_sessions (token, expires_at, user_id) values (tok, now() + interval '30 days', auth.uid());
  return tok;
end $$;

create or replace function public.dev_check(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from dev_sessions s join profiles p on p.id = s.user_id
                 where s.token = p_token and s.expires_at > now() and s.user_id = auth.uid() and p.is_owner);
$$;

revoke all on function public.dev_login(text, text) from public, anon;
revoke all on function public.dev_check(text) from public, anon;
grant execute on function public.dev_login(text, text) to authenticated;
grant execute on function public.dev_check(text) to authenticated;
