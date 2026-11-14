-- Area packs: each play area's buildings and named places (from Overture open data), built once by the
-- host's device and stored here for every player to load. Public to read; only the room's host can write.
create or replace function public.tag_is_room_admin(p_room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from rooms where id = p_room and admin_id = auth.uid());
$$;
revoke all on function public.tag_is_room_admin(uuid) from public, anon;
grant execute on function public.tag_is_room_admin(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('areas', 'areas', true, 15728640, array['application/json'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists areas_admin_insert on storage.objects;
drop policy if exists areas_admin_update on storage.objects;
drop policy if exists areas_read on storage.objects;
create policy areas_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'areas' and public.tag_is_room_admin((substring(name from '^rooms/([0-9a-f-]{36})-[0-9a-z]+\.json$'))::uuid));
create policy areas_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'areas' and public.tag_is_room_admin((substring(name from '^rooms/([0-9a-f-]{36})-[0-9a-z]+\.json$'))::uuid))
  with check (bucket_id = 'areas' and public.tag_is_room_admin((substring(name from '^rooms/([0-9a-f-]{36})-[0-9a-z]+\.json$'))::uuid));
create policy areas_read on storage.objects for select to authenticated using (bucket_id = 'areas');
