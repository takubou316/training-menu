// トレーニングセッション全体の経過時間を計測するストップウォッチ。
// 画面には表示せず、記録確定時にdurationSecとして保存するためだけに使う。

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

// existingStartTimeを渡すと、その時刻から経過したものとして再開する
// (アプリ再読み込み後にセッションを復元する場合に使う。js/app.jsのrestoreActiveSessionIfAny参照)。
function startSessionTimer(existingStartTime) {
  sessionStartTime = existingStartTime || Date.now();
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
// セッションを実際に終了する時(handleFinishWorkout)専用。sessionStartTimeをnullにするため、
// まだ記録中セッションが続く可能性がある場面(下のpauseSessionTimerDisplay参照)では使わないこと。
function stopSessionTimer() {
  const elapsedSec = sessionStartTime != null ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0;
  if (sessionTimerInterval) {
    clearInterval(sessionTimerInterval);
    sessionTimerInterval = null;
  }
  sessionStartTime = null;
  return elapsedSec;
}

// 記録画面から他のボトムナビ画面へ移動する時に呼ぶ(js/app.jsのnav-btnハンドラ参照)。
// currentSessionはまだ生きている(記録を終了したわけではない)ため、開始時刻(sessionStartTime)は
// 消さずにインターバルだけ止める。以前はここでstopSessionTimer()を使い回していたが、
// sessionStartTimeがnullになった状態でpersistActiveSessionSnapshotが動くと、その後の
// リロード復元時にセッション開始時刻を見失い、最終的な経過時間(durationSec)が0扱いに
// なってしまう不具合があった(2026-09-15、Codexレビュー指摘)。
function pauseSessionTimerDisplay() {
  if (sessionTimerInterval) {
    clearInterval(sessionTimerInterval);
    sessionTimerInterval = null;
  }
}
