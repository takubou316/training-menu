-- 有酸素の目標時間のプッシュ通知(2026-10-07〜)。Compstackで計測を始めると「◯時◯分にこの端末へ通知する」
-- 予定を1件ここに入れ、休憩・終了で消し、再開で入れ直す。時刻が来た予定は、定期実行(pg_cron、
-- 下の別SQL)がEdge Function「cardio-push-dispatch」を呼んで送る。
-- 予定は1ユーザーにつき1件だけ(上書き。device_idは「この端末が入れた予定だけ消す」ための目印)。
-- iPhoneの標準タイマーと違い、自分の予定だけを消すので他のタイマーを巻き込まない。
-- 悪用対策(Codexレビュー指摘): 1ユーザー1件・宛先は主要ブラウザのプッシュサービスだけ・予定は1日先まで。
-- game-daily-managerと同じSupabaseプロジェクトに相乗りしている(training-menu/js/sync.js冒頭参照)。

create table if not exists public.cardio_push_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  device_id text not null check (char_length(device_id) between 8 and 100),
  subscription jsonb not null,
  fire_at timestamptz not null,
  title text not null default '目標時間になりました' check (char_length(title) <= 100),
  body text not null default '' check (char_length(body) <= 200),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id),
  check (subscription->>'endpoint' ~ '^https://(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)/'),
  check (fire_at < now() + interval '1 day')
);

alter table public.cardio_push_jobs enable row level security;

drop policy if exists "cardio_push_jobs: own rows" on public.cardio_push_jobs;
create policy "cardio_push_jobs: own rows" on public.cardio_push_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 送る対象(未送信で時刻が来たもの)を探す用
create index if not exists cardio_push_jobs_due_idx on public.cardio_push_jobs(fire_at) where sent_at is null;
