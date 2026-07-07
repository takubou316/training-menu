// プランクなど、回数ではなく時間で行う種目のための手動ストップウォッチ。
// セットの「秒」スライダーの横にあるボタンで開始/停止し、計測結果をそのままスライダーに反映する。

let activeHoldTimer = null; // { exIndex, setIndex, startedAt, intervalId }

function toggleHoldTimer(button) {
  const [exIndex, setIndex] = button.dataset.holdTimer.split(':').map(Number);

  if (activeHoldTimer && activeHoldTimer.exIndex === exIndex && activeHoldTimer.setIndex === setIndex) {
    stopHoldTimer();
    return;
  }
  stopHoldTimer();

  activeHoldTimer = { exIndex, setIndex, startedAt: Date.now(), intervalId: null };
  button.classList.add('active');
  updateHoldTimerDisplay();
  activeHoldTimer.intervalId = setInterval(updateHoldTimerDisplay, 250);
}

function updateHoldTimerDisplay() {
  if (!activeHoldTimer) return;
  const { exIndex, setIndex, startedAt } = activeHoldTimer;
  const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
  const button = document.querySelector(`[data-hold-timer="${exIndex}:${setIndex}"]`);

  const slider = document.querySelector(`input[type="range"][data-ex="${exIndex}"][data-set="${setIndex}"][data-field="reps"]`);
  let displaySec = elapsedSec;
  if (slider) {
    slider.value = Math.min(elapsedSec, Number(slider.max));
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    // rangeはstep刻みに丸められるため、ボタン表示も実際にスライダーへ反映された値に合わせる
    displaySec = Number(slider.value);
  }
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
  activeHoldTimer = null;
}
