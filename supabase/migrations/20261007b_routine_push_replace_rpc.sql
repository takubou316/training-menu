-- 予定の時刻の通知の入れ替えを、1回のDB関数でまとめて行う(2026-10-07、Codexレビュー指摘への対応)。
-- 以前はアプリから「upsert→一覧に無い行をdelete」を別々に送っていたため、
--  ・60件の上限トリガーでupsertが失敗すると、古い予約の削除まで止まる
--  ・並行して入れると上限を超えられる(ロック無しのCOUNT)
--  ・本人が sent_at を null に戻して何度でも送らせられる
--  ・通知時刻の直前に入れ直すと、送られる直前の予約を消してしまう
-- という問題があった。この関数は、ユーザーごとに排他ロックを取ってから、
--  1) 新しい一覧に無い未送信の予約を消す(ただし2分以内に送る予約・送る時刻を過ぎた未送信の予約は残す)
--  2) 新しい一覧を入れる(既にある行は宛先・文面だけ更新し、送ったかどうか(sent_at)には触らない)
--  3) 最後に件数を確かめ、60件を超えたら全体を取り消す
-- を1つのトランザクションで行う。アプリからの表への直接のinsert/updateは禁止し、この関数だけを通す。

-- 宛先(endpoint)が無い購読情報を通さない(CHECKはNULLを通してしまうため)
alter table public.routine_push_jobs drop constraint if exists routine_push_jobs_endpoint_present;
alter table public.routine_push_jobs add constraint routine_push_jobs_endpoint_present
  check (subscription ? 'endpoint' and subscription->>'endpoint' is not null);

-- 件数の上限は関数の中で(ロックを取った後に)確かめるので、トリガーは外す
drop trigger if exists routine_push_jobs_limit on public.routine_push_jobs;
drop function if exists public.routine_push_jobs_limit();

-- アプリ(ログインしたユーザー)からは、自分の行を見ることと消すことだけを許す
revoke insert, update on public.routine_push_jobs from authenticated, anon;
drop policy if exists "routine_push_jobs: own rows" on public.routine_push_jobs;
drop policy if exists "routine_push_jobs: own rows select" on public.routine_push_jobs;
drop policy if exists "routine_push_jobs: own rows delete" on public.routine_push_jobs;
create policy "routine_push_jobs: own rows select" on public.routine_push_jobs
  for select using (auth.uid() = user_id);
create policy "routine_push_jobs: own rows delete" on public.routine_push_jobs
  for delete using (auth.uid() = user_id);

-- p_jobs: [{ "routine_id": "...", "fire_at": "ISO", "title": "...", "body": "..." }, ...](最大60件)
create or replace function public.replace_routine_push_jobs(p_device_id text, p_subscription jsonb, p_jobs jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  total integer;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if p_jobs is null or jsonb_typeof(p_jobs) <> 'array' or jsonb_array_length(p_jobs) > 60 then
    raise exception 'invalid jobs';
  end if;
  -- 同じユーザーの入れ替えを1つずつ順番に行う(並行して上限を超えたり、古い一覧で上書きしたりしないため)
  perform pg_advisory_xact_lock(hashtextextended('routine_push_jobs:' || uid::text, 0));

  delete from public.routine_push_jobs j
  where j.user_id = uid
    and j.sent_at is null
    and j.fire_at > now() + interval '2 minutes'
    and not exists (
      select 1 from jsonb_array_elements(p_jobs) x
      where x->>'routine_id' = j.routine_id and (x->>'fire_at')::timestamptz = j.fire_at
    );

  if jsonb_array_length(p_jobs) > 0 then
    insert into public.routine_push_jobs (user_id, device_id, routine_id, subscription, fire_at, title, body)
    select uid, p_device_id, x->>'routine_id', p_subscription, (x->>'fire_at')::timestamptz,
           coalesce(x->>'title', 'トレーニングの時間です'), coalesce(x->>'body', '')
    from jsonb_array_elements(p_jobs) x
    on conflict (user_id, routine_id, fire_at) do update
      set device_id = excluded.device_id,
          subscription = excluded.subscription,
          title = excluded.title,
          body = excluded.body;
  end if;

  select count(*) into total from public.routine_push_jobs where user_id = uid and sent_at is null;
  if total > 60 then
    raise exception 'too many routine push jobs';
  end if;
  return total;
end;
$$;

revoke all on function public.replace_routine_push_jobs(text, jsonb, jsonb) from public, anon;
grant execute on function public.replace_routine_push_jobs(text, jsonb, jsonb) to authenticated;
