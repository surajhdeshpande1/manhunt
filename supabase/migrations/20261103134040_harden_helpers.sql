-- harden_helpers

revoke execute on function public.tag_can_read_channel(uuid,text) from public, anon;
grant execute on function public.tag_can_read_channel(uuid,text) to authenticated;
alter function public.geo_hav(float8,float8,float8,float8) set search_path = public;
alter function public.geo_contains(jsonb,float8,float8) set search_path = public;
alter function public.geo_edge_dist(jsonb,float8,float8) set search_path = public;
alter function public.geo_valid_poly(jsonb) set search_path = public;
alter function public.tag_num(jsonb,text,float8,float8,float8) set search_path = public;
alter function public.tag_clean_settings(jsonb) set search_path = public;
alter function public.tag_set(public.rooms,text) set search_path = public;
alter function public.tag_violation(public.rooms,float8,float8) set search_path = public;
alter function public.tag_initial_zone(jsonb) set search_path = public;
alter function public.tag_next_zone(public.rooms,jsonb) set search_path = public;
alter function public.tag_gen_code() set search_path = public;
