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
  await cancelCardioPush();
  setCardioPushEnabled(false);
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
  if (!userId || typeof syncCardioTargetPush !== 'function') return;
  if (typeof activeCardioTimer !== 'undefined' && activeCardioTimer) syncCardioTargetPush();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') resyncCardioPushIfNeeded(true);
});

// 設定画面のテスト。15秒後に届く予定を入れる(サーバー側の定期実行まで含めて確かめられる)
function sendCardioPushTest() {
  return scheduleCardioPush(Date.now() + 15000, 'テスト通知', 'Compstackからの通知が届きました');
}

// ===== 記録タブ「その他の設定」の行 =====
function renderCardioPushSetting() {
  resyncCardioPushIfNeeded(false); // ログイン状態が変わるたびに呼ばれる(renderSyncStatus経由)
  const row = document.getElementById('cardio-push-row');
  if (!row) return;
  const head = '<div class="theme-picker-label">目標時間の通知</div>';
  const desc = '<p class="hint-text">有酸素の計測中、目標時間になった時に、アプリを閉じていても・画面がロック中でも通知で知らせます。</p>';
  let body;
  if (!cardioPushSupported()) {
    body = '<p class="hint-text">この端末・開き方では使えません。iPhoneはホーム画面に追加したアプリから開いてください。</p>';
  } else if (typeof isCloudSyncActive !== 'function' || !isCloudSyncActive()) {
    body = '<p class="hint-text">クラウド同期（Googleでログイン）をしている時に使えます。</p>';
  } else if (Notification.permission === 'denied') {
    body = '<p class="hint-text">通知がオフになっています。iPhoneの設定アプリ →「通知」→「Compstack」で許可してください。</p>';
  } else if (isCardioPushEnabled() && Notification.permission === 'granted') {
    body = `
      <p class="hint-text"><b>オン</b>　計測を始める時・休憩や終了の時にネットにつながっている必要があります。つながっていない時に終えると、後から通知が届くことがあります。</p>
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
        else setStatus('オンにしました。「テスト」で届くか確かめられます。');
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
