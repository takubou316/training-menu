// Compstackのプッシュ通知を送るEdge Function(2026-10-07〜)。名前は最初の用途(有酸素の目標時間)のままだが、
// トレーニング予定の時刻の通知(routine_push_jobs)も同じ仕組みで送る。
// pg_cronが10秒ごとに、送る時刻が来た予定がどちらかの表にある時だけ呼ぶ(supabase/cron-cardio-push.sql.template)。
// 呼び出し元の確認は共有の秘密の値(x-dispatch-secret)で行うので、JWT検証は切ってデプロイする(--no-verify-jwt)。
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SECRET = Deno.env.get('CARDIO_PUSH_DISPATCH_SECRET') ?? '';
webpush.setVapidDetails(
  'https://takubou316.github.io/training-menu/',
  Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
);
const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

// 予定の表ごとの設定。retryMs: 一時的な失敗の時、予定時刻からこの時間内なら送り直す。tag: 通知の種類(同じtagは上書き表示)
const TABLES = [
  { name: 'cardio_push_jobs', retryMs: 5 * 60 * 1000, tag: 'cardio-target' },
  { name: 'routine_push_jobs', retryMs: 30 * 60 * 1000, tag: 'routine-reminder' },
];

async function dispatchTable(table: typeof TABLES[number], now: string) {
  // 1回に送るのは古い順に最大50件
  const { data: due, error: dueError } = await supabase
    .from(table.name)
    .select('id')
    .is('sent_at', null)
    .lte('fire_at', now)
    .order('fire_at')
    .limit(50);
  if (dueError) throw new Error(`${table.name}: ${dueError.message}`);
  if (!due || due.length === 0) return { due: 0, sent: 0, gone: 0, failed: 0 };

  // 送る分を先に「送った」にしてから送る(定期実行が重なっても同じ予定を二度送らないため)
  const { data: jobs, error } = await supabase
    .from(table.name)
    .update({ sent_at: now })
    .in('id', due.map((d) => d.id))
    .is('sent_at', null)
    .lte('fire_at', now)
    .select('id, subscription, title, body, fire_at');
  if (error) throw new Error(`${table.name}: ${error.message}`);

  let sent = 0;
  let gone = 0;
  let failed = 0;
  for (const job of jobs ?? []) {
    try {
      await webpush.sendNotification(
        job.subscription,
        JSON.stringify({ id: job.id, title: job.title, body: job.body, fireAt: job.fire_at, tag: table.tag }),
        { TTL: 600, urgency: 'high' },
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // 送っている間にアプリが同じ行を新しい予定で上書きしていたら触らない(fire_atとsent_atで、
      // 取り出した時の予定のままかを確かめる。Codexレビュー指摘)
      if (status === 404 || status === 410) {
        // 端末側で登録が無効になったもの。予定ごと消す
        await supabase.from(table.name).delete()
          .eq('id', job.id).eq('fire_at', job.fire_at).eq('sent_at', now);
        gone++;
      } else {
        // 一時的な失敗(429/5xx/通信)は、予定時刻から一定時間内なら次の定期実行で送り直す
        failed++;
        console.error('send failed', table.name, job.id, status, (e as Error).message);
        if (Date.now() - new Date(job.fire_at).getTime() < table.retryMs) {
          await supabase.from(table.name).update({ sent_at: null })
            .eq('id', job.id).eq('fire_at', job.fire_at).eq('sent_at', now);
        }
      }
    }
  }
  return { due: jobs?.length ?? 0, sent, gone, failed };
}

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get('x-dispatch-secret') !== SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const now = new Date().toISOString();
  const result: Record<string, unknown> = {};
  let hadError = false;
  // 片方の表で失敗しても、もう片方は送る
  for (const table of TABLES) {
    try {
      result[table.name] = await dispatchTable(table, now);
    } catch (e) {
      hadError = true;
      result[table.name] = { error: (e as Error).message };
    }
  }
  return Response.json(result, { status: hadError ? 500 : 200 });
});
