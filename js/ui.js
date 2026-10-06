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
  // ホームへはナビ以外(設定画面の戻る等)からも来るため、ここで毎回描き直す
  if (name === 'mode') renderHomeResumeWorkout();
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
  const panel = button.closest('.menu-block, .exercise-card, .circuit-row, .warmup-item').querySelector('.ex-info-panel');
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

// クラウド同期(js/sync.js)関連のUI。2026-09-07追加。
// 初回起動時の「ログインする/しない」選択モーダルと、記録画面「その他の設定」の同期状態行を描画する。

function openSyncChoiceModal() {
  document.getElementById('sync-choice-modal').classList.add('open');
}

function closeSyncChoiceModal() {
  document.getElementById('sync-choice-modal').classList.remove('open');
}

// initSupabaseAuth()完了後にapp.jsのinit()から呼ばれる。まだ選択していない場合だけ表示する
// (一度選んだら二度と出さない。設定から後でいつでも変更できる)。
function maybeShowSyncChoiceModal() {
  if (hasSyncChoiceBeenMade()) return;
  openSyncChoiceModal();
}

// 記録画面「その他の設定」内、#sync-status-rowの中身を現在の状態に応じて描画し直す。
// クラウド同期の状態が変わるたび(ログイン成功・ログアウト・初期化完了)に呼ばれる。
// 2026-09-07Codexレビュー指摘を反映: ログイン/ログアウトどちらのボタンも結果(error)を見て
// 失敗時にエラー文言を表示するようにした(以前はfire-and-forgetで失敗時に何もフィードバックが
// 無かった)。
// 2026-09-07実機バグ修正: 「有効」表示の判定をcurrentSupabaseSessionの有無だけでなく
// isCloudSyncActive()（同期フラグも見る）に変更した。以前はセッションさえあれば無条件で
// 「有効」と表示していたため、setSyncEnabled(true)が実行されずに同期フラグが立っていない
// 状態でも画面上は「有効」に見えてしまい、実際には記録が一切同期されない不具合に気づけなかった。
// 同期欄のエラーメッセージ(ログイン/ログアウト/再送の失敗)。送信が終わるたびにrenderSyncStatusで
// 欄ごと描き直すため、DOMではなくここに覚えておき、描き直しても消えないようにする(2026-10-04 Codexレビュー指摘)。
let syncStatusMessage = '';

function renderSyncStatus() {
  const container = document.getElementById('sync-status-row');
  if (!container) return; // 記録画面をまだ開いていない場合はDOMが無いので何もしない
  const counts = SUPABASE_AVAILABLE && isCloudSyncActive() ? syncQueueCounts() : null;
  // 記録タブ上部の「送れなかった記録があります」(詳細は折りたたみの中なので、気付けるように上にも出す)
  const notice = document.getElementById('sync-failed-notice');
  if (notice) notice.hidden = !(counts && counts.failed > 0);
  if (!SUPABASE_AVAILABLE) {
    container.innerHTML = `<p class="hint-text">クラウド同期は現在利用できません（読み込みに失敗した可能性があります）。記録はこの端末のみに保存されます。</p>`;
    return;
  }
  if (counts) {
    const email = escapeHtml(currentSupabaseSession.user?.email || '');
    // 送信待ち・送れなかった記録・最後に送れた日時(2026-10-04〜。以前は「有効」としか出さず、
    // 送れていないことに気付けなかった)。
    const { pending, failed, lastSuccessAt } = counts;
    const lastDate = lastSuccessAt ? new Date(lastSuccessAt) : null;
    const lastText = lastDate && !Number.isNaN(lastDate.getTime())
      ? `${lastDate.getMonth() + 1}月${lastDate.getDate()}日 ${lastDate.getHours()}:${String(lastDate.getMinutes()).padStart(2, '0')}`
      : '';
    container.innerHTML = `
      <p class="hint-text">クラウド同期: 有効${email ? `（${email}）` : ''}</p>
      <p class="hint-text">クラウドに送るのはトレーニング記録だけです。体重・腹囲はこの端末にだけ保存されます（下の「データを書き出す」には含まれます）。</p>
      ${pending > 0 ? `<p class="hint-text sync-pending-text">送信待ち: ${pending}件（ネットにつながっている時に自動で送ります）</p>` : ''}
      ${failed > 0 ? `
      <div class="sync-failed-row">
        <p class="error-text sync-failed-text">送れなかった記録: ${failed}件</p>
        <button type="button" class="ghost-pill-btn sync-retry-btn" id="sync-retry-btn">もう一度送る</button>
      </div>` : ''}
      ${lastText ? `<p class="hint-text">最後に送れた日時: ${lastText}</p>` : ''}
      <button type="button" class="secondary-btn" id="sync-signout-btn">ログアウトする</button>
      <p class="error-text" id="sync-status-error">${escapeHtml(syncStatusMessage)}</p>`;
    const retryBtn = document.getElementById('sync-retry-btn');
    if (retryBtn) retryBtn.addEventListener('click', async () => {
      retryBtn.disabled = true;
      retryBtn.textContent = '送信中…';
      syncStatusMessage = '';
      try {
        await retryFailedSyncEntries();
      } catch (e) {
        syncStatusMessage = '再送の準備に失敗しました。端末の空き容量を確認してください。';
      } finally {
        renderSyncStatus();
      }
    });
    const btn = document.getElementById('sync-signout-btn');
    if (btn) btn.addEventListener('click', async () => {
      syncStatusMessage = '';
      const { error } = await signOutFromSync();
      if (error) syncStatusMessage = 'ログアウトに失敗しました。もう一度お試しください。';
      renderSyncStatus();
    });
  } else {
    container.innerHTML = `
      <p class="hint-text">クラウド同期: 未使用（この端末だけで記録しています）</p>
      <button type="button" class="secondary-btn" id="sync-signin-btn">Googleでログインする</button>
      <p class="error-text" id="sync-status-error">${escapeHtml(syncStatusMessage)}</p>`;
    const btn = document.getElementById('sync-signin-btn');
    if (btn) btn.addEventListener('click', async () => {
      syncStatusMessage = '';
      const { error } = await signInWithGoogleForSync();
      if (error) {
        syncStatusMessage = 'ログインに失敗しました。もう一度お試しください。';
        renderSyncStatus();
      }
    });
  }
}

const PAIN_AREA_LABELS = { 肩: '肩', 腰: '腰', 膝: '膝', 手首: '手首' };

// 週間プラン画面での部位表示名(#part-group/#weekly-day-part-groupのdata-part値に対応)。
const PART_LABELS = { fullbody: '全身', chest: '胸', back: '背中', shoulders: '肩', arms: '腕', legs: '脚', core: '体幹・腹筋' };

// 週間プランの1曜日分の内容を、一覧行に出す短いテキストにする。
function weeklyDayContentText(day, templates) {
  if (!day || day.kind === 'rest') return '休み';
  if (day.kind === 'parts') {
    if (!Array.isArray(day.parts) || day.parts.length === 0) return '休み';
    return day.parts.map((p) => PART_LABELS[p] || p).join('・');
  }
  if (day.kind === 'template') {
    const t = templates.find((tpl) => tpl.id === day.templateId);
    return t ? `「${t.name}」` : '（削除された組み合わせ）';
  }
  return '休み';
}

// ===== 週間プランの「一日おき」（2026-10-06〜） =====
// 曜日ではなく「前回やった日」から数える。前回やった日の翌日だけ休みで、2日以上空いたら(または
// まだ一度もやっていなければ)今日がやる日。やり忘れて2日空いても、さらに1日待たせず今日やる日にする。
function isAlternatePlan(plan) {
  return !!plan && plan.schedule === 'alternate';
}

function alternateEntryActionable(entry, templates) {
  return !!entry && (
    (entry.kind === 'parts' && Array.isArray(entry.parts) && entry.parts.length > 0)
    || (entry.kind === 'template' && templates.some((t) => t.id === entry.templateId))
  );
}

// state: 'due'(今日やる日) | 'doneToday'(今日もうやった) | 'rest'(昨日やったので今日は休み)
function alternatePlanStatus(plan) {
  const today = localDateKey(new Date());
  const last = lastDoneDateKeyForEntry(plan.alternate);
  if (last === today) return { state: 'doneToday', last };
  if (last && last === previousDateKey(today)) return { state: 'rest', last };
  return { state: 'due', last };
}

function shortDateKeyLabel(dateKey) {
  const [, m, d] = dateKey.split('-').map(Number);
  return `${m}/${d}`;
}

