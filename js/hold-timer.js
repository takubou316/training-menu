// プランクなど、回数ではなく時間で行う種目のための計測タイマー。
// セットの「秒」スライダー横のボタンで開始し、全画面表示になる。姿勢を作る時間を
// 確保するため、いきなり計測を始めず「準備」カウントダウン(5秒)を挟んでから計測を始める。
// 計測結果はそのままスライダーに反映される。

// 計測中に「休憩」で一時停止でき(膝をついて休む等)、「再開」で準備カウントダウンを挟んで続きから数える(2026-10-07〜)。
// 記録される秒数は休憩を除いた合計。

const HOLD_TIMER_PREP_SECONDS = 5;

// { exIndex, setIndex, targetSec, phase: 'prep'|'measuring'|'paused', prepEndAt, prepLastBeepSec,
//   accumulatedMs(前の区間までに数えた時間), startedAt(今の計測区間の開始、休憩中・準備中はnull), pausedAt, intervalId }
let activeHoldTimer = null;
let holdTimerAudioCtx = null;

// 音声ファイルを持たずWeb Audio APIでビープ音を鳴らす（rest-timer.jsと同じ方式）。
function ensureHoldTimerAudioCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!holdTimerAudioCtx) holdTimerAudioCtx = new Ctx();
  // iOS Safariは他のアプリから戻ると'interrupted'になることがあるので、'suspended'以外も再開を試みる
  if (holdTimerAudioCtx.state !== 'running') holdTimerAudioCtx.resume().catch(() => {});
  return holdTimerAudioCtx;
}

function playHoldTimerBeep(freq, duration) {
  const ctx = holdTimerAudioCtx;
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
    // 再生に失敗しても計測自体は継続する
  }
}

function toggleHoldTimer(button) {
  const [exIndex, setIndex] = button.dataset.holdTimer.split(':').map(Number);

  if (activeHoldTimer && activeHoldTimer.exIndex === exIndex && activeHoldTimer.setIndex === setIndex) {
    stopHoldTimer();
    return;
  }
  stopHoldTimer();

  ensureHoldTimerAudioCtx();
  // 「自分で作る」で秒数を決めた種目(ハーフバーピー45秒等、fixedTarget)は、目標の秒数に達したら
  // 音で知らせて自動で止める(「45秒やれたか」を記録する種目なので、それ以上数え続けない。2026-10-06)。
  // それ以外(プランクの最長記録を伸ばす等)は従来通り「中断」を押すまで数え続ける。
  const exercise = typeof currentSession !== 'undefined' && currentSession ? currentSession.exercises[exIndex] : null;
  const targetSec = exercise && exercise.fixedTarget && exercise.holdTargetSec ? Number(exercise.holdTargetSec) : null;
  activeHoldTimer = {
    exIndex,
    setIndex,
    targetSec,
    phase: 'prep',
    prepEndAt: Date.now() + HOLD_TIMER_PREP_SECONDS * 1000,
    prepLastBeepSec: null,
    accumulatedMs: 0,
    startedAt: null,
    pausedAt: null,
    intervalId: null,
  };
  button.classList.add('active');

  const modal = document.getElementById('hold-timer-modal');
  if (modal) {
    modal.classList.remove('hold-timer-measuring');
    modal.hidden = false;
  }
  updateHoldTimerPauseUi();
  lockBodyScroll();
  updateHoldTimerModal();
  activeHoldTimer.intervalId = setInterval(updateHoldTimerModal, 100);
}

function updateHoldTimerModal() {
  if (!activeHoldTimer) return;
  if (activeHoldTimer.phase === 'prep') {
    updateHoldTimerPrep();
  } else if (activeHoldTimer.phase === 'paused') {
    updateHoldTimerPaused();
  } else {
    updateHoldTimerMeasuring();
  }
}

// 休憩を除いた計測時間(ミリ秒)
function holdTimerElapsedMs() {
  if (!activeHoldTimer) return 0;
  const running = activeHoldTimer.phase === 'measuring' && activeHoldTimer.startedAt != null
    ? Date.now() - activeHoldTimer.startedAt : 0;
  return activeHoldTimer.accumulatedMs + running;
}

// 「休憩」/「再開」ボタン。計測中は「休憩」、休憩中は「再開」、準備中は出さない。
function toggleHoldTimerPause() {
  if (!activeHoldTimer) return;
  ensureHoldTimerAudioCtx();
  if (activeHoldTimer.phase === 'measuring') {
    // 休憩に入る瞬間までの秒数を記録へ反映し、目標に届いていればそのまま終える(Codexレビュー指摘)
    updateHoldTimerMeasuring();
    if (!activeHoldTimer || activeHoldTimer.phase !== 'measuring') return;
    activeHoldTimer.accumulatedMs = holdTimerElapsedMs();
    activeHoldTimer.startedAt = null;
    activeHoldTimer.phase = 'paused';
    activeHoldTimer.pausedAt = Date.now();
    const modal = document.getElementById('hold-timer-modal');
    if (modal) modal.classList.remove('hold-timer-measuring');
    updateHoldTimerPaused();
  } else if (activeHoldTimer.phase === 'paused') {
    // 姿勢を作り直す時間として、最初と同じ準備カウントダウンを挟んでから続きを数える
    activeHoldTimer.phase = 'prep';
    activeHoldTimer.pausedAt = null;
    activeHoldTimer.prepEndAt = Date.now() + HOLD_TIMER_PREP_SECONDS * 1000;
    activeHoldTimer.prepLastBeepSec = null;
    updateHoldTimerPrep();
  }
  updateHoldTimerPauseUi();
}

