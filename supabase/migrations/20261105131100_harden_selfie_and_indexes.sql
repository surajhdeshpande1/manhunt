-- harden_selfie_and_indexes
-- players may only point their profile picture at a file they uploaded themselves
drop policy if exists profiles_selfie on public.profiles;
create policy profiles_selfie on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and (selfie_path is null or selfie_path like (select auth.uid())::text || '-%'));

-- covering indexes for foreign keys used by the game's lookups
create index if not exists friendships_b_idx on public.friendships (b);
create index if not exists invites_from_id_idx on public.invites (from_id);
create index if not exists invites_to_id_idx on public.invites (to_id);
create index if not exists messages_user_id_idx on public.messages (user_id);
create index if not exists positions_user_id_idx on public.positions (user_id);
create index if not exists rooms_admin_id_idx on public.rooms (admin_id);
