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

function toggleInfoPanel(button) {
  const panel = button.closest('.menu-block, .exercise-card, .warmup-item').querySelector('.ex-info-panel');
  if (!panel) return;
  const isHidden = panel.hasAttribute('hidden');
  if (isHidden) {
    panel.removeAttribute('hidden');
  } else {
    panel.setAttribute('hidden', '');
  }
  button.classList.toggle('active', isHidden);
}

function openDemoModal(url) {
  const modal = document.getElementById('demo-modal');
  const video = document.getElementById('demo-video');
  video.src = url;
  video.play().catch(() => {});
  modal.classList.add('open');
}

function closeDemoModal() {
  const modal = document.getElementById('demo-modal');
  const video = document.getElementById('demo-video');
  modal.classList.remove('open');
  video.pause();
  video.removeAttribute('src');
  video.load();
}

const PAIN_AREA_LABELS = { 肩: '肩', 腰: '腰', 膝: '膝', 手首: '手首' };

function renderMenu(menu) {
  const container = document.getElementById('menu-content');

  const dynamicWarmupHtml = menu.warmup.dynamic
    .map((d) => `
    <div class="warmup-item">
      <div class="ex-header">
        <div class="ex-meta">${d.label}</div>
        <div class="ex-icons">
          <button type="button" class="icon-btn" data-info-toggle aria-label="この動きの説明">ⓘ</button>
        </div>
      </div>
      <div class="ex-info-panel" hidden>
        <p>${d.description}${d.forExercises.length ? `<br>→ このあとの「${d.forExercises.join('・')}」の準備。` : ''}</p>
      </div>
    </div>`)
    .join('');

  const painNoteHtml = menu.params.painAreas && menu.params.painAreas.length > 0
    ? `<div class="menu-block"><div class="ex-note">気になる部位（${menu.params.painAreas.join('・')}）に負担がかかりやすい種目は除外して作成しています。痛みが続く場合は自己判断せず医療・専門家にご相談ください。</div></div>`
    : '';

  const warmupHtml = `
    <div class="menu-block">
      <h3>ウォームアップ</h3>
      <div class="warmup-item"><div class="ex-meta">${menu.warmup.general}</div></div>
      ${dynamicWarmupHtml}
      <div class="warmup-item"><div class="ex-meta">本セット前に、各種目1セット軽い重量・回数で慣らしてから始めましょう（下の各種目にもウォームアップセットとして表示されます）</div></div>
    </div>`;

  const mainHtml = menu.main
    .map((item, i) => `
    <div class="menu-block">
      <div class="ex-header">
        <div class="ex-name">${i + 1}. ${item.name}${item.unilateral ? '（左右それぞれ）' : ''}</div>
        <div class="ex-icons">
          ${item.description ? `<button type="button" class="icon-btn" data-info-toggle aria-label="フォームのポイント">ⓘ</button>` : ''}
          ${item.demoMedia ? `<button type="button" class="icon-btn" data-demo="${item.demoMedia}" aria-label="動きを見る">▶</button>` : ''}
        </div>
      </div>
      <div class="ex-meta">${item.warmupSets > 0 ? `ウォームアップ${item.warmupSets}セット＋` : ''}${item.sets}セット × ${item.repsMin}〜${item.repsMax}回　休憩${item.restSec}秒</div>
      ${item.note ? `<div class="ex-note">${item.note}</div>` : ''}
      ${item.description ? `<div class="ex-info-panel" hidden><p>${item.description}</p></div>` : ''}
    </div>`)
    .join('');

  const cooldownHtml = `
    <div class="menu-block">
      <div class="ex-header">
        <h3 style="margin:0;">クールダウン</h3>
        <div class="ex-icons">
          <button type="button" class="icon-btn" data-info-toggle aria-label="クールダウンのやり方">ⓘ</button>
        </div>
      </div>
      <ul>
        ${menu.cooldown.static.map((s) => `<li>${s.label}</li>`).join('')}
        <li>${menu.cooldown.general}</li>
      </ul>
      <div class="ex-info-panel" hidden>
        ${menu.cooldown.static.map((s) => `<p><strong>${s.label.split('（')[0]}</strong><br>${s.description}</p>`).join('')}
      </div>
    </div>`;

  container.innerHTML = `
    <div class="menu-block">
      <h3>目的</h3>
      <div class="ex-meta">${goalLabel(menu.params.goal)}</div>
    </div>
    ${painNoteHtml}
    ${warmupHtml}
    <h3 style="margin-top:16px;">本編（${menu.main.length}種目）</h3>
    ${mainHtml}
    ${cooldownHtml}
  `;
}

