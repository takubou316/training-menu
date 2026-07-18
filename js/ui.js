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

function buildWarmupHtml(warmup) {
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

  return `
    <div class="menu-block">
      <h3>ウォームアップ</h3>
      <div class="warmup-item"><div class="ex-meta">${warmup.general}</div></div>
      ${dynamicWarmupHtml}
      <div class="warmup-item"><div class="ex-meta">本セット前に、各種目1セット軽い重量・回数で慣らしてから始めましょう（下の各種目にもウォームアップセットとして表示されます）</div></div>
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

  const warmupHtml = buildWarmupHtml(menu.warmup);

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
    <button type="button" class="secondary-btn" id="menu-add-exercise-btn">＋ 種目を追加</button>
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

function sliderFieldHtml({ exIndex, setIndex, field, label, min, max, step, value, holdBased, extraHtml }) {
  const labelHtml = field === 'rpe'
    ? `<span>${label} <button type="button" class="rpe-info-btn" data-rpe-info-toggle aria-label="RPEとは">ⓘ</button></span>`
    : `<span>${label}</span>`;
  const rpeReserveHtml = field === 'rpe'
    ? `<span class="rpe-reserve-hint" data-rpe-reserve="${exIndex}:${setIndex}">${rpeReserveText(value)}</span>`
    : '';
  return `
        <div class="slider-field">
          <div class="slider-label">${labelHtml}${rpeReserveHtml}<span class="slider-value">${formatSliderValue(field, value, holdBased)}</span></div>
          <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-ex="${exIndex}" data-set="${setIndex}" data-field="${field}">
          ${extraHtml || ''}
        </div>`;
}

// ===== 「自分で作る」モード / メニュー画面での種目追加で使う共通部品 =====

function renderCustomWuCd(warmup, cooldown) {
  const container = document.getElementById('custom-wu-cd');
  if (!container) return;

  if (warmup.dynamic.length === 0 && cooldown.static.length === 0) {
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
        <input type="range" min="0" max="300" step="15" value="${restSec}" data-custom-rest="${ex.id}">
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

function renderExercisePicker(query, isSelectedFn, filterMode) {
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
  const warmupHtml = `
    <details class="wu-cd-toggle">
      <summary>ウォームアップを見る</summary>
      ${buildWarmupHtml(session.warmup)}
    </details>`;
  const cooldownHtml = `
    <details class="wu-cd-toggle">
      <summary>クールダウンを見る</summary>
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
              : sliderFieldHtml({ exIndex, setIndex, field: 'weight', label: '重量', min: 0, max: weightRange.max, step: weightRange.step, value: s.weight });
            // 回数スライダー自体は1刻みで細かく動かせるようにしつつ、上限(max)は最初10回に
            // しておき、右端で離すと10ずつ伸びる(handleLogInput参照、伸びる幅が10刻み)。
            // 初期値ちょうどをmaxにすると「つまみが最初から右端に張り付いて動かせる幅がない」
            // 状態になるため、常に現在値より1段(10)上まで動かせる余白を持たせる。
            const repsInitialMax = ex.holdBased ? 120 : Math.max(10, Number(s.reps) + 10);
            const repsField = sliderFieldHtml({
              exIndex, setIndex, field: 'reps', label: ex.holdBased ? '秒' : '回数',
              min: 0, max: repsInitialMax, step: 1, value: s.reps, holdBased: ex.holdBased,
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
        <input type="range" min="0" max="7200" step="1" value="${ex.duration}" data-cardio-ex="${exIndex}" data-cardio-field="duration">
        <button type="button" class="cardio-timer-btn" data-cardio-timer="${exIndex}">▶ 計測</button>
      </div>
      ${ex.hasDistance ? `
      <div class="slider-field">
        <div class="slider-label"><span>距離</span><span class="slider-value">${Number(ex.distance).toFixed(1)}km</span></div>
        <input type="range" min="0" max="20" step="0.1" value="${ex.distance}" data-cardio-ex="${exIndex}" data-cardio-field="distance">
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
      <div class="h-header">
        <div class="h-date">${formatDate(session.date)}</div>
        <button type="button" class="h-delete-btn" data-history-delete="${session.id}" aria-label="この記録を削除">×</button>
      </div>
      <div class="h-meta">${goalLabel(session.goal)}　種目数 ${session.exercises.length}　総挙上量 ${Math.round(session.volume)}kg${session.durationSec ? `　時間 ${formatDuration(session.durationSec)}` : ''}</div>
      <details>
        <summary>詳細を見る</summary>
        ${session.exercises
          .map((ex) => {
            if (ex.type === 'cardio') {
              const restSummary = formatCardioRestSummary(ex.restLog);
              const detail = ex.done
                ? `${formatMinSec(ex.duration || 0)}${ex.distance ? `・${Number(ex.distance).toFixed(1)}km` : ''}${restSummary ? `・${restSummary}` : ''}`
                : '未記録';
              return `<div class="h-ex">${ex.name}: ${detail}</div>`;
            }
            // 保持時間系(プランク等)は「重量」という概念自体がなく(記録画面でも重量スライダーは
            // 表示していない)、setsのreps欄には回数ではなく保持秒数が入っている。ここで
            // holdBasedを考慮せず一律「weight||0」kg表記にしていたため、体重を使わない
            // 保持時間種目まで「0kg×◯回」という無意味な表示になってしまっていた。
            const exerciseMeta = findExerciseById(ex.exerciseId);
            const holdBased = exerciseMeta && exerciseMeta.holdBased;
            return `<div class="h-ex">${ex.name}: ${ex.sets
              .filter((s) => s.done && !s.isWarmup)
              .map((s) => (holdBased
                ? `${s.reps || 0}秒${s.rpe ? `(RPE${s.rpe})` : ''}`
                : `${s.weight || 0}kg×${s.reps || 0}${s.rpe ? `(RPE${s.rpe})` : ''}`))
              .join(', ') || '未記録'}</div>`;
          })
          .join('')}
      </details>
    </div>`)
    .join('');
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

function renderProgressScreen() {
  const overallContainer = document.getElementById('overall-progress-content');
  const overallChartHtml = buildProgressTrendChartHtml(
    overallVolumeSeries(12),
    { title: '総挙上量の推移（直近12回）', valueFormatter: (v) => `${Math.round(v)}kg` },
  );
  overallContainer.innerHTML = overallChartHtml
    || '<p class="empty-text">記録が2回分たまるとグラフが表示されます。</p>';

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
