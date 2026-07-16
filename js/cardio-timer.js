// 有酸素種目の記録画面用ストップウォッチ。session-timer.js/hold-timer.jsと同じ方式で、
// 区間の開始時刻(Date.now())だけを覚えておき、表示のたびに「今の時刻-開始時刻」で経過時間を
// 計算し直す。画面ロックやアプリ切り替えで裏の更新自体は止まっても、戻ってきた瞬間に
// 正しい経過時間へ復元される（真のバックグラウンド実行ではないが、実用上はこれで足りる）。
//
// 「休憩」で運動時間の計測を一時停止し、休憩時間だけを別に計測できる。休憩中は
// 種目の「時間」スライダーは増えず、「再開」を押すと運動時間の計測に戻る。
// 休憩の開始時刻・長さはexercise.restLogに記録として残し、記録画面・履歴で後から見られるようにする。
// 一度でも休憩すると、以降は運動時間(上)と休憩時間(下)を同時に2段表示にする
// (休憩から再開しても1段表示には戻さない。詳細はsetCardioTimerPhaseUi参照)。

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

// タイマーの全画面モーダル内に、これまでの休憩を1回ごとの小さな履歴として表示する。
function updateCardioTimerRestHistory(restLog) {
  const el = document.getElementById('cardio-timer-rest-history');
  if (!el) return;
  if (!restLog || restLog.length === 0) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  const rows = restLog.map((r, i) => `<div>${i + 1}回目 ${formatDuration(r.durationSec)}</div>`).join('');
  el.innerHTML = `${rows}<div class="cardio-timer-rest-history-total">合計 ${formatDuration(cardioRestTotalSec(restLog))}</div>`;
}

// 休憩を一度でも始めたら(今休憩中も含む)、以降はこのタイマーが終わるまで
// 運動時間と休憩時間の2段表示のままにする(休憩から戻ってもまた1段表示には戻さない)。
function hasCardioRestedAtLeastOnce() {
  return !!activeCardioTimer && (activeCardioTimer.restLog.length > 0 || activeCardioTimer.phase === 'resting');
}

function setCardioTimerPhaseUi(phase) {
  const modal = document.getElementById('cardio-timer-modal');
  const labelEl = document.getElementById('cardio-timer-label');
  const restToggleBtn = document.getElementById('cardio-timer-rest-toggle');
  const restRow = document.getElementById('cardio-timer-rest-row');
  const dualMode = hasCardioRestedAtLeastOnce();

  if (modal) modal.classList.toggle('cardio-timer-resting', phase === 'resting');
  if (labelEl) labelEl.textContent = dualMode ? '運動時間' : '計測中';
  if (restToggleBtn) restToggleBtn.textContent = phase === 'resting' ? '再開' : '休憩';
  if (restRow) restRow.hidden = !dualMode;
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
  updateCardioTimerRestHistory([]); // 前回このモーダルを使った時の休憩履歴が一瞬見えないようにリセット

  // スライダーのstep(0.25分=15秒刻み、手でドラッグする時用)のままだと、値を代入した時点で
  // ブラウザが最寄りのstepに丸めてしまい、計測中の秒単位の実測値が反映できない。
  // 計測中だけ細かいstepに一時的に変更し、手放したら元のstepに戻す(stopCardioTimer参照)。
  const slider = document.querySelector(`[data-cardio-ex="${exIndex}"][data-cardio-field="duration"]`);
  if (slider) slider.step = '0.001';

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
  // 運動時間は休憩を挟んでも常にこの表示を使う(休憩中はここで増えるのを止めているだけで、隠しはしない)
  const valueEl = document.getElementById('cardio-timer-value');
  if (valueEl) valueEl.textContent = formatDuration(activeSec);

  // 休憩時間は休憩中だけ数え、計測中は0のまま(次の休憩に備えてリセットした状態)にする
  const restValueEl = document.getElementById('cardio-timer-rest-value');
  if (restValueEl) {
    const restSec = phase === 'resting' ? Math.floor((Date.now() - segmentStartedAt) / 1000) : 0;
    restValueEl.textContent = formatDuration(restSec);
  }

  // スライダーのstepは0.25分(15秒)刻みだが、タイマー計測中は秒単位の実測値をそのまま反映する
  // (stepへの丸めはユーザーが手でドラッグする時だけ働けばよい)。
  const elapsedMin = activeSec / 60;
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
  updateCardioTimerRestHistory(restLog);
}

function stopCardioTimer() {
  if (!activeCardioTimer) return;
  if (activeCardioTimer.phase === 'resting') {
    finalizeCurrentRestSegment();
  } else {
    activeCardioTimer.accumulatedActiveMs += Date.now() - activeCardioTimer.segmentStartedAt;
    activeCardioTimer.segmentStartedAt = Date.now();
  }

  const { exIndex } = activeCardioTimer;
  // 手でドラッグする時用のstepに先に戻してから最後の反映を行う。stepを変えた後に
  // 値を直接書き換えると、ブラウザがその場でstepの倍数に丸めてしまうため、順番を
  // 逆にする(先にstepを戻す→最後にupdateCardioTimerで反映)と、つまみの位置・
  // ラベル・保存される時間が食い違わずに済む(最終的な値は15秒刻みに丸められる)。
  const slider = document.querySelector(`[data-cardio-ex="${exIndex}"][data-cardio-field="duration"]`);
  if (slider) slider.step = '0.25';
  updateCardioTimer(); // 停止した瞬間までの経過時間を反映してから止める

  clearInterval(activeCardioTimer.intervalId);
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
