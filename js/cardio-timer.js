// 有酸素種目の記録画面用ストップウォッチ。session-timer.js/hold-timer.jsと同じ方式で、
// 区間の開始時刻(Date.now())だけを覚えておき、表示のたびに「今の時刻-開始時刻」で経過時間を
// 計算し直す。画面ロックやアプリ切り替えで裏の更新自体は止まっても、戻ってきた瞬間に
// 正しい経過時間へ復元される（真のバックグラウンド実行ではないが、実用上はこれで足りる）。
//
// 「休憩」で運動時間の計測を一時停止し、休憩時間だけを別に計測できる。休憩中は
// 種目の「時間」スライダーは増えず、「再開」を押すと運動時間の計測に戻る。
// 休憩の開始時刻・長さはexercise.restLogに記録として残し、記録画面・履歴で後から見られるようにする。

let activeCardioTimer = null;
// { exIndex, phase: 'running'|'resting', accumulatedActiveMs, segmentStartedAt, restLog, intervalId }

function cardioRestTotalSec(restLog) {
  return (restLog || []).reduce((sum, r) => sum + r.durationSec, 0);
}

// 履歴画面など、cardio-timer.jsを一度も動かしていない画面からも呼べるよう
// フォーマット関数はここに置く（グローバルスコープなので読み込み順に関係なく参照できる）。
function formatCardioRestSummary(restLog) {
  if (!restLog || restLog.length === 0) return '';
  return `休憩${restLog.length}回・計${formatDuration(cardioRestTotalSec(restLog))}`;
}

function updateCardioRestSummaryDisplay(exIndex, restLog) {
  const el = document.querySelector(`[data-cardio-rest-summary="${exIndex}"]`);
  if (!el) return;
  if (!restLog || restLog.length === 0) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = formatCardioRestSummary(restLog);
}

function setCardioTimerPhaseUi(phase) {
  const modal = document.getElementById('cardio-timer-modal');
  const labelEl = document.getElementById('cardio-timer-label');
  const restToggleBtn = document.getElementById('cardio-timer-rest-toggle');
  if (modal) modal.classList.toggle('cardio-timer-resting', phase === 'resting');
  if (labelEl) labelEl.textContent = phase === 'resting' ? '休憩中' : '計測中';
  if (restToggleBtn) restToggleBtn.textContent = phase === 'resting' ? '再開' : '休憩';
}

function toggleCardioTimer(button) {
  const exIndex = Number(button.dataset.cardioTimer);

  if (activeCardioTimer && activeCardioTimer.exIndex === exIndex) {
    stopCardioTimer();
    return;
  }
  stopCardioTimer();

  activeCardioTimer = {
    exIndex,
    phase: 'running',
    accumulatedActiveMs: 0,
    segmentStartedAt: Date.now(),
    restLog: [],
    intervalId: null,
  };
  button.classList.add('active');

  const modal = document.getElementById('cardio-timer-modal');
  if (modal) modal.hidden = false;
  setCardioTimerPhaseUi('running');
  updateCardioTimer();
  activeCardioTimer.intervalId = setInterval(updateCardioTimer, 1000);
}

// 「計測中」区間の累計(現在進行中の区間を含む)をミリ秒で返す。休憩中は増えない。
function currentActiveMs() {
  if (!activeCardioTimer) return 0;
  const { phase, accumulatedActiveMs, segmentStartedAt } = activeCardioTimer;
  return phase === 'running' ? accumulatedActiveMs + (Date.now() - segmentStartedAt) : accumulatedActiveMs;
}

function updateCardioTimer() {
  if (!activeCardioTimer) return;
  const { exIndex, phase, segmentStartedAt } = activeCardioTimer;

  const activeSec = Math.floor(currentActiveMs() / 1000);
  // 休憩中は「休憩の経過時間」を、計測中は「運動の経過時間」を大きい数字に表示する
  const displaySec = phase === 'resting' ? Math.floor((Date.now() - segmentStartedAt) / 1000) : activeSec;
  const valueEl = document.getElementById('cardio-timer-value');
  if (valueEl) valueEl.textContent = formatDuration(displaySec);

  const elapsedMin = Math.floor(activeSec / 60);
  const slider = document.querySelector(`[data-cardio-ex="${exIndex}"][data-cardio-field="duration"]`);
  if (slider) {
    slider.value = Math.min(elapsedMin, Number(slider.max));
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const button = document.querySelector(`[data-cardio-timer="${exIndex}"]`);
  if (button) button.textContent = `■ ${formatDuration(activeSec)}`;
}

// 「休憩」「再開」共通のトグル操作。
function toggleCardioRest() {
  if (!activeCardioTimer) return;
  if (activeCardioTimer.phase === 'running') pauseCardioTimerForRest();
  else resumeCardioTimerFromRest();
}

function pauseCardioTimerForRest() {
  if (!activeCardioTimer || activeCardioTimer.phase !== 'running') return;
  const now = Date.now();
  activeCardioTimer.accumulatedActiveMs += now - activeCardioTimer.segmentStartedAt;
  activeCardioTimer.phase = 'resting';
  activeCardioTimer.segmentStartedAt = now;
  setCardioTimerPhaseUi('resting');
  updateCardioTimer();
}

function resumeCardioTimerFromRest() {
  if (!activeCardioTimer || activeCardioTimer.phase !== 'resting') return;
  finalizeCurrentRestSegment();
  activeCardioTimer.phase = 'running';
  activeCardioTimer.segmentStartedAt = Date.now();
  setCardioTimerPhaseUi('running');
  updateCardioTimer();
}

// 進行中の休憩区間をrestLogに記録として積む(exercise.restLogにも反映して記録画面・履歴用に残す)。
function finalizeCurrentRestSegment() {
  const now = Date.now();
  const durationSec = Math.round((now - activeCardioTimer.segmentStartedAt) / 1000);
  if (durationSec > 0) {
    activeCardioTimer.restLog.push({
      startedAt: new Date(activeCardioTimer.segmentStartedAt).toISOString(),
      durationSec,
    });
  }
  const { exIndex, restLog } = activeCardioTimer;
  const exercise = currentSession && currentSession.exercises[exIndex];
  if (exercise) exercise.restLog = restLog;
  updateCardioRestSummaryDisplay(exIndex, restLog);
}

function stopCardioTimer() {
  if (!activeCardioTimer) return;
  if (activeCardioTimer.phase === 'resting') {
    finalizeCurrentRestSegment();
  } else {
    activeCardioTimer.accumulatedActiveMs += Date.now() - activeCardioTimer.segmentStartedAt;
    activeCardioTimer.segmentStartedAt = Date.now();
  }
  updateCardioTimer(); // 停止した瞬間までの経過時間を反映してから止める

  clearInterval(activeCardioTimer.intervalId);
  const { exIndex } = activeCardioTimer;
  const button = document.querySelector(`[data-cardio-timer="${exIndex}"]`);
  if (button) {
    button.textContent = '▶ 計測';
    button.classList.remove('active');
  }
  const modal = document.getElementById('cardio-timer-modal');
  if (modal) {
    modal.hidden = true;
    modal.classList.remove('cardio-timer-resting');
  }
  activeCardioTimer = null;
}
