-- Heat: a runner's wins in a row inside a match push their task level up; one miss resets it.
alter table public.room_members add column if not exists task_streak int not null default 0;

create or replace function public.tag_track_task_streak()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.tasks_done > old.tasks_done then new.task_streak := old.task_streak + 1;       -- solved
  elsif new.tasks_done < old.tasks_done then new.task_streak := 0;                       -- new match
  elsif old.task_seed is not null and new.task_seed is null then new.task_streak := 0;   -- failed or timed out
  end if;
  return new;
end $$;
revoke all on function public.tag_track_task_streak() from public, anon, authenticated;

drop trigger if exists room_members_task_streak on public.room_members;
create trigger room_members_task_streak before update of tasks_done, task_seed on public.room_members
  for each row execute function public.tag_track_task_streak();

create or replace function public.tag_task_level(r rooms, m room_members, uid uuid)
returns int language sql stable security definer set search_path = public as $$
  select greatest(1, least(5,
    1 + least(2, coalesce((select (task_mastery->>(m.task_kind::text))::int from profiles where id = uid), 0) / 3)
      + least(2, m.tasks_done / 4)
      + least(2, m.task_streak / 2)
      + case coalesce(r.settings->>'task_difficulty','normal') when 'easy' then -1 when 'hard' then 1 else 0 end));
$$;
revoke all on function public.tag_task_level(rooms, room_members, uuid) from public, anon, authenticated;
