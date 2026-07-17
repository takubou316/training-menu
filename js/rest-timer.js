// トレーニング記録画面でセットの「完了」を押した時に自動で始まる、全画面表示の休憩タイマー。
// 「+10秒」で延長、「今すぐ終わる」で即座に閉じられる。0になったら少し表示してから自動で閉じる。

let restTimerInterval = null;
let restTimerEndAt = null;
let restTimerAudioCtx = null;
let restTimerLastBeepSec = null;

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
  restTimerEndAt = Date.now() + seconds * 1000;
  restTimerLastBeepSec = null;
  ensureRestTimerAudioCtx();
  const modal = document.getElementById('rest-timer-modal');
  if (!modal) return;
  modal.hidden = false;
  modal.classList.remove('rest-timer-done');
  lockBodyScroll();
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
    if (!restTimerInterval) restTimerInterval = setInterval(updateRestTimerDisplay, 250);
  }
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
      setTimeout(endRestTimer, 2000);
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