function alternateStatusText(status) {
  if (!status.last) return 'まだ一度もやっていません';
  const lastText = `前回 ${shortDateKeyLabel(status.last)}`;
  if (status.state === 'doneToday') return '今日やりました・次は明後日';
  if (status.state === 'rest') return `${lastText}（昨日）・次は明日`;
  return lastText;
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

  if (isAlternatePlan(active)) {
    const entry = active.alternate;
    if (!alternateEntryActionable(entry, templates)) {
      container.innerHTML = '';
      setCardsFlat(true);
      return;
    }
    const status = alternatePlanStatus(active);
    if (status.state === 'due') {
      container.innerHTML = `
    <div class="today-focus-panel">
      <div>
        <div class="today-focus-title">今日は${escapeHtml(weeklyDayContentText(entry, templates))}の日です</div>
        <div class="today-focus-sub">一日おき・${escapeHtml(alternateStatusText(status))}</div>
      </div>
      <button type="button" class="today-focus-start-btn" data-weekly-plan-start-today>始める</button>
    </div>`;
      setCardsFlat(false);
      detailsEl.open = false;
    } else {
      container.innerHTML = status.state === 'doneToday'
        ? '<p class="today-focus-rest">今日の分は終わりました（次は明後日）</p>'
        : `<p class="today-focus-rest">今日は休みの日です（${escapeHtml(alternateStatusText(status))}）</p>`;
      setCardsFlat(true);
    }
    return;
  }

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

// 記録中のトレーニングの概要(「10:32開始」「2/5種目を記録」)。ホームの「トレーニングに戻る」と、
// 別のメニューで開始しようとした時の確認(js/app.jsのhandleStartWorkout)で使う。
function activeSessionSummaryParts(session, startTime) {
  const parts = [];
  if (startTime != null) {
    const d = new Date(startTime);
    const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    const sameDay = localDateKey(d) === localDateKey(new Date());
    parts.push(`${sameDay ? '' : `${d.getMonth() + 1}月${d.getDate()}日 `}${time}開始`);
  }
  const recorded = session.exercises.filter(exerciseHasRecord).length;
  parts.push(`${recorded}/${session.exercises.length}種目を記録`);
  return parts;
}

function activeSessionSummaryText(session, startTime) {
  return activeSessionSummaryParts(session, startTime).join('・');
}

// ホームの一番下の「トレーニングに戻る」。記録中(currentSession)の時だけ出す(2026-10-04)。
// ボトムナビで別画面へ移ると記録画面に戻る手段が無く、もう一度「開始」すると記録が上書きされていた。
function renderHomeResumeWorkout() {
  const container = document.getElementById('home-resume-workout-section');
  if (!container) return;
  if (typeof currentSession === 'undefined' || !currentSession) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `
    <div class="today-focus-panel home-resume-panel">
      <div class="home-resume-text">
        <div class="today-focus-title">トレーニング中</div>
        <div class="home-resume-desc">${activeSessionSummaryParts(currentSession, sessionStartTime).map((p) => `<span class="home-resume-desc-part">${escapeHtml(p)}</span>`).join('・')}</div>
      </div>
      <div class="home-resume-actions">
        <button type="button" class="today-focus-start-btn" data-resume-workout>トレーニングに戻る</button>
        <button type="button" class="ghost-pill-btn home-resume-discard-btn" data-discard-workout>やめる（記録しない）</button>
      </div>
    </div>`;
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
  const daysHtml = isAlternatePlan(active)
    ? (active.alternate
      ? `<div class="weekly-plan-days"><div class="weekly-plan-day-row">
      <span class="weekly-plan-day-label">一日おき</span>
      <span class="weekly-plan-day-content">${escapeHtml(weeklyDayContentText(active.alternate, templates))}</span>
    </div></div>`
      : '<p class="weekly-plan-summary-empty">一日おきにやる内容をまだ決めていません</p>')
    : weeklyPlanDaysHtml(active.days, templates);

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

  // 各種目の最初にウォームアップセットを入れるかのON/OFF。設定はlocalStorageに保存され、
  // 自分で切り替えるまで維持される(js/storage.jsのloadWarmupSetsEnabled、切り替え処理はjs/app.jsの
  // handleWarmupSetsToggle)。メニュー確認画面・記録画面の両方に同じスイッチが出る。
  const warmupSetsEnabled = loadWarmupSetsEnabled();
  const warmupSetNoteHtml = hasStrengthExercise
    ? `<label class="warmup-item warmup-sets-toggle">
        <span class="warmup-sets-toggle-text">
          <span class="warmup-sets-toggle-title">各種目の最初にウォームアップセットを入れる</span>
          <span class="warmup-sets-toggle-desc">${warmupSetsEnabled
    ? 'オン：本セットの前に、軽い重量・回数で慣らすセットが入ります'
    : 'オフ：ウォームアップセットなしで本セットから始めます'}</span>
        </span>
        <input type="checkbox" class="switch-input" data-warmup-sets-toggle ${warmupSetsEnabled ? 'checked' : ''}>
        <span class="switch-track" aria-hidden="true"></span>
      </label>`
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

// メニュー確認画面の種目1つ分の「何セット×何回」。
function menuItemMetaText(item, isCircuit) {
  if (item.type === 'cardio') {
    return `有酸素種目（${item.hasDistance ? '時間・距離' : '時間'}を記録${item.targetSec ? `・目標${Math.round(item.targetSec / 60)}分` : ''}）`;
  }
  const valueText = item.holdBased
    ? `${item.targetSec != null ? item.targetSec : loadHoldTargetSec(item.exerciseId)}秒`
    : item.fixedTarget ? `${item.repsMin}回` : `${item.repsMin}〜${item.repsMax}回`;
  if (isCircuit) return valueText;
  const warmupText = item.warmupSets > 0 && loadWarmupSetsEnabled() ? `ウォームアップ${item.warmupSets}セット＋` : '';
  return `${warmupText}${item.sets}セット × ${valueText}　休憩${item.restSec}秒`;
}

// サーキットの「今日の周回数」「1周ごとの休憩」。周回数は日によって変える前提なので、組み合わせには
// 保存せず、ここ(始める直前)で選ぶ(ユーザー判断、2026-10-06)。前回選んだ値が最初から選ばれている。
function buildCircuitStartHtml(circuit, hasCardio) {
  const restLabel = (sec) => (sec === 0 ? 'なし' : `${sec}秒`);
  return `
    <div class="menu-block circuit-start-block">
      <h3>サーキット</h3>
      <p class="ex-meta">上から順に1セットずつ行い、最後の種目までで1周です。種目の間は休まず次へ進みます。${hasCardio ? '有酸素種目は周回に入れず、全部の周が終わった後に1回だけ行います。' : ''}</p>
      <div class="sheet-field-head"><span class="sheet-field-label">今日の周回数</span></div>
      <div class="choice-chips" role="radiogroup" aria-label="今日の周回数">
        ${CIRCUIT_ROUNDS_OPTIONS.map((n) => `<button type="button" class="choice-chip" role="radio" aria-checked="${circuit.rounds === n}" data-circuit-rounds="${n}">${n}周</button>`).join('')}
      </div>
      <div class="sheet-field-head"><span class="sheet-field-label">1周ごとの休憩</span></div>
      <div class="choice-chips" role="radiogroup" aria-label="1周ごとの休憩">
        ${CIRCUIT_ROUND_REST_OPTIONS.map((sec) => `<button type="button" class="choice-chip" role="radio" aria-checked="${circuit.roundRestSec === sec}" data-circuit-rest="${sec}">${restLabel(sec)}</button>`).join('')}
      </div>
    </div>`;
}

function renderMenu(menu) {
  const container = document.getElementById('menu-content');
  const isCircuit = menu.params.format === 'circuit';

  const goalBlockHtml = menu.params.custom
    ? (isCircuit ? buildCircuitStartHtml(menu.circuit, menu.main.some((item) => item.type === 'cardio')) : `<div class="menu-block"><h3>種目の組み方</h3><div class="ex-meta">自分で選んだ種目</div></div>`)
    : `<div class="menu-block"><h3>目的</h3><div class="ex-meta">${goalLabel(menu.params.goal)}</div></div>`;

  const painNoteHtml = menu.params.painAreas && menu.params.painAreas.length > 0
    ? `<div class="menu-block"><div class="ex-note">気になる部位（${menu.params.painAreas.join('・')}）に負担がかかりやすい種目は除外して作成しています。痛みが続く場合は自己判断せず医療・専門家にご相談ください。</div></div>`
    : '';

  // 所要時間の目安(ウォームアップ・クールダウン込み)。種目の追加・削除にも追従するよう、描画のたびに
  // 今の内容から見積もる。作成時に指定時間へ収めるために行った調整(timeAdjustments)も一言添える(2026-10-04)。
  const estMin = Math.max(1, Math.round(estimateMenuSeconds(menu) / 60));
  const targetMin = Number(menu.params.minutes) || 0;
  const adjustTexts = (menu.timeAdjustments || []).map((a) => {
    if (a === 'rest') return '休憩を短めに';
    if (a === 'warmupSets') return 'ウォームアップセットを1セットに';
    const [, from, to] = String(a).split(':');
    return a.startsWith('drop:') ? `種目を${from}→${to}つに` : '';
  }).filter(Boolean);
  const overTarget = menuOverBudget(menu, targetMin); // 調整処理(fitMenuToTime)と同じ秒単位の基準
  const timeBlockHtml = `
    <div class="menu-block">
      <h3>所要時間</h3>
      <div class="ex-meta">目安 約${estMin}分（ウォームアップ・クールダウン込み）${targetMin > 0 ? `・指定 ${targetMin}分` : ''}</div>
      ${adjustTexts.length && !overTarget ? `<div class="ex-note">${targetMin}分に収めるため、${adjustTexts.join('・')}調整しました。</div>` : ''}
      ${overTarget ? `<div class="ex-note">指定の${targetMin}分より長くなりそうです。種目を減らすか、時間を長めに選び直してください。</div>` : ''}
    </div>`;

  // 時間に収めるために減らした分は「条件に合う種目が少ない」とは別なので、選べた数(availableCount)で判定する
  const shortfallNoteHtml = menu.requestedCount && (menu.availableCount != null ? menu.availableCount : menu.main.length) < menu.requestedCount
    ? `<div class="menu-block"><div class="ex-note">選んだ条件（器具・レベル・部位など）に合う種目が少なく、目安の${menu.requestedCount}種目に対して${menu.availableCount != null ? menu.availableCount : menu.main.length}種目しか選べませんでした。器具を増やす、レベルを上げる、鍛えたい部位を広げるなどすると種目を増やせます。</div></div>`
    : '';

  // サーキットにはウォームアップセットが無い(各種目1セットずつ)ので、その切り替えスイッチも出さない
  const warmupHtml = buildWarmupHtml(menu.warmup, !isCircuit && menu.main.some((item) => item.type !== 'cardio'));

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
      <div class="ex-meta">${menuItemMetaText(item, isCircuit)}</div>
      ${item.note ? `<div class="ex-note">${item.note}</div>` : ''}
      ${item.description ? `<div class="ex-info-panel" hidden><p>${item.description}</p></div>` : ''}
    </div>`)
    .join('');

  // 生成後に✕で全種目を削除すると0件になりうる(2026-09-16、Codexレビュー指摘)。
  // その場合は並べ替えツールバーの代わりに空状態の案内を出し、開始ボタンも
  // 無効化する(以前はボタンが押せる状態のまま残り、押すとalert()が出るだけだった)。
  const mainHtml = menu.main.length === 0
    ? `<div class="reorder-list" id="menu-exercise-list"><p class="ex-note">種目がありません。「＋ 種目を追加」から追加してください。</p></div>`
    : `
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
    ${timeBlockHtml}
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
  const startBtn = document.getElementById('start-workout-btn');
  if (startBtn) {
    startBtn.disabled = menu.main.length === 0;
    // サーキットは今回の量(何周か)を開始ボタンでも確かめられるようにする
    startBtn.textContent = isCircuit ? `${menu.circuit.rounds}周で開始` : 'このメニューで開始';
  }
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
// 何をやったか消えてしまわないよう、reps/RPEを短く残す。
// 2026-09-16修正: 重量は「値ラベル側で既に見えている前提」で含めていなかったが、
// 重量スライダーの`.slider-field`自体が完了時にまるごと隠れる(値ラベルも一緒に消える)
// ため、実際には重量を使う種目(自重換算ではなく実物の重量スライダーがある種目)は
// 完了直後に何kgでやったか分からなくなっていた不具合があった(Codexレビュー指摘)。
// hasWeightField(呼び出し元でその種目に重量スライダーがあるかどうか)がtrueの時だけ
// 先頭に重量を足す。自重種目(自重換算)は元々スライダー自体が無いので対象外のまま。
function setRowSummaryText(set, holdBased, hasWeightField) {
  const reps = holdBased ? `${set.reps}秒` : `${set.reps}回`;
  const weightPart = hasWeightField ? `${set.weight}kg・` : '';
  // サーキットはRPEを聞かない(空)ので、その時は出さない
  const rpePart = set.rpe !== '' && set.rpe != null ? `・RPE${set.rpe}` : '';
  return `${weightPart}${reps}${rpePart}`;
}

// sliderFieldHtml/numberWheelHtmlで共通の「ラベル＋現在値」行を組み立てる。
function sliderFieldLabelRowHtml(field, label, exIndex, setIndex, value, holdBased) {
  const labelHtml = field === 'rpe'
    ? `<span>${label} <button type="button" class="rpe-info-btn" data-rpe-info-toggle aria-label="RPEとは">ⓘ</button></span>`
    : `<span>${label}</span>`;
  const rpeReserveHtml = field === 'rpe'
    ? `<span class="rpe-reserve-hint" data-rpe-reserve="${exIndex}:${setIndex}">${rpeReserveText(value)}</span>`
    : '';
  return `<div class="slider-label">${labelHtml}${rpeReserveHtml}<span class="slider-value">${formatSliderValue(field, value, holdBased)}</span></div>`;
}

// 回数・RPEの入力を、ドラッグして目的の数字に合わせるスライダーではなく、横に並んだ数字を
// 指で流して選ぶ「数字ホイール」にしたもの（2026-08-14、複数回の相談の末に決定）。
// スライダーだと「端まで動かすと範囲が伸びる」仕組みが分かりにくい、太いトラックが密な
// リストで邪魔、目盛りを付けてもごちゃつく、と何を試しても収まりが悪かったため、
// 発想を変えて「範囲固定・スクロールして選ぶ」方式に切り替えた。
// 実体は非表示の<input type="range">のままにし(hidden属性)、ホイールが確定した値を
// その<input>にセットしてinput/changeイベントを発火させることで、handleLogInput側の
// 既存ロジック(値の反映・disabled化・RPE残りレップ表示・自己ベスト判定など)をそのまま
// 使い回している。ホイール自体の描画・ドラッグ処理はjs/app.jsのwireNumberWheels。
// 数字ホイールの中身(トラック+目盛り代わりの数字一覧)だけを組み立てる共通部品。
// 呼び出し側(numberWheelHtml、休憩時間・体重用の各関数)がラベル行や<input>を
// それぞれの文脈に合わせて足す。
// 2026-10-06 操作性の見直し: 数字1マスを36px→44px(Appleが推奨するタップ領域の目安)に広げ、
// 選択中の数字を大きく太く・中央の枠を塗りつぶしの帯にして「今どれが選ばれているか」を一目で
// 分かるようにした。トラック自体をrole=slider・tabindex=0にして、キーボードの←→と読み上げ機能
// (VoiceOverの上下スワイプ=値の増減)でも操作できるようにしている(js/app.jsのwireNumberWheels)。
// label: 読み上げで「回数」等と伝える名前。unit: 読み上げの値に付ける単位(「20回」)。
function numberWheelTrackHtml(min, max, step, { label = '', unit = '' } = {}) {
  const stepsCount = Math.round((max - min) / step);
  const itemsHtml = Array.from({ length: stepsCount + 1 }, (_, i) => {
    const n = Math.round((min + i * step) * 10) / 10;
    return `<div class="number-wheel-item" data-n="${n}" aria-hidden="true">${n}</div>`;
  }).join('');
  return `
          <div class="number-wheel">
            <div class="number-wheel-highlight"></div>
            <div class="number-wheel-fade-left"></div>
            <div class="number-wheel-fade-right"></div>
            <div class="number-wheel-track" role="slider" tabindex="0" aria-label="${escapeHtml(label)}" aria-valuemin="${min}" aria-valuemax="${max}" data-step="${step}" data-unit="${escapeHtml(unit)}">
              <div class="number-wheel-spacer"></div>
              ${itemsHtml}
              <div class="number-wheel-spacer"></div>
            </div>
          </div>`;
}

function numberWheelHtml({ exIndex, setIndex, field, label, min, max, step, value, holdBased, disabled, extraHtml }) {
  const unit = field === 'reps' ? (holdBased ? '秒' : '回') : '';
  return `
        <div class="slider-field">
          ${sliderFieldLabelRowHtml(field, label, exIndex, setIndex, value, holdBased)}
          ${numberWheelTrackHtml(min, max, step, { label, unit })}
          <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-ex="${exIndex}" data-set="${setIndex}" data-field="${field}"${disabled ? ' disabled' : ''} hidden>
          ${extraHtml || ''}
        </div>`;
}

function sliderFieldHtml({ exIndex, setIndex, field, label, min, max, step, value, holdBased, extraHtml, disabled, tickStep }) {
  return `
        <div class="slider-field">
          ${sliderFieldLabelRowHtml(field, label, exIndex, setIndex, value, holdBased)}
          <div class="slider-track-row">
            <span class="slider-bound-label slider-bound-min">${min}</span>
            <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-ex="${exIndex}" data-set="${setIndex}" data-field="${field}"${disabled ? ' disabled' : ''}${tickStep ? ` data-tick-step="${tickStep}"` : ''}>
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

// 「自分で作る」の種目1つ分の目標を短い文にする(一覧の行・メニュー確認画面で使う)。
// 例: 種目ごと「3セット × 20回・休憩90秒」、サーキット「20回」「45秒」。
function customTargetValueText(target) {
  return target.timed ? `${target.sec}秒` : `${target.reps}回`;
}

function customTargetSummaryText(target, format, restSec) {
  if (format === 'circuit') return customTargetValueText(target);
  return `${target.sets}セット × ${customTargetValueText(target)}・休憩${restSec}秒`;
}

// 一覧の各行は「何回・何セットか」の要約だけを出し、行の下半分(要約ボタン)をタップすると
// 下から編集画面(renderCustomTargetSheet)が出る(2026-10-06)。以前は休憩時間のホイールだけが
// 各行に直接並んでいたが、回数・セット数まで行ごとに並べると数字だらけで縦スクロールの邪魔になるため。
// 種目名の部分は今まで通り長押しで並べ替えられる(ボタンの上から長押ししても並べ替えは始まらない)。
function renderCustomExerciseList(customExercises, customRestSec, customTargets = {}, format = 'sets') {
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
      // 有酸素種目は回数・セット・休憩という概念がないため、「有酸素種目」のバッジと目標時間だけを表示する
      const bodyHtml = ex.type === 'cardio'
        ? `<span class="picker-item-cardio-badge">有酸素種目</span>
      ${cardioTargetButtonHtml(customCardioTargetMin(ex, customTargets[ex.id]), `data-cardio-target-custom="${ex.id}"`, ex.name)}`
        : (() => {
          const restSec = customRestSec[ex.id] != null ? customRestSec[ex.id] : 90;
          const target = normalizeCustomTarget(ex, customTargets[ex.id]);
          return `
      <button type="button" class="custom-target-btn" data-custom-target-edit="${ex.id}" aria-label="${escapeHtml(ex.name)}の回数・セット数を変える">
        <span class="custom-target-summary">${customTargetSummaryText(target, format, restSec)}</span>
        <span class="custom-target-chevron" aria-hidden="true">変更 ›</span>
      </button>`;
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

// ===== 回数・セット数の編集画面（「自分で作る」、2026-10-06〜） =====
// 数の選び方は、数の種類で使い分ける(Codexと相談して決定):
// - セット数(1〜5がほとんど): 横に並んだボタンを1回タップ。6以上は「6〜」を押すと6〜10のホイールが出る
// - 回数(1〜100)・秒数(5〜300、5秒刻み)・休憩(0〜300秒、15秒刻み): 数字ホイール＋よく使う値のボタン。
//   ボタンは「ホイールをその値まで動かす近道」で、別の選択状態は持たない(20回から50回へ流す手間を省く)
// 編集した値はその場で反映し(js/app.jsのwireCustomTargetSheet)、「完了」で閉じる。
const CUSTOM_REPS_PRESETS = [10, 15, 20, 30, 50];
const CUSTOM_SEC_PRESETS = [20, 30, 45, 60, 90];
const CUSTOM_REST_PRESETS = [30, 60, 90, 120];
const CUSTOM_SETS_CHIPS = [1, 2, 3, 4, 5];

function wheelPresetButtonsHtml(presets, value, unit) {
  return `
      <div class="wheel-presets" role="group" aria-label="よく使う値">
        ${presets.map((n) => `<button type="button" class="wheel-preset-btn${Number(value) === n ? ' is-current' : ''}" data-wheel-preset="${n}">${n}${unit}</button>`).join('')}
      </div>`;
}

// 編集画面の中の、ホイール1つ分(大きな現在値＋ホイール＋よく使う値)。
// field: 'value'(回数/秒数) | 'rest'(休憩) | 'sets'(6以上のセット数)。値は非表示の<input>に入る。
function sheetWheelFieldHtml({ field, label, unit, min, max, step, value, presets, inputAttr = 'data-custom-target-field' }) {
  return `
      <div class="slider-field sheet-wheel-field" data-sheet-field="${field}">
        <div class="sheet-field-head">
          <span class="sheet-field-label">${label}</span>
          <span class="sheet-big-value"><span class="slider-value" data-sheet-value-num>${value}</span><span class="sheet-big-unit">${unit}</span></span>
        </div>
        ${numberWheelTrackHtml(min, max, step, { label, unit })}
        <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" ${inputAttr}="${field}" hidden>
        ${presets ? wheelPresetButtonsHtml(presets, value, unit) : ''}
      </div>`;
}

function renderCustomTargetSheet(ex, target, restSec, format) {
  const body = document.getElementById('custom-target-sheet-body');
  const title = document.getElementById('custom-target-sheet-title');
  if (!body) return;
  if (title) title.textContent = ex.name;

  const modeHtml = `
      <div class="segmented" role="radiogroup" aria-label="数え方">
        <button type="button" class="segmented-btn" role="radio" aria-checked="${!target.timed}" data-custom-target-mode="reps">回数で数える</button>
        <button type="button" class="segmented-btn" role="radio" aria-checked="${target.timed}" data-custom-target-mode="time">時間で測る</button>
      </div>`;

  const valueHtml = target.timed
    ? sheetWheelFieldHtml({ field: 'value', label: '時間', unit: '秒', min: CUSTOM_SEC_MIN, max: CUSTOM_SEC_MAX, step: CUSTOM_SEC_STEP, value: target.sec, presets: CUSTOM_SEC_PRESETS })
    : sheetWheelFieldHtml({ field: 'value', label: '回数', unit: '回', min: CUSTOM_REPS_MIN, max: CUSTOM_REPS_MAX, step: 1, value: target.reps, presets: CUSTOM_REPS_PRESETS });

  // サーキットでは各種目1セットずつ×周回数なので、セット数と種目ごとの休憩は出さない
  // (周回数・1周ごとの休憩は開始前の画面で選ぶ)。
  const many = target.sets > CUSTOM_SETS_CHIPS[CUSTOM_SETS_CHIPS.length - 1];
  const setsHtml = format === 'circuit' ? `
      <p class="hint-text sheet-circuit-note">サーキットでは各種目を1セットずつ行います。周回数は始める前に選びます。</p>` : `
      <div class="sheet-field">
        <div class="sheet-field-head"><span class="sheet-field-label">セット数</span></div>
        <div class="choice-chips" role="radiogroup" aria-label="セット数">
          ${CUSTOM_SETS_CHIPS.map((n) => `<button type="button" class="choice-chip" role="radio" aria-checked="${!many && target.sets === n}" data-custom-target-sets="${n}">${n}</button>`).join('')}
          <button type="button" class="choice-chip" role="radio" aria-checked="${many}" data-custom-target-sets="more">${many ? target.sets : '6〜'}</button>
        </div>
        ${many ? sheetWheelFieldHtml({ field: 'sets', label: 'セット数', unit: 'セット', min: 6, max: CUSTOM_SETS_MAX, step: 1, value: target.sets }) : ''}
      </div>
      ${sheetWheelFieldHtml({ field: 'rest', label: 'セット間の休憩', unit: '秒', min: 0, max: 300, step: 15, value: restSec, presets: CUSTOM_REST_PRESETS })}`;

  body.innerHTML = `
      ${modeHtml}
      ${valueHtml}
      ${setsHtml}
      <p class="hint-text sheet-wheel-hint">数字は左右に動かすか、見えている数字をタップして選べます。</p>`;
}

// ===== 有酸素種目の目標時間（2026-10-06〜） =====
// 「自分で作る」の一覧と記録画面の有酸素カードに出す「目標 20分　変更 ›」。押すと下から
// 目標時間の編集シート(renderCardioTargetSheet、js/app.jsのwireCardioTargetSheet)が出る。
const CARDIO_TARGET_PRESETS = [10, 15, 20, 30, 45, 60];
const CARDIO_TARGET_DEFAULT_MIN = 20; // 「目標あり」に切り替えた時の最初の値

function cardioTargetText(min) {
  return min ? `目標 ${min}分` : '目標なし';
}

function cardioTargetButtonHtml(min, attr, name) {
  return `
      <button type="button" class="custom-target-btn cardio-target-btn" ${attr} aria-label="${escapeHtml(name)}の目標時間を変える">
        <span class="custom-target-summary" data-cardio-target-text>${cardioTargetText(min)}</span>
        <span class="custom-target-chevron" aria-hidden="true">変更 ›</span>
      </button>`;
}

function renderCardioTargetSheet(name, min) {
  const body = document.getElementById('cardio-target-sheet-body');
  const title = document.getElementById('cardio-target-sheet-title');
  if (!body) return;
  if (title) title.textContent = name;
  body.innerHTML = `
      <div class="segmented" role="radiogroup" aria-label="目標時間">
        <button type="button" class="segmented-btn" role="radio" aria-checked="${!!min}" data-cardio-target-mode="on">目標を決める</button>
        <button type="button" class="segmented-btn" role="radio" aria-checked="${!min}" data-cardio-target-mode="off">決めない</button>
      </div>
      ${min ? `
      ${sheetWheelFieldHtml({ field: 'cardioMin', label: '目標時間', unit: '分', min: CARDIO_TARGET_MIN_MIN, max: CARDIO_TARGET_MIN_MAX, step: 1, value: min, presets: CARDIO_TARGET_PRESETS, inputAttr: 'data-cardio-target-field' })}
      <p class="hint-text sheet-wheel-hint">計測中にこの時間になると音で知らせます（計測は止まりません）。他のアプリを開いている間は鳴らず、Compstackに戻った時に知らせます（音が出ない時は計測画面をタップ）。iPhoneの消音モード中は鳴りません。</p>` : `
      <p class="hint-text sheet-wheel-hint">目標を決めると、計測中にその時間になった時に音で知らせます。</p>`}`;
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
        <div class="template-meta">${t.format === 'circuit' ? 'サーキット・' : ''}${t.exerciseIds.length}種目・${dateLabel}保存</div>
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
// fitToData: 縦軸を0始まりではなく実データの最小〜最大に合わせる(体重のように値の変動幅が
//   絶対値に比べてごく小さいものは、0始まりだと線がほぼ平らになり変化が読み取れないため)。
// timeScale: 横軸を記録の回数ではなく実際の日付の間隔で並べる(毎日とは限らない体重記録で、
//   間が空いた期間を詰めて見せないため)。
// overlay(2026-10-06〜、体重の7日平均用): pointsと同じ長さの配列 [{ value, weak, breakBefore }]。
// 指定すると、pointsは線で結ばず薄い点だけにし、overlayを太線で重ねる。weak(記録が少ない)の点を含む区間は点線、
// breakBefore(前の点から間が空きすぎ)の区間は線をつながない。タップの当たり判定はpoints側にだけ持たせ、
// overlayの値はdetailFormatterでツールチップに出す(同じ日に2つの当たり判定を重ねないため)。
function buildProgressTrendChartHtml(points, { title, valueFormatter, detailFormatter, fitToData = false, timeScale = false, overlay = null, overlayLabel = '', subtitleHtml = '' }) {
  if (points.length < 2) return '';
  const width = 320;
  const height = 160;
  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 22;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const values = points.map((p) => p.value).concat(overlay ? overlay.map((o) => o.value) : []);
  let axisMin = 0;
  let axisMax = Math.max(...values) || 1;
  if (fitToData) {
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const margin = Math.max((dataMax - dataMin) * 0.15, 0.5);
    axisMin = Math.max(0, Math.floor((dataMin - margin) * 2) / 2);
    axisMax = Math.ceil((dataMax + margin) * 2) / 2;
  }
  const axisRange = axisMax - axisMin || 1;
  const times = points.map((p) => new Date(p.date).getTime());
  const firstTime = times[0];
  const timeSpan = times[times.length - 1] - firstTime || 1;
  const coords = points.map((p, i) => ({
    x: padL + (timeScale ? ((times[i] - firstTime) / timeSpan) * innerW : (i / (points.length - 1)) * innerW),
    y: padT + innerH - ((p.value - axisMin) / axisRange) * innerH,
    p,
  }));
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const yOf = (v) => padT + innerH - ((v - axisMin) / axisRange) * innerH;
  let overlayHtml = '';
  if (overlay) {
    const segs = [];
    for (let i = 1; i < coords.length; i += 1) {
      if (overlay[i].breakBefore) continue;
      const dashed = overlay[i].weak || overlay[i - 1].weak;
      segs.push(`<line x1="${coords[i - 1].x.toFixed(1)}" y1="${yOf(overlay[i - 1].value).toFixed(1)}" x2="${coords[i].x.toFixed(1)}" y2="${yOf(overlay[i].value).toFixed(1)}"
          stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"${dashed ? ' stroke-dasharray="4 4" stroke-opacity="0.7"' : ''} />`);
    }
    const last = coords[coords.length - 1];
    const lastY = yOf(overlay[overlay.length - 1].value);
    // 線の終わりに直接名前を付ける(凡例を見に行かなくても何の線か分かるように)
    const label = overlayLabel ? `<text x="${Math.min(last.x, width - padR).toFixed(1)}" y="${(lastY - 8).toFixed(1)}" text-anchor="end" class="chart-overlay-label">${overlayLabel}</text>` : '';
    const marks = coords.map((c, i) => `<circle cx="${c.x.toFixed(1)}" cy="${yOf(overlay[i].value).toFixed(1)}" r="2.5" fill="var(--accent)"${overlay[i].weak ? ' fill-opacity="0.6"' : ''} style="pointer-events:none;" />`);
    overlayHtml = segs.join('') + marks.join('') + label;
  }

  const gridLines = [0, 0.5, 1]
    .map((frac) => {
      const y = padT + innerH - frac * innerH;
      const rawVal = axisMin + frac * axisRange;
      const val = fitToData ? (Math.round(rawVal * 10) / 10).toString() : Math.round(rawVal);
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
        <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3" fill="${overlay ? 'var(--text-dim)' : 'var(--accent)'}"${overlay ? ' fill-opacity="0.6"' : ''} style="pointer-events:none;" />`)
    .join('');

  return `
    <div class="progress-trend-chart-wrap">
      <h3 style="margin-bottom:4px;">${title}</h3>
      ${subtitleHtml}
      <div class="progress-trend-chart" style="position:relative;">
        <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${title}のグラフ">
          ${gridLines}
          ${overlay ? overlayHtml : `<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`}
          ${dots}
          ${xLabels}
        </svg>
        <div class="chart-tooltip" hidden></div>
      </div>
    </div>`;
}

// 記録画面のセットの「回数(または秒)」の数字ホイール。通常の記録画面とサーキットで共通。
function buildRepsWheelHtml(ex, exIndex, setIndex, s) {
  // 回数の上限は「自分で作る」で選べる上限(100回)に揃える(2026-10-06、以前は50回)
  return numberWheelHtml({
    exIndex, setIndex, field: 'reps', label: ex.holdBased ? '秒' : '回数',
    min: 0, max: ex.holdBased ? 300 : 100, step: 1, value: s.reps, holdBased: ex.holdBased, disabled: s.done,
    extraHtml: ex.holdBased ? `<button type="button" class="hold-timer-btn" data-hold-timer="${exIndex}:${setIndex}">▶ 計測</button>` : '',
  });
}

function buildDoneToggleHtml(exIndex, setIndex, s) {
  return `
            <label class="done-toggle">
              <input type="checkbox" ${s.done ? 'checked' : ''} data-ex="${exIndex}" data-set="${setIndex}" data-field="done">
              <span class="done-toggle-pill">完了</span>
            </label>`;
}

// サーキットの記録画面(2026-10-06〜)。記録の形は通常と同じ「種目×セット」(n周目＝各種目のn番目のセット、
// js/workout-log.jsのcreateSessionFromMenu参照)だが、種目ごとのカードに並べると1周するたびに
// 画面を上下に行き来することになるため、「1周目」「2周目」…の周回ごとに、その周でやる種目を順に並べる。
// RPEも通常と同じくセットごとに記録する(2026-10-06にユーザー要望で追加)。data-ex/data-setは通常の記録画面と同じなので、入力の処理
// (js/app.jsのhandleLogInput)・計測タイマー・前回実績・保存はすべて共通。
function buildCircuitRoundsHtml(session) {
  const { rounds, roundRestSec } = session.circuit;
  const strength = session.exercises
    .map((ex, exIndex) => ({ ex, exIndex }))
    .filter(({ ex }) => ex.type !== 'cardio');
  // 有酸素種目だけのサーキットは周回が空(0/0)になるので、周回の表示自体を出さない
  if (strength.length === 0) return '';
  const roundsHtml = Array.from({ length: rounds }, (_, r) => {
    const doneCount = strength.filter(({ ex }) => ex.sets[r] && ex.sets[r].done).length;
    const rowsHtml = strength.map(({ ex, exIndex }, order) => {
      const s = ex.sets[r];
      if (!s) return '';
      const weightRange = WEIGHT_RANGE_BY_EQUIPMENT[ex.equipment && ex.equipment[0]];
      const weightField = ex.holdBased || !weightRange
        ? ''
        : sliderFieldHtml({ exIndex, setIndex: r, field: 'weight', label: '重量', min: 0, max: weightRange.max, step: weightRange.step, value: s.weight, disabled: s.done });
      const targetText = ex.holdBased ? `${ex.holdTargetSec}秒` : `${ex.repsMin}回`;
      return `
        <div class="set-row circuit-row${s.done ? ' is-done' : ''}">
          <div class="set-row-head">
            <span class="circuit-row-name">${order + 1}. ${escapeHtml(ex.name)}${ex.unilateral ? '（左右それぞれ）' : ''}<span class="circuit-row-target">目標 ${targetText}</span></span>
            <span class="set-row-summary" data-set-summary="${exIndex}:${r}">${s.done ? setRowSummaryText(s, ex.holdBased, !!weightField) : ''}</span>
            ${ex.description ? `<button type="button" class="icon-btn" data-info-toggle aria-label="フォームのポイント">ⓘ</button>` : ''}
            ${buildDoneToggleHtml(exIndex, r, s)}
          </div>
          ${ex.description ? `<div class="ex-info-panel" hidden><p>${ex.description}</p></div>` : ''}
          <div class="set-pr-badge" data-pr-badge="${exIndex}:${r}" hidden>🏆 自己ベスト更新！</div>
          ${weightField}
          ${buildRepsWheelHtml(ex, exIndex, r, s)}
          ${numberWheelHtml({ exIndex, setIndex: r, field: 'rpe', label: 'RPE', min: RPE_SCALE.min, max: RPE_SCALE.max, step: RPE_SCALE.step, value: s.rpe, disabled: s.done })}
        </div>`;
    }).join('');
    return `
      <div class="circuit-round" data-circuit-round="${r}">
        <div class="circuit-round-head">
          <h3>${r + 1}周目</h3>
          <span class="circuit-round-progress${doneCount === strength.length ? ' is-complete' : ''}" data-circuit-round-progress="${r}">${doneCount}/${strength.length}</span>
        </div>
        ${rowsHtml}
      </div>`;
  }).join('');
  return `
      <div class="menu-block circuit-log-intro">
        <div class="ex-meta">サーキット 全${rounds}周・1周ごとの休憩${roundRestSec > 0 ? `${roundRestSec}秒` : 'なし'}</div>
        <div class="ex-note">上から順に、できたら「完了」を押して次の種目へ進みます。</div>
      </div>
      ${roundsHtml}`;
}

function renderLog(session) {
  const container = document.getElementById('log-content');
  const isCircuit = !!session.circuit;
  // ウォームアップは怪我予防に関わるため、記録画面を開いた時点で最初から展開しておく
  // （クールダウンはセット記録が終わった後に見るものなので緊急度が違い、従来通り折りたたみのまま）。
  const warmupHtml = `
    <details class="section-toggle" open>
      <summary><span class="section-toggle-title">ウォームアップ</span><span class="section-toggle-chevron">▾</span></summary>
      ${buildWarmupHtml(session.warmup, !isCircuit && session.exercises.some((ex) => ex.type !== 'cardio'))}
    </details>`;
  const cooldownHtml = `
    <details class="section-toggle">
      <summary><span class="section-toggle-title">クールダウン</span><span class="section-toggle-chevron">▾</span></summary>
      ${buildCooldownHtml(session.cooldown)}
    </details>`;
  if (isCircuit) {
    // 有酸素種目は周回に入れず、周回の後に通常のカードで出す
    const cardioHtml = session.exercises
      .map((ex, exIndex) => (ex.type === 'cardio' ? buildCardioExerciseCardHtml(ex, exIndex) : ''))
      .join('');
    container.innerHTML = warmupHtml + buildCircuitRoundsHtml(session) + cardioHtml + cooldownHtml;
    return;
  }
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
      ${ex.holdBased ? buildHoldTargetMetaHtml(ex, exIndex) : `<div class="ex-meta">目標 ${ex.fixedTarget ? ex.repsMin : `${ex.repsMin}〜${ex.repsMax}`}回　休憩${ex.restSec}秒</div>`}
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
            // 回数/RPEは、スライダー(ドラッグして値を合わせる)ではなく数字ホイール
            // (横に流して選ぶ)を使う。何度か試行錯誤した末の結論で、詳細は
            // numberWheelHtmlのコメント参照。範囲は固定(ホイールは端の伸び縮みが
            // 要らない=広めに取っても選びやすい)。
            const repsField = buildRepsWheelHtml(ex, exIndex, setIndex, s);
            const rpeField = numberWheelHtml({ exIndex, setIndex, field: 'rpe', label: 'RPE', min: RPE_SCALE.min, max: RPE_SCALE.max, step: RPE_SCALE.step, value: s.rpe, disabled: s.done });
            return `
        <div class="set-row${s.isWarmup ? ' set-row-warmup' : ''}${s.done ? ' is-done' : ''}">
          <div class="set-row-head">
            <span class="set-idx">${label}</span>
            <span class="set-row-summary" data-set-summary="${exIndex}:${setIndex}">${s.done && !s.isWarmup ? setRowSummaryText(s, ex.holdBased, !!weightField) : ''}</span>
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

// 保持時間系(プランク等)の目標秒数の表示と、その場で書き換える入力欄(「変更」で開く)。
// 目標は種目ごとに保存され次回以降も使われる(storage.jsのloadHoldTargetSec)。保存処理はjs/app.jsの
// wireHoldTargetEdit。holdTargetSecを持たない古いスナップショットは保存済みの目標で補う。
function buildHoldTargetMetaHtml(ex, exIndex) {
  const sec = ex.holdTargetSec != null ? ex.holdTargetSec : loadHoldTargetSec(ex.exerciseId);
  // 「自分で作る」で秒数を決めた種目(fixedTarget)は、目標をそちら(組み合わせ)で管理しているので、
  // ここで種目共通の目標を書き換える「変更」は出さない(同じ目標を決める場所が2つあると食い違うため)。
  if (ex.fixedTarget) {
    return `
      <div class="ex-meta">目標 ${sec}秒　休憩${ex.restSec}秒</div>`;
  }
  return `
      <div class="ex-meta hold-target-meta" data-hold-target-meta="${exIndex}">
        <span>目標 ${sec}秒</span>
        <button type="button" class="ghost-pill-btn hold-target-edit-btn" data-hold-target-edit="${exIndex}">変更</button>
        <span>休憩${ex.restSec}秒</span>
      </div>
      <div class="hold-target-form-wrap" data-hold-target-form="${exIndex}" hidden>
        <div class="hold-target-form">
          <span class="hold-target-label">目標</span>
          <input type="number" inputmode="numeric" step="1" min="${HOLD_TARGET_MIN_SEC}" max="${HOLD_TARGET_MAX_SEC}"
            class="bodyweight-manual-input hold-target-input" value="${sec}" aria-label="目標の秒数">
          <span class="hold-target-unit">秒</span>
          <button type="button" class="primary-btn" data-hold-target-save="${exIndex}">保存</button>
          <button type="button" class="ghost-pill-btn hold-target-cancel-btn" data-hold-target-cancel="${exIndex}">キャンセル</button>
        </div>
        <p class="hint-text hold-target-hint">次回からもこの秒数が目標になります。完了していないセットの秒数も変わります。</p>
        <p class="error-text hold-target-error" hidden></p>
      </div>`;
}

// 有酸素種目(type:'cardio')専用の記録カード。セット/回数/重量ではなく時間・距離(該当種目のみ)を
// 記録し、体重×MET×時間から推定消費カロリーを表示する。ex.durationは秒単位(1秒刻み)で持つ
// (以前は分単位・15秒刻みだったが、計測タイマーとの丸め誤差が出るため秒単位に統一した)。
function buildCardioExerciseCardHtml(ex, exIndex) {
  const bodyWeightKg = getBodyWeightKg();
  const calories = estimateCardioCalories(ex.met, bodyWeightKg, Number(ex.duration) || 0);
  // 時間スライダーの上限は既定120分。計測で2時間を超えた記録を描き直す時は、値が切り詰められないよう
  // 10分単位で広げる(js/cardio-timer.jsのupdateCardioTimerと同じ基準)。
  const cardioDurationSliderMax = Math.max(7200, Math.ceil((Number(ex.duration) || 0) / 600) * 600);
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
      ${cardioTargetButtonHtml(ex.targetSec ? Math.round(ex.targetSec / 60) : null, `data-cardio-target-log="${exIndex}"`, ex.name)}
      ${sparklineHtml}
      <div class="slider-field">
        <div class="slider-label"><span>時間</span><span class="slider-value">${formatMinSec(ex.duration)}</span></div>
        <div class="slider-track-row">
          <span class="slider-bound-label slider-bound-min">0分</span>
          <input type="range" min="0" max="${cardioDurationSliderMax}" step="1" value="${ex.duration}" data-cardio-ex="${exIndex}" data-cardio-field="duration">
          <span class="slider-bound-label slider-bound-max">${cardioDurationSliderMax / 60}分</span>
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
        <span class="done-toggle-pill">完了</span>
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
  const streak = calculateTrainingStreak(history); // 渡された記録から計算(読み直さない)
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
    // 完了を押し忘れても時間があれば実施した扱い(isCardioRecorded)。2026-10-03以前に
    // 完了を押さずに保存された記録も、時間が残っていればここで表示されるようになる。
    return isCardioRecorded(ex)
      ? `${formatMinSec(ex.duration || 0)}${ex.distance ? `・${Number(ex.distance).toFixed(1)}km` : ''}${restSummary ? `・${restSummary}` : ''}`
      : '未記録';
  }
  const exerciseMeta = findExerciseById(ex.exerciseId);
  // 測り方は記録自体が持つ(同じ種目でも回数/時間を切り替えられるため。古い記録は種目データで補う)
  const holdBased = recordedExerciseIsTimed(ex);
  const isBodyweightLoad = exerciseMeta && !holdBased && isBodyweightLoadExercise({ ...exerciseMeta, holdBased });
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
      <div class="h-meta">${session.goal ? goalLabel(session.goal) : '自分で選んだ種目'}　種目数 ${session.exercises.length}${session.durationSec ? `　時間 ${formatDuration(session.durationSec)}` : ''}</div>
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
    bodyHtml = `<p class="empty-text">この日はトレーニングの記録がありません</p>${buildRecordJumpLinks(dateStr, historyMap)}`;
  }
  bodyHtml = buildDayWeightRowHtml(dateStr, { showEmpty: showNav }) + buildDayWaistRowHtml(dateStr, { showEmpty: showNav }) + bodyHtml;
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
    // 記録が無い日も.cal-day-numで囲む(今日バッジのCSSがこのクラスに掛かっているため。
    // css/style.cssの.cal-day.is-today .cal-day-num参照)。位置指定(絶対配置での左上表示)は
    // .has-recordの時だけ効くので、記録が無い日は今まで通りマス中央に表示されたままになる。
    // 体重はマスには出さず、日の詳細の体重行だけで見せる(2026-10-02、マス内の数値表示は
    // 「日付のすぐ下に書くのはやめて」というユーザー指摘で撤回)。
    cell.innerHTML = hasRecord
      ? `${buildRecordStampImg()}<span class="cal-day-num">${day}</span>`
      : `<span class="cal-day-num">${day}</span>`;
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
  updateResetDayButton(historyMap);
}

// 「その他の設定」の「◯月◯日のデータを削除する」を、カレンダーで選択中の日に合わせて書き換える。
// 選択中の日にトレーニング記録が無い時と、選択日の概念が無いリスト表示の時は出さない。
function updateResetDayButton(historyMap = groupHistoryByDate(loadHistory())) {
  const button = document.getElementById('reset-day-btn');
  if (!button) return;
  const show = recordViewMode === 'calendar' && !!recordSelectedDateStr && historyMap.has(recordSelectedDateStr);
  button.hidden = !show;
  if (show) button.textContent = `${recordDateLabel(recordDateFromKey(recordSelectedDateStr))}のデータを削除する`;
}

function selectRecordDate(dateStr) {
  recordSelectedDateStr = dateStr;
  showFullDetail = false;
  editingBodyWeightDateStr = null;
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
    updateResetDayButton(historyMap);
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
  editingBodyWeightDateStr = null;
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
  // 体重だけ記録している場合は、カレンダー(体重の数値・日の詳細の体重行)で確認できるようリストに切り替えない。
  if (history.length === 0 && bodyWeightEntriesSorted().length === 0) recordViewMode = 'list';
  setActiveRecordTab(activeRecordTab);
  setRecordViewMode(recordViewMode);
  if (recordViewMode === 'calendar') {
    renderCalendar(historyMap);
    renderRecordDayDetail(historyMap);
  } else {
    renderListView(historyMap);
  }
  if (typeof renderSyncStatus === 'function') renderSyncStatus();
}

// ===== グラフ画面（記録一覧とは別画面。全体の総挙上量推移＋種目ごとの推移） =====

function exercisesWithHistoryOptions() {
  const history = loadHistory();
  const seen = new Map(); // exerciseId -> name
  history.forEach((session) => {
    session.exercises.forEach((ex) => {
      if (seen.has(ex.exerciseId)) return;
      const hasRecord = ex.type === 'cardio'
        ? isCardioRecorded(ex) && Number(ex.duration) > 0
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
  renderWeeklySummary();
  renderBodyWeightProgressChart();
  renderWaistProgressChart();
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

// ===== 体重記録（2026-10-02〜） =====
// 1日1件の体重記録(js/storage.jsのloadBodyWeightLog)を、ホーム画面で入力し、記録タブの
// カレンダー(マスの小さな数値＋日の詳細)とグラフタブ(体重の推移)で確認できるようにする。
// 入力は他フィールドの「操作して選ぶ」方針の例外として数字の直接入力にしている(体重計の値を
// 0.1kg単位でそのまま写すだけの操作で、数字ホイールで探すより速く正確なため)。

let homeBodyWeightEditing = false; // ホームで「変更」を押して入力し直している最中か
let editingBodyWeightDateStr = null; // 記録タブの日の詳細で体重を入力中の日付
let bodyWeightGraphRangeDays = 30; // グラフタブの体重の表示期間(日数、0はすべて)

function formatKg(kg) {
  return `${Number(kg).toFixed(1)}kg`;
}

function previousBodyWeightEntry(dateKey) {
  const earlier = bodyWeightEntriesSorted().filter((e) => e.dateKey < dateKey);
  return earlier.length ? earlier[earlier.length - 1] : null;
}

function signedKgText(diff) {
  const rounded = Math.sign(diff) * Math.round(Math.abs(diff) * 10) / 10; // 負の0.05も0.1に丸める(−0.75が−0.7にならないように)
  if (rounded === 0) return '±0.0kg';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(1)}kg`;
}

// 直前の記録との差。前日の記録があれば「前日比」、間が空いていれば何日の記録との比較かを明示する。
function bodyWeightDiffText(dateKey, kg) {
  const prev = previousBodyWeightEntry(dateKey);
  if (!prev) return '';
  const label = prev.dateKey === previousDateKey(dateKey)
    ? '前日比'
    : `${recordDateLabel(recordDateFromKey(prev.dateKey))}比`;
  return `${label} ${signedKgText(kg - prev.kg)}`;
}

function bodyWeightFormHtml(dateKey, currentKg, { showCancel = false } = {}) {
  const entries = bodyWeightEntriesSorted();
  const placeholder = entries.length ? `前回 ${entries[entries.length - 1].kg.toFixed(1)}` : '例: 60.0';
  return `
    <div class="bodyweight-log-form-wrap" data-bodyweight-log-date="${dateKey}">
      <div class="bodyweight-log-form">
        <input type="number" inputmode="decimal" step="0.1" min="${BODYWEIGHT_MIN}" max="${BODYWEIGHT_MAX}"
          class="bodyweight-manual-input bodyweight-log-input" value="${currentKg != null ? Number(currentKg).toFixed(1) : ''}"
          placeholder="${placeholder}" aria-label="体重（kg）">
        <span class="bodyweight-log-unit">kg</span>
        <button type="button" class="primary-btn bodyweight-log-save" data-bodyweight-log-save>記録する</button>
      </div>
      <p class="error-text bodyweight-log-error" hidden></p>
      ${showCancel || currentKg != null ? `
      <div class="bodyweight-log-actions">
        ${showCancel ? '<button type="button" class="ghost-pill-btn bodyweight-log-small-btn" data-bodyweight-log-cancel>キャンセル</button>' : '<span></span>'}
        ${currentKg != null ? '<button type="button" class="danger-link-btn bodyweight-log-delete" data-bodyweight-log-delete>この日の体重を削除</button>' : ''}
      </div>` : ''}
    </div>`;
}

function renderHomeBodyWeight() {
  const container = document.getElementById('home-bodyweight-section');
  if (!container) return;
  const today = localDateKey(new Date());
  const kg = loadBodyWeightLog()[today];
  if (kg != null && !homeBodyWeightEditing) {
    const diffText = bodyWeightDiffText(today, Number(kg));
    container.innerHTML = `
      <div class="home-weight-panel">
        <div class="home-weight-main row-tap-area" data-bodyweight-home-edit>
          <div class="home-weight-label">今日の体重</div>
          <div class="home-weight-value">${Number(kg).toFixed(1)}<span class="home-weight-unit">kg</span></div>
          ${diffText ? `<div class="home-weight-diff">${diffText}</div>` : ''}
        </div>
        <button type="button" class="ghost-pill-btn home-weight-edit-btn" data-bodyweight-home-edit>変更</button>
      </div>`;
    return;
  }
  container.innerHTML = `
    <div class="home-weight-panel home-weight-panel-input">
      <div class="home-weight-label">今日の体重を記録</div>
      ${bodyWeightFormHtml(today, kg, { showCancel: homeBodyWeightEditing })}
      ${kg == null ? '<p class="hint-text home-weight-hint">記録した体重は「記録」タブのカレンダーとグラフで振り返れます。</p>' : ''}
    </div>`;
}

// 記録タブの日の詳細に出す体重の行。未来の日は記録できないので出さない。
// リスト表示(showEmpty=false)では、記録のある日だけ表示して「未記録」の行を並べない。
function buildDayWeightRowHtml(dateStr, { showEmpty = true } = {}) {
  if (dateStr > localDateKey(new Date())) return '';
  const kg = loadBodyWeightLog()[dateStr];
  if (editingBodyWeightDateStr === dateStr) {
    return `<div class="day-weight-row day-weight-row-editing">
      <div class="day-weight-label">体重</div>
      ${bodyWeightFormHtml(dateStr, kg, { showCancel: true })}
    </div>`;
  }
  if (kg == null && !showEmpty) return '';
  const diffText = kg != null ? bodyWeightDiffText(dateStr, Number(kg)) : '';
  return `<div class="day-weight-row">
    <span class="day-row-tap row-tap-area" data-bodyweight-detail-edit="${dateStr}">
      <span class="day-weight-label">体重</span>
      <span class="day-weight-value${kg == null ? ' is-empty' : ''}">${kg != null ? formatKg(kg) : '未記録'}</span>
      ${diffText ? `<span class="day-weight-diff">${diffText}</span>` : ''}
    </span>
    <button type="button" class="ghost-pill-btn bodyweight-log-small-btn day-weight-edit-btn" data-bodyweight-detail-edit="${dateStr}">${kg != null ? '変更' : '記録する'}</button>
  </div>`;
}

// 体重の追加・変更・削除の後、表示中の記録タブ(カレンダー/リスト/グラフ)を描き直す。
// 日の詳細で体重と腹囲の入力欄を両方開いている時、片方の操作で描き直すと、もう片方の入力途中の値が
// 保存済みの値で作り直されて消えてしまう(2026-10-06 Codexレビュー指摘)。描き直す前に開いている入力欄の値を
// 覚えておき、描き直した後も同じ入力欄が開いていれば戻す。
function captureMeasureDrafts() {
  const drafts = [];
  document.querySelectorAll('.day-weight-row-editing input').forEach((input) => {
    const wrap = input.closest('[data-bodyweight-log-date], [data-waist-log-date]');
    if (wrap) drafts.push({ cls: input.classList.contains('waist-log-input') ? 'waist-log-input' : 'bodyweight-log-input', wrapKey: wrap.dataset.bodyweightLogDate || wrap.dataset.waistLogDate, value: input.value });
  });
  return drafts;
}

function restoreMeasureDrafts(drafts) {
  drafts.forEach(({ cls, wrapKey, value }) => {
    const sel = cls === 'waist-log-input' ? `[data-waist-log-date="${wrapKey}"] .${cls}` : `[data-bodyweight-log-date="${wrapKey}"] .${cls}`;
    const input = document.querySelector(`.day-weight-row-editing ${sel}`);
    if (input) input.value = value;
  });
}

function refreshRecordViewsAfterBodyWeightChange() {
  const historyMap = groupHistoryByDate(loadHistory());
  const drafts = captureMeasureDrafts();
  if (recordViewMode === 'list') {
    renderListView(historyMap);
  } else {
    renderCalendar(historyMap);
    renderRecordDayDetail(historyMap);
  }
  restoreMeasureDrafts(drafts);
  if (activeRecordTab === 'graph') {
    renderBodyWeightProgressChart();
    renderWaistProgressChart();
  }
}

// ===== 週のまとめ（2026-10-07〜、数え方はCodexと相談して決定） =====
// 既存の記録から計算するだけ(入力は増やさない)。週は月曜始まり(週間プランと揃える)。
// - 筋トレ: 筋トレ系の種目(有酸素以外)を記録した「日数」。同じ日に2回記録しても1日
// - 本セット: 完了した本セット。ウォームアップと未完了は数えない。サーキットも各セットを数える(3周×3種目=9セット)
// - 部位ごと: 種目データのprimary(主に使う)とsecondary(補助で使う)を分けて数え、補助を0.5セット等に換算しない。
//   1つの種目が複数の部位を主に使う場合はそれぞれに数えるので、部位の合計は本セット数と一致しない
// - 有酸素: 記録した時間の合計(ウォーキングを先頭に、種目ごと)
// 今週は「途中」と表示し、先週と比べて足りない等の判定はしない。数字は種目の分類による目安で、筋肉への刺激の精密な量ではない。
let weeklySummaryOffset = 0; // 0=今週、-1=先週…

function mondayKeyOf(dateKey) {
  const offset = (recordDateFromKey(dateKey).getDay() + 6) % 7; // 月曜=0
  return shiftDateKey(dateKey, -offset);
}

function computeWeeklySummary(history, mondayKey) {
  const sundayKey = shiftDateKey(mondayKey, 6);
  const trainingDays = new Set();
  const muscles = {}; // { muscle: { primary, secondary } }
  const cardio = new Map(); // exerciseId → { name, sec }
  let workSets = 0;
  history.forEach((session) => {
    const dateKey = localDateKey(session.date);
    if (!dateKey || dateKey < mondayKey || dateKey > sundayKey) return;
    (session.exercises || []).forEach((ex) => {
      if (ex.type === 'cardio') {
        if (!isCardioRecorded(ex)) return;
        const cur = cardio.get(ex.exerciseId) || { name: ex.name, sec: 0 };
        cur.sec += Number(ex.duration) || 0;
        cardio.set(ex.exerciseId, cur);
        return;
      }
      // 2026-10-03より前の記録には未完了のセットも残っているので、完了したものだけ数える
      const sets = (ex.sets || []).filter((s) => s.done && !s.isWarmup).length;
      if (sets === 0) return;
      trainingDays.add(dateKey);
      workSets += sets;
      const data = EXERCISES.find((e) => e.id === ex.exerciseId);
      if (!data) return;
      (data.primary || []).forEach((m) => {
        muscles[m] = muscles[m] || { primary: 0, secondary: 0 };
        muscles[m].primary += sets;
      });
      (data.secondary || []).forEach((m) => {
        muscles[m] = muscles[m] || { primary: 0, secondary: 0 };
        muscles[m].secondary += sets;
      });
    });
  });
  const cardioList = [...cardio.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (a.id === 'walking' ? -1 : b.id === 'walking' ? 1 : b.sec - a.sec));
  return { mondayKey, sundayKey, trainingDays: trainingDays.size, workSets, muscles, cardioList };
}

// 週の期間の表示。今年以外・年をまたぐ週は年も出す(前の週へいくらでも戻れるため。Codexレビュー指摘)
function weekRangeText(mondayKey, sundayKey) {
  const thisYear = new Date().getFullYear();
  const [y1] = mondayKey.split('-').map(Number);
  const [y2] = sundayKey.split('-').map(Number);
  const showYear = y1 !== thisYear || y2 !== thisYear;
  const fmt = (key, y) => `${showYear ? `${y}/` : ''}${shortDateFromKey(key)}`;
  return `${fmt(mondayKey, y1)}(月)〜${fmt(sundayKey, y2)}(日)`;
}

function formatHourMin(totalSec) {
  const min = Math.round(Number(totalSec) / 60);
  if (min < 60) return `${min}分`;
  return `${Math.floor(min / 60)}時間${min % 60 ? `${min % 60}分` : ''}`;
}

function renderWeeklySummary() {
  const container = document.getElementById('weekly-summary-content');
  if (!container) return;
  const thisMonday = mondayKeyOf(localDateKey(new Date()));
  const mondayKey = shiftDateKey(thisMonday, weeklySummaryOffset * 7);
  const s = computeWeeklySummary(loadHistory(), mondayKey);
  const label = weeklySummaryOffset === 0 ? '今週（途中）' : weeklySummaryOffset === -1 ? '先週' : '';
  const walking = s.cardioList.find((c) => c.id === 'walking');
  const otherCardio = s.cardioList.filter((c) => c.id !== 'walking');
  const muscleRows = Object.keys(MUSCLE_GROUPS)
    .filter((m) => s.muscles[m])
    .sort((a, b) => s.muscles[b].primary - s.muscles[a].primary || s.muscles[b].secondary - s.muscles[a].secondary)
    .map((m) => `<tr><th scope="row">${MUSCLE_GROUPS[m]}</th><td>${s.muscles[m].primary || '−'}</td><td>${s.muscles[m].secondary || '−'}</td></tr>`)
    .join('');
  container.innerHTML = `
    <div class="weekly-summary-nav">
      <button type="button" class="day-nav-btn" data-weekly-summary-nav="-1" aria-label="前の週">◀</button>
      <div class="weekly-summary-range">${weekRangeText(s.mondayKey, s.sundayKey)}${label ? `<span class="weekly-summary-label">${label}</span>` : ''}</div>
      <button type="button" class="day-nav-btn" data-weekly-summary-nav="1" aria-label="次の週"${weeklySummaryOffset >= 0 ? ' disabled' : ''}>▶</button>
    </div>
    <div class="bodyweight-summary">
      <div class="bodyweight-summary-item"><span class="bodyweight-summary-label">筋トレ</span><span class="bodyweight-summary-value">${s.trainingDays}日</span></div>
      <div class="bodyweight-summary-item"><span class="bodyweight-summary-label">本セット</span><span class="bodyweight-summary-value">${s.workSets}セット</span></div>
      <div class="bodyweight-summary-item"><span class="bodyweight-summary-label">ウォーキング</span><span class="bodyweight-summary-value">${walking ? formatHourMin(walking.sec) : '−'}</span></div>
    </div>
    ${otherCardio.length ? `<p class="hint-text weekly-summary-other">その他の有酸素: ${otherCardio.map((c) => `${escapeHtml(c.name || '')} ${formatHourMin(c.sec)}`).join('、')}</p>` : ''}
    ${muscleRows ? `
    <table class="weekly-muscle-table">
      <thead><tr><th scope="col">部位</th><th scope="col">主に使った</th><th scope="col">補助で使った</th></tr></thead>
      <tbody>${muscleRows}</tbody>
    </table>
    <p class="hint-text weekly-summary-note">本セットの数（ウォームアップは数えない）。「主に使った」はその部位を主に鍛える種目、「補助で使った」は補助として使う種目のセット数です。1つの種目が複数の部位を使うので、部位ごとの数を足しても本セット数とは一致しません。種目の分類による目安です。</p>`
    : s.workSets > 0
      // 種目データに無い種目だけを記録した週など(部位が分からない)。上の「本セット」と食い違う「記録なし」は出さない
      ? '<p class="hint-text weekly-summary-note">この週の種目は部位の情報が無いため、部位ごとの数は出せません。</p>'
      : '<p class="empty-text">この週の筋トレの記録はありません。</p>'}`;
}

// ===== 腹囲の記録（2026-10-06〜） =====
// 週1回程度の記録を想定。入力は体重と同じく数字の直接入力(0.1cm)。ホームに入口を常設し、
// 未記録または前回から7日以上たった時だけ控えめに強調する(通知や警告色は使わない)。
// 過去の日の入力・変更・削除は記録タブの日の詳細から。グラフタブに推移(1点から表示、2点目から線)。
// 小さな変化に良し悪しの判定は付けない(入力の桁と測定の精度は別物のため)。
const WAIST_DUE_DAYS = 7;
const WAIST_MEASURE_NOTE = '測る位置（おへその高さ）・時間（朝、トイレの後など）・姿勢（立って、息を吐いたとき）を毎回そろえると、変化を比べやすくなります。';
let homeWaistEditing = false;
let editingWaistDateStr = null;

function formatCm(cm) {
  return `${Number(cm).toFixed(1)}cm`;
}

function signedCmText(diff) {
  const rounded = Math.sign(diff) * Math.round(Math.abs(diff) * 10) / 10; // 負の0.05も0.1に丸める(−0.75が−0.7にならないように)
  if (rounded === 0) return '±0.0cm';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(1)}cm`;
}

function daysBetweenKeys(fromKey, toKey) {
  return Math.round((recordDateFromKey(toKey) - recordDateFromKey(fromKey)) / 86400000);
}

// 前回の記録との差。週1回の記録なので、いつの記録と比べたかを必ず添える。
function waistDiffText(dateKey, cm) {
  const earlier = waistEntriesSorted().filter((e) => e.dateKey < dateKey);
  if (!earlier.length) return '';
  const prev = earlier[earlier.length - 1];
  return `${shortDateFromKey(prev.dateKey)}比 ${signedCmText(cm - prev.cm)}`;
}

function waistFormHtml(dateKey, currentCm, { showCancel = false } = {}) {
  const entries = waistEntriesSorted();
  const placeholder = entries.length ? `前回 ${entries[entries.length - 1].cm.toFixed(1)}` : '例: 80.0';
  return `
    <div class="waist-log-form-wrap" data-waist-log-date="${dateKey}">
      <div class="bodyweight-log-form">
        <input type="number" inputmode="decimal" step="0.1" min="${WAIST_MIN}" max="${WAIST_MAX}"
          class="bodyweight-manual-input waist-log-input" value="${currentCm != null ? Number(currentCm).toFixed(1) : ''}"
          placeholder="${placeholder}" aria-label="腹囲（cm）">
        <span class="bodyweight-log-unit">cm</span>
        <button type="button" class="primary-btn" data-waist-log-save>記録する</button>
      </div>
      <p class="error-text bodyweight-log-error waist-log-error" hidden></p>
      <p class="hint-text waist-measure-note">${WAIST_MEASURE_NOTE}</p>
      ${showCancel || currentCm != null ? `
      <div class="bodyweight-log-actions">
        ${showCancel ? '<button type="button" class="ghost-pill-btn bodyweight-log-small-btn" data-waist-log-cancel>キャンセル</button>' : '<span></span>'}
        ${currentCm != null ? '<button type="button" class="danger-link-btn bodyweight-log-delete" data-waist-log-delete>この日の腹囲を削除</button>' : ''}
      </div>` : ''}
    </div>`;
}

function renderHomeWaist() {
  const container = document.getElementById('home-waist-section');
  if (!container) return;
  const today = localDateKey(new Date());
  const todayCm = loadWaistLog()[today];
  if (homeWaistEditing) {
    container.innerHTML = `
      <div class="home-waist-panel home-waist-panel-input">
        <div class="home-weight-label">今日の腹囲を記録</div>
        ${waistFormHtml(today, todayCm, { showCancel: true })}
      </div>`;
    return;
  }
  const entries = waistEntriesSorted();
  const last = entries.length ? entries[entries.length - 1] : null;
  let mainHtml;
  let due = false;
  if (!last) {
    due = true;
    mainHtml = '<span class="home-waist-sub">まだ記録がありません（週1回が目安）</span>';
  } else if (todayCm != null) {
    const diff = waistDiffText(today, Number(todayCm));
    mainHtml = `<span class="home-waist-value">${formatCm(todayCm)}</span><span class="home-waist-sub">今日${diff ? `・${diff}` : ''}</span>`;
  } else {
    const days = daysBetweenKeys(last.dateKey, today);
    due = days >= WAIST_DUE_DAYS;
    mainHtml = `<span class="home-waist-value">${formatCm(last.cm)}</span><span class="home-waist-sub">${shortDateFromKey(last.dateKey)}・${days}日前${due ? '・そろそろ測る日です' : ''}</span>`;
  }
  container.innerHTML = `
    <div class="home-waist-panel${due ? ' is-due' : ''}">
      <div class="home-waist-main row-tap-area" data-waist-home-edit><span class="home-waist-label">腹囲</span>${mainHtml}</div>
      <button type="button" class="ghost-pill-btn bodyweight-log-small-btn" data-waist-home-edit>${todayCm != null ? '変更' : '記録する'}</button>
    </div>`;
}

// 記録タブの日の詳細に出す腹囲の行。週1回の記録なので、記録の無い日は「未記録」の行を並べず、
// カレンダー表示(showEmpty)の時だけ小さな「＋ 腹囲を記録」ボタンを出す。
function buildDayWaistRowHtml(dateStr, { showEmpty = true } = {}) {
  if (dateStr > localDateKey(new Date())) return '';
  const cm = loadWaistLog()[dateStr];
  if (editingWaistDateStr === dateStr) {
    return `<div class="day-weight-row day-weight-row-editing">
      <div class="day-weight-label">腹囲</div>
      ${waistFormHtml(dateStr, cm, { showCancel: true })}
    </div>`;
  }
  if (cm == null) {
    if (!showEmpty) return '';
    return `<div class="day-waist-add-row"><button type="button" class="ghost-pill-btn bodyweight-log-small-btn" data-waist-detail-edit="${dateStr}">＋ 腹囲を記録</button></div>`;
  }
  const diffText = waistDiffText(dateStr, Number(cm));
  return `<div class="day-weight-row">
    <span class="day-row-tap row-tap-area" data-waist-detail-edit="${dateStr}">
      <span class="day-weight-label">腹囲</span>
      <span class="day-weight-value">${formatCm(cm)}</span>
      ${diffText ? `<span class="day-weight-diff">${diffText}</span>` : ''}
    </span>
    <button type="button" class="ghost-pill-btn bodyweight-log-small-btn day-weight-edit-btn" data-waist-detail-edit="${dateStr}">変更</button>
  </div>`;
}

function renderWaistProgressChart() {
  const container = document.getElementById('waist-progress-content');
  if (!container) return;
  const entries = waistEntriesSorted();
  if (entries.length === 0) {
    container.innerHTML = '<p class="empty-text">まだ腹囲の記録がありません。ホーム画面の「腹囲」から記録できます（週1回が目安）。</p>';
    return;
  }
  const last = entries[entries.length - 1];
  if (entries.length === 1) {
    container.innerHTML = `
      <div class="bodyweight-summary">
        <div class="bodyweight-summary-item"><span class="bodyweight-summary-label">記録（${shortDateFromKey(last.dateKey)}）</span><span class="bodyweight-summary-value">${formatCm(last.cm)}</span></div>
      </div>
      <p class="hint-text">2回目を記録すると、推移が線でつながります。</p>`;
    return;
  }
  const prev = entries[entries.length - 2];
  const first = entries[0];
  const points = entries.map((e) => ({ date: `${e.dateKey}T00:00:00`, value: e.cm }));
  const chartHtml = buildProgressTrendChartHtml(points, {
    title: `腹囲（${entries.length}回分）`,
    valueFormatter: (v) => formatCm(v),
    fitToData: true,
    timeScale: true,
  });
  container.innerHTML = `
    <div class="bodyweight-summary">
      <div class="bodyweight-summary-item"><span class="bodyweight-summary-label">最新（${shortDateFromKey(last.dateKey)}）</span><span class="bodyweight-summary-value">${formatCm(last.cm)}</span></div>
      <div class="bodyweight-summary-item"><span class="bodyweight-summary-label">前回（${shortDateFromKey(prev.dateKey)}）比</span><span class="bodyweight-summary-value">${signedCmText(last.cm - prev.cm)}</span></div>
      <div class="bodyweight-summary-item"><span class="bodyweight-summary-label">初回（${shortDateFromKey(first.dateKey)}）比</span><span class="bodyweight-summary-value">${signedCmText(last.cm - first.cm)}</span></div>
    </div>
    ${chartHtml}`;
}

// ===== 体重の7日平均（2026-10-06〜、Codexと相談して決めた仕様） =====
// 毎日の値は水分や食事で上下するので、傾向は7日平均で見る。
// - ある日の7日平均 = その日を含む直前7暦日のうち「記録がある日だけ」の平均。未記録の日は0として数えない。
// - 7日のうち記録が5日未満の平均は「参考値」(グラフは点線)。5日は統計的な保証ではなく「週の大半を記録した」という目安。
// - 比べる基準日は、今日の記録があれば今日、無ければ昨日(朝に測る前でも昨日までの7日で比べられるように)。
//   最終記録日まで自動で戻すと、長く記録していないのに古い結果を「直近」と見せてしまうので戻さない。
const BODYWEIGHT_AVG_DAYS = 7;
const BODYWEIGHT_AVG_MIN_DAYS = 5;

// entries(古い→新しい順)のうち、endKeyを含む直前days暦日の記録の平均と日数。記録が無ければavgはnull。
function bodyWeightWindowAverage(entries, endKey, days = BODYWEIGHT_AVG_DAYS) {
  const startKey = shiftDateKey(endKey, -(days - 1));
  const inWindow = entries.filter((e) => e.dateKey >= startKey && e.dateKey <= endKey);
  const avg = inWindow.length ? inWindow.reduce((sum, e) => sum + e.kg, 0) / inWindow.length : null;
  return { avg, count: inWindow.length, startKey, endKey };
}

// 古い→新しい順の全記録について、各記録日の7日平均を一度に求める({dateKey → {avg, count}})。
// 期間に入った記録を足し、期間から外れた記録を引くだけの方式(毎回全記録を絞り込み直さない)。
function bodyWeightRollingAverages(entries) {
  const result = new Map();
  let startIdx = 0;
  let sum = 0;
  entries.forEach((e, i) => {
    sum += e.kg;
    const windowStart = shiftDateKey(e.dateKey, -(BODYWEIGHT_AVG_DAYS - 1));
    while (entries[startIdx].dateKey < windowStart) {
      sum -= entries[startIdx].kg;
      startIdx += 1;
    }
    const count = i - startIdx + 1;
    result.set(e.dateKey, { avg: sum / count, count });
  });
  return result;
}

function shortDateFromKey(dateKey) {
  const d = recordDateFromKey(dateKey);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 直近7日と、その前の7日の平均の比較を出す。差は丸める前の平均で計算し、表示の時だけ丸める。
function buildBodyWeightAverageCompareHtml(allEntries) {
  const today = localDateKey(new Date());
  const hasToday = allEntries.some((e) => e.dateKey === today);
  const baseKey = hasToday ? today : previousDateKey(today);
  const recent = bodyWeightWindowAverage(allEntries, baseKey);
  const prev = bodyWeightWindowAverage(allEntries, shiftDateKey(baseKey, -BODYWEIGHT_AVG_DAYS));
  if (recent.count === 0 && prev.count === 0) return '';
  const row = (label, w) => {
    const weak = w.count > 0 && w.count < BODYWEIGHT_AVG_MIN_DAYS;
    return `<div class="bw-avg-row">
      <div class="bw-avg-row-label">${label}<span class="bw-avg-range">${shortDateFromKey(w.startKey)}〜${shortDateFromKey(w.endKey)}</span></div>
      <div class="bw-avg-row-value">
        ${w.avg != null ? `<span class="bw-avg-kg">${formatKg(w.avg)}</span>` : '<span class="bw-avg-none">記録なし</span>'}
        <span class="bw-avg-count${weak ? ' is-weak' : ''}">${w.count}/${BODYWEIGHT_AVG_DAYS}日分${weak ? '・参考値' : ''}</span>
      </div>
    </div>`;
  };
  let diffHtml;
  if (recent.count >= BODYWEIGHT_AVG_MIN_DAYS && prev.count >= BODYWEIGHT_AVG_MIN_DAYS) {
    diffHtml = `<div class="bw-avg-diff">前の7日と比べて <strong>${signedKgText(recent.avg - prev.avg)}</strong></div>`;
  } else {
    // 「あと◯日記録すれば」とは書かない(日が進むと古い記録が期間から外れ、前の期間の不足は今後の記録では埋まらないため)
    const short = [];
    if (recent.count < BODYWEIGHT_AVG_MIN_DAYS) short.push('直近の7日');
    if (prev.count < BODYWEIGHT_AVG_MIN_DAYS) short.push('その前の7日');
    diffHtml = `<p class="hint-text bw-avg-diff-note">${short.join('と')}の記録が${BODYWEIGHT_AVG_MIN_DAYS}日分に足りないため、差は出していません。</p>`;
  }
  return `<div class="bw-avg-compare">
      <div class="bw-avg-title">7日平均の比較</div>
      ${row('直近の7日', recent)}
      ${row('その前の7日', prev)}
      ${diffHtml}
      ${hasToday ? '' : '<p class="hint-text bw-avg-diff-note">今日はまだ記録がないので、昨日までの7日で比べています。</p>'}
    </div>`;
}

function renderBodyWeightProgressChart() {
  const container = document.getElementById('bodyweight-progress-content');
  if (!container) return;
  document.querySelectorAll('[data-bodyweight-range]').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.bodyweightRange) === bodyWeightGraphRangeDays);
  });
  const allEntries = bodyWeightEntriesSorted();
  let cutoff = '';
  if (bodyWeightGraphRangeDays > 0) {
    const from = new Date();
    from.setDate(from.getDate() - (bodyWeightGraphRangeDays - 1));
    cutoff = localDateKey(from);
  }
  const entries = allEntries.filter((e) => e.dateKey >= cutoff);
  if (allEntries.length === 0) {
    container.innerHTML = '<p class="empty-text">まだ体重の記録がありません。ホーム画面の「今日の体重を記録」から記録できます。</p>';
    return;
  }
  const compareHtml = buildBodyWeightAverageCompareHtml(allEntries);
  if (entries.length < 2) {
    container.innerHTML = `${compareHtml}<p class="empty-text">この期間の体重の記録が2日分たまるとグラフが表示されます。期間を広げるか、ホーム画面から毎日記録してみてください。</p>`;
    return;
  }
  const last = entries[entries.length - 1];
  const values = entries.map((e) => e.kg);
  const rangeLabel = { 30: '1か月', 90: '3か月', 365: '1年', 0: 'すべての期間' }[bodyWeightGraphRangeDays] || '';
  // 平均は記録のある日にだけ点を打つ(記録の無い日に点を足すと、測っていない間に体重が動いたように見えるため)。
  // 表示期間の最初の日の平均にも、期間より前の6日分の記録を使う。
  const averageByDate = bodyWeightRollingAverages(allEntries);
  const averages = entries.map((e) => averageByDate.get(e.dateKey));
  const overlay = entries.map((e, i) => ({
    value: averages[i].avg,
    weak: averages[i].count < BODYWEIGHT_AVG_MIN_DAYS,
    breakBefore: i > 0 && entries[i - 1].dateKey <= shiftDateKey(e.dateKey, -BODYWEIGHT_AVG_DAYS),
  }));
  const points = entries.map((e, i) => ({ date: `${e.dateKey}T00:00:00`, value: e.kg, avg: averages[i] }));
  const chartHtml = buildProgressTrendChartHtml(points, {
    title: `体重（${rangeLabel}・${entries.length}日分）`,
    valueFormatter: (v) => formatKg(v),
    detailFormatter: (p) => `7日平均 ${formatKg(p.avg.avg)}・${p.avg.count}日分${p.avg.count < BODYWEIGHT_AVG_MIN_DAYS ? '・参考値' : ''}`,
    fitToData: true,
    timeScale: true,
    overlay,
    overlayLabel: '7日平均',
    subtitleHtml: '<p class="hint-text chart-legend-note">点＝毎日の体重、線＝7日平均（点線は記録が5日分未満の参考値）。点をタップすると両方の値が出ます。</p>',
  });
  container.innerHTML = `
    ${compareHtml}
    <div class="bodyweight-summary">
      <div class="bodyweight-summary-item"><span class="bodyweight-summary-label">最新（${shortDateFromKey(last.dateKey)}）</span><span class="bodyweight-summary-value">${formatKg(last.kg)}</span></div>
      <div class="bodyweight-summary-item"><span class="bodyweight-summary-label">最小〜最大(kg)</span><span class="bodyweight-summary-value">${Math.min(...values).toFixed(1)}〜${Math.max(...values).toFixed(1)}</span></div>
    </div>
    ${chartHtml}`;
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
