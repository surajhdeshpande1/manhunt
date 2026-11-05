-- room_event_theme

do $$
declare d text;
begin
  d := pg_get_functiondef('public.tag_clean_settings(jsonb)'::regprocedure);
  if position('''event''' in d) = 0 then
    d := replace(d, '  return out;', '  out := out || jsonb_build_object(''event'', case when s->>''event'' in (''diwali'',''halloween'',''fest'',''holi'') then s->>''event'' else ''none'' end);
  return out;');
    execute d;
  end if;
end $$;
select public.tag_clean_settings('{"event":"diwali"}'::jsonb)->>'event' as check_event;
