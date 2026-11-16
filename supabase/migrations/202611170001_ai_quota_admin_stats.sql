-- Preserve existing counters, remove only the website-wide ceiling.
create or replace function public.consume_ai_quiz_quota()
returns boolean language plpgsql security definer set search_path = public
as $$
declare used integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.ai_quiz_usage(user_id, usage_day, requests)
  values (auth.uid(), (now() at time zone 'UTC')::date, 1)
  on conflict (user_id, usage_day) do update
    set requests = public.ai_quiz_usage.requests + 1
    where public.ai_quiz_usage.requests < 5
  returning requests into used;
  if used is null then return false; end if;
  insert into public.ai_quiz_daily_usage(usage_day, requests)
  values ((now() at time zone 'UTC')::date, 1)
  on conflict (usage_day) do update
    set requests = public.ai_quiz_daily_usage.requests + 1;
  return true;
end;
$$;
revoke all on function public.consume_ai_quiz_quota() from public, anon;
grant execute on function public.consume_ai_quiz_quota() to authenticated;

-- Check the separate admin allow-list, never the user-editable profile role.
create or replace function public.admin_ai_quiz_usage()
returns table (user_id uuid, display_name text, class_name text, requests integer)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.quiz_admins a where a.user_id = auth.uid()
  ) then raise exception 'Administrator access required' using errcode = '42501'; end if;
  return query
    select u.user_id, p.display_name, p.class_name, u.requests
    from public.ai_quiz_usage u
    left join public.profiles p on p.id = u.user_id
    where u.usage_day = (now() at time zone 'UTC')::date
    order by u.requests desc, p.display_name, u.user_id;
end;
$$;
revoke all on function public.admin_ai_quiz_usage() from public, anon;
grant execute on function public.admin_ai_quiz_usage() to authenticated;
