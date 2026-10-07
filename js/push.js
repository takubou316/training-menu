// 有酸素の目標時間のプッシュ通知（2026-10-07〜）。
// アプリ内の音(js/cardio-timer.js)は、ホーム画面のアプリを開いている間しか鳴らせない(裏に回るとJSが止まる)。
// そこで、計測を始めた時に「目標時刻にこの端末へ通知を送る」予定をSupabaseのcardio_push_jobsへ1件入れ、
// 時刻が来たらサーバー(Edge Function「cardio-push-dispatch」、pg_cronで10秒ごと)が送る。
// 休憩・終了で予定を消し、再開・目標の変更で入れ直す。iPhone標準のタイマーと違い、自分の予定だけを
// 消すので他のタイマーを巻き込まない(2026-10-06/07の実機実験で比較して決定)。
//
// 使える条件: 通知を許可している・クラウド同期(Googleログイン)中・ネットにつながっている。
// どれかが欠けても計測とアプリ内の音はそのまま動く(予定の登録・削除の失敗は記録して無視する)。
// 既知の制約: 終了時にネットにつながっていないと予定を消せず、後から通知が届くことがある。

const CARDIO_PUSH_VAPID_PUBLIC_KEY = 'BMRDXsvZlsojfOzrzQMKzxHH6_hubzuHeAkTUI5XVfDGuTFRgv0UVuCmkqVTN3wtRT8uypNLhws4yKheky7lv7g';
const CARDIO_PUSH_ENABLED_KEY = 'training-menu:cardio-push-enabled';
const CARDIO_PUSH_DEVICE_ID_KEY = 'training-menu:push-device-id';

function cardioPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function isStandaloneApp() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function isCardioPushEnabled() {
  try { return localStorage.getItem(CARDIO_PUSH_ENABLED_KEY) === '1'; } catch (e) { return false; }
}

function setCardioPushEnabled(enabled) {
  try { localStorage.setItem(CARDIO_PUSH_ENABLED_KEY, enabled ? '1' : '0'); } catch (e) { /* 次回また設定すればよい */ }
}

