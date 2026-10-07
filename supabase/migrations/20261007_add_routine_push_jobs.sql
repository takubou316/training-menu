-- トレーニング予定の時刻の通知(2026-10-07〜)。予定に「通知する時刻」を決めると、Compstackがこの先7日分の
-- 「やる日×時刻」を計算してここに入れる(その日が済んでいれば入れない。アプリを開く・記録を終えるたびに入れ直す)。
-- 送るのは目標時間の通知と同じEdge Function「cardio-push-dispatch」(同じ定期実行で両方の表を見る)。
-- 悪用対策: 宛先は主要ブラウザのプッシュサービスだけ・予定は8日先まで・1ユーザー60件まで(トリガー)。

create table if not exists public.routine_push_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  device_id text not null check (char_length(device_id) between 8 and 100),
  routine_id text not null check (char_length(routine_id) between 1 and 100),
  subscription jsonb not null,
  fire_at timestamptz not null,
  title text not null default 'トレーニングの時間です' check (char_length(title) <= 100),
  body text not null default '' check (char_length(body) <= 200),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, routine_id, fire_at),
  check (subscription->>'endpoint' ~ '^https://(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)/'),
  check (fire_at < now() + interval '8 days')
);

alter table public.routine_push_jobs enable row level security;

drop policy if exists "routine_push_jobs: own rows" on public.routine_push_jobs;
create policy "routine_push_jobs: own rows" on public.routine_push_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists routine_push_jobs_due_idx on public.routine_push_jobs(fire_at) where sent_at is null;

-- 1ユーザーが入れられる予定は60件まで(予定の数×7日。普通の使い方では届かない)
create or replace function public.routine_push_jobs_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.routine_push_jobs where user_id = new.user_id) >= 60 then
    raise exception 'too many routine push jobs';
  end if;
  return new;
end;
$$;

drop trigger if exists routine_push_jobs_limit on public.routine_push_jobs;
create trigger routine_push_jobs_limit before insert on public.routine_push_jobs
  for each row execute function public.routine_push_jobs_limit();
