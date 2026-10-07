// 有酸素の目標時間のプッシュ通知を送るEdge Function(2026-10-07〜)。
// pg_cronが10秒ごとに、送る時刻が来た予定(cardio_push_jobs)がある時だけ呼ぶ(supabase/cron-cardio-push.sql.template)。
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

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get('x-dispatch-secret') !== SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const now = new Date().toISOString();

  // 1回に送るのは古い順に最大50件
  const { data: due, error: dueError } = await supabase
    .from('cardio_push_jobs')
    .select('id')
    .is('sent_at', null)
    .lte('fire_at', now)
    .order('fire_at')
    .limit(50);
  if (dueError) return Response.json({ error: dueError.message }, { status: 500 });
  if (!due || due.length === 0) return Response.json({ due: 0, sent: 0, gone: 0, failed: 0 });

  // 送る分を先に「送った」にしてから送る(定期実行が重なっても同じ予定を二度送らないため)
  const { data: jobs, error } = await supabase
    .from('cardio_push_jobs')
    .update({ sent_at: now })
    .in('id', due.map((d) => d.id))
    .is('sent_at', null)
    .lte('fire_at', now)
    .select('id, subscription, title, body, fire_at');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let gone = 0;
  let failed = 0;
  for (const job of jobs ?? []) {
    try {
      await webpush.sendNotification(
        job.subscription,
        JSON.stringify({ id: job.id, title: job.title, body: job.body, fireAt: job.fire_at }),
        { TTL: 600, urgency: 'high' },
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // 送っている間にアプリが同じ行を新しい予定で上書きしていたら触らない(fire_atとsent_atで、
      // 取り出した時の予定のままかを確かめる。Codexレビュー指摘)
      if (status === 404 || status === 410) {
        // 端末側で登録が無効になったもの。予定ごと消す
        await supabase.from('cardio_push_jobs').delete()
          .eq('id', job.id).eq('fire_at', job.fire_at).eq('sent_at', now);
        gone++;
      } else {
        // 一時的な失敗(429/5xx/通信)は、目標時刻から5分以内なら次の定期実行で送り直す
        failed++;
        console.error('send failed', job.id, status, (e as Error).message);
        if (Date.now() - new Date(job.fire_at).getTime() < 5 * 60 * 1000) {
          await supabase.from('cardio_push_jobs').update({ sent_at: null })
            .eq('id', job.id).eq('fire_at', job.fire_at).eq('sent_at', now);
        }
      }
    }
  }

  return Response.json({ due: jobs?.length ?? 0, sent, gone, failed });
});
