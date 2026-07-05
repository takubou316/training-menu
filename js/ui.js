// DOM描画。状態(state)は持たず、渡されたデータをそのまま画面に反映するだけ。

function showScreen(name) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.nav === name);
  });
}

function goalLabel(goalKey) {
  return GOALS[goalKey] ? GOALS[goalKey].label : goalKey;
}

function renderMenu(menu) {
  const container = document.getElementById('menu-content');
  const warmupHtml = `
    <div class="menu-block">
      <h3>ウォームアップ</h3>
      <ul>
        <li>${menu.warmup.general}</li>
        ${menu.warmup.dynamic.map((d) => `<li>${d}</li>`).join('')}
        <li>本セット前に、各種目1セット軽い重量・回数で肩慣らしをしてから始めましょう</li>
      </ul>
    </div>`;

  const mainHtml = menu.main
    .map((item, i) => `
    <div class="menu-block">
      <div class="ex-name">${i + 1}. ${item.name}${item.unilateral ? '（左右それぞれ）' : ''}</div>
      <div class="ex-meta">${item.sets}セット × ${item.repsMin}〜${item.repsMax}回　休憩${item.restSec}秒</div>
      ${item.note ? `<div class="ex-note">${item.note}</div>` : ''}
      ${item.description ? `<details class="ex-info"><summary>ⓘ フォームのポイント</summary><p>${item.description}</p></details>` : ''}
    </div>`)
    .join('');

  const cooldownHtml = `
    <div class="menu-block">
      <h3>クールダウン</h3>
      <ul>
        ${menu.cooldown.static.map((s) => `<li>${s}</li>`).join('')}
        <li>${menu.cooldown.general}</li>
      </ul>
    </div>`;

  container.innerHTML = `
    <div class="menu-block">
      <h3>目的</h3>
      <div class="ex-meta">${goalLabel(menu.params.goal)}</div>
    </div>
    ${warmupHtml}
    <h3 style="margin-top:16px;">本編（${menu.main.length}種目）</h3>
    ${mainHtml}
    ${cooldownHtml}
  `;
}

function renderLog(session) {
  const container = document.getElementById('log-content');
  container.innerHTML = session.exercises
    .map((ex, exIndex) => `
    <div class="exercise-card">
      <div class="ex-name">${exIndex + 1}. ${ex.name}${ex.unilateral ? '（左右それぞれ）' : ''}</div>
      <div class="ex-meta">目標 ${ex.repsMin}〜${ex.repsMax}回　休憩${ex.restSec}秒</div>
      ${ex.description ? `<details class="ex-info"><summary>ⓘ フォームのポイント</summary><p>${ex.description}</p></details>` : ''}
      <div class="ex-note">${ex.suggestion.text}</div>
      <div class="set-header">
        <span></span><span>重量(kg)</span><span>回数</span><span>RPE</span><span>完了</span>
      </div>
      ${ex.sets
        .map((s, setIndex) => `
        <div class="set-row">
          <span class="set-idx">${setIndex + 1}</span>
          <input type="number" inputmode="decimal" step="0.5" min="0" value="${s.weight}" data-ex="${exIndex}" data-set="${setIndex}" data-field="weight">
          <input type="number" inputmode="numeric" min="0" value="${s.reps}" data-ex="${exIndex}" data-set="${setIndex}" data-field="reps">
          <input type="number" inputmode="numeric" min="1" max="10" value="${s.rpe}" data-ex="${exIndex}" data-set="${setIndex}" data-field="rpe">
          <input type="checkbox" ${s.done ? 'checked' : ''} data-ex="${exIndex}" data-set="${setIndex}" data-field="done">
        </div>`)
        .join('')}
    </div>`)
    .join('');
}

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function renderHistory() {
  const container = document.getElementById('history-content');
  const history = loadHistory();
  if (history.length === 0) {
    container.innerHTML = '<p class="empty-text">まだ記録がありません。メニューを作って始めましょう。</p>';
    return;
  }
  container.innerHTML = history
    .map((session) => `
    <div class="history-item">
      <div class="h-date">${formatDate(session.date)}</div>
      <div class="h-meta">${goalLabel(session.goal)}　種目数 ${session.exercises.length}　総挙上量 ${Math.round(session.volume)}kg</div>
      <details>
        <summary>詳細を見る</summary>
        ${session.exercises
          .map((ex) => `<div class="h-ex">${ex.name}: ${ex.sets
            .filter((s) => s.done)
            .map((s) => `${s.weight || 0}kg×${s.reps || 0}${s.rpe ? `(RPE${s.rpe})` : ''}`)
            .join(', ') || '未記録'}</div>`)
          .join('')}
      </details>
    </div>`)
    .join('');
}
