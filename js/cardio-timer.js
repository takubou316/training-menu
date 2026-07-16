// 有酸素種目の記録画面用ストップウォッチ。session-timer.js/hold-timer.jsと同じ方式で、
// 開始時刻(Date.now())だけを覚えておき、表示のたびに「今の時刻-開始時刻」で経過時間を
// 計算し直す。画面ロックやアプリ切り替えで裏の更新自体は止まっても、戻ってきた瞬間に
// 正しい経過時間へ復元される（真のバックグラウンド実行ではないが、実用上はこれで足りる）。

let activeCardioTimer = null; // { exIndex, startedAt, intervalId }

function toggleCardioTimer(button) {
  const exIndex = Number(button.dataset.cardioTimer);

  if (activeCardioTimer && activeCardioTimer.exIndex === exIndex) {
    stopCardioTimer();
    return;
  }
  stopCardioTimer();

  activeCardioTimer = { exIndex, startedAt: Date.now(), intervalId: null };
  button.classList.add('active');

  const modal = document.getElementById('cardio-timer-modal');
  if (modal) modal.hidden = false;
  updateCardioTimer();
  activeCardioTimer.intervalId = setInterval(updateCardioTimer, 1000);
}

function updateCardioTimer() {
  if (!activeCardioTimer) return;
  const { exIndex, startedAt } = activeCardioTimer;
  const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
  const elapsedMin = Math.floor(elapsedSec / 60);

  const valueEl = document.getElementById('cardio-timer-value');
  if (valueEl) valueEl.textContent = formatDuration(elapsedSec);

  const slider = document.querySelector(`[data-cardio-ex="${exIndex}"][data-cardio-field="duration"]`);
  if (slider) {
    slider.value = Math.min(elapsedMin, Number(slider.max));
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const button = document.querySelector(`[data-cardio-timer="${exIndex}"]`);
  if (button) button.textContent = `■ ${formatDuration(elapsedSec)}`;
}

function stopCardioTimer() {
  if (!activeCardioTimer) return;
  updateCardioTimer(); // 停止した瞬間までの経過時間を反映してから止める
  clearInterval(activeCardioTimer.intervalId);
  const { exIndex } = activeCardioTimer;
  const button = document.querySelector(`[data-cardio-timer="${exIndex}"]`);
  if (button) {
    button.textContent = '▶ 計測';
    button.classList.remove('active');
  }
  const modal = document.getElementById('cardio-timer-modal');
  if (modal) modal.hidden = true;
  activeCardioTimer = null;
}
