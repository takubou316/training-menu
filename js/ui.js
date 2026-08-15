// DOM描画。状態(state)は持たず、渡されたデータをそのまま画面に反映するだけ。

// テンプレート名などユーザーが自由入力した文字列をinnerHTMLに埋め込む前にエスケープする。
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

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

// 種目名の左に置く★お気に入りトグル。表示箇所を問わず共通で使う。
function favoriteStarHtml(exerciseId) {
  const fav = isFavoriteExercise(exerciseId);
  return `<button type="button" class="fav-star${fav ? ' active' : ''}" data-fav-toggle="${exerciseId}" aria-label="${fav ? 'お気に入りから外す' : 'お気に入りに追加'}">${fav ? '★' : '☆'}</button>`;
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

function openRpeInfoModal() {
  document.getElementById('rpe-info-modal').classList.add('open');
  lockBodyScroll();
}

function closeRpeInfoModal() {
  document.getElementById('rpe-info-modal').classList.remove('open');
  unlockBodyScroll();
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

// 週間プラン画面での部位表示名(#part-group/#weekly-day-part-groupのdata-part値に対応)。
const PART_LABELS = { fullbody: '全身', chest: '胸', back: '背中', shoulders: '肩', arms: '腕', legs: '脚', core: '体幹・腹筋' };

// 週間プランの1曜日分の内容を、一覧行に出す短いテキストにする。
function weeklyDayContentText(day, templates) {
  if (!day || day.kind === 'rest') return '休み';
  if (day.kind === 'parts') {
    if (!day.parts || day.parts.length === 0) return '休み';
    return day.parts.map((p) => PART_LABELS[p] || p).join('・');
  }
  if (day.kind === 'template') {
    const t = templates.find((tpl) => tpl.id === day.templateId);
    return t ? `「${t.name}」` : '（削除された組み合わせ）';
  }
  return '休み';
}

// 今日の曜日を週間プランの並び(0=月〜6=日)に合わせたインデックスで返す。
// Date.getDay()は0=日曜始まりなので、月曜始まりに変換する。
function todayWeekdayIndex() {
  return (new Date().getDay() + 6) % 7;
}

function renderWeeklyPlan(plan, templates) {
  const container = document.getElementById('weekly-day-list');
  if (!container) return;
  container.innerHTML = plan.map((day, i) => {
    const isRest = !day || day.kind === 'rest';
    return `
    <div class="weekly-day-row${isRest ? ' is-rest' : ''}">
      <div class="weekly-day-label">${WEEKDAY_LABELS[i]}</div>
      <div class="weekly-day-content">${escapeHtml(weeklyDayContentText(day, templates))}</div>
      <button type="button" class="weekly-day-edit-btn" data-weekly-day-edit="${i}">変更</button>
    </div>`;
  }).join('');
}

// プリセットの保存日を「8/5」のような短い表記にする(自分で作るの保存済み組み合わせと同じ書式)。
function shortSavedDateLabel(isoString) {
  const d = new Date(isoString);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 週間プランの中身を、休み・今日の曜日を省いた「曜日：内容」の行リストにする
// （モード選択画面の週間プランパネル用）。主役は中身なので、1行に詰め込まず曜日ごとに
// 見やすく並べる。今日の予定は2026-08-14に画面最上部の#today-focus-section（renderTodayFocus）
// へ昇格したため、ここでは重複表示を避けるため除外している。
function weeklyPlanDaysHtml(days, templates) {
  const todayIdx = todayWeekdayIndex();
  const anyAssigned = days.some((day) => day && day.kind !== 'rest');
  if (!anyAssigned) {
    return '<p class="weekly-plan-summary-empty">まだ何も割り当てていません</p>';
  }
  const rows = days
    .map((day, i) => ({ day, i }))
    .filter(({ day, i }) => day && day.kind !== 'rest' && i !== todayIdx);
  if (rows.length === 0) {
    // 割り当てが今日だけの場合。今日の内容は上の今日の案内に出ているのでここでは触れない。
    return '<p class="weekly-plan-summary-empty">今日以外はまだ割り当てていません</p>';
  }
  return `<div class="weekly-plan-days">${rows.map(({ day, i }) => `
    <div class="weekly-plan-day-row">
      <span class="weekly-plan-day-label">${WEEKDAY_LABELS[i]}</span>
      <span class="weekly-plan-day-content">${escapeHtml(weeklyDayContentText(day, templates))}</span>
    </div>`).join('')}</div>`;
}

// モード選択画面の最上部に置く「今日の予定」案内（2026-08-14、原点回帰UX見直しの一環）。
// 週間プランを1つも作っていなければ何も表示しない（そもそも「他に」何も無い状態で
// 折りたたみを見せても意味が無いため、#mode-cards-detailsのsummary自体も隠して従来通り
// カード2枚がそのまま並ぶ見た目に戻す＝.mode-cards-flat）。プランがあれば、今日が
// 実行可能な内容(部位、または削除されていないテンプレート)なら「今日は○○の日です」＋
// 「始める」を強調表示し、その代わり「要望から作る」「自分で作る」の2枚は
// #mode-cards-detailsに折りたたむ（知識があって毎回作るのが面倒な人ほど、今日の
// 提案だけ見えれば用が済む）。休みの日は変更を最小限にしたく、軽い一言だけ添えて
// カードは従来通り開いたままにする。以前、専用の目立つバナーを別途置いて「うるさい」と
// 指摘された経緯があるため、配色は.weekly-plan-day-row-todayと同じ抑えたaccent-dimに揃えている。
function renderTodayFocus(plans, activeId, templates) {
  const container = document.getElementById('today-focus-section');
  const detailsEl = document.getElementById('mode-cards-details');
  if (!container) return;

  const setCardsFlat = (flat) => {
    if (!detailsEl) return;
    detailsEl.classList.toggle('mode-cards-flat', flat);
    if (flat) detailsEl.open = true;
  };

  if (plans.length === 0) {
    container.innerHTML = '';
    setCardsFlat(true);
    return;
  }

  const active = plans.find((p) => p.id === activeId) || plans[0];
  const day = active.days[todayWeekdayIndex()];
  const actionable = day && (
    (day.kind === 'parts' && day.parts && day.parts.length > 0)
    || (day.kind === 'template' && templates.some((t) => t.id === day.templateId))
  );

  if (actionable) {
    container.innerHTML = `
    <div class="today-focus-panel">
      <div class="today-focus-title">今日は${escapeHtml(weeklyDayContentText(day, templates))}の日です</div>
      <button type="button" class="today-focus-start-btn" data-weekly-plan-start-today>始める</button>
    </div>`;
    setCardsFlat(false);
    detailsEl.open = false;
  } else {
    container.innerHTML = '<p class="today-focus-rest">今日は休みの日です</p>';
    setCardsFlat(true);
  }
}

// モード選択画面の「週間プラン」セクション。プリセットが1つも無ければ他の2つのモードカードと
// 揃えた見た目の「作成カード」を、既にあれば使用中(active)のものを大きく＋他は折りたたみ一覧で出す。
function renderWeeklyPlanSection(plans, activeId, templates) {
  const container = document.getElementById('weekly-plan-section');
  if (!container) return;

  if (plans.length === 0) {
    container.innerHTML = `
    <button type="button" class="mode-card" id="weekly-plan-create-btn">
      <div class="mode-card-title">週間プラン</div>
      <div class="mode-card-desc">曜日ごとに鍛える部位や組み合わせを決めておけます</div>
    </button>`;
    return;
  }

  const active = plans.find((p) => p.id === activeId) || plans[0];
  const others = plans.filter((p) => p.id !== active.id);
  const daysHtml = weeklyPlanDaysHtml(active.days, templates);

  const othersHtml = others.length > 0 ? `
    <details class="weekly-plan-others-toggle">
      <summary class="ghost-pill-btn">ほかのプランを見る（${others.length}件）</summary>
      <div class="menu-block">
        ${others.map((p) => `
        <div class="template-item">
          <button type="button" class="template-item-main" data-weekly-plan-use="${p.id}">
            <div class="template-name">${escapeHtml(p.name)}</div>
            <div class="template-meta">${shortSavedDateLabel(p.createdAt)}保存</div>
          </button>
          <button type="button" class="template-delete-btn" data-weekly-plan-delete="${p.id}" aria-label="このプランを削除">✕</button>
        </div>`).join('')}
      </div>
    </details>` : '';

  // 編集する／＋新しいプランを作るは、以前は控えめなテキストリンクだったが、
  // 「他のメニューを作る」を輪郭pillボタンにしたのに合わせて2等分のボタンに変更した
  // （Imagineで複数案を提示しユーザーが選んだI案、2026-08-14）。
  container.innerHTML = `
  <div class="menu-block weekly-plan-panel">
    <h3>週間プラン</h3>
    <div class="weekly-plan-active-name">📌 ${escapeHtml(active.name)}</div>
    ${daysHtml}
    <div class="weekly-plan-links">
      <button type="button" class="ghost-pill-btn" data-weekly-plan-edit="${active.id}">編集する</button>
      <button type="button" class="ghost-pill-btn" id="weekly-plan-new-btn">＋ 新しいプラン</button>
    </div>
    ${othersHtml}
  </div>`;
}

// hasStrengthExercise: 本編に有酸素以外(重量・ウォームアップセットの概念がある種目)が1つでもあるか。
// 無ければ「軽い重量・回数で慣らしましょう」の案内は文脈に合わないため省く
// （有酸素だけのメニューには重量もウォームアップセットも存在しないため）。
function buildWarmupHtml(warmup, hasStrengthExercise) {
  const dynamicWarmupHtml = warmup.dynamic
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

  // 体操の後に行う、主要部位の短い静的ストレッチ(10秒)。クールダウンの本格的なストレッチ(20〜30秒)と
  // 内容は同じで、ウォームアップとしては短時間版として案内する(staticStretchが無い/古い形式のデータの
  // 場合は表示しない。warmup.staticStretchは後から追加したフィールドのため、undefined時は空扱い)。
  const staticStretchHtml = (warmup.staticStretch || [])
    .map((s) => `
    <div class="warmup-item">
      <div class="ex-meta">${s.label}</div>
    </div>`)
    .join('');

  const warmupSetNoteHtml = hasStrengthExercise
    ? '<div class="warmup-item"><div class="ex-meta">本セット前に、各種目1セット軽い重量・回数で慣らしてから始めましょう（下の各種目にもウォームアップセットとして表示されます）</div></div>'
    : '';

  return `
    <div class="menu-block">
      <h3>ウォームアップ</h3>
      <div class="warmup-item"><div class="ex-meta">${warmup.general}</div></div>
      ${dynamicWarmupHtml}
      ${staticStretchHtml}
      ${warmupSetNoteHtml}
    </div>`;
}

function buildCooldownHtml(cooldown) {
  return `
    <div class="menu-block">
      <div class="ex-header">
        <h3 style="margin:0;">クールダウン</h3>
        <div class="ex-icons">
          <button type="button" class="icon-btn" data-info-toggle aria-label="クールダウンのやり方">ⓘ</button>
        </div>
      </div>
      <ul>
        ${cooldown.static.map((s) => `<li>${s.label}</li>`).join('')}
        <li>${cooldown.general}</li>
      </ul>
      <div class="ex-info-panel" hidden>
        ${cooldown.static.map((s) => `<p><strong>${s.label.split('（')[0]}</strong><br>${s.description}</p>`).join('')}
      </div>
    </div>`;
}

function renderMenu(menu) {
  const container = document.getElementById('menu-content');

  const goalBlockHtml = menu.params.custom
    ? `<div class="menu-block"><h3>種目の組み方</h3><div class="ex-meta">自分で選んだ種目</div></div>`
    : `<div class="menu-block"><h3>目的</h3><div class="ex-meta">${goalLabel(menu.params.goal)}</div></div>`;

  const painNoteHtml = menu.params.painAreas && menu.params.painAreas.length > 0
    ? `<div class="menu-block"><div class="ex-note">気になる部位（${menu.params.painAreas.join('・')}）に負担がかかりやすい種目は除外して作成しています。痛みが続く場合は自己判断せず医療・専門家にご相談ください。</div></div>`
    : '';

  const shortfallNoteHtml = menu.requestedCount && menu.main.length < menu.requestedCount
    ? `<div class="menu-block"><div class="ex-note">選んだ条件（器具・レベル・部位など）に合う種目が少なく、目安の${menu.requestedCount}種目に対して${menu.main.length}種目のメニューになりました。器具を増やす、レベルを上げる、鍛えたい部位を広げるなどすると種目を増やせます。</div></div>`
    : '';

  const warmupHtml = buildWarmupHtml(menu.warmup, menu.main.some((item) => item.type !== 'cardio'));

  const mainItemsHtml = menu.main
    .map((item, i) => `
    <div class="menu-block reorder-item" data-reorder-key="${item.exerciseId}">
      <button type="button" class="reorder-delete-badge" aria-label="この種目を削除">×</button>
      <div class="ex-header">
        <div class="ex-name">${favoriteStarHtml(item.exerciseId)}${i + 1}. ${item.name}${item.unilateral ? '（左右それぞれ）' : ''}</div>
        <div class="ex-icons">
          ${item.description ? `<button type="button" class="icon-btn" data-info-toggle aria-label="フォームのポイント">ⓘ</button>` : ''}
          ${item.demoMedia ? `<button type="button" class="icon-btn" data-demo="${item.demoMedia}" aria-label="動きを見る">▶</button>` : ''}
        </div>
      </div>
      <div class="ex-meta">${item.type === 'cardio'
        ? `有酸素種目（${item.hasDistance ? '時間・距離' : '時間'}を記録）`
        : `${item.warmupSets > 0 ? `ウォームアップ${item.warmupSets}セット＋` : ''}${item.sets}セット × ${item.repsMin}〜${item.repsMax}回　休憩${item.restSec}秒`}</div>
      ${item.note ? `<div class="ex-note">${item.note}</div>` : ''}
      ${item.description ? `<div class="ex-info-panel" hidden><p>${item.description}</p></div>` : ''}
    </div>`)
    .join('');

  const mainHtml = `
    <div class="reorder-list" id="menu-exercise-list">
      <div class="reorder-toolbar">
        <span class="reorder-hint">カードを長押しすると並べ替え・削除ができます</span>
        <button type="button" class="reorder-done-btn" data-reorder-done>完了</button>
      </div>
      ${mainItemsHtml}
    </div>`;

  const cooldownHtml = buildCooldownHtml(menu.cooldown);

  container.innerHTML = `
    ${goalBlockHtml}
    ${painNoteHtml}
    ${shortfallNoteHtml}
    ${warmupHtml}
    <h3 style="margin-top:16px;">本編（${menu.main.length}種目）</h3>
    ${mainHtml}
    <div class="button-row">
      <button type="button" class="secondary-btn" id="menu-add-exercise-btn">＋ 種目を追加</button>
      <button type="button" class="secondary-btn" id="menu-auto-sort-btn">↕ 並び順を自動で整える</button>
    </div>
    <div style="height:16px;"></div>
    ${cooldownHtml}
  `;
}

// 器具ごとの現実的な重量スライダー範囲。bodyweightは重量を扱わないためスライダー自体を出さない。
const WEIGHT_RANGE_BY_EQUIPMENT = {
  dumbbell: { max: 60, step: 0.5 },
  barbell: { max: 200, step: 2.5 },
  machine: { max: 150, step: 2.5 },
};

// 有酸素の「時間」(秒単位で持つ)を「X分Y秒」で表示する。
// ちょうど分の時は「Y秒」を省略する(例: 12分、12分30秒)。
function formatMinSec(totalSeconds) {
  const totalSec = Math.round(Number(totalSeconds));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return s > 0 ? `${m}分${s}秒` : `${m}分`;
}

function formatSliderValue(field, value, holdBased) {
  if (field === 'weight') return `${value} kg`;
  if (field === 'reps') return holdBased ? `${value} 秒` : `${value} 回`;
  if (field === 'rpe') return `RPE ${value}`;
  return value;
}

// 完了にすると縮む(スライダー類を隠す)セット行に、代わりに表示する1行サマリー。
// 何をやったか消えてしまわないよう、reps/RPEだけ短く残す(重量は種目によって
// 表示形式がまちまち(自重換算等)なので、値ラベル側で既に見えている前提で含めない)。
function setRowSummaryText(set, holdBased) {
  const reps = holdBased ? `${set.reps}秒` : `${set.reps}回`;
  return `${reps}・RPE${set.rpe}`;
}

function sliderFieldHtml({ exIndex, setIndex, field, label, min, max, step, value, holdBased, extraHtml, disabled }) {
  const labelHtml = field === 'rpe'
    ? `<span>${label} <button type="button" class="rpe-info-btn" data-rpe-info-toggle aria-label="RPEとは">ⓘ</button></span>`
    : `<span>${label}</span>`;
  const rpeReserveHtml = field === 'rpe'
    ? `<span class="rpe-reserve-hint" data-rpe-reserve="${exIndex}:${setIndex}">${rpeReserveText(value)}</span>`
    : '';
  return `
        <div class="slider-field">
          <div class="slider-label">${labelHtml}${rpeReserveHtml}<span class="slider-value">${formatSliderValue(field, value, holdBased)}</span></div>
          <div class="slider-track-row">
            <span class="slider-bound-label slider-bound-min">${min}</span>
            <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-ex="${exIndex}" data-set="${setIndex}" data-field="${field}"${disabled ? ' disabled' : ''}>
            <span class="slider-bound-label slider-bound-max">${max}</span>
          </div>
          ${extraHtml || ''}
        </div>`;
}

// ===== 「自分で作る」モード / メニュー画面での種目追加で使う共通部品 =====

function renderCustomWuCd(warmup, cooldown) {
  const container = document.getElementById('custom-wu-cd');
  if (!container) return;

  const staticStretch = warmup.staticStretch || [];
  if (warmup.dynamic.length === 0 && staticStretch.length === 0 && cooldown.static.length === 0) {
    container.innerHTML = '<p class="hint-text">種目を追加すると、内容に応じたウォームアップ・クールダウンが自動で表示されます。</p>';
    return;
  }

  const warmupItemsHtml = warmup.dynamic
    .map((d, i) => `
    <div class="warmup-item">
      <div class="ex-header">
        <div class="ex-meta">${d.label}</div>
        <div class="ex-icons">
          <button type="button" class="icon-btn" data-info-toggle aria-label="この動きの説明">ⓘ</button>
          <button type="button" class="custom-remove-btn" data-custom-remove-warmup="${i}" aria-label="この項目を外す">✕</button>
        </div>
      </div>
      <div class="ex-info-panel" hidden>
        <p>${d.description}${d.forExercises.length ? `<br>→ このあとの「${d.forExercises.join('・')}」の準備。` : ''}</p>
      </div>
    </div>`)
    .join('');

  const staticStretchItemsHtml = staticStretch
    .map((s, i) => `
    <div class="warmup-item">
      <div class="ex-header">
        <div class="ex-meta">${s.label}</div>
        <div class="ex-icons">
          <button type="button" class="custom-remove-btn" data-custom-remove-static-stretch="${i}" aria-label="この項目を外す">✕</button>
        </div>
      </div>
    </div>`)
    .join('');

  const cooldownItemsHtml = cooldown.static
    .map((s, i) => `
    <div class="warmup-item cd-item">
      <div class="ex-header">
        <div class="ex-meta">${s.label}</div>
        <div class="ex-icons">
          <button type="button" class="custom-remove-btn" data-custom-remove-cooldown="${i}" aria-label="この項目を外す">✕</button>
        </div>
      </div>
    </div>`)
    .join('');

  container.innerHTML = `
    <div class="menu-block">
      <h3>ウォームアップ（自動）</h3>
      ${warmupItemsHtml || '<p class="hint-text">自動提案なし</p>'}
      ${staticStretchItemsHtml}
    </div>
    <div class="menu-block">
      <h3>クールダウン（自動）</h3>
      ${cooldownItemsHtml || '<p class="hint-text">自動提案なし</p>'}
    </div>`;
}

function renderCustomExerciseList(customExercises, customRestSec) {
  const container = document.getElementById('custom-exercise-list');
  const countEl = document.getElementById('custom-exercise-count');
  if (countEl) countEl.textContent = customExercises.length;
  if (!container) return;

  if (customExercises.length === 0) {
    container.innerHTML = '<p class="empty-text">まだ種目がありません。「＋ 種目を追加」から選んでください。</p>';
    return;
  }

  const itemsHtml = customExercises
    .map((ex, i) => {
      // 有酸素種目はセット間の休憩という概念がないため、休憩時間スライダーの代わりに
      // 「有酸素種目」のバッジだけを表示する
      const bodyHtml = ex.type === 'cardio'
        ? '<span class="picker-item-cardio-badge">有酸素種目</span>'
        : (() => {
          const restSec = customRestSec[ex.id] != null ? customRestSec[ex.id] : 90;
          return `
      <div class="slider-field">
        <div class="slider-label"><span>休憩時間</span><span class="slider-value">${restSec} 秒</span></div>
        <div class="slider-track-row">
          <span class="slider-bound-label slider-bound-min">0秒</span>
          <input type="range" min="0" max="300" step="15" value="${restSec}" data-custom-rest="${ex.id}">
          <span class="slider-bound-label slider-bound-max">300秒</span>
        </div>
      </div>`;
        })();
      return `
    <div class="custom-exercise-item reorder-item" data-reorder-key="${ex.id}">
      <button type="button" class="reorder-delete-badge" aria-label="この種目を削除">×</button>
      <div class="ex-name">${favoriteStarHtml(ex.id)}${i + 1}. ${ex.name}${ex.unilateral ? '（左右それぞれ）' : ''}</div>
      ${bodyHtml}
    </div>`;
    })
    .join('');

  container.innerHTML = `
    <div class="reorder-toolbar">
      <span class="reorder-hint">カードを長押しすると並べ替え・削除ができます</span>
      <button type="button" class="reorder-done-btn" data-reorder-done>完了</button>
    </div>
    ${itemsHtml}`;
}

// 「自分で作る」画面の上部、保存済みの種目組み合わせ一覧(折りたたみ内)。
function renderCustomTemplateList(templates) {
  const container = document.getElementById('custom-template-list');
  if (!container) return;

  if (templates.length === 0) {
    container.innerHTML = '<p class="hint-text">まだ保存した組み合わせはありません。種目を選んだあと、下の「この組み合わせを保存」から追加できます。</p>';
    return;
  }

  container.innerHTML = templates.map((t) => {
    const date = new Date(t.createdAt);
    const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`;
    return `
    <div class="template-item">
      <button type="button" class="template-item-main" data-template-load="${t.id}">
        <div class="template-name">${escapeHtml(t.name)}</div>
        <div class="template-meta">${t.exerciseIds.length}種目・${dateLabel}保存</div>
      </button>
      <button type="button" class="template-delete-btn" data-template-delete="${t.id}" aria-label="この組み合わせを削除">✕</button>
    </div>`;
  }).join('');
}

// equipmentFilter: 「要望から作る」で選んだ器具の配列(絞り込み対象外ならnull/undefined)。
// 有酸素種目は器具の概念が別枠(cardio_outdoor等)で噛み合わないため、絞り込みの対象外にして
// 常に表示する（有酸素はメニュー画面から手動追加できる仕様のため、消えてしまうと追加できなくなる）。
function renderExercisePicker(query, isSelectedFn, filterMode, equipmentFilter) {
  const listEl = document.getElementById('exercise-picker-list');
  const q = (query || '').trim().toLowerCase();
  let pool = EXERCISES;
  if (filterMode === 'favorites') {
    const favorites = new Set(loadFavorites());
    pool = EXERCISES.filter((ex) => favorites.has(ex.id));
  } else if (filterMode === 'recent') {
    const recentIds = recentExerciseIds();
    const byId = Object.fromEntries(EXERCISES.map((ex) => [ex.id, ex]));
    pool = recentIds.map((id) => byId[id]).filter(Boolean);
  }
  if (equipmentFilter) {
    pool = pool.filter((ex) => ex.type === 'cardio' || ex.equipment.some((e) => equipmentFilter.includes(e)));
  }
  const matches = pool.filter((ex) => !q || ex.name.toLowerCase().includes(q));

  if (matches.length === 0) {
    const emptyMessage = filterMode === 'favorites'
      ? 'お気に入りの種目がありません。★を押すと登録できます'
      : filterMode === 'recent'
        ? 'まだ実施した種目がありません'
        : '見つかりませんでした';
    listEl.innerHTML = `<div class="exercise-picker-empty">${emptyMessage}</div>`;
    return;
  }

  listEl.innerHTML = matches
    .map((ex) => {
      // 有酸素種目は「胸」「背中」のような部位ラベルの代わりに、検索中でもひと目で
      // 見分けられるよう見た目の違うバッジで「有酸素」と表示する
      const typeLabelHtml = ex.type === 'cardio'
        ? '<span class="picker-item-cardio-badge">有酸素</span>'
        : `<span class="picker-item-muscle">${(ex.primary || []).map((m) => MUSCLE_GROUPS[m] || m).join('・')}</span>`;
      const selected = isSelectedFn(ex.id);
      return `
    <div class="exercise-picker-item${selected ? ' selected' : ''}">
      ${favoriteStarHtml(ex.id)}
      <button type="button" class="exercise-picker-item-main" data-picker-exercise="${ex.id}">
        <span>${selected ? '✓ ' : ''}${ex.name}</span>
        ${typeLabelHtml}
      </button>
    </div>`;
    })
    .join('');
}

// ===== 進捗グラフ（チャートライブラリは使わず、インラインSVGを自前で組み立てる） =====

function formatShortDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 記録画面：種目カードに出す小さな推移スパークライン。装飾的な一目確認用で、
// 軸やツールチップは持たず、直近値だけを右にテキストで直接ラベル表示する。
// 種目のタイプ(保持時間系／自重／重量設定あり)によって、進捗グラフで何を見せるかを決める。
function progressMetricInfo(exerciseMeta) {
  if (exerciseMeta.type === 'cardio') {
    return exerciseMeta.hasDistance
      ? { title: '距離の推移（直近12回）', caption: '距離', valueFormatter: (v) => `${v.toFixed(1)}km`, detailFormatter: (p) => formatMinSec(p.duration) }
      : { title: '時間の推移（直近12回）', caption: '時間', valueFormatter: (v) => formatMinSec(v) };
  }
  if (exerciseMeta.holdBased) {
    return {
      title: '保持時間の推移（直近12回）',
      caption: '保持時間',
      valueFormatter: (v) => formatDuration(v),
    };
  }
  if (isBodyweightLoadExercise(exerciseMeta)) {
    return {
      title: '回数の推移（直近12回）',
      caption: '回数',
      valueFormatter: (v) => `${Math.round(v)}回`,
    };
  }
  return {
    title: '重量の推移（直近12回）',
    caption: '重量',
    valueFormatter: (v) => `${Math.round(v)}kg`,
    detailFormatter: (p) => `${p.reps}回`,
  };
}

function buildProgressSparklineHtml(points, valueFormatter, caption) {
  if (points.length < 2) return '';
  const width = 120;
  const height = 36;
  const padX = 4;
  const padY = 5;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const coords = points.map((p, i) => [
    padX + (i / (points.length - 1)) * innerW,
    padY + innerH - ((p.value - min) / range) * innerH,
  ]);
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lastX, lastY] = coords[coords.length - 1];
  const lastValueText = valueFormatter(points[points.length - 1].value);
  return `
    <div class="progress-sparkline-wrap">
      <svg class="progress-sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="直近の推移、最新値は${lastValueText}">
        <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3" fill="var(--accent)" />
      </svg>
      <span class="progress-sparkline-label">${caption ? `${caption} ` : ''}${lastValueText}</span>
    </div>`;
}

// このセッション内で、より前にやった種目が同じ主動筋を使っていれば、その筋肉名の配列を返す。
// 疲労で回数・重量が普段より下がっていても、それが「今日たまたま調子が悪い」のではなく
// 「先に同じ筋肉を使う種目をやったから」だと分かるようにするため。
function priorSameMuscleOverlap(session, exIndex) {
  const current = session.exercises[exIndex];
  if (!current || !current.primary) return [];
  const priorMuscles = new Set();
  for (let i = 0; i < exIndex; i += 1) {
    (session.exercises[i].primary || []).forEach((m) => priorMuscles.add(m));
  }
  return current.primary.filter((m) => priorMuscles.has(m));
}

function buildPrefatigueNoteHtml(session, exIndex) {
  const overlap = priorSameMuscleOverlap(session, exIndex);
  if (overlap.length === 0) return '';
  const muscleLabel = overlap.map((m) => MUSCLE_GROUPS[m] || m).join('・');
  return `<div class="ex-prefatigue-note">⚠ この前に${muscleLabel}を使う種目をやっています。疲労で回数・重量がいつもより下がることがあります</div>`;
}

// 本セット(ウォームアップ除く)の回数(または保持秒数)を1セット目から順に並べ、
// 1セット目から最終セットでどれだけ変わったかを添える。セット間の疲労の見え方を確認するため。
function buildRepsProgressionText(sets, holdBased) {
  const values = sets.filter((s) => !s.isWarmup).map((s) => Number(s.reps) || 0);
  if (values.length < 2) return '';
  const unit = holdBased ? '秒' : '回';
  const label = holdBased ? '保持時間の推移' : '回数の推移';
  const first = values[0];
  const last = values[values.length - 1];
  const diffText = last < first
    ? `（1セット目から${first - last}${unit}減少）`
    : last > first
      ? `（1セット目から${last - first}${unit}増加）`
      : '（変化なし）';
  return `${label}: ${values.map((v) => `${v}${unit}`).join('→')}${diffText}`;
}

// 履歴画面：セッション全体の推移を見る大きめのグラフ。軸・グリッド・タップでのツールチップつき。
function buildProgressTrendChartHtml(points, { title, valueFormatter, detailFormatter }) {
  if (points.length < 2) return '';
  const width = 320;
  const height = 160;
  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 22;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const values = points.map((p) => p.value);
  const max = Math.max(...values) || 1;
  const coords = points.map((p, i) => ({
    x: padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW),
    y: padT + innerH - (p.value / max) * innerH,
    p,
  }));
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  const gridLines = [0, 0.5, 1]
    .map((frac) => {
      const y = padT + innerH - frac * innerH;
      const val = Math.round(frac * max);
      return `
        <line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1" />
        <text x="${padL - 6}" y="${y.toFixed(1)}" text-anchor="end" dominant-baseline="middle" class="chart-axis-label">${val}</text>`;
    })
    .join('');

  const labelIdxs = new Set([0, coords.length - 1]);
  if (coords.length >= 5) labelIdxs.add(Math.floor((coords.length - 1) / 2));
  const xLabels = coords
    .map((c, i) => (labelIdxs.has(i)
      ? `<text x="${c.x.toFixed(1)}" y="${height - 6}" text-anchor="middle" class="chart-axis-label">${formatShortDate(c.p.date)}</text>`
      : ''))
    .join('');

  const dots = coords
    .map((c) => `
        <circle class="chart-point" data-chart-date="${formatShortDate(c.p.date)}" data-chart-value="${valueFormatter(c.p.value)}"
          data-chart-detail="${detailFormatter ? detailFormatter(c.p) : ''}"
          cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="10" fill="transparent" />
        <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3" fill="var(--accent)" style="pointer-events:none;" />`)
    .join('');

  return `
    <div class="progress-trend-chart-wrap">
      <h3 style="margin-bottom:4px;">${title}</h3>
      <div class="progress-trend-chart" style="position:relative;">
        <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${title}のグラフ">
          ${gridLines}
          <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          ${dots}
          ${xLabels}
        </svg>
        <div class="chart-tooltip" hidden></div>
      </div>
    </div>`;
}

function renderLog(session) {
  const container = document.getElementById('log-content');
  // ウォームアップは怪我予防に関わるため、記録画面を開いた時点で最初から展開しておく
  // （クールダウンはセット記録が終わった後に見るものなので緊急度が違い、従来通り折りたたみのまま）。
  const warmupHtml = `
    <details class="section-toggle" open>
      <summary><span class="section-toggle-title">ウォームアップ</span><span class="section-toggle-chevron">▾</span></summary>
      ${buildWarmupHtml(session.warmup, session.exercises.some((ex) => ex.type !== 'cardio'))}
    </details>`;
  const cooldownHtml = `
    <details class="section-toggle">
      <summary><span class="section-toggle-title">クールダウン</span><span class="section-toggle-chevron">▾</span></summary>
      ${buildCooldownHtml(session.cooldown)}
    </details>`;
  const exercisesHtml = session.exercises
    .map((ex, exIndex) => (ex.type === 'cardio' ? buildCardioExerciseCardHtml(ex, exIndex) : `
    <div class="exercise-card">
      <div class="ex-header">
        <div class="ex-name">${favoriteStarHtml(ex.exerciseId)}${exIndex + 1}. ${ex.name}${ex.unilateral ? '（左右それぞれ）' : ''}</div>
        <div class="ex-icons">
          ${ex.description ? `<button type="button" class="icon-btn" data-info-toggle aria-label="フォームのポイント">ⓘ</button>` : ''}
          ${ex.demoMedia ? `<button type="button" class="icon-btn" data-demo="${ex.demoMedia}" aria-label="動きを見る">▶</button>` : ''}
        </div>
      </div>
      <div class="ex-meta">目標 ${ex.repsMin}〜${ex.repsMax}${ex.holdBased ? '秒' : '回'}　休憩${ex.restSec}秒</div>
      ${ex.description ? `<div class="ex-info-panel" hidden><p>${ex.description}</p></div>` : ''}
      <div class="ex-note">${ex.suggestion.text}</div>
      ${buildPrefatigueNoteHtml(session, exIndex)}
      ${(() => {
        const metricInfo = progressMetricInfo(ex);
        return buildProgressSparklineHtml(
          exerciseProgressSeries(ex.exerciseId, ex, 8),
          metricInfo.valueFormatter,
          metricInfo.caption,
        );
      })()}
      <div class="ex-reps-progression" data-ex-reps-progression="${exIndex}">${buildRepsProgressionText(ex.sets, ex.holdBased)}</div>
      ${(() => {
        let workingN = 0;
        return ex.sets
          .map((s, setIndex) => {
            const label = s.isWarmup ? 'ウォームアップ：軽い動作で数回' : `${(workingN += 1)}`;
            const weightRange = WEIGHT_RANGE_BY_EQUIPMENT[ex.equipment && ex.equipment[0]];
            const weightField = ex.holdBased || !weightRange
              ? ''
              : sliderFieldHtml({ exIndex, setIndex, field: 'weight', label: '重量', min: 0, max: weightRange.max, step: weightRange.step, value: s.weight, disabled: s.done });
            // 回数スライダー自体は1刻みで細かく動かせるようにしつつ、上限(max)は最初10回に
            // しておき、右端で離すと10ずつ伸びる(handleLogInput参照、伸びる幅が10刻み)。
            // 初期値ちょうどをmaxにすると「つまみが最初から右端に張り付いて動かせる幅がない」
            // 状態になるため、常に現在値より1段(10)上まで動かせる余白を持たせる。
            const repsInitialMax = ex.holdBased ? 120 : Math.max(10, Number(s.reps) + 10);
            const repsField = sliderFieldHtml({
              exIndex, setIndex, field: 'reps', label: ex.holdBased ? '秒' : '回数',
              min: 0, max: repsInitialMax, step: 1, value: s.reps, holdBased: ex.holdBased, disabled: s.done,
              extraHtml: ex.holdBased ? `<button type="button" class="hold-timer-btn" data-hold-timer="${exIndex}:${setIndex}">▶ 計測</button>` : '',
            });
            const rpeField = sliderFieldHtml({ exIndex, setIndex, field: 'rpe', label: 'RPE', min: RPE_SCALE.min, max: RPE_SCALE.max, step: RPE_SCALE.step, value: s.rpe, disabled: s.done });
            return `
        <div class="set-row${s.isWarmup ? ' set-row-warmup' : ''}${s.done ? ' is-done' : ''}">
          <div class="set-row-head">
            <span class="set-idx">${label}</span>
            <span class="set-row-summary" data-set-summary="${exIndex}:${setIndex}">${s.done && !s.isWarmup ? setRowSummaryText(s, ex.holdBased) : ''}</span>
            <label class="done-toggle">
              <input type="checkbox" ${s.done ? 'checked' : ''} data-ex="${exIndex}" data-set="${setIndex}" data-field="done">
              <span class="done-toggle-pill">完了</span>
            </label>
          </div>
          <div class="set-pr-badge" data-pr-badge="${exIndex}:${setIndex}" hidden>🏆 自己ベスト更新！</div>
          ${weightField}
          ${repsField}
          ${rpeField}
        </div>`;
          })
          .join('');
      })()}
    </div>`))
    .join('');
  container.innerHTML = warmupHtml + exercisesHtml + cooldownHtml;
}

// 有酸素種目(type:'cardio')専用の記録カード。セット/回数/重量ではなく時間・距離(該当種目のみ)を
// 記録し、体重×MET×時間から推定消費カロリーを表示する。ex.durationは秒単位(1秒刻み)で持つ
// (以前は分単位・15秒刻みだったが、計測タイマーとの丸め誤差が出るため秒単位に統一した)。
function buildCardioExerciseCardHtml(ex, exIndex) {
  const bodyWeightKg = getBodyWeightKg();
  const calories = estimateCardioCalories(ex.met, bodyWeightKg, Number(ex.duration) || 0);
  const metricInfo = progressMetricInfo(ex);
  const sparklineHtml = buildProgressSparklineHtml(
    exerciseProgressSeries(ex.exerciseId, ex, 8),
    metricInfo.valueFormatter,
    metricInfo.caption,
  );
  return `
    <div class="exercise-card">
      <div class="ex-header">
        <div class="ex-name">${favoriteStarHtml(ex.exerciseId)}${exIndex + 1}. ${ex.name}</div>
        <div class="ex-icons">
          ${ex.description ? `<button type="button" class="icon-btn" data-info-toggle aria-label="やり方のポイント">ⓘ</button>` : ''}
          ${ex.demoMedia ? `<button type="button" class="icon-btn" data-demo="${ex.demoMedia}" aria-label="動きを見る">▶</button>` : ''}
        </div>
      </div>
      <div class="ex-meta">有酸素種目</div>
      ${ex.description ? `<div class="ex-info-panel" hidden><p>${ex.description}</p></div>` : ''}
      ${sparklineHtml}
      <div class="slider-field">
        <div class="slider-label"><span>時間</span><span class="slider-value">${formatMinSec(ex.duration)}</span></div>
        <div class="slider-track-row">
          <span class="slider-bound-label slider-bound-min">0分</span>
          <input type="range" min="0" max="7200" step="1" value="${ex.duration}" data-cardio-ex="${exIndex}" data-cardio-field="duration">
          <span class="slider-bound-label slider-bound-max">120分</span>
        </div>
        <button type="button" class="cardio-timer-btn" data-cardio-timer="${exIndex}">▶ 計測</button>
      </div>
      ${ex.hasDistance ? `
      <div class="slider-field">
        <div class="slider-label"><span>距離</span><span class="slider-value">${Number(ex.distance).toFixed(1)}km</span></div>
        <div class="slider-track-row">
          <span class="slider-bound-label slider-bound-min">0km</span>
          <input type="range" min="0" max="20" step="0.1" value="${ex.distance}" data-cardio-ex="${exIndex}" data-cardio-field="distance">
          <span class="slider-bound-label slider-bound-max">20km</span>
        </div>
      </div>` : ''}
      <div class="ex-note" data-cardio-calorie="${exIndex}">推定消費カロリー: 約${Math.round(calories)}kcal</div>
      <div class="ex-note" data-cardio-rest-summary="${exIndex}" ${(ex.restLog && ex.restLog.length) ? '' : 'hidden'}>${formatCardioRestSummary(ex.restLog)}</div>
      <label class="done-toggle">
        <input type="checkbox" ${ex.done ? 'checked' : ''} data-cardio-ex="${exIndex}" data-cardio-field="done">
        完了
      </label>
    </div>`;
}

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function renderTrainingStreak(history) {
  const container = document.getElementById('training-streak-summary');
  if (!container) return;
  const streak = getTrainingStreak();
  const today = localDateKey(new Date());
  const yesterday = previousDateKey(today);
  const streakIsCurrent = streak && (streak.last === today || streak.last === yesterday);
  if (!history.length || !streakIsCurrent) {
    container.hidden = true;
    container.textContent = '';
    return;
  }
  container.hidden = false;
  container.textContent = `🔥 ${streak.count}日連続`;
}

let recordViewYear = new Date().getFullYear();
let recordViewMonth = new Date().getMonth();
let recordSelectedDateStr = localDateKey(new Date());
let recordViewMode = 'calendar';
let activeRecordTab = 'record';
// 「セットの詳細を見る」を展開中のセッションid集合。日付ごとに複数セッションが
// 同時に並ぶことがある(リスト表示・複数セッション同日)ため、単一のグローバルboolean
// ではなくセッションid単位で管理する(1件だけ展開しても他のカードに影響しない)。
const expandedSessionDetailIds = new Set();

function toggleSessionDetail(sessionId) {
  if (expandedSessionDetailIds.has(sessionId)) expandedSessionDetailIds.delete(sessionId);
  else expandedSessionDetailIds.add(sessionId);
  if (recordViewMode === 'list') {
    renderListView();
  } else {
    renderRecordDayDetail();
  }
}

// 1セット分の重量/回数/RPE表記。cardio/holdBased/自重換算の既存ロジックはそのまま踏襲する。
function buildExerciseDetailHtml(ex) {
  if (ex.type === 'cardio') {
    const restSummary = formatCardioRestSummary(ex.restLog);
    return ex.done
      ? `${formatMinSec(ex.duration || 0)}${ex.distance ? `・${Number(ex.distance).toFixed(1)}km` : ''}${restSummary ? `・${restSummary}` : ''}`
      : '未記録';
  }
  const exerciseMeta = findExerciseById(ex.exerciseId);
  const holdBased = exerciseMeta && exerciseMeta.holdBased;
  const isBodyweightLoad = exerciseMeta && isBodyweightLoadExercise(exerciseMeta);
  return ex.sets
    .filter((s) => s.done && !s.isWarmup)
    .map((s) => {
      const rpeSuffix = s.rpe ? `<span class="detail-annotation">(RPE${s.rpe})</span>` : '';
      return holdBased
        ? `${s.reps || 0}秒${rpeSuffix}`
        : `${s.weight || 0}kg${isBodyweightLoad ? '<span class="detail-annotation">(体重換算)</span>' : ''}×${s.reps || 0}${rpeSuffix}`;
    })
    .join(', ') || '未記録';
}

// 1セッション分の表示は履歴一覧・カレンダーの日詳細・リスト表示で共通に使う。
// デフォルトは種目名だけの軽い一覧（以前の「1行に重量・回数まで詰め込んだ文」は
// 読みにくいという指摘があったため）。種目名の行はそのままタップするとグラフタブの
// その種目の推移へ直接飛べる（`goToExerciseGraph`）。セットの重量・回数はカード上部の
// 「セットの詳細を見る」で切り替える。
function buildSessionCardHtml(session, { showDate = true } = {}) {
  const dateHeader = `
      <div class="h-header">
        ${showDate ? `<div class="h-date">${formatDate(session.date)}</div>` : '<span></span>'}
        <button type="button" class="h-delete-btn" data-history-delete="${session.id}" aria-label="この記録を削除">×</button>
      </div>`;
  const expanded = expandedSessionDetailIds.has(session.id);
  const exListHtml = session.exercises
    .map((ex) => `
        <li>
          <button type="button" class="ex-name-row-btn" data-graph-exercise="${ex.exerciseId}">
            <span>${ex.name}${expanded ? `<span class="ex-set-detail">${buildExerciseDetailHtml(ex)}</span>` : ''}</span>
            <span class="ex-row-link-label">推移を見る ›</span>
          </button>
        </li>`)
    .join('');
  return `
    <div class="history-item">
      ${dateHeader}
      <div class="h-meta">${session.goal ? goalLabel(session.goal) : '自分で選んだ種目'}　種目数 ${session.exercises.length}　総挙上量 ${Math.round(session.volume)}kg${session.durationSec ? `　時間 ${formatDuration(session.durationSec)}` : ''}</div>
      <button type="button" class="ghost-pill-btn detail-toggle-btn" data-toggle-detail="${session.id}">
        ${expanded ? '種目名だけの表示に戻す' : 'セットの詳細を見る（重量・回数）'}
      </button>
      <ul class="ex-name-list">${exListHtml}</ul>
    </div>`;
}

// 記録タブの種目名をタップした時、グラフタブのその種目の推移へ直接切り替える。
// setActiveRecordTab('graph')がグラフタブを開いてrenderProgressScreen()経由でセレクトの
// 選択肢を作り直すので、その後に目的の種目を選び直す(デフォルト選択を上書きする)。
// その種目がまだ1件も完了セットを持たない(exercisesWithHistoryOptionsに出てこない)場合は
// セレクトにoption自体が無いため、無理に選ばずグラフタブへの遷移だけ行う。
function goToExerciseGraph(exerciseId) {
  setActiveRecordTab('graph');
  const select = document.getElementById('progress-exercise-select');
  if (!select) return;
  const hasOption = Array.from(select.options).some((opt) => opt.value === exerciseId);
  if (hasOption) {
    select.value = exerciseId;
    renderExerciseProgressChart(exerciseId);
  }
}

function groupHistoryByDate(history) {
  const grouped = new Map();
  history.forEach((session) => {
    const dateStr = localDateKey(session.date);
    if (!dateStr) return;
    if (!grouped.has(dateStr)) grouped.set(dateStr, []);
    grouped.get(dateStr).push(session);
  });
  grouped.forEach((sessions) => {
    sessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });
  return grouped;
}

function recordDateFromKey(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function recordDateLabel(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function recordWeekdayLabel(date) {
  return ['月', '火', '水', '木', '金', '土', '日'][(date.getDay() + 6) % 7];
}

function buildRecordStampImg() {
  return '<img class="cal-day-stamp" src="assets/stamp-record.svg" alt="" aria-hidden="true">';
}

function findNearestRecordDate(dateStr, direction, historyMap) {
  const dates = Array.from(historyMap.keys()).sort();
  if (direction < 0) {
    const candidates = dates.filter((date) => date < dateStr);
    return candidates.length ? candidates[candidates.length - 1] : null;
  }
  const candidates = dates.filter((date) => date > dateStr);
  return candidates.length ? candidates[0] : null;
}

function buildRecordJumpLinks(dateStr, historyMap) {
  const previous = findNearestRecordDate(dateStr, -1, historyMap);
  const next = findNearestRecordDate(dateStr, 1, historyMap);
  return `<div class="jump-links">
    ${previous ? `<button type="button" class="ghost-pill-btn" data-record-jump="${previous}">◀ 前回の記録へ（${recordDateLabel(recordDateFromKey(previous))}）</button>` : '<span></span>'}
    ${next ? `<button type="button" class="ghost-pill-btn" data-record-jump="${next}">次の記録へ（${recordDateLabel(recordDateFromKey(next))}）▶</button>` : ''}
  </div>`;
}

function buildRecordDayDetailHtml(dateStr, historyMap, { showNav = true } = {}) {
  const date = recordDateFromKey(dateStr);
  const sessions = historyMap.get(dateStr) || [];
  let bodyHtml;
  if (sessions.length) {
    bodyHtml = sessions.map((session) => buildSessionCardHtml(session, { showDate: false })).join('');
  } else if (historyMap.size === 0) {
    bodyHtml = `<div class="record-empty-state">
      <p class="empty-text">まだ記録がありません。<br>5分でも運動を始めてみませんか？</p>
      <button type="button" class="primary-btn" id="empty-state-start-btn">＋ メニューを作る</button>
    </div>`;
  } else {
    bodyHtml = `<p class="empty-text">この日は記録がありません</p>${buildRecordJumpLinks(dateStr, historyMap)}`;
  }
  return `<div class="day-detail-header">
      ${showNav ? '<button type="button" class="day-nav-btn" data-record-day-prev aria-label="前の日">◀</button>' : '<span></span>'}
      <div><span class="day-detail-date">${recordDateLabel(date)}</span><span class="day-detail-weekday">${recordWeekdayLabel(date)}曜日</span></div>
      ${showNav ? '<button type="button" class="day-nav-btn" data-record-day-next aria-label="次の日">▶</button>' : '<span></span>'}
    </div>
    <div class="day-detail-body">${bodyHtml}</div>`;
}

function renderCalendar(historyMap = groupHistoryByDate(loadHistory())) {
  const label = document.getElementById('cal-month-label');
  const grid = document.getElementById('cal-grid');
  if (!label || !grid) return;
  label.textContent = `${recordViewYear}年${recordViewMonth + 1}月`;
  grid.innerHTML = '';
  const firstOfMonth = new Date(recordViewYear, recordViewMonth, 1);
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(recordViewYear, recordViewMonth + 1, 0).getDate();
  for (let i = 0; i < leadingBlanks; i += 1) {
    const blank = document.createElement('div');
    blank.className = 'cal-day other-month';
    grid.appendChild(blank);
  }
  const todayStr = localDateKey(new Date());
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(recordViewYear, recordViewMonth, day);
    const dateStr = localDateKey(date);
    const hasRecord = historyMap.has(dateStr);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = `cal-day ${hasRecord ? 'has-record' : 'no-record'}${dateStr === todayStr ? ' is-today' : ''}${dateStr === recordSelectedDateStr ? ' selected' : ''}`;
    cell.setAttribute('aria-label', `${recordDateLabel(date)}${hasRecord ? '・記録あり' : ''}`);
    cell.innerHTML = hasRecord ? `${buildRecordStampImg()}<span class="cal-day-num">${day}</span>` : `${day}`;
    cell.addEventListener('click', () => selectRecordDate(dateStr));
    grid.appendChild(cell);
  }
}

// アプリのヘッダー(.app-header、sticky top:0で常に画面上部に固定される)の実際の高さを測って、
// 日詳細ヘッダーのsticky top位置(--sticky-header-offset)に反映する。ヘッダーの高さは環境
// (safe-area-inset-top等)で変わるためJS側で動的に算出する。
function updateStickyHeaderOffset() {
  const appHeader = document.querySelector('.app-header');
  const height = appHeader ? appHeader.getBoundingClientRect().height : 0;
  document.documentElement.style.setProperty('--sticky-header-offset', `${height}px`);
}

function renderRecordDayDetail(historyMap = groupHistoryByDate(loadHistory())) {
  const container = document.getElementById('day-detail-inline-container');
  if (!container || !recordSelectedDateStr) return;
  container.innerHTML = `<div class="day-detail-inline">${buildRecordDayDetailHtml(recordSelectedDateStr, historyMap)}</div>`;
  updateStickyHeaderOffset();
}

function selectRecordDate(dateStr) {
  recordSelectedDateStr = dateStr;
  showFullDetail = false;
  const date = recordDateFromKey(dateStr);
  recordViewYear = date.getFullYear();
  recordViewMonth = date.getMonth();
  const historyMap = groupHistoryByDate(loadHistory());
  renderCalendar(historyMap);
  renderRecordDayDetail(historyMap);
}

function moveSelectedRecordDay(deltaDays) {
  const date = recordDateFromKey(recordSelectedDateStr || localDateKey(new Date()));
  date.setDate(date.getDate() + deltaDays);
  selectRecordDate(localDateKey(date));
}

function renderListView(historyMap = groupHistoryByDate(loadHistory())) {
  const container = document.getElementById('list-view-container');
  if (!container) return;
  const dates = Array.from(historyMap.keys()).sort().reverse();
  if (dates.length === 0) {
    container.innerHTML = `<div class="record-empty-state">
      <p class="empty-text">まだ記録がありません。<br>5分でも運動を始めてみませんか？</p>
      <button type="button" class="primary-btn" id="empty-state-start-btn">＋ メニューを作る</button>
    </div>`;
    return;
  }
  container.innerHTML = dates.map((dateStr) => `<div class="day-detail-inline">${buildRecordDayDetailHtml(dateStr, historyMap, { showNav: false })}</div>`).join('');
}

function setRecordViewMode(mode) {
  recordViewMode = mode;
  const calendarButton = document.getElementById('view-mode-calendar-btn');
  const listButton = document.getElementById('view-mode-list-btn');
  calendarButton.classList.toggle('active', mode === 'calendar');
  listButton.classList.toggle('active', mode === 'list');
  calendarButton.setAttribute('aria-pressed', String(mode === 'calendar'));
  listButton.setAttribute('aria-pressed', String(mode === 'list'));
  document.getElementById('calendar-view-container').hidden = mode !== 'calendar';
  document.getElementById('list-view-container').hidden = mode !== 'list';
  const historyMap = groupHistoryByDate(loadHistory());
  if (mode === 'calendar') {
    renderCalendar(historyMap);
    renderRecordDayDetail(historyMap);
  } else {
    const dayDetailContainer = document.getElementById('day-detail-inline-container');
    if (dayDetailContainer) dayDetailContainer.innerHTML = '';
    renderListView(historyMap);
  }
}

function setActiveRecordTab(tab) {
  activeRecordTab = tab;
  const recordButton = document.getElementById('tab-record-btn');
  const graphButton = document.getElementById('tab-graph-btn');
  recordButton.classList.toggle('active', tab === 'record');
  graphButton.classList.toggle('active', tab === 'graph');
  recordButton.setAttribute('aria-selected', String(tab === 'record'));
  graphButton.setAttribute('aria-selected', String(tab === 'graph'));
  document.getElementById('record-tab-content').hidden = tab !== 'record';
  document.getElementById('graph-tab-content').hidden = tab !== 'graph';
  if (tab === 'graph') renderProgressScreen();
}

function renderRecordScreen({ selectToday = false } = {}) {
  const history = loadHistory();
  renderTrainingStreak(history);
  const historyMap = groupHistoryByDate(history);
  if (selectToday) {
    recordSelectedDateStr = localDateKey(new Date());
    activeRecordTab = 'record';
    recordViewMode = 'calendar';
  }
  if (!recordSelectedDateStr) recordSelectedDateStr = localDateKey(new Date());
  const selectedDate = recordDateFromKey(recordSelectedDateStr);
  recordViewYear = selectedDate.getFullYear();
  recordViewMonth = selectedDate.getMonth();
  if (history.length === 0) recordViewMode = 'list';
  setActiveRecordTab(activeRecordTab);
  setRecordViewMode(recordViewMode);
  if (recordViewMode === 'calendar') {
    renderCalendar(historyMap);
    renderRecordDayDetail(historyMap);
  } else {
    renderListView(historyMap);
  }
}

// ===== グラフ画面（記録一覧とは別画面。全体の総挙上量推移＋種目ごとの推移） =====

function exercisesWithHistoryOptions() {
  const history = loadHistory();
  const seen = new Map(); // exerciseId -> name
  history.forEach((session) => {
    session.exercises.forEach((ex) => {
      if (seen.has(ex.exerciseId)) return;
      const hasRecord = ex.type === 'cardio'
        ? ex.done && Number(ex.duration) > 0
        : ex.sets.some((s) => s.done && !s.isWarmup);
      if (hasRecord) seen.set(ex.exerciseId, ex.name);
    });
  });
  return Array.from(seen, ([id, name]) => ({ id, name }));
}

// 種目をまたいだ重量×回数の単純合算(総挙上量)には生理学的な意味がほぼ無く、「その日やったか」
// 自体はカレンダー(記録タブ)側で既に分かるため、種目ごとの推移のみを表示する
// (2026-08-14、記録一覧×カレンダー統合の設計検討時に決定・後日反映)。
function renderProgressScreen() {
  const select = document.getElementById('progress-exercise-select');
  const options = exercisesWithHistoryOptions();
  if (options.length === 0) {
    select.innerHTML = '<option value="">まだ記録済みの種目がありません</option>';
    select.disabled = true;
    document.getElementById('exercise-progress-content').innerHTML = '';
    return;
  }
  select.disabled = false;
  const prevValue = select.value;
  select.innerHTML = options.map((ex) => `<option value="${ex.id}">${ex.name}</option>`).join('');
  select.value = options.some((ex) => ex.id === prevValue) ? prevValue : options[0].id;
  renderExerciseProgressChart(select.value);
}

function renderExerciseProgressChart(exerciseId) {
  const container = document.getElementById('exercise-progress-content');
  if (!exerciseId) {
    container.innerHTML = '';
    return;
  }
  const exercise = EXERCISES.find((ex) => ex.id === exerciseId);
  if (!exercise) {
    container.innerHTML = '';
    return;
  }
  const metricInfo = progressMetricInfo(exercise);
  const series = exerciseProgressSeries(exerciseId, exercise, 12);
  const chartHtml = buildProgressTrendChartHtml(series, {
    title: metricInfo.title,
    valueFormatter: metricInfo.valueFormatter,
    detailFormatter: metricInfo.detailFormatter,
  });
  container.innerHTML = chartHtml
    || '<p class="empty-text">この種目の記録が2回分たまるとグラフが表示されます。</p>';
}

// ===== 豆知識画面 =====
// LLMは使わず、あらかじめ用意したQ&A(KNOWLEDGE_ENTRIES)をキーワード一致で絞り込むだけの
// 疑似的な質問応答。教科書由来の知識を「質問したら答えが返ってくる」体裁で見せる。

function renderKnowledgeTodayTip() {
  const container = document.getElementById('knowledge-today-tip');
  if (!container) return;
  const entry = todaysKnowledgeEntry();
  container.innerHTML = `
    <div class="knowledge-today-tip-label">💡 今日のヒント</div>
    <div class="knowledge-q">${escapeHtml(entry.question)}</div>
    <div class="knowledge-a">${escapeHtml(entry.answer)}</div>
    <div class="knowledge-source">${escapeHtml(entry.source)}</div>`;
}

// カテゴリの絞り込みチップを初回だけ組み立てる(「すべて」はindex.htmlに静的に置いてあるので、
// ここではKNOWLEDGE_CATEGORIESの分だけ追加する)。
function renderKnowledgeCategoryFilters() {
  const container = document.getElementById('knowledge-category-filters');
  if (!container || container.dataset.built) return;
  container.dataset.built = 'true';
  const chipsHtml = KNOWLEDGE_CATEGORIES
    .map((cat) => `<button type="button" class="picker-filter-btn" data-knowledge-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`)
    .join('');
  container.insertAdjacentHTML('beforeend', chipsHtml);
}

function renderKnowledgeList(query, category) {
  const container = document.getElementById('knowledge-list');
  if (!container) return;
  const q = (query || '').trim().toLowerCase();
  let entries = KNOWLEDGE_ENTRIES;
  if (category && category !== 'all') {
    entries = entries.filter((e) => e.category === category);
  }
  if (q) {
    entries = entries.filter((e) => e.question.toLowerCase().includes(q)
      || e.answer.toLowerCase().includes(q)
      || e.keywords.some((k) => k.toLowerCase().includes(q)));
  }

  if (entries.length === 0) {
    container.innerHTML = '<p class="empty-text">見つかりませんでした。ほかのキーワードで試してみてください。</p>';
    return;
  }

  container.innerHTML = entries.map((entry) => `
    <div class="knowledge-item">
      <div class="knowledge-q">${escapeHtml(entry.question)}</div>
      <div class="knowledge-a">${escapeHtml(entry.answer)}</div>
      <div class="knowledge-source">${escapeHtml(entry.source)}</div>
    </div>`).join('');
}