// 端末ごとの予定を区別するためのid(1端末につき予定は1件で、同じidで上書きする)
function cardioPushDeviceId() {
  try {
    let id = localStorage.getItem(CARDIO_PUSH_DEVICE_ID_KEY);
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || `d${Date.now()}${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(CARDIO_PUSH_DEVICE_ID_KEY, id);
    }
    return id;
  } catch (e) {
    return null;
  }
}

// 予定を送れる状態か(通知を許可していて、ログイン中)
function isCardioPushReady() {
  return cardioPushSupported() && isCardioPushEnabled() && Notification.permission === 'granted'
    && typeof isCloudSyncActive === 'function' && isCloudSyncActive();
}

function vapidKeyToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// 通知の宛先(購読)。iPhoneでは登録が消えることがあるので、無ければその場で作り直す
async function cardioPushSubscription() {
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription())
    || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyToUint8Array(CARDIO_PUSH_VAPID_PUBLIC_KEY) });
}

// 設定の「オンにする」。通知の許可はボタンを押した操作の中でないとiPhoneでは聞けない
async function enableCardioPush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: permission === 'denied' ? 'denied' : 'dismissed' };
  await cardioPushSubscription();
  setCardioPushEnabled(true);
  return { ok: true };
}

async function disableCardioPush() {
  // 先にオフにしておく(この後にキューで動く予定の入れ直しが、オンのつもりで予約を戻さないように。Codexレビュー指摘)
  setCardioPushEnabled(false);
  await cancelCardioPush();
  await cancelRoutinePush();
}

// 予定の登録・削除は「最後に頼んだ操作」だけが効くよう順番に流す(休憩→再開を素早く押した時に、
// 先に出した削除が後から届いて再開の予定を消してしまわないため)。呼び出し元には成否をそのまま返し、
// 失敗してもキュー自体は止めない(設定画面のテストで「失敗したのに成功」と出さないため。Codexレビュー指摘)。
let cardioPushQueue = Promise.resolve();
function enqueueCardioPush(task) {
  const run = cardioPushQueue.then(task);
  cardioPushQueue = run.catch((e) => console.warn('cardio push:', e && e.message));
  return run;
}

function currentPushUserId() {
  return (currentSupabaseSession && currentSupabaseSession.user && currentSupabaseSession.user.id) || null;
}

// 頼んだ時のユーザーのままか(待っている間にログアウト・別アカウントに変わったら送らない。Codexレビュー指摘)
function assertSamePushUser(userId) {
  if (!userId || currentPushUserId() !== userId) throw new Error('ログイン状態が変わったため中止しました');
}

function scheduleCardioPush(fireAtMs, title, body) {
  if (!isCardioPushReady()) return Promise.resolve();
  const userId = currentPushUserId();
  return enqueueCardioPush(async () => {
    const deviceId = cardioPushDeviceId();
    if (!deviceId) return;
    const sub = await cardioPushSubscription();
    assertSamePushUser(userId);
    // 予定は1ユーザー1件(サーバー側でunique(user_id))。別の端末で始めた予定は上書きされる
    const { error } = await supabaseClient.from('cardio_push_jobs').upsert({
      user_id: userId,
      device_id: deviceId,
      subscription: sub.toJSON(),
      fire_at: new Date(fireAtMs).toISOString(),
      title,
      body,
      sent_at: null,
    }, { onConflict: 'user_id' });
    if (error) throw error;
  });
}

// この端末が入れた予定だけを消す(別の端末で始めた予定は消さない)
function cancelCardioPush() {
  if (!cardioPushSupported() || typeof isCloudSyncActive !== 'function' || !isCloudSyncActive()) return Promise.resolve();
  const userId = currentPushUserId();
  return enqueueCardioPush(async () => {
    const deviceId = cardioPushDeviceId();
    if (!deviceId) return;
    assertSamePushUser(userId);
    const { error } = await supabaseClient.from('cardio_push_jobs').delete().eq('user_id', userId).eq('device_id', deviceId);
    if (error) throw error;
  });
}

// ログイン状態が確定した時・ログインし直した時・アプリに戻ってきた時に、計測中のタイマーの状態で予定を
// 入れ直す。起動直後(ログイン確認前)の停止・休憩で消し損ねた予定や、再読み込みで復元した計測、
// iPhoneで通知の宛先が変わった場合を、ここで追いつかせる(Codexレビュー指摘)。
let cardioPushSyncedUserId = null;
function resyncCardioPushIfNeeded(force) {
  const userId = typeof isCloudSyncActive === 'function' && isCloudSyncActive() ? currentPushUserId() : null;
  if (!force && userId === cardioPushSyncedUserId) return;
  cardioPushSyncedUserId = userId;
  // 予定の時刻の通知も、ログインが確定した時・アプリに戻った時に入れ直す(日付が変わった・別の端末で記録した等に追いつく)
  if (userId) scheduleRoutinePushSync(true);
  if (!userId || typeof syncCardioTargetPush !== 'function') return;
  if (typeof activeCardioTimer !== 'undefined' && activeCardioTimer) syncCardioTargetPush();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') resyncCardioPushIfNeeded(true);
});

// ===== トレーニング予定の時刻の通知(2026-10-07〜) =====
// 予定ごとの「通知する時刻」(routine.remindAt)から、この先7日分の「やる日×時刻」を計算してSupabaseの
// routine_push_jobsへ入れる。その日が済んでいれば入れない(ユーザー判断「済んでいたら送らない」)。
// 「やったか」はこの端末の記録にしか無いので、アプリを開いた時・予定を変えた時・記録を終えた時などに入れ直す
// (renderTodayFocusから呼ばれる。中身が前回と同じなら送らない)。1週間以上アプリを開かないと、その先の通知は届かない。
const ROUTINE_PUSH_DAYS = 7;
let routinePushLastSignature = null;
let routinePushTimer = null;

// 予定がこの先やる日(dateKeyの配列、今日から)。一日おきは「やる日にやった」と仮定して先を読む
function routineDueDateKeysAhead(r, doneDays, days = ROUTINE_PUSH_DAYS, now = new Date()) {
  const keys = [];
  let last = [...doneDays.keys()].filter((k) => k <= localDateKey(now)).sort().pop() || null;
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const key = localDateKey(d);
    let due;
    if (r.freq === 'daily') due = true;
    else if (r.freq === 'weekdays') due = r.weekdays.includes(todayWeekdayIndex(d));
    else {
      due = last !== key && !(last && last === previousDateKey(key));
      if (due) last = key;
    }
    // 今日もう済んでいる分は送らない
    if (due && i === 0 && doneDays.has(key)) due = false;
    if (due) keys.push(key);
  }
  return keys;
}

// 入れたい通知の一覧 [{ routineId, fireAt(ISO), title, body }]
function desiredRoutinePushJobs(now = new Date()) {
  const state = loadRoutineState();
  if (state.allPaused) return [];
  const templates = loadCustomTemplates();
  const history = loadHistory();
  const jobs = [];
  state.items.forEach((r) => {
    if (r.paused || !r.remindAt || !routineActionable(r, templates)) return;
    const [hh, mm] = r.remindAt.split(':').map(Number);
    routineDueDateKeysAhead(r, routineDoneDays(r, history), ROUTINE_PUSH_DAYS, now).forEach((key) => {
      const [y, m, d] = key.split('-').map(Number);
      const fire = new Date(y, m - 1, d, hh, mm, 0, 0);
      if (fire.getTime() <= now.getTime() + 30 * 1000) return; // 過ぎた時刻は入れない
      jobs.push({
        routineId: r.id,
        fireAt: fire.toISOString(),
        title: 'トレーニングの時間です',
        body: `${routineContentText(r, templates)}の予定です`.slice(0, 200),
      });
    });
  });
  return jobs;
}

// 予定の通知を入れ直す(短い間に何度呼ばれても最後の1回だけ動く)。force=trueなら中身が同じでも送る。
// 待っている間に通常の呼び出しが来ても、強制の頼みは消さない(アプリに戻った時の入れ直しが打ち消されないように。Codexレビュー指摘)
let routinePushForcePending = false;
function scheduleRoutinePushSync(force = false) {
  routinePushForcePending = routinePushForcePending || force;
  clearTimeout(routinePushTimer);
  routinePushTimer = setTimeout(() => {
    const f = routinePushForcePending;
    routinePushForcePending = false;
    syncRoutinePush(f).catch((e) => console.warn('routine push:', e && e.message));
  }, 1500);
}

// 入れ替えはサーバーの関数(replace_routine_push_jobs)が1回で行う(古い予約の削除・新しい予約の追加・件数の確認・
// ユーザーごとの排他。supabase/migrations/20261007b_routine_push_replace_rpc.sql)。何を入れるかは、キューの順番が
// 来た時点の最新の状態で決める(待っている間に通知オフ・予定の変更があっても古い内容で上書きしないため。Codexレビュー指摘)
function syncRoutinePush(force = false) {
  if (!cardioPushSupported() || typeof isCloudSyncActive !== 'function' || !isCloudSyncActive()) return Promise.resolve();
  const userId = currentPushUserId();
  return enqueueCardioPush(async () => {
    assertSamePushUser(userId);
    const deviceId = cardioPushDeviceId();
    if (!deviceId) return;
    // 通知がオフなら「何も入れない」=入れてあった分を消す
    const desired = isCardioPushReady() ? desiredRoutinePushJobs() : [];
    const signature = JSON.stringify([userId, desired]);
    if (!force && signature === routinePushLastSignature) return;
    if (desired.length === 0) {
      const { error } = await supabaseClient.from('routine_push_jobs').delete().eq('user_id', userId).is('sent_at', null);
      if (error) throw error;
    } else {
      const sub = await cardioPushSubscription();
      assertSamePushUser(userId);
      const { error } = await supabaseClient.rpc('replace_routine_push_jobs', {
        p_device_id: deviceId,
        p_subscription: sub.toJSON(),
        p_jobs: desired.map((j) => ({ routine_id: j.routineId, fire_at: j.fireAt, title: j.title, body: j.body })),
      });
      if (error) throw error;
    }
    routinePushLastSignature = signature;
  });
}

// 送っていない予定の通知をすべて消す(ログアウト・通知をオフにする時)
function cancelRoutinePush() {
  if (!cardioPushSupported() || typeof isCloudSyncActive !== 'function' || !isCloudSyncActive()) return Promise.resolve();
  const userId = currentPushUserId();
  clearTimeout(routinePushTimer);
  return enqueueCardioPush(async () => {
    assertSamePushUser(userId);
    const { error } = await supabaseClient.from('routine_push_jobs').delete().eq('user_id', userId).is('sent_at', null);
    if (error) throw error;
    routinePushLastSignature = null;
  });
}

// 設定画面のテスト。15秒後に届く予定を入れる(サーバー側の定期実行まで含めて確かめられる)
function sendCardioPushTest() {
  return scheduleCardioPush(Date.now() + 15000, 'テスト通知', 'Compstackからの通知が届きました');
}

// ===== 記録タブ「その他の設定」の行 =====
function renderCardioPushSetting() {
  resyncCardioPushIfNeeded(false); // ログイン状態が変わるたびに呼ばれる(renderSyncStatus経由)
  const row = document.getElementById('cardio-push-row');
  if (!row) return;
  const head = '<div class="theme-picker-label">通知</div>';
  const desc = '<p class="hint-text">アプリを閉じていても・画面がロック中でも、通知で知らせます。<br>・有酸素の計測中に目標時間になった時<br>・トレーニング予定で「時刻に知らせる」にした予定の時刻（まだやっていない日だけ）</p>';
  let body;
  if (!cardioPushSupported()) {
    body = '<p class="hint-text">この端末・開き方では使えません。iPhoneはホーム画面に追加したアプリから開いてください。</p>';
  } else if (typeof isCloudSyncActive !== 'function' || !isCloudSyncActive()) {
    body = '<p class="hint-text">クラウド同期（Googleでログイン）をしている時に使えます。</p>';
  } else if (Notification.permission === 'denied') {
    body = '<p class="hint-text">通知がオフになっています。iPhoneの設定アプリ →「通知」→「Compstack」で許可してください。</p>';
  } else if (isCardioPushEnabled() && Notification.permission === 'granted') {
    body = `
      <p class="hint-text"><b>オン</b>　計測を始める時・休憩や終了の時にネットにつながっている必要があります。つながっていない時に終えると、後から通知が届くことがあります。予定の通知は、アプリを開いた時にこの先7日分を予約し直すので、1週間以上開かないとその先は届きません。</p>
      <div class="backup-actions">
        <button type="button" class="ghost-pill-btn" data-cardio-push-test>テスト（15秒後に通知）</button>
        <button type="button" class="ghost-pill-btn" data-cardio-push-off>オフにする</button>
      </div>`;
  } else {
    body = `
      <div class="backup-actions">
        <button type="button" class="ghost-pill-btn" data-cardio-push-on>オンにする</button>
      </div>`;
  }
  row.innerHTML = `${head}${desc}${body}<p class="backup-status" data-cardio-push-status aria-live="polite"></p>`;
}

function wireCardioPushSetting() {
  const row = document.getElementById('cardio-push-row');
  if (!row) return;
  const setStatus = (text) => {
    const el = row.querySelector('[data-cardio-push-status]');
    if (el) el.textContent = text;
  };
  row.addEventListener('click', async (e) => {
    try {
      if (e.target.closest('[data-cardio-push-on]')) {
        const result = await enableCardioPush();
        renderCardioPushSetting();
        if (!result.ok) setStatus(result.reason === 'denied' ? '通知が許可されませんでした。' : '通知の許可が選ばれませんでした。');
        else {
          setStatus('オンにしました。「テスト」で届くか確かめられます。');
          // 「時刻に知らせる」にしてある予定があれば、すぐに予約する
          scheduleRoutinePushSync(true);
        }
      } else if (e.target.closest('[data-cardio-push-off]')) {
        await disableCardioPush();
        renderCardioPushSetting();
        setStatus('オフにしました。');
      } else if (e.target.closest('[data-cardio-push-test]')) {
        await sendCardioPushTest();
        setStatus('15秒後に通知が届きます。アプリを閉じたり、画面をロックしたりして待ってみてください。');
      }
    } catch (err) {
      setStatus(`うまくいきませんでした: ${err && err.message ? err.message : err}`);
    }
  });
  renderCardioPushSetting();
}

document.addEventListener('DOMContentLoaded', wireCardioPushSetting);
