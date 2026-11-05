-- password_reset_codes_and_ping

create table public.password_resets (
  user_id uuid primary key references auth.users on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  sent_at timestamptz not null default now()
);
alter table public.password_resets enable row level security;
revoke all on public.password_resets from anon, authenticated;

-- service-role only: find an account by email for the reset function
create or replace function public.tag_user_by_email(p_email text)
returns table (id uuid, username text) language sql stable security definer set search_path = public as $$
  select u.id, p.username from auth.users u left join profiles p on p.id = u.id where lower(u.email) = lower(trim(p_email)) limit 1;
$$;
revoke execute on function public.tag_user_by_email(text) from public, anon, authenticated;
grant execute on function public.tag_user_by_email(text) to service_role;

-- tiny public heartbeat so a daily ping keeps the free project awake
create or replace function public.tag_ping() returns timestamptz language sql stable as $$ select now() $$;
revoke execute on function public.tag_ping() from public;
grant execute on function public.tag_ping() to anon, authenticated;
