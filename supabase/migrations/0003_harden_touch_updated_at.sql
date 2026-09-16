-- Keep the trigger helper from inheriting a mutable role search_path.
alter function public.touch_updated_at() set search_path = public;
