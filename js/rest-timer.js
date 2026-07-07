// セット完了時に自動で開始する休憩タイマー。UIの表示・更新のみを担当し、
// いつ開始するかの判断（どのセットが完了したか等）はapp.js側で行う。

let restTimerInterval = null;
let restTimerEndAt = null;

function startRestTimer(seconds) {
  if (!seconds || seconds <= 0) return;
  restTimerEndAt = Date.now() + seconds * 1000;
  const timerEl = document.getElementById('rest-timer');
  if (!timerEl) return;
  timerEl.hidden = false;
  timerEl.classList.remove('rest-timer-done');
  if (restTimerInterval) clearInterval(restTimerInterval);
  updateRestTimerDisplay();
  restTimerInterval = setInterval(updateRestTimerDisplay, 250);
}

function adjustRestTimer(deltaSec) {
  if (restTimerEndAt == null) return;
  restTimerEndAt += deltaSec * 1000;
  const timerEl = document.getElementById('rest-timer');
  if (timerEl && timerEl.classList.contains('rest-timer-done') && restTimerEndAt > Date.now()) {
    timerEl.classList.remove('rest-timer-done');
    if (!restTimerInterval) restTimerInterval = setInterval(updateRestTimerDisplay, 250);
  }
  updateRestTimerDisplay();
}

function updateRestTimerDisplay() {
  const timerEl = document.getElementById('rest-timer');
  const valueEl = document.getElementById('rest-timer-value');
  if (!timerEl || !valueEl || restTimerEndAt == null) return;
  const remainingMs = restTimerEndAt - Date.now();
  if (remainingMs <= 0) {
    valueEl.textContent = '00:00';
    if (!timerEl.classList.contains('rest-timer-done')) {
      timerEl.classList.add('rest-timer-done');
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      setTimeout(hideRestTimer, 3000);
    }
    return;
  }
  const totalSec = Math.ceil(remainingMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  valueEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function hideRestTimer() {
  if (restTimerInterval) {
    clearInterval(restTimerInterval);
    restTimerInterval = null;
  }
  restTimerEndAt = null;
  const timerEl = document.getElementById('rest-timer');
  if (timerEl) {
    timerEl.hidden = true;
    timerEl.classList.remove('rest-timer-done');
  }
}
