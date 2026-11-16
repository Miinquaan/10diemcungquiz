-- The caller is authenticated by Supabase; one counter is shared across devices.
create table if not exists public.ai_quiz_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  requests integer not null check (requests >= 0),
  primary key (user_id, usage_day)
);
alter table public.ai_quiz_usage enable row level security;
create table if not exists public.ai_quiz_daily_usage (
  usage_day date primary key,
  requests integer not null check (requests >= 0)
);
alter table public.ai_quiz_daily_usage enable row level security;

create or replace function public.consume_ai_quiz_quota()
returns boolean language plpgsql security definer set search_path = public
as $$
declare used integer; daily_used integer;
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
    set requests = public.ai_quiz_daily_usage.requests + 1
    where public.ai_quiz_daily_usage.requests < 25
  returning requests into daily_used;
  return daily_used is not null;
end;
$$;
revoke all on function public.consume_ai_quiz_quota() from public, anon;
grant execute on function public.consume_ai_quiz_quota() to authenticated;
