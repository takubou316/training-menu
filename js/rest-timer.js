// トレーニング記録画面でセットの「完了」を押した時に自動で始まる、全画面表示の休憩タイマー。
// 「+10秒」で延長、「今すぐ終わる」で即座に閉じられる。0になったら少し表示してから自動で閉じる。

// アプリを閉じている・画面ロック中でも休憩の終わりを知らせるため、有酸素の目標時間と同じプッシュ通知の予定を入れる
// (2026-10-07〜、js/push.jsのscheduleCardioPush。予定は1ユーザー1件なので、有酸素の計測中は入れない)。

let restTimerInterval = null;
let restTimerEndAt = null;
let restTimerAudioCtx = null;
let restTimerLastBeepSec = null;
// 0秒になった後の自動終了の予約(「今すぐ終わる」と重なって2回終了しないよう、終える時・新しく始める時に取り消す)
let restTimerAutoEndTimeout = null;
// このタイマーでプッシュ通知の予定を入れたか(入れた時だけ取り消す)
let restTimerPushScheduled = false;

function scheduleRestTimerPush() {
  if (typeof scheduleCardioPush !== 'function' || typeof isCardioPushReady !== 'function' || !isCardioPushReady()) return;
  if (typeof activeCardioTimer !== 'undefined' && activeCardioTimer) return;
  restTimerPushScheduled = true;
  scheduleCardioPush(restTimerEndAt, '休憩終わり', '次のセットを始めましょう', 'rest').catch(() => {});
}

function cancelRestTimerPush() {
  if (!restTimerPushScheduled) return;
  restTimerPushScheduled = false;
  if (typeof cancelCardioPush === 'function') cancelCardioPush('rest').catch(() => {});
}

// 音声ファイルを持たずWeb Audio APIでビープ音を鳴らす（オフラインでも確実に再生できるため）。
// AudioContextの生成/再開はブラウザの自動再生制限に引っかからないよう、必ずユーザー操作
// （セットの「完了」チェック）に紐づくstartRestTimer呼び出しの中で行う。
function ensureRestTimerAudioCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!restTimerAudioCtx) restTimerAudioCtx = new Ctx();
  if (restTimerAudioCtx.state === 'suspended') restTimerAudioCtx.resume();
  return restTimerAudioCtx;
}

function playRestTimerBeep(freq, duration) {
  const ctx = restTimerAudioCtx;
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    // 音声再生に失敗しても休憩タイマー自体は継続させる
  }
}

function startRestTimer(seconds) {
  if (!seconds || seconds <= 0) return;
  const modal = document.getElementById('rest-timer-modal');
  if (!modal) return;
  const alreadyOpen = restTimerEndAt != null;
  clearTimeout(restTimerAutoEndTimeout);
  restTimerAutoEndTimeout = null;
  restTimerEndAt = Date.now() + seconds * 1000;
  restTimerLastBeepSec = null;
  ensureRestTimerAudioCtx();
  modal.hidden = false;
  modal.classList.remove('rest-timer-done');
  // 表示中にもう一度始めた時はロックを重ねない(重ねると閉じても画面が固まったままになる)
  if (!alreadyOpen) lockBodyScroll();
  scheduleRestTimerPush();
  updateRestTimerDisplay();
  if (restTimerInterval) clearInterval(restTimerInterval);
  restTimerInterval = setInterval(updateRestTimerDisplay, 250);
}

function addRestTimerSeconds(sec) {
  if (restTimerEndAt == null) return;
  restTimerEndAt += sec * 1000;
  restTimerLastBeepSec = null; // 延長した場合、残り3秒に再突入した時にまたカウントダウン音を鳴らす
  const modal = document.getElementById('rest-timer-modal');
  if (modal && modal.classList.contains('rest-timer-done') && restTimerEndAt > Date.now()) {
    modal.classList.remove('rest-timer-done');
    // 0秒の後に延長した時は、自動終了の予約を取り消す(延長した時間の途中で閉じてしまわないように)
    clearTimeout(restTimerAutoEndTimeout);
    restTimerAutoEndTimeout = null;
    if (!restTimerInterval) restTimerInterval = setInterval(updateRestTimerDisplay, 250);
  }
  // 通知の時刻も延長に合わせる
  if (restTimerEndAt > Date.now()) scheduleRestTimerPush();
  updateRestTimerDisplay();
}

function updateRestTimerDisplay() {
  const valueEl = document.getElementById('rest-timer-value');
  const modal = document.getElementById('rest-timer-modal');
  if (!valueEl || !modal || restTimerEndAt == null) return;
  const remainingMs = restTimerEndAt - Date.now();
  if (remainingMs <= 0) {
    valueEl.textContent = '00:00';
    if (!modal.classList.contains('rest-timer-done')) {
      modal.classList.add('rest-timer-done');
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      playRestTimerBeep(1046, 0.2); // 終了の合図は高めの音で長めに
      // 画面を見ている時だけ通知は取り消す(裏に回っていてもタイマーが動くことがあり、その時に消すと通知が届かない。Codexレビュー指摘)
      if (document.visibilityState === 'visible') cancelRestTimerPush();
      clearTimeout(restTimerAutoEndTimeout);
      restTimerAutoEndTimeout = setTimeout(endRestTimer, 2000);
    }
    return;
  }
  const totalSec = Math.ceil(remainingMs / 1000);
  // 残り3・2・1秒になった瞬間にそれぞれ1回だけビープを鳴らす
  if (totalSec <= 3 && totalSec >= 1 && totalSec !== restTimerLastBeepSec) {
    restTimerLastBeepSec = totalSec;
    playRestTimerBeep(880, 0.12);
  }
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  valueEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function endRestTimer() {
  clearTimeout(restTimerAutoEndTimeout);
  restTimerAutoEndTimeout = null;
  // 既に閉じている時は何もしない(2回目の終了でスクロールのロック解除が重なり、画面が古い位置へ飛んでいた)
  if (restTimerEndAt == null && !restTimerInterval) return;
  cancelRestTimerPush();
  if (restTimerInterval) {
    clearInterval(restTimerInterval);
    restTimerInterval = null;
  }
  restTimerEndAt = null;
  restTimerLastBeepSec = null;
  const modal = document.getElementById('rest-timer-modal');
  if (modal) {
    modal.hidden = true;
    modal.classList.remove('rest-timer-done');
  }
  unlockBodyScroll();
}