// 器具ごとの現実的な重量スライダー範囲。bodyweightは重量を扱わないためスライダー自体を出さない。
const WEIGHT_RANGE_BY_EQUIPMENT = {
  dumbbell: { max: 60, step: 0.5 },
  barbell: { max: 200, step: 2.5 },
  machine: { max: 150, step: 2.5 },
};

function formatSliderValue(field, value, holdBased) {
  if (field === 'weight') return `${value} kg`;
  if (field === 'reps') return holdBased ? `${value} 秒` : `${value} 回`;
  if (field === 'rpe') return `RPE ${value}`;
  return value;
}

function sliderFieldHtml({ exIndex, setIndex, field, label, min, max, step, value, holdBased, extraHtml }) {
  return `
        <div class="slider-field">
          <div class="slider-label"><span>${label}</span><span class="slider-value">${formatSliderValue(field, value, holdBased)}</span></div>
          <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-ex="${exIndex}" data-set="${setIndex}" data-field="${field}">
          ${extraHtml || ''}
        </div>`;
}

function renderLog(session) {
  const container = document.getElementById('log-content');
  container.innerHTML = session.exercises
    .map((ex, exIndex) => `
    <div class="exercise-card">
      <div class="ex-header">
        <div class="ex-name">${exIndex + 1}. ${ex.name}${ex.unilateral ? '（左右それぞれ）' : ''}</div>
        <div class="ex-icons">
          ${ex.description ? `<button type="button" class="icon-btn" data-info-toggle aria-label="フォームのポイント">ⓘ</button>` : ''}
          ${ex.demoMedia ? `<button type="button" class="icon-btn" data-demo="${ex.demoMedia}" aria-label="動きを見る">▶</button>` : ''}
        </div>
      </div>
      <div class="ex-meta">目標 ${ex.repsMin}〜${ex.repsMax}${ex.holdBased ? '秒' : '回'}　休憩${ex.restSec}秒</div>
      ${ex.description ? `<div class="ex-info-panel" hidden><p>${ex.description}</p></div>` : ''}
      <div class="ex-note">${ex.suggestion.text}</div>
      ${(() => {
        let warmupN = 0;
        let workingN = 0;
        return ex.sets
          .map((s, setIndex) => {
            const label = s.isWarmup ? `W${(warmupN += 1)}` : `${(workingN += 1)}`;
            const weightRange = WEIGHT_RANGE_BY_EQUIPMENT[ex.equipment && ex.equipment[0]];
            const weightField = ex.holdBased || !weightRange
              ? ''
              : sliderFieldHtml({ exIndex, setIndex, field: 'weight', label: '重量', min: 0, max: weightRange.max, step: weightRange.step, value: s.weight });
            const repsField = sliderFieldHtml({
              exIndex, setIndex, field: 'reps', label: ex.holdBased ? '秒' : '回数',
              min: 0, max: ex.holdBased ? 120 : 30, step: ex.holdBased ? 5 : 1, value: s.reps, holdBased: ex.holdBased,
              extraHtml: ex.holdBased ? `<button type="button" class="hold-timer-btn" data-hold-timer="${exIndex}:${setIndex}">▶ 計測</button>` : '',
            });
            const rpeField = sliderFieldHtml({ exIndex, setIndex, field: 'rpe', label: 'RPE', min: RPE_SCALE.min, max: RPE_SCALE.max, step: RPE_SCALE.step, value: s.rpe });
            return `
        <div class="set-row${s.isWarmup ? ' set-row-warmup' : ''}">
          <div class="set-row-head">
            <span class="set-idx">${label}</span>
            <label class="done-toggle">
              <input type="checkbox" ${s.done ? 'checked' : ''} data-ex="${exIndex}" data-set="${setIndex}" data-field="done">
              完了
            </label>
          </div>
          ${weightField}
          ${repsField}
          ${rpeField}
        </div>`;
          })
          .join('');
      })()}
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
      <div class="h-meta">${goalLabel(session.goal)}　種目数 ${session.exercises.length}　総挙上量 ${Math.round(session.volume)}kg${session.durationSec ? `　時間 ${formatDuration(session.durationSec)}` : ''}</div>
      <details>
        <summary>詳細を見る</summary>
        ${session.exercises
          .map((ex) => `<div class="h-ex">${ex.name}: ${ex.sets
            .filter((s) => s.done && !s.isWarmup)
            .map((s) => `${s.weight || 0}kg×${s.reps || 0}${s.rpe ? `(RPE${s.rpe})` : ''}`)
            .join(', ') || '未記録'}</div>`)
          .join('')}
      </details>
    </div>`)
    .join('');
}
