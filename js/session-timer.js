// トレーニングセッション全体の経過時間を計測するストップウォッチ。
// 休憩タイマー(rest-timer.js)とは別に、開始から終了まで常にカウントアップし続ける。

let sessionTimerInterval = null;
let sessionStartTime = null;

function formatDuration(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function startSessionTimer() {
  sessionStartTime = Date.now();
  updateSessionTimerDisplay();
  if (sessionTimerInterval) clearInterval(sessionTimerInterval);
  sessionTimerInterval = setInterval(updateSessionTimerDisplay, 1000);
}

function updateSessionTimerDisplay() {
  const el = document.getElementById('session-timer-value');
  if (!el || sessionStartTime == null) return;
  const elapsedSec = Math.floor((Date.now() - sessionStartTime) / 1000);
  el.textContent = formatDuration(elapsedSec);
}

// タイマーを止めて経過秒数を返す。呼び出し側で記録に使うかは自由。
function stopSessionTimer() {
  const elapsedSec = sessionStartTime != null ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0;
  if (sessionTimerInterval) {
    clearInterval(sessionTimerInterval);
    sessionTimerInterval = null;
  }
  sessionStartTime = null;
  return elapsedSec;
}
