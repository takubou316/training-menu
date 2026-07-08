// トレーニング記録画面でセットの「完了」を押した時に自動で始まる、全画面表示の休憩タイマー。
// 「+10秒」で延長、「今すぐ終わる」で即座に閉じられる。0になったら少し表示してから自動で閉じる。

let restTimerInterval = null;
let restTimerEndAt = null;

function startRestTimer(seconds) {
  if (!seconds || seconds <= 0) return;
  restTimerEndAt = Date.now() + seconds * 1000;
  const modal = document.getElementById('rest-timer-modal');
  if (!modal) return;
  modal.hidden = false;
  modal.classList.remove('rest-timer-done');
  updateRestTimerDisplay();
  if (restTimerInterval) clearInterval(restTimerInterval);
  restTimerInterval = setInterval(updateRestTimerDisplay, 250);
}

function addRestTimerSeconds(sec) {
  if (restTimerEndAt == null) return;
  restTimerEndAt += sec * 1000;
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
      setTimeout(endRestTimer, 2000);
    }
    return;
  }
  const totalSec = Math.ceil(remainingMs / 1000);
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
  const modal = document.getElementById('rest-timer-modal');
  if (modal) {
    modal.hidden = true;
    modal.classList.remove('rest-timer-done');
  }
}