function updateHoldTimerPauseUi() {
  const btn = document.getElementById('hold-timer-pause');
  const note = document.getElementById('hold-timer-paused-note');
  const phase = activeHoldTimer ? activeHoldTimer.phase : null;
  if (btn) {
    btn.hidden = phase !== 'measuring' && phase !== 'paused';
    btn.textContent = phase === 'paused' ? '再開' : '休憩';
  }
  if (note) {
    const sec = Math.floor(holdTimerElapsedMs() / 1000);
    note.hidden = phase !== 'paused';
    note.textContent = phase === 'paused' ? `ここまで ${formatDuration(sec)}（再開すると続きから数えます）` : '';
  }
}

function updateHoldTimerPaused() {
  const labelEl = document.getElementById('hold-timer-label');
  const valueEl = document.getElementById('hold-timer-value');
  const restSec = Math.floor((Date.now() - activeHoldTimer.pausedAt) / 1000);
  if (labelEl) labelEl.textContent = '休憩中';
  if (valueEl) valueEl.textContent = formatDuration(restSec);
}

function updateHoldTimerPrep() {
  const labelEl = document.getElementById('hold-timer-label');
  const valueEl = document.getElementById('hold-timer-value');
  const remainingMs = activeHoldTimer.prepEndAt - Date.now();

  if (remainingMs <= 0) {
    // 準備終了、ここから実測定を開始する
    activeHoldTimer.phase = 'measuring';
    activeHoldTimer.startedAt = Date.now();
    const modal = document.getElementById('hold-timer-modal');
    if (modal) modal.classList.add('hold-timer-measuring');
    if (navigator.vibrate) navigator.vibrate(150);
    playHoldTimerBeep(1046, 0.2);
    updateHoldTimerPauseUi();
    updateHoldTimerMeasuring();
    return;
  }

  const remainingSec = Math.ceil(remainingMs / 1000);
  if (remainingSec !== activeHoldTimer.prepLastBeepSec) {
    activeHoldTimer.prepLastBeepSec = remainingSec;
    playHoldTimerBeep(880, 0.12);
  }
  if (labelEl) labelEl.textContent = activeHoldTimer.accumulatedMs > 0 ? '準備（続きから数えます）' : '準備（姿勢を作ってください）';
  if (valueEl) valueEl.textContent = String(remainingSec);
}

function updateHoldTimerMeasuring() {
  if (!activeHoldTimer || activeHoldTimer.phase !== 'measuring') return;
  const { exIndex, setIndex, targetSec } = activeHoldTimer;
  const rawElapsedSec = Math.floor(holdTimerElapsedMs() / 1000);
  const reachedTarget = targetSec != null && rawElapsedSec >= targetSec;
  const elapsedSec = reachedTarget ? targetSec : rawElapsedSec;
  const labelEl = document.getElementById('hold-timer-label');
  const valueEl = document.getElementById('hold-timer-value');
  const button = document.querySelector(`[data-hold-timer="${exIndex}:${setIndex}"]`);

  const slider = document.querySelector(`input[type="range"][data-ex="${exIndex}"][data-set="${setIndex}"][data-field="reps"]`);
  let displaySec = elapsedSec;
  if (slider) {
    slider.value = Math.min(elapsedSec, Number(slider.max));
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    // rangeはstep刻みに丸められるため、表示も実際にスライダーへ反映された値に合わせる
    displaySec = Number(slider.value);
  }
  if (reachedTarget) {
    // 目標に到達: 終了の合図(2回鳴らす)をしてから止める。値は目標秒数のまま残る。
    if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
    playHoldTimerBeep(1046, 0.18);
    setTimeout(() => playHoldTimerBeep(1318, 0.3), 220);
    stopHoldTimer();
    return;
  }
  if (labelEl) labelEl.textContent = targetSec != null ? `計測中（目標${targetSec}秒・残り${targetSec - displaySec}秒）` : '計測中';
  if (valueEl) valueEl.textContent = formatDuration(displaySec);
  if (button) button.textContent = `■ ${formatDuration(displaySec)}`;
}

function stopHoldTimer() {
  if (!activeHoldTimer) return;
  clearInterval(activeHoldTimer.intervalId);
  const { exIndex, setIndex } = activeHoldTimer;
  const button = document.querySelector(`[data-hold-timer="${exIndex}:${setIndex}"]`);
  if (button) {
    button.textContent = '▶ 計測';
    button.classList.remove('active');
  }
  const modal = document.getElementById('hold-timer-modal');
  if (modal) {
    modal.hidden = true;
    modal.classList.remove('hold-timer-measuring');
  }
  unlockBodyScroll();
  activeHoldTimer = null;
  updateHoldTimerPauseUi();
}
