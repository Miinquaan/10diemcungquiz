-- Keep one event per accepted request. Never store the source document or API key.
create table if not exists public.ai_quiz_request_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);
alter table public.ai_quiz_request_log enable row level security;
create index if not exists ai_quiz_request_log_requested_at_idx
  on public.ai_quiz_request_log (requested_at desc);

-- Keep the per-account limit; Gemini remains responsible for the project limit.
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
  insert into public.ai_quiz_request_log(user_id) values (auth.uid());
  return true;
end;
$$;
revoke all on function public.consume_ai_quiz_quota() from public, anon;
grant execute on function public.consume_ai_quiz_quota() to authenticated;

create or replace function public.admin_ai_quiz_history()
returns table (requested_at timestamptz, display_name text, class_name text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.quiz_admins a where a.user_id = auth.uid()
  ) then raise exception 'Administrator access required' using errcode = '42501'; end if;
  return query
    select l.requested_at, p.display_name, p.class_name
    from public.ai_quiz_request_log l
    left join public.profiles p on p.id = l.user_id
    where l.requested_at >= now() - interval '30 days'
    order by l.requested_at desc, l.id desc
    limit 200;
end;
$$;
revoke all on function public.admin_ai_quiz_history() from public, anon;
grant execute on function public.admin_ai_quiz_history() to authenticated;
