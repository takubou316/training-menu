// エントリポイント。画面遷移とイベント配線のみを担当する。

// 全画面モーダル(種目ピッカー・RPE説明・有酸素タイマー等)を開いている間、背面ページの
// スクロールを止めるための共有ロック。カウンタ方式にしているのは、内部に独自スクロール領域
// (種目ピッカーの一覧、RPE説明の長い表など)を持つモーダルで、背面ページのスクロールと
// 競合してタッチ操作がどちらに取られるか曖昧になり、本来スクロールしたい方が操作できなくなる
// 不具合があったため。1つでも開いていればロックし、全部閉じたら解除する。
// 単純にoverflow:hiddenを付けるだけだと、特にiOS Safariでロック解除時に
// スクロール位置が一番上に戻ってしまう既知の問題があるため、ロック時の
// スクロール位置を覚えておき、bodyをposition:fixedでその位置に固定→
// 解除時にwindow.scrollToで元の位置へ戻す方式にしている。
// テーマ(配色)切り替え。data-theme属性をhtml要素に付け、css/style.cssの[data-theme]定義に
// 切り替えを任せる。index.html<head>の即時実行スクリプトが起動時のFOUC対策として同じ属性を
// 先に設定しているので、ここでは「保存」と「(必要なら)反映」の両方を行う。
const THEME_META_COLORS = { amber: '#1a1512', mono: '#16171a', rose: '#16141a', sage: '#14171a' };

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  saveTheme(theme);
  const metaEl = document.getElementById('theme-color-meta');
  if (metaEl) metaEl.setAttribute('content', THEME_META_COLORS[theme] || THEME_META_COLORS.amber);
  document.querySelectorAll('.theme-swatch').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.themeOption === theme);
  });
}

function wireThemePicker() {
  document.querySelectorAll('.theme-swatch').forEach((btn) => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.themeOption));
  });
  applyTheme(loadTheme());
}

// 今動いている画面のプログラムのバージョン。**service-worker.jsのCACHE_NAME(training-menu-vN)を上げる時は必ず一緒に上げる**。
// 「その他の設定」に、これとオフライン用キャッシュの番号・読み込んだ時刻を出し、引っぱって更新で本当に新しくなったかを確かめられるようにする
// (2026-10-07 ユーザー要望「本当に更新できてる？」)。
const APP_VERSION = 63;
const APP_LOADED_AT = new Date();

async function renderAppVersion() {
  const el = document.getElementById('app-version-text');
  if (!el) return;
  const time = `${APP_LOADED_AT.getMonth() + 1}/${APP_LOADED_AT.getDate()} ${APP_LOADED_AT.getHours()}:${String(APP_LOADED_AT.getMinutes()).padStart(2, '0')}:${String(APP_LOADED_AT.getSeconds()).padStart(2, '0')}`;
  let cacheText = '';
  try {
    if ('caches' in window) {
      const nums = (await caches.keys()).map((k) => (k.match(/^training-menu-v(\d+)$/) || [])[1]).filter(Boolean).map(Number);
      if (nums.length > 0) {
        const latest = Math.max(...nums);
        cacheText = latest === APP_VERSION ? '（オフライン用も同じ）' : `（オフライン用は v${latest}。次に開いた時にそろいます）`;
      }
    }
  } catch (e) { /* キャッシュが読めなくても番号は出す */ }
  el.textContent = `v${APP_VERSION}${cacheText}・${time}に読み込み`;
}

// 最新の状態に更新する(引っぱって更新から呼ぶ)。standaloneでホーム画面に追加したPWAにはブラウザのURLバー・
// 更新ボタンが無く、最新コードを取ってきたい手段が「一度ホーム画面から削除して開き直す」
// くらいしか無かった(2026-09-16、ユーザー指摘。当初はヘッダー右上の⟳ボタン、2026-10-07に引っぱって更新へ)。
// service-worker.jsのfetchハンドラは既にネットワーク優先(cache:'no-store')なので理屈上は単純なlocation.reload()だけでも
// 最新化されるはずだが、念のためService Workerのキャッシュ(オフライン用フォールバック)も
// 明示的に消してから再読み込みする。記録中のトレーニングは途中の記録(スナップショット)から復元される。
async function hardReload() {
  try {
    if (typeof persistActiveSessionSnapshot === 'function') persistActiveSessionSnapshot({ passive: true });
  } catch (e) { /* 保存できなくても更新は続ける */ }
  try {
    // Service Worker自体の新しい版も取りに行く(新しい版はskipWaitingで入れ替わる)。長く待たないよう3秒で打ち切る
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await Promise.race([reg.update(), new Promise((resolve) => setTimeout(resolve, 3000))]);
    }
  } catch (e) { /* 更新確認に失敗しても再読み込みは続ける */ }
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (e) {
    // 失敗してもlocation.reload()自体はネットワーク優先で最新化されるので握りつぶす
  }
  location.reload();
}

// 引っぱって更新(2026-10-07 ユーザー要望「上限界までやると空白の部分が出てくるけど、ある一定まで下げると
// ページが更新されるようにしたい」)。ページが一番上の時に始めた縦のスワイプだけを見て、一定以上(PULL_REFRESH_PX)
// 下げて離したら更新する。iPhoneの標準の引っぱり(上に空白が出る動き)はそのまま使い、表示を重ねるだけにする。
// 全画面タイマー・下から出るシート・確認の小窓を開いている間(lockBodyScroll中や.open)は反応しない。
// 80pxでは軽すぎた(ユーザー要望で140pxに)。離した後は回る表示を最低0.5秒見せてから更新する(すぐ消えると更新したか分からないため)
const PULL_REFRESH_PX = 140;
const PULL_REFRESH_MIN_SPIN_MS = 500;

function wirePullToRefresh() {
  const indicator = document.getElementById('pull-refresh');
  if (!indicator) return;
  const textEl = indicator.querySelector('.pull-refresh-text');
  let startY = null;
  let startX = 0;
  let pull = 0;
  let refreshing = false;

  const blocked = () => bodyScrollLockCount > 0
    || !!document.querySelector('.demo-modal.open, .rest-timer-modal:not([hidden])');
  const reset = () => {
    startY = null;
    pull = 0;
    indicator.classList.remove('is-visible', 'is-ready');
  };

  document.addEventListener('touchstart', (e) => {
    if (refreshing || e.touches.length !== 1 || window.scrollY > 0 || blocked()) { startY = null; return; }
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    pull = 0;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (startY == null || refreshing) return;
    const dy = e.touches[0].clientY - startY;
    const dx = Math.abs(e.touches[0].clientX - startX);
    // 横に流す操作(数字ホイール等)や、途中でページが下にスクロールした時はやめる
    if (dy <= 0 || dx > dy || window.scrollY > 0) {
      if (pull > 0) reset();
      if (dx > Math.abs(dy)) startY = null;
      return;
    }
    pull = dy;
    const header = document.querySelector('.app-header');
    const top = header ? header.getBoundingClientRect().bottom : 0;
    const ready = pull >= PULL_REFRESH_PX;
    indicator.style.top = `${Math.max(0, top) + Math.min(pull, PULL_REFRESH_PX) * 0.25}px`;
    indicator.classList.add('is-visible');
    indicator.classList.toggle('is-ready', ready);
    textEl.textContent = ready ? '離すと更新' : '引っぱって更新';
  }, { passive: true });

  const end = () => {
    if (startY == null || refreshing) return;
    if (pull >= PULL_REFRESH_PX) {
      refreshing = true;
      indicator.classList.remove('is-ready');
      indicator.classList.add('is-visible', 'is-refreshing');
      indicator.querySelector('.pull-refresh-icon').textContent = '⟳';
      textEl.textContent = '更新中…';
      setTimeout(() => hardReload(), PULL_REFRESH_MIN_SPIN_MS);
      return;
    }
    reset();
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', reset, { passive: true });
}

let bodyScrollLockCount = 0;
let bodyScrollLockSavedY = 0;
function lockBodyScroll() {
  bodyScrollLockCount += 1;
  if (bodyScrollLockCount > 1) return; // 既にロック中なら何もしない
  bodyScrollLockSavedY = window.scrollY;
  document.body.classList.add('modal-open');
  document.body.style.top = `-${bodyScrollLockSavedY}px`;
}
function unlockBodyScroll() {
  // ロックしていないのに呼ばれた時は何もしない(以前は古い位置へwindow.scrollToしてしまい、画面が勝手に飛んでいた。
  // 休憩タイマーが0秒の後の自動終了と「今すぐ終わる」が重なった時など。2026-10-07 実機報告)
  if (bodyScrollLockCount === 0) return;
  bodyScrollLockCount -= 1;
  if (bodyScrollLockCount > 0) return;
  document.body.classList.remove('modal-open');
  document.body.style.top = '';
  window.scrollTo(0, bodyScrollLockSavedY);
}

const PART_TO_MUSCLES = {
  fullbody: ['fullbody'],
  chest: ['chest'],
  back: ['back'],
  shoulders: ['shoulders'],
  arms: ['biceps', 'triceps'],
  legs: ['quads', 'hamstrings', 'glutes', 'calves'],
  core: ['abs'],
};

let currentMenu = null;
let currentSession = null;

// 記録中(currentSessionがある間)の状態を随時localStorageへスナップショット保存する。
// ブラウザ/PWAには真のバックグラウンド実行の権限が無く、OSがバックグラウンドの
// タブ/PWAプロセスを終了させることがある(特にウォーキング中に他アプリへ長時間切り替えた場合)。
// 復帰時にページが丸ごとリロードされるとメモリ上のcurrentSession・タイマーが失われ、
// 計測中の時間も記録の完了もできなくなる不具合があったため追加した(復元はrestoreActiveSessionIfAny)。
// rest-timer/hold-timerは数十秒〜数分程度の短時間な操作であり、リロードに巻き込まれても
// 「もう一度セットを完了にする／もう一度計測ボタンを押す」程度の実害で済むため対象外にしている。
// 記録中のトレーニングを最後に操作した時刻(2026-10-07〜)。開き直した時、しばらく操作していなければ
// 記録画面ではなくホームで開くために使う。アプリを閉じた・別画面へ移っただけの保存(passive)では更新しない。
let sessionLastActivityAt = null;
// 最後の操作からこれ以上たっていたら、開き直した時にホームで開く(ユーザー判断「しばらく空いたらホーム」、3時間)
const STALE_SESSION_MS = 3 * 60 * 60 * 1000;

function persistActiveSessionSnapshot({ passive = false } = {}) {
  if (!currentSession) return;
  if (!passive || sessionLastActivityAt == null) sessionLastActivityAt = Date.now();
  const ok = saveActiveSessionSnapshot({
    session: currentSession,
    menu: currentMenu,
    sessionStartTime,
    lastActivityAt: sessionLastActivityAt,
    cardioTimer: activeCardioTimer
      ? {
          exIndex: activeCardioTimer.exIndex,
          phase: activeCardioTimer.phase,
          accumulatedActiveMs: activeCardioTimer.accumulatedActiveMs,
          segmentStartedAt: activeCardioTimer.segmentStartedAt,
          restLog: activeCardioTimer.restLog,
          targetNotified: activeCardioTimer.targetNotified,
        }
      : null,
  });
  // 自動保存に失敗している間は記録画面に注意を出す(以前は黙って無視しており、アプリが閉じられると
  // 途中の記録が消えることに気付けなかった。2026-10-04)。
  const warning = document.getElementById('log-autosave-error');
  if (warning) warning.hidden = ok;
}

// 起動時、前回終了できなかった記録中セッションがあれば記録画面へ復元する。
// 戻り値は復元できたかどうか(復元した場合、URLパラメータ由来の?quickstart等の処理は
// 記録中セッションを上書きしてしまうため呼び出し元でスキップする)。
function restoreActiveSessionIfAny() {
  const snapshot = loadActiveSessionSnapshot();
  if (!snapshot || !snapshot.session || !Array.isArray(snapshot.session.exercises)) return false;

  // 想定外の形式のスナップショット(将来のデータ構造変更や、書き込み途中でOSに
  // プロセスを終了させられ壊れた場合など)でrenderLog等が例外を投げると、
  // init()の残りの配線(ボタンのイベント登録等)まで止まってしまいアプリ全体が
  // 動かなくなる。復元専用の処理なので失敗時は握りつぶし、壊れたスナップショットを
  // 捨てて通常起動にフォールバックする(2026-09-15、Codexレビュー指摘)。
  try {
    currentSession = snapshot.session;
    currentMenu = snapshot.menu || null;
    // 古いスナップショット(lastActivityAt無し)は開始時刻で代用する
    sessionLastActivityAt = Number(snapshot.lastActivityAt) || Number(snapshot.sessionStartTime) || Date.now();
    renderLog(currentSession);
    updateFinishButtonState();
    // 最後の操作から3時間以上たっていたら、もうやるつもりが無い記録かもしれないので記録画面ではなくホームで開く
    // (ホームの「トレーニング中」欄から戻るかやめるかを選べる。2026-10-07 ユーザー要望)。
    // 有酸素の計測中は画面を閉じていても計測が続いている扱いなので、時間に関係なく記録画面に戻す。
    const stale = !snapshot.cardioTimer && Date.now() - sessionLastActivityAt >= STALE_SESSION_MS;
    startSessionTimer(snapshot.sessionStartTime);
    if (stale) {
      pauseSessionTimerDisplay();
      showScreen('mode');
    } else {
      showScreen('log');
    }
    if (snapshot.cardioTimer) {
      // 保存された種目番号(exIndex)が現在のセッション内容と噛み合わない場合(壊れた
      // スナップショットや将来の仕様変更等)、対応する有酸素スライダーが存在しないまま
      // タイマーだけが動き続ける「宙に浮いた」状態になってしまう。有酸素種目であることを
      // 確認できた時だけ復元する(2026-09-16、Codexレビュー指摘)。
      const cardioEx = currentSession.exercises[snapshot.cardioTimer.exIndex];
      if (cardioEx && cardioEx.type === 'cardio') restoreCardioTimer(snapshot.cardioTimer);
    }
    return true;
  } catch (e) {
    currentSession = null;
    currentMenu = null;
    clearActiveSessionSnapshot();
    // restoreCardioTimer側の途中で例外が起きた場合、activeCardioTimerとモーダルの表示だけが
    // 宙に浮いて残ることがあるため、後片付けも試みる(失敗しても無視する)。
    if (typeof activeCardioTimer !== 'undefined' && activeCardioTimer && typeof stopCardioTimer === 'function') {
      try { stopCardioTimer(); } catch (e2) { /* 後片付け自体の失敗は無視 */ }
    }
    return false;
  }
}
// 自重種目の負荷推定・有酸素の消費カロリー計算に使う体重は、ホームで毎日記録する体重
// (js/storage.jsのloadBodyWeightLog)を参照する。今日の記録があればそれ、無ければ一番新しい記録。
// 体重の記録が1件も無い場合だけ、以前の設定画面/自分で作る画面で入力していた値(settings.bodyWeightKg)、
// それも無ければ60kgを仮の値として使う。
// 2026-10-03までは「要望から作る」「自分で作る」の両画面に体重の入力欄があったが、ホームの毎日の
// 体重記録と二重になるためユーザー要望で入力欄を完全に削除した。
const BODYWEIGHT_MIN = 20;
const BODYWEIGHT_MAX = 200;
const BODYWEIGHT_FALLBACK_KG = 60;

function getBodyWeightKg() {
  const entries = bodyWeightEntriesSorted();
  if (entries.length) return entries[entries.length - 1].kg;
  const settings = loadSettings();
  if (settings && Number.isFinite(Number(settings.bodyWeightKg)) && settings.bodyWeightKg != null) {
    return Number(settings.bodyWeightKg);
  }
  return BODYWEIGHT_FALLBACK_KG;
}

// 指定した日(localDateKey形式)時点の体重。その日以前で一番新しい体重記録→以前の設定値の順で求め、
// どちらも無ければnull(仮の60kgは返さない)。クラウド同期で記録に添える体重に使う(js/sync.js)。
// 以前は送信した瞬間の最新体重を送っていたため、オフラインで記録→別の日に体重を更新→同期、の順だと
// 過去の運動に別の日の体重が付いていた(2026-10-04修正)。
function bodyWeightKgOnDate(dateKey) {
  const earlier = bodyWeightEntriesSorted().filter((e) => e.dateKey <= dateKey);
  if (earlier.length) return earlier[earlier.length - 1].kg;
  const settings = loadSettings();
  if (settings && settings.bodyWeightKg != null && Number.isFinite(Number(settings.bodyWeightKg))) {
    return Number(settings.bodyWeightKg);
  }
  return null;
}

// 本人が入力した体重があるか(仮の60kgではないか)。
function bodyWeightHasStoredValue() {
  if (bodyWeightEntriesSorted().length) return true;
  const settings = loadSettings();
  return !!(settings && settings.bodyWeightKg != null);
}

// 「自分で作る」モードの状態
let customExercises = []; // EXERCISESの生データを追加順に並べたもの
let customRestSec = {}; // exerciseId -> 休憩秒数
// exerciseId -> { timed, reps, sec, sets }（js/menu-generator.jsのnormalizeCustomTarget）。2026-10-06〜
let customTargets = {};
// やり方: 'sets'(種目ごと、従来通り) | 'circuit'(全種目を1セットずつ×周回数)
let customFormat = 'sets';
// 最後に読み込んだ(または保存した)組み合わせのid。種目構成がその組み合わせのままなら、記録に
// templateIdとして残す(週間プランの「一日おき」が前回やった日を探すのに使う)。
let customTemplateId = null;
// 回数・セット数の編集画面で今編集している種目のid
let customTargetEditingId = null;
let customWarmup = { general: '', dynamic: [] };
let customCooldown = { static: [], general: '' };

// 種目ピッカーが今どちらの画面から開かれているか('custom' | 'menu')
let exercisePickerTarget = null;
// 種目ピッカーの絞り込みモード('all' | 'favorites' | 'recent')
let exercisePickerFilter = 'all';
// 種目ピッカーの器具絞り込み。「要望から作る」のメニュー画面から開いた時だけ、その時
// 選んだ器具の配列が入る(「自分で作る」からは常にnull＝絞り込みなし)。
let exercisePickerEquipmentFilter = null;
// 上記の絞り込みを今実際に適用しているか(ピッカー内のトグルでON/OFFを切り替えられる)
let exercisePickerEquipmentFilterActive = true;

// 記録削除の確認モーダルが今どちらの対象か(nullなら「すべて削除」、文字列ならその1件のsession.id)
let historyDeleteTargetId = null;
// 上記とは別軸で、削除の種類を持つ('all'|'session'|'day')。「◯月◯日のデータを削除する」は
// 1日に複数回記録がある場合も全部まとめて対象になるため、単一のsession.idでは表現できない。
let historyDeleteMode = 'all';
// historyDeleteMode==='day'の時の対象日(localDateKey形式)。確認モーダルを開いた時点の選択日を固定する。
let historyDeleteDateKey = null;

// 豆知識画面のカテゴリ絞り込み('all'またはKNOWLEDGE_CATEGORIESのいずれか)
let knowledgeCategoryFilter = 'all';

// トレーニング予定から始めた時、その予定のid。記録のroutineIdに入れて「やったか」の判定に使う(2026-10-07〜)。
// 「自分で作る」経由(保存した組み合わせの予定)はcustomRoutineId、「要望から作る」経由(部位の予定)はsetupRoutineId。
let customRoutineId = null;
let setupRoutineId = null;

// ===== 種目カードの長押し→ドラッグ並べ替え（スマホのホーム画面アイコンと同じ操作感） =====
// 長押しで「入れ替えモード」に入り、カードがゆれる。ゆれている間はどのカードもそのまま
// ドラッグして並べ替えできる（2つ目以降は長押し不要）。各カードの左上の×バッジで削除。
// 「完了」を押すか、もう一度長押しすると通常モードに戻る。

const REORDER_LONG_PRESS_MS = 450;
const REORDER_MOVE_TOLERANCE = 10;

function createReorderController({ stableContainer, listSelector, onReorder, onRemove }) {
  let reorderMode = false;
  let pressTimer = null;
  let pressStart = null;
  let pressItem = null;
  let drag = null;

  function listEl() {
    if (!stableContainer) return null;
    if (stableContainer.matches && stableContainer.matches(listSelector)) return stableContainer;
    return stableContainer.querySelector(listSelector);
  }

  function items() {
    const list = listEl();
    return list ? Array.from(list.querySelectorAll(':scope > .reorder-item')) : [];
  }

  function applyModeClass() {
    const list = listEl();
    if (list) list.classList.toggle('reorder-mode', reorderMode);
  }

  function setReorderMode(on) {
    reorderMode = on;
    applyModeClass();
  }

  function clearPressTimer() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  function beginDrag(item) {
    const els = items();
    const originalOrder = els.map((el) => el.dataset.reorderKey);
    drag = {
      key: item.dataset.reorderKey,
      el: item,
      order: originalOrder.slice(),
      originalIndex: Object.fromEntries(originalOrder.map((k, i) => [k, i])),
      slotTop: els.map((el) => el.getBoundingClientRect().top),
      slotHeight: els.map((el) => el.offsetHeight),
      startClientY: null,
    };
    item.classList.add('reorder-dragging');
    const list = listEl();
    if (list) list.classList.add('dragging-active');
  }

  function updateDrag(clientY) {
    if (!drag) return;
    if (drag.startClientY == null) drag.startClientY = clientY;
    const deltaY = clientY - drag.startClientY;
    drag.el.style.transform = `translateY(${deltaY}px)`;

    const draggedSlot = drag.originalIndex[drag.key];
    const draggedCenter = drag.slotTop[draggedSlot] + drag.slotHeight[draggedSlot] / 2 + deltaY;

    let targetSlot = drag.order.indexOf(drag.key);
    let bestDist = Infinity;
    drag.slotTop.forEach((top, i) => {
      const center = top + drag.slotHeight[i] / 2;
      const dist = Math.abs(center - draggedCenter);
      if (dist < bestDist) {
        bestDist = dist;
        targetSlot = i;
      }
    });

    const currentSlot = drag.order.indexOf(drag.key);
    if (targetSlot !== currentSlot) {
      drag.order.splice(currentSlot, 1);
      drag.order.splice(targetSlot, 0, drag.key);
    }

    items().forEach((el) => {
      if (el === drag.el) return;
      const key = el.dataset.reorderKey;
      const target = drag.slotTop[drag.order.indexOf(key)];
      const orig = drag.slotTop[drag.originalIndex[key]];
      const shift = target - orig;
      el.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  }

  function endDrag() {
    if (!drag) return;
    const finalOrder = drag.order.slice();
    drag.el.classList.remove('reorder-dragging');
    drag.el.style.transform = '';
    items().forEach((el) => { el.style.transform = ''; });
    const list = listEl();
    if (list) list.classList.remove('dragging-active');
    drag = null;
    onReorder(finalOrder);
  }

  // Pointer Eventsではなく生のTouch/Mouseイベントを使う。iOSのPointer Eventsは
  // touch-action(CSS)をJSから動的に変更してもドラッグ開始時のスクロール判定に
  // 間に合わないことがある既知の制限があり(w3c/pointerevents issue #178)、
  // 実際にドラッグ中に画面ごとスクロールしてしまう不具合が起きたため、より枯れた
  // Touch Events(preventDefaultがtouchmoveで確実に効く)方式に切り替えた。

  function pointFromEvent(e) {
    if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function handleStart(e) {
    if (drag) return; // 既にドラッグ中は多重タッチ/多重クリックを無視
    if (e.target.closest('.reorder-delete-badge')) return;
    if (e.target.closest('input, button, a')) return;
    const item = e.target.closest('.reorder-item');
    const list = listEl();
    if (!item || !list || !list.contains(item)) return;
    const p = pointFromEvent(e);
    pressStart = { x: p.x, y: p.y };
    pressItem = item;
    clearPressTimer();
    if (reorderMode) {
      beginDrag(item);
    } else {
      pressTimer = setTimeout(() => {
        pressTimer = null;
        if (!pressItem) return;
        setReorderMode(true);
        beginDrag(pressItem);
      }, REORDER_LONG_PRESS_MS);
    }
  }

  function cancelPendingPress() {
    clearPressTimer();
    pressItem = null;
    pressStart = null;
  }

  // move/end/cancelはcontainerではなくdocumentで拾う。ドラッグ中に指がリストの外
  // (下部ナビや画面端)まで動いても追跡を取りこぼさないようにするため。
  function handleMove(e) {
    const p = pointFromEvent(e);
    if (pressStart && !drag) {
      if (Math.abs(p.x - pressStart.x) > REORDER_MOVE_TOLERANCE || Math.abs(p.y - pressStart.y) > REORDER_MOVE_TOLERANCE) {
        cancelPendingPress();
      }
    }
    if (drag) {
      e.preventDefault(); // touchmoveでのpreventDefaultが画面スクロール抑制の本体
      updateDrag(p.y);
    }
  }

  function handleEnd() {
    cancelPendingPress();
    if (drag) endDrag();
  }

  stableContainer.addEventListener('touchstart', handleStart, { passive: true });
  document.addEventListener('touchmove', handleMove, { passive: false });
  document.addEventListener('touchend', handleEnd);
  document.addEventListener('touchcancel', handleEnd);

  // マウス操作(PCでの動作確認用)
  stableContainer.addEventListener('mousedown', handleStart);
  document.addEventListener('mousemove', handleMove);
  document.addEventListener('mouseup', handleEnd);

  stableContainer.addEventListener('click', (e) => {
    const badge = e.target.closest('.reorder-delete-badge');
    if (badge) {
      const item = badge.closest('.reorder-item');
      if (item) onRemove(item.dataset.reorderKey);
      return;
    }
    if (e.target.closest('[data-reorder-done]')) setReorderMode(false);
  });

  return {
    reapplyAfterRender() { applyModeClass(); },
  };
}

let menuReorderController = null;
let customReorderController = null;

function findExerciseById(id) {
  return EXERCISES.find((ex) => ex.id === id);
}

function getSelectedParts() {
  return Array.from(document.querySelectorAll('#part-group input:checked')).map((el) => el.dataset.part);
}

function getSelectedEquipment() {
  return Array.from(document.querySelectorAll('#equipment-group input:checked')).map((el) => el.value);
}

function getSelectedPainAreas() {
  return Array.from(document.querySelectorAll('#pain-group input:checked'))
    .map((el) => el.dataset.pain)
    .filter((v) => v !== 'none');
}

// ===== スライダー全般の見た目強化（塗りつぶしトラック＋ドラッグ中の値バブル） =====
// アプリ内の`.slider-field input[type="range"]`（体重・重量・回数・RPE・休憩時間・
// 有酸素の時間/距離など）すべてに共通で効かせる。個々の描画箇所(sliderFieldHtml等)を
// 増やしても自動的に対応できるよう、個別に配線せずdocumentレベルのイベント委譲と
// MutationObserverで一括対応している。

const SLIDER_THUMB_SIZE = 26; // css側の::-webkit-slider-thumb/::-moz-range-thumbの幅と合わせる

// WebKit(iOS Safari)には::-webkit-slider-progressが無く、塗りつぶしはトラック背景の
// グラデーションで表現するしかないため、現在値の割合を--slider-fillカスタムプロパティに
// 反映する。Firefoxは::-moz-range-progressで標準対応しているため実質上書き不要だが、
// 呼んでも害はない。
function updateSliderTrackFill(slider) {
  const min = Number(slider.min) || 0;
  const max = Number(slider.max) || 100;
  const value = Number(slider.value);
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  slider.style.setProperty('--slider-fill', `${pct}%`);
  updateSliderBoundLabels(slider);
  updateSliderTickPeriod(slider);
}

// data-tick-step="10"のように「何単位ごとに目盛りを引くか」を指定したスライダーだけ、
// 今のmin/maxに対する目盛り間隔を%で計算してCSS側に渡す(体重スライダーで指定、
// 2026-08-14)。端で範囲(min/max)が伸びるスライダーでも、間隔がその都度計算し直されるので
// 常に「10kgごと」等が保たれる。指定が無いスライダーは--slider-tick-period(既定100%)の
// ままで目盛りが表示されない。
function updateSliderTickPeriod(slider) {
  const tickStep = Number(slider.dataset.tickStep);
  if (!tickStep) return;
  const min = Number(slider.min) || 0;
  const max = Number(slider.max) || 100;
  const span = max - min;
  if (span <= 0) return;
  const periodPct = (tickStep / span) * 100;
  slider.style.setProperty('--slider-tick-period', `${periodPct}%`);
}

// トラック両脇の範囲表示(.slider-bound-min/.slider-bound-max)を、今のmin/maxに合わせて
// 更新する。体重・回数のように端まで動かすと範囲が伸びるスライダーでは、この表示も
// 追従しないと「今どこまで動かせるか」が伝わらない。塗り(--slider-fill)と同じタイミングで
// 常に呼ぶことで更新漏れを防ぐ(呼ぶだけなら値が同じでも害はない)。
function updateSliderBoundLabels(slider) {
  const row = slider.closest('.slider-track-row');
  if (!row) return;
  const minEl = row.querySelector('.slider-bound-min');
  const maxEl = row.querySelector('.slider-bound-max');
  if (minEl) minEl.textContent = formatSliderBoundLabel(slider, slider.min);
  if (maxEl) maxEl.textContent = formatSliderBoundLabel(slider, slider.max);
}

// 秒数系(休憩時間・有酸素の時間)は生の秒数だと読みにくいので、既存の分:秒表記を流用する。
// それ以外は単位を付けず素の数値のみ(値側のラベルで単位が分かるため、両端まで繰り返さない)。
function formatSliderBoundLabel(slider, rawValue) {
  if (slider.dataset.cardioField === 'duration') {
    return `${Math.round(Number(rawValue) / 60)}分`;
  }
  if (slider.dataset.cardioField === 'distance') {
    return `${rawValue}km`;
  }
  if (slider.hasAttribute('data-custom-rest')) {
    return `${rawValue}秒`;
  }
  return rawValue;
}

let sliderValueBubbleEl = null;

function ensureSliderValueBubble() {
  if (!sliderValueBubbleEl) {
    sliderValueBubbleEl = document.createElement('div');
    sliderValueBubbleEl.className = 'slider-value-bubble';
    document.body.appendChild(sliderValueBubbleEl);
  }
  return sliderValueBubbleEl;
}

// バブルの位置・中身をスライダーの現在位置に合わせる。中身は隣の.slider-valueラベル
// （単位付きの表示、例:「87 kg」「RPE 7」）をそのまま流用し、表記を二重管理しない。
function positionSliderBubble(slider) {
  const bubble = ensureSliderValueBubble();
  const rect = slider.getBoundingClientRect();
  const min = Number(slider.min) || 0;
  const max = Number(slider.max) || 100;
  const pct = max > min ? (Number(slider.value) - min) / (max - min) : 0;
  const x = rect.left + SLIDER_THUMB_SIZE / 2 + pct * (rect.width - SLIDER_THUMB_SIZE);
  bubble.style.left = `${x}px`;
  bubble.style.top = `${rect.top - 8}px`;
  const valueLabel = slider.closest('.slider-field')?.querySelector('.slider-value');
  bubble.textContent = valueLabel ? valueLabel.textContent : slider.value;
}

function showSliderBubble(slider) {
  positionSliderBubble(slider);
  ensureSliderValueBubble().classList.add('visible');
}

function hideSliderBubble() {
  if (sliderValueBubbleEl) sliderValueBubbleEl.classList.remove('visible');
}

function isRangeInput(el) {
  return el instanceof HTMLInputElement && el.type === 'range';
}

function wireSliderEnhancements() {
  document.querySelectorAll('input[type="range"]').forEach(updateSliderTrackFill);

  // 新しく描画されたスライダー(記録画面の再描画、種目追加など)にも自動で塗りを反映する。
  new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (isRangeInput(node)) updateSliderTrackFill(node);
        node.querySelectorAll?.('input[type="range"]').forEach(updateSliderTrackFill);
      });
    });
  }).observe(document.getElementById('main'), { childList: true, subtree: true });

  // 値ラベル(.slider-value)の更新は各画面固有のリスナー(handleLogInput等、スライダーの
  // 直近の祖先要素に登録)が担当している。DOMのバブリングでは、targetに近い祖先の
  // リスナーほど先に呼ばれるため、documentに登録したこの'input'リスナーが呼ばれる頃には
  // 値ラベルは既に更新済み。バブルの表示文言はそれをそのまま読むだけでよい。
  document.addEventListener('input', (e) => {
    if (!isRangeInput(e.target)) return;
    updateSliderTrackFill(e.target);
    if (sliderValueBubbleEl?.classList.contains('visible')) positionSliderBubble(e.target);
  });
  document.addEventListener('pointerdown', (e) => {
    if (!isRangeInput(e.target)) return;
    showSliderBubble(e.target);
  });
  ['pointerup', 'pointercancel'].forEach((evt) => {
    document.addEventListener(evt, hideSliderBubble);
  });
}

// ===== 数字ホイール（回数/RPE。スライダーの代わりに横スクロールで数字を選ぶ） =====
// 実体は同じ.slider-field内にある非表示の<input type="range">（numberWheelHtml参照）。
// ホイールが確定した値をその<input>へ反映し、input/changeイベントを発火させることで
// handleLogInput側の既存ロジック(値の反映・disabled化・RPE残りレップ表示・自己ベスト
// 判定など)をそのまま使い回している。ホイール自体はここでしか状態を持たない。

function numberWheelHiddenInput(track) {
  return track.closest('.slider-field')?.querySelector('input[type="range"]');
}

// トラック中央に一番近い.number-wheel-itemを返す(＝今選ばれている数字)。
function numberWheelNearestItem(track) {
  const rect = track.getBoundingClientRect();
  const center = rect.left + rect.width / 2;
  let closest = null;
  let closestDist = Infinity;
  track.querySelectorAll('.number-wheel-item').forEach((el) => {
    const elRect = el.getBoundingClientRect();
    const dist = Math.abs((elRect.left + elRect.width / 2) - center);
    if (dist < closestDist) {
      closestDist = dist;
      closest = el;
    }
  });
  return closest;
}

function numberWheelUpdateActive(track) {
  const nearest = numberWheelNearestItem(track);
  track.querySelectorAll('.number-wheel-item').forEach((el) => {
    el.classList.toggle('active', el === nearest);
  });
  if (nearest) {
    // 読み上げ機能(VoiceOver等)に今の値を伝える(js/ui.jsのnumberWheelTrackHtmlでrole=slider)
    track.setAttribute('aria-valuenow', nearest.dataset.n);
    track.setAttribute('aria-valuetext', `${nearest.dataset.n}${track.dataset.unit || ''}`);
  }
  return nearest;
}

// ホイールの値を、指で流さずに直接変える(キーボードの←→・読み上げ機能の上下スワイプ・よく使う値のボタン)。
// 見た目はスクロールで動かしつつ、値は待たずにその場で<input>へ入れる(スクロールが止まった後の確定処理
// numberWheelCommitも同じ値を見つけるので二重にはならない)。
// ボタン等で直接入れた値(スクロールで追いかけている途中の目標)。これがある間は、スクロールが止まった後の
// 確定処理(numberWheelCommit)は途中の位置を読まず、この値に向けて動かし直すだけにする(途中の位置で
// 上書きしないため。2026-10-06 Codexレビュー指摘)。指で触り直したら消す。
const numberWheelPendingValues = new WeakMap();

function numberWheelSetValue(track, value) {
  const input = numberWheelHiddenInput(track);
  if (!input || input.disabled) return;
  clearTimeout(numberWheelScrollTimers.get(track));
  const min = Number(input.min);
  const max = Number(input.max);
  const step = Number(input.step) || 1;
  const clamped = Math.min(max, Math.max(min, Math.round((Number(value) - min) / step) * step + min));
  const v = String(Math.round(clamped * 10) / 10);
  numberWheelPendingValues.set(track, v);
  numberWheelScrollToValue(track, v, true);
  if (String(input.value) !== v) {
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  track.setAttribute('aria-valuenow', v);
  track.setAttribute('aria-valuetext', `${v}${track.dataset.unit || ''}`);
}

function numberWheelNudge(track, direction) {
  const input = numberWheelHiddenInput(track);
  if (!input) return;
  numberWheelSetValue(track, Number(input.value) + direction * (Number(input.step) || 1));
}

// ホイール(横スクロールのトラック)の中だけを横に動かして、その数字を中央に合わせる。
// 以前はitem.scrollIntoView({inline:'center', block:'nearest'})を使っていたが、scrollIntoViewは
// 祖先のスクロール領域すべて(ページ全体=window含む)を動かすため、記録画面を開いた瞬間に
// 各ホイールの初期位置合わせがページを縦にスクロールさせ、画面が一番上ではなく途中から
// 表示される不具合があった(2026-10-02、実機報告)。トラック自身のscrollLeftだけを計算して動かす。
function numberWheelScrollToValue(track, value, smooth) {
  const item = track.querySelector(`.number-wheel-item[data-n="${value}"]`);
  if (!item) return;
  const trackRect = track.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  const left = track.scrollLeft + (itemRect.left - trackRect.left) - (trackRect.width - itemRect.width) / 2;
  track.scrollTo({ left, behavior: smooth ? 'smooth' : 'instant' });
}

// スクロールが落ち着いた(指を離した/慣性が止まった/ドラッグを離した)瞬間に呼ぶ。
// CSSのscroll-snapだけでもほぼ中央に来ているはずだが、値を確実に反映するため
// JS側でも中央合わせし直してから<input>へ反映する。
function numberWheelCommit(track) {
  const pending = numberWheelPendingValues.get(track);
  if (pending != null) {
    const nearestNow = numberWheelUpdateActive(track);
    if (nearestNow && nearestNow.dataset.n === pending) numberWheelPendingValues.delete(track);
    else numberWheelScrollToValue(track, pending, true);
    return;
  }
  numberWheelScrollToValue(track, numberWheelNearestItem(track)?.dataset.n, true);
  const nearest = numberWheelUpdateActive(track);
  if (!nearest) return;
  const input = numberWheelHiddenInput(track);
  if (!input || input.disabled) return;
  if (String(input.value) !== String(nearest.dataset.n)) {
    input.value = nearest.dataset.n;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

// 画面を閉じる・描き直す直前に呼ぶ。スクロールが止まるのを待っている(120ms)途中の選択を、その場で確定させる
// (流した直後に「完了」を押すと前の値のままになるため。2026-10-06 Codexレビュー指摘)。
function flushNumberWheels(container) {
  container.querySelectorAll('.number-wheel-track').forEach((track) => {
    clearTimeout(numberWheelScrollTimers.get(track));
    if (numberWheelPendingValues.has(track)) return; // ボタン等で入れた値は既に<input>に入っている
    const nearest = numberWheelUpdateActive(track);
    const input = numberWheelHiddenInput(track);
    if (!nearest || !input || input.disabled || String(input.value) === String(nearest.dataset.n)) return;
    input.value = nearest.dataset.n;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

// レイアウト(要素の幅)は挿入した時点で同期的に取得できるため、requestAnimationFrameで
// 次の描画まで待つ必要は無い(以前はrAFで包んでいたが、Browserペインが非表示で描画が
// 止まっている状況(タブが裏に回っている等)ではrAF自体が発火せず初期位置合わせが
// 永久に行われないことがあると判明したため、同期呼び出しに変更した)。
function initNumberWheel(track) {
  const input = numberWheelHiddenInput(track);
  if (input) numberWheelScrollToValue(track, input.value, false);
  numberWheelUpdateActive(track);
}

const numberWheelScrollTimers = new WeakMap();
let numberWheelDragTrack = null;
let numberWheelDragStartX = 0;
let numberWheelDragStartScrollLeft = 0;

function wireNumberWheels() {
  document.querySelectorAll('.number-wheel-track').forEach(initNumberWheel);

  // 新しく描画されたホイール(記録画面の再描画など)にも自動で初期位置合わせを行う。
  new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches?.('.number-wheel-track')) initNumberWheel(node);
        node.querySelectorAll?.('.number-wheel-track').forEach(initNumberWheel);
      });
    });
  }).observe(document.getElementById('main'), { childList: true, subtree: true });

  // overflow要素自身のscrollイベントはバブリングしないため、captureフェーズで拾う。
  // 見た目(active表示)はスクロール中ずっと追従させ、スクロールが止まってから
  // (120ms間動きが無ければ)値を確定させる。
  document.addEventListener('scroll', (e) => {
    const track = e.target;
    if (!track.classList?.contains('number-wheel-track')) return;
    numberWheelUpdateActive(track);
    clearTimeout(numberWheelScrollTimers.get(track));
    numberWheelScrollTimers.set(track, setTimeout(() => numberWheelCommit(track), 120));
  }, true);

  // 中央以外の見えている数字をタップした時、その数字まで直接スクロールする
  // (ドラッグ操作時はブラウザが自動でclickを抑制するため、タップ判定と競合しない)。
  document.addEventListener('click', (e) => {
    // よく使う値のボタン(「20回」「45秒」等、js/ui.jsのwheelPresetButtonsHtml)。同じ.slider-field内の
    // ホイールをその値まで動かすだけの近道で、別の選択状態は持たない。
    const preset = e.target.closest('[data-wheel-preset]');
    if (preset) {
      const track = preset.closest('.slider-field')?.querySelector('.number-wheel-track');
      if (track) numberWheelSetValue(track, preset.dataset.wheelPreset);
      return;
    }
    const item = e.target.closest('.number-wheel-item');
    if (!item) return;
    // 値はその場で入れる(スクロールが止まるのを待つと、タップ直後に「完了」を押した時に反映されないため)
    numberWheelSetValue(item.closest('.number-wheel-track'), item.dataset.n);
  });

  // 指で触り直したら、ボタン等で入れた値を追いかけるのをやめ、指で選んだ位置を優先する
  document.addEventListener('touchstart', (e) => {
    const track = e.target.closest?.('.number-wheel-track');
    if (track) numberWheelPendingValues.delete(track);
  }, { passive: true });

  // キーボードの←→↑↓で1目盛りずつ動かす。iPhoneのVoiceOverの上下スワイプ(role=sliderの値の増減)が
  // ここに届くかは実機で未確認(2026-10-06)。
  document.addEventListener('keydown', (e) => {
    const track = e.target.closest?.('.number-wheel-track');
    if (!track) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      numberWheelNudge(track, 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      numberWheelNudge(track, -1);
    }
  });

  // PC向け: マウスのクリック+ドラッグでもスクロールできるようにする。タッチ操作は
  // ブラウザ標準のスクロール(慣性・scroll-snap込み)にそのまま任せたいので、
  // pointerType==='mouse'の時だけ自前でscrollLeftを操作する。
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    const track = e.target.closest('.number-wheel-track');
    if (!track || numberWheelHiddenInput(track)?.disabled) return;
    numberWheelPendingValues.delete(track);
    numberWheelDragTrack = track;
    numberWheelDragStartX = e.clientX;
    numberWheelDragStartScrollLeft = track.scrollLeft;
    track.style.scrollSnapType = 'none';
    track.setPointerCapture(e.pointerId);
  });
  document.addEventListener('pointermove', (e) => {
    if (!numberWheelDragTrack) return;
    numberWheelDragTrack.scrollLeft = numberWheelDragStartScrollLeft - (e.clientX - numberWheelDragStartX);
    numberWheelUpdateActive(numberWheelDragTrack);
  });
  function endNumberWheelDrag() {
    if (!numberWheelDragTrack) return;
    const track = numberWheelDragTrack;
    numberWheelDragTrack = null;
    track.style.scrollSnapType = '';
    numberWheelCommit(track);
  }
  document.addEventListener('pointerup', endNumberWheelDrag);
  document.addEventListener('pointercancel', endNumberWheelDrag);
}

// ===== 「自分で作る」モード =====

function recomputeCustomWarmupCooldown() {
  // 「自分で作る」画面には気になる部位の選択UIが無いが、設定画面(要望から作る)で選んだ内容は
  // 一時的な条件ではなく本人の恒常的な特性に近いため、保存済みの設定から引き継ぎ、その部位に負担のかかる
  // 準備の動きを出さないのに使う(2026-10-07までは、クールダウンのストレッチの優先順位付けに使っていた)。
  const painAreas = (loadSettings() || {}).painAreas || [];
  const { warmup, cooldown } = buildWarmupAndCooldown(customExercises, painAreas, null, { circuit: customFormat === 'circuit' });
  customWarmup = warmup;
  customCooldown = cooldown;
  renderCustomWuCd(customWarmup, customCooldown);
}

const CUSTOM_FORMAT_DESCRIPTIONS = {
  sets: '1つの種目を決めたセット数やってから、次の種目へ進みます。',
  circuit: '全種目を上から1セットずつ休まず続け、それを何周かします。周回数は始める前に選びます。',
};

function renderCustomExerciseListNow() {
  renderCustomExerciseList(customExercises, customRestSec, customTargets, customFormat);
  if (customReorderController) customReorderController.reapplyAfterRender();
}

function renderCustomFormatToggle() {
  document.querySelectorAll('#custom-format-toggle [data-custom-format]').forEach((btn) => {
    btn.setAttribute('aria-checked', String(btn.dataset.customFormat === customFormat));
  });
  document.getElementById('custom-format-desc').textContent = CUSTOM_FORMAT_DESCRIPTIONS[customFormat];
}

function renderCustomScreen() {
  recomputeCustomWarmupCooldown();
  renderCustomFormatToggle();
  renderCustomExerciseListNow();
  renderCustomTemplateList(loadCustomTemplates());
  // 予定画面から編集しに来ている間は、下の保存ボタン(custom-editor-save-btn)で保存するので出さない
  document.getElementById('custom-save-template-btn').hidden = customExercises.length === 0 || !!customEditor;
}

// 今の「自分で作る」画面の中身を、保存した組み合わせ・予定の「その場で選ぶ」と同じ形にする
function currentCustomContent() {
  return {
    exerciseIds: customExercises.map((ex) => ex.id),
    restSec: { ...customRestSec },
    format: customFormat,
    // 有酸素種目は目標時間(分、目標なしはnull)を{cardioMin}として持つ
    targets: Object.fromEntries(customExercises
      .map((ex) => [ex.id, ex.type === 'cardio'
        ? { cardioMin: customCardioTargetMin(ex, customTargets[ex.id]) }
        : customTargetFor(ex)])),
  };
}

// 種目ごとの目標(回数・セット数等)。まだ決めていない種目は既定値(3セット×10回、時間で測る種目は保存済みの目標秒数)。
function customTargetFor(ex) {
  return normalizeCustomTarget(ex, customTargets[ex.id]);
}

// 保存済みの組み合わせ(種目構成・休憩時間・やり方・種目ごとの目標)を「自分で作る」画面に反映する。
// 種目データが更新されて削除されたIDは無視する。format/targetsが無い古い組み合わせは
// 「種目ごと」・既定の目標で補う(2026-10-06より前に保存したもの)。
function applyCustomTemplate(template) {
  applyCustomContent(template, template.id);
}

// 中身(組み合わせ、または予定の「その場で選ぶ」)を画面に反映する。templateIdは記録に残す組み合わせのid(無ければnull)
function applyCustomContent(content, templateId) {
  customRoutineId = null;
  customExercises = (content.exerciseIds || []).map((id) => findExerciseById(id)).filter(Boolean);
  customRestSec = { ...(content.restSec || {}) };
  customTargets = { ...(content.targets || {}) };
  customFormat = content.format === 'circuit' ? 'circuit' : 'sets';
  customTemplateId = templateId || null;
  document.getElementById('custom-error').textContent = '';
  renderCustomScreen();
}

function resetCustomScreenState() {
  customExercises = [];
  customRestSec = {};
  customTargets = {};
  customFormat = 'sets';
  customTemplateId = null;
  customRoutineId = null;
  document.getElementById('custom-error').textContent = '';
}

// 「自分で作る」画面の中身から開始用のメニューを組む(種目が無ければfalse)
function buildMenuFromCustom() {
  if (customExercises.length === 0) return false;
  const main = customExercises.map((ex) => (ex.type === 'cardio'
    ? buildCustomCardioPlan(ex, customCardioTargetMin(ex, customTargets[ex.id]))
    : buildCustomSetPlan(ex, customRestSec[ex.id] != null ? customRestSec[ex.id] : 90, customTargetFor(ex), customFormat)));
  currentMenu = {
    warmup: customWarmup,
    cooldown: customCooldown,
    main,
    generatedAt: new Date().toISOString(),
    params: { custom: true, format: customFormat, templateId: currentCustomTemplateIdForRecord(), routineId: customRoutineId },
    // サーキットの周回数・1周ごとの休憩は前回選んだ値から始め、メニュー確認画面で選び直せる
    circuit: customFormat === 'circuit' ? loadCircuitLast() : null,
    userReordered: false,
  };
  return true;
}

// 今の種目構成が、最後に読み込んだ組み合わせと同じ種目の集まりならそのidを返す(記録のtemplateId用)。
// 回数・並び順を少し変えただけなら同じ組み合わせをやったものとみなし、種目を足し引きしたら別物とする。
function templateIdIfSameExercises(templateId, exerciseIds) {
  if (!templateId) return null;
  const template = loadCustomTemplates().find((t) => t.id === templateId);
  if (!template) return null;
  const a = [...template.exerciseIds].sort().join(',');
  const b = [...exerciseIds].sort().join(',');
  return a === b ? template.id : null;
}

function currentCustomTemplateIdForRecord() {
  return templateIdIfSameExercises(customTemplateId, customExercises.map((ex) => ex.id));
}

function openSaveTemplateModal() {
  document.getElementById('save-template-name').value = '';
  document.getElementById('save-template-error').textContent = '';
  document.getElementById('save-template-modal').classList.add('open');
  document.getElementById('save-template-name').focus();
}

function closeSaveTemplateModal() {
  document.getElementById('save-template-modal').classList.remove('open');
}

function confirmSaveTemplate() {
  const nameInput = document.getElementById('save-template-name');
  const name = nameInput.value.trim();
  if (!name) {
    document.getElementById('save-template-error').textContent = '名前を入力してください';
    return;
  }
  const id = newCustomTemplateId();
  saveCustomTemplate({ id, name, createdAt: new Date().toISOString(), ...currentCustomContent() });
  // 保存した直後にそのまま始めた記録も、この組み合わせをやったものとして数える
  customTemplateId = id;
  closeSaveTemplateModal();
  renderCustomTemplateList(loadCustomTemplates());
}

function newCustomTemplateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// 組み合わせを削除する。使っている予定は消さず、中身をそのまま予定の中(「その場で選ぶ」)に移す
// (以前は削除すると予定が「内容が見つかりません」になっていた)。削除したらtrue。
function deleteTemplateKeepingRoutines(templateId) {
  const template = loadCustomTemplates().find((t) => t.id === templateId);
  if (!template) return false;
  const users = loadRoutineState().items.filter((r) => r.kind === 'template' && r.templateId === templateId);
  const message = users.length > 0
    ? `「${template.name}」を削除しますか？\nこの組み合わせを使っている予定（${users.length}件）は、中身をそのまま予定の中に移すので、続けて使えます。`
    : `「${template.name}」を削除しますか？`;
  if (!confirm(message)) return false;
  const content = routineCustomFromTemplate(template);
  const before = JSON.parse(JSON.stringify(loadRoutineState()));
  // 移した予定にも元の組み合わせのidを残し、routineIdの無い過去の記録(「自分で作る」から始めた分)で「済み」を数え続ける(Codexレビュー指摘)
  const toCustom = (r) => {
    r.kind = 'custom';
    r.custom = JSON.parse(JSON.stringify(content));
    r.fromTemplateId = templateId;
    delete r.templateId;
  };
  if (users.length > 0) {
    const ok = updateRoutineState((state) => {
      state.items.forEach((r) => { if (r.kind === 'template' && r.templateId === templateId) toCustom(r); });
    });
    // 予定へ移せなかった時は組み合わせを消さない(予定が中身を失うため)
    if (!ok) return false;
  }
  try {
    deleteCustomTemplate(templateId);
  } catch (e) {
    // 組み合わせを消せなかった時は予定も元に戻す(予定だけ移った中途半端な状態を残さない。Codexレビュー指摘)
    if (users.length > 0) updateRoutineState((state) => { Object.assign(state, before); });
    alert('組み合わせを削除できませんでした。端末の空き容量を確認してください。');
    return false;
  }
  if (customEditor && customEditor.returnTo && customEditor.returnTo.draft.templateId === templateId) {
    const { draft } = customEditor.returnTo;
    toCustom(draft);
    draft.templateId = '';
  }
  renderRoutineScreen();
  renderTodayFocus();
  return true;
}

function routineCustomFromTemplate(t) {
  return { exerciseIds: [...t.exerciseIds], restSec: { ...(t.restSec || {}) }, format: t.format === 'circuit' ? 'circuit' : 'sets', targets: { ...(t.targets || {}) } };
}

function addCustomExercise(id) {
  if (customExercises.some((ex) => ex.id === id)) return;
  const ex = findExerciseById(id);
  if (!ex) return;
  customExercises.push(ex);
  // 有酸素種目はセット間の休憩という概念がないため、休憩時間は設定しない
  if (ex.type !== 'cardio' && customRestSec[id] == null) customRestSec[id] = 90;
  renderCustomScreen();
}

function removeCustomExercise(id) {
  customExercises = customExercises.filter((ex) => ex.id !== id);
  renderCustomScreen();
}

function reorderCustomExercises(keyOrder) {
  const byId = Object.fromEntries(customExercises.map((ex) => [ex.id, ex]));
  customExercises = keyOrder.map((key) => byId[key]).filter(Boolean);
  renderCustomExerciseListNow();
}

// ===== 回数・セット数の編集画面（下から出るシート、2026-10-06〜） =====
// 描画はjs/ui.jsのrenderCustomTargetSheet。値は操作したその場でcustomTargets/customRestSecに反映し、
// 「完了」(または背景のタップ)で閉じて一覧を描き直す。

function renderCustomTargetSheetNow() {
  const ex = customExercises.find((item) => item.id === customTargetEditingId);
  if (!ex) return;
  const restSec = customRestSec[ex.id] != null ? customRestSec[ex.id] : 90;
  renderCustomTargetSheet(ex, customTargetFor(ex), restSec, customFormat);
  // シートは#mainの外にあり、ホイールの自動初期化(MutationObserver)の対象外なので、ここで位置合わせする
  document.querySelectorAll('#custom-target-sheet .number-wheel-track').forEach(initNumberWheel);
}

function openCustomTargetSheet(exerciseId) {
  customTargetEditingId = exerciseId;
  // 表示してから描く(非表示のままだと要素の幅が0で、ホイールの初期位置を合わせられない)
  document.getElementById('custom-target-sheet').classList.add('open');
  lockBodyScroll();
  renderCustomTargetSheetNow();
}

function closeCustomTargetSheet() {
  const sheet = document.getElementById('custom-target-sheet');
  if (!sheet.classList.contains('open')) return;
  flushNumberWheels(sheet);
  sheet.classList.remove('open');
  unlockBodyScroll();
  customTargetEditingId = null;
  renderCustomExerciseListNow();
}

function updateCustomTarget(changes) {
  const ex = customExercises.find((item) => item.id === customTargetEditingId);
  if (!ex) return null;
  customTargets[ex.id] = normalizeCustomTarget(ex, { ...customTargetFor(ex), ...changes });
  return customTargets[ex.id];
}

// よく使う値のボタンのうち、今の値と同じものに印を付ける
function refreshWheelPresetMarks(field) {
  const input = field.querySelector('input[type="range"]');
  if (!input) return;
  field.querySelectorAll('[data-wheel-preset]').forEach((btn) => {
    btn.classList.toggle('is-current', Number(btn.dataset.wheelPreset) === Number(input.value));
  });
}

function wireCustomTargetSheet() {
  const sheet = document.getElementById('custom-target-sheet');
  sheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-custom-target-close]')) {
      closeCustomTargetSheet();
      return;
    }
    const modeBtn = e.target.closest('[data-custom-target-mode]');
    const setsBtnForFlush = e.target.closest('[data-custom-target-sets]');
    // 描き直す前に、流している途中のホイールの値を確定させる(描き直すとホイールごと作り直されるため)
    if (modeBtn || setsBtnForFlush) flushNumberWheels(sheet);
    if (modeBtn) {
      updateCustomTarget({ timed: modeBtn.dataset.customTargetMode === 'time' });
      renderCustomTargetSheetNow();
      return;
    }
    const setsBtn = e.target.closest('[data-custom-target-sets]');
    if (setsBtn) {
      const value = setsBtn.dataset.customTargetSets;
      // 「6〜」はまず6にして、出てきたホイールで7以上を選べるようにする
      const current = customTargetFor(customExercises.find((item) => item.id === customTargetEditingId)).sets;
      updateCustomTarget({ sets: value === 'more' ? Math.max(6, current) : Number(value) });
      renderCustomTargetSheetNow();
    }
  });
  sheet.addEventListener('input', (e) => {
    const input = e.target.closest('[data-custom-target-field]');
    if (!input) return;
    const field = input.dataset.customTargetField;
    const value = Number(input.value);
    if (field === 'rest') {
      if (customTargetEditingId) customRestSec[customTargetEditingId] = value;
    } else if (field === 'sets') {
      updateCustomTarget({ sets: value });
      const moreChip = sheet.querySelector('[data-custom-target-sets="more"]');
      if (moreChip) moreChip.textContent = String(value);
    } else {
      const ex = customExercises.find((item) => item.id === customTargetEditingId);
      if (ex) updateCustomTarget(customTargetFor(ex).timed ? { sec: value } : { reps: value });
    }
    const wrap = input.closest('.slider-field');
    const numEl = wrap && wrap.querySelector('[data-sheet-value-num]');
    if (numEl) numEl.textContent = String(value);
    if (wrap) refreshWheelPresetMarks(wrap);
  });
}

// ===== 有酸素種目の目標時間の編集画面（下から出るシート、2026-10-06〜） =====
// 「自分で作る」の一覧(context.kind==='custom'、組み合わせの目標customTargetsを変える)と、記録画面の
// 有酸素カード(context.kind==='log'、今回の記録のtargetSecを変える)の両方から開く。どちらで決めても、
// 組み合わせを使わない経路(クイックスタート等)の次回の初期値として種目ごとに覚える(saveCardioTargetMin)。
let cardioTargetSheetContext = null;

function cardioTargetSheetExercise() {
  const c = cardioTargetSheetContext;
  if (!c) return null;
  if (c.kind === 'custom') return customExercises.find((item) => item.id === c.exerciseId) || null;
  return (currentSession && currentSession.exercises[c.exIndex]) || null;
}

function currentCardioTargetMin() {
  const c = cardioTargetSheetContext;
  const ex = cardioTargetSheetExercise();
  if (!ex) return null;
  if (c.kind === 'custom') return customCardioTargetMin(ex, customTargets[ex.id]);
  return ex.targetSec ? Math.round(ex.targetSec / 60) : null;
}

function renderCardioTargetSheetNow() {
  const ex = cardioTargetSheetExercise();
  if (!ex) return;
  renderCardioTargetSheet(ex.name, currentCardioTargetMin());
  document.querySelectorAll('#cardio-target-sheet .number-wheel-track').forEach(initNumberWheel);
}

function openCardioTargetSheet(context) {
  cardioTargetSheetContext = context;
  if (!cardioTargetSheetExercise()) {
    cardioTargetSheetContext = null;
    return;
  }
  document.getElementById('cardio-target-sheet').classList.add('open');
  lockBodyScroll();
  renderCardioTargetSheetNow();
}

function closeCardioTargetSheet() {
  const sheet = document.getElementById('cardio-target-sheet');
  if (!sheet.classList.contains('open')) return;
  flushNumberWheels(sheet);
  sheet.classList.remove('open');
  unlockBodyScroll();
  const wasCustom = cardioTargetSheetContext && cardioTargetSheetContext.kind === 'custom';
  cardioTargetSheetContext = null;
  if (wasCustom) renderCustomExerciseListNow();
}

function setCardioTargetMin(min) {
  const c = cardioTargetSheetContext;
  const ex = cardioTargetSheetExercise();
  if (!ex) return;
  if (c.kind === 'custom') {
    customTargets[ex.id] = { cardioMin: min };
  } else {
    ex.targetSec = min ? min * 60 : null;
    // カードの表示はその場で書き換える(記録画面全体を描き直すと入力途中のホイール等まで作り直されるため)
    const textEl = document.querySelector(`[data-cardio-target-log="${c.exIndex}"] [data-cardio-target-text]`);
    if (textEl) textEl.textContent = cardioTargetText(min);
    if (typeof onCardioTargetChanged === 'function') onCardioTargetChanged(c.exIndex);
    persistActiveSessionSnapshot();
  }
  saveCardioTargetMin(ex.exerciseId || ex.id, min);
}

function wireCardioTargetSheet() {
  const sheet = document.getElementById('cardio-target-sheet');
  sheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-cardio-target-close]')) {
      closeCardioTargetSheet();
      return;
    }
    const modeBtn = e.target.closest('[data-cardio-target-mode]');
    if (!modeBtn) return;
    flushNumberWheels(sheet);
    const on = modeBtn.dataset.cardioTargetMode === 'on';
    if (on === !!currentCardioTargetMin()) return;
    setCardioTargetMin(on ? CARDIO_TARGET_DEFAULT_MIN : null);
    renderCardioTargetSheetNow();
  });
  sheet.addEventListener('input', (e) => {
    const input = e.target.closest('[data-cardio-target-field]');
    if (!input) return;
    const value = Number(input.value);
    setCardioTargetMin(value);
    const wrap = input.closest('.slider-field');
    const numEl = wrap && wrap.querySelector('[data-sheet-value-num]');
    if (numEl) numEl.textContent = String(value);
    if (wrap) refreshWheelPresetMarks(wrap);
  });
}

function wireCustomScreen() {
  document.getElementById('custom-add-exercise-btn').addEventListener('click', () => openExercisePicker('custom'));

  customReorderController = createReorderController({
    stableContainer: document.getElementById('custom-exercise-list'),
    listSelector: '#custom-exercise-list',
    onReorder: reorderCustomExercises,
    onRemove: removeCustomExercise,
  });

  // 各種目の「3セット × 20回 変更 ›」をタップすると、回数・セット数の編集画面を開く
  document.getElementById('custom-exercise-list').addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-custom-target-edit]');
    if (editBtn) openCustomTargetSheet(editBtn.dataset.customTargetEdit);
  });

  document.getElementById('custom-format-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-custom-format]');
    if (!btn || btn.dataset.customFormat === customFormat) return;
    customFormat = btn.dataset.customFormat;
    // サーキットかどうかでクールダウンの長さが変わるので作り直す
    recomputeCustomWarmupCooldown();
    renderCustomFormatToggle();
    renderCustomExerciseListNow();
  });

  wireCustomTargetSheet();
  wireCardioTargetSheet();

  document.getElementById('custom-wu-cd').addEventListener('click', (e) => {
    // ⓘ(data-info-toggle)は#mainの共通ハンドラで処理されるのでここでは扱わない
    const removeWarmup = e.target.closest('[data-custom-remove-warmup]');
    if (removeWarmup) {
      customWarmup.dynamic.splice(Number(removeWarmup.dataset.customRemoveWarmup), 1);
      renderCustomWuCd(customWarmup, customCooldown);
      return;
    }
    const removeCooldown = e.target.closest('[data-custom-remove-cooldown]');
    if (removeCooldown) {
      customCooldown.static.splice(Number(removeCooldown.dataset.customRemoveCooldown), 1);
      renderCustomWuCd(customWarmup, customCooldown);
    }
  });

  document.getElementById('custom-template-list').addEventListener('click', (e) => {
    const del = e.target.closest('[data-template-delete]');
    if (del) {
      if (deleteTemplateKeepingRoutines(del.dataset.templateDelete)) renderCustomTemplateList(loadCustomTemplates());
      return;
    }
    const load = e.target.closest('[data-template-load]');
    if (load) {
      const template = loadCustomTemplates().find((t) => t.id === load.dataset.templateLoad);
      if (template) applyCustomTemplate(template);
      document.getElementById('custom-template-toggle').open = false;
    }
  });

  document.getElementById('custom-save-template-btn').addEventListener('click', openSaveTemplateModal);
  document.getElementById('save-template-modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-save-template-close]')) closeSaveTemplateModal();
  });
  document.getElementById('save-template-confirm').addEventListener('click', confirmSaveTemplate);
  document.getElementById('save-template-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmSaveTemplate();
  });

  document.getElementById('custom-generate-btn').addEventListener('click', () => {
    const errorEl = document.getElementById('custom-error');
    if (!buildMenuFromCustom()) {
      errorEl.textContent = '種目を1つ以上追加してください';
      return;
    }
    errorEl.textContent = '';
    renderMenuScreen();
    showScreen('menu');
  });

  document.getElementById('custom-editor-save-btn').addEventListener('click', saveCustomEditor);
  document.getElementById('custom-editor-cancel').addEventListener('click', () => finishCustomEditor(null));
  document.getElementById('custom-editor-delete').addEventListener('click', () => {
    if (!customEditor || !customEditor.templateId) return;
    if (deleteTemplateKeepingRoutines(customEditor.templateId)) finishCustomEditor(null);
  });
}

// ===== 種目ピッカー（「自分で作る」画面／メニュー画面の両方から使う共通モーダル） =====

function isExercisePickerSelected(id) {
  if (exercisePickerTarget === 'custom') return customExercises.some((ex) => ex.id === id);
  if (exercisePickerTarget === 'menu') return currentMenu && currentMenu.main.some((item) => item.exerciseId === id);
  return false;
}

function renderExercisePickerNow() {
  const equipmentFilter = exercisePickerEquipmentFilterActive ? exercisePickerEquipmentFilter : null;
  renderExercisePicker(document.getElementById('exercise-picker-search').value, isExercisePickerSelected, exercisePickerFilter, equipmentFilter);
}

// 絞り込み(フィルター切り替え・検索)で表示される一覧そのものが変わる時に呼ぶ。
// 一覧のスクロール位置を先頭に戻さないと、長い一覧を下の方までスクロールした状態で
// 短い一覧(例:お気に入り)に切り替えた時、スクロール位置だけ残ってしまい
// 実際にはある種目が画面外(スクロールした先の空白)に隠れて何も表示されないように見えるバグがあった。
function renderExercisePickerAndResetScroll() {
  renderExercisePickerNow();
  document.getElementById('exercise-picker-list').scrollTop = 0;
}

// 器具絞り込みの案内＋トグルボタンの表示を更新する。絞り込み対象外(自分で作る、
// または要望から作るでも器具を1つも選んでいない等)なら何も出さない。
function updateExercisePickerEquipmentNote() {
  const note = document.getElementById('exercise-picker-equipment-note');
  if (!exercisePickerEquipmentFilter) {
    note.hidden = true;
    return;
  }
  note.hidden = false;
  document.getElementById('exercise-picker-equipment-note-text').textContent = exercisePickerEquipmentFilterActive
    ? '設定画面で選んだ器具のみ表示中（有酸素は除く）'
    : 'すべての器具の種目を表示中';
  document.getElementById('exercise-picker-equipment-toggle').textContent = exercisePickerEquipmentFilterActive
    ? 'すべて表示する'
    : '器具で絞り込む';
}

function openExercisePicker(target) {
  exercisePickerTarget = target;
  exercisePickerFilter = 'all';
  // 「要望から作る」で生成したメニュー画面からの追加時だけ、その時選んだ器具で絞り込む
  // （「自分で作る」は元々器具条件を選んでいないモードなので対象外）。
  exercisePickerEquipmentFilter = (target === 'menu' && currentMenu && !currentMenu.params.custom && currentMenu.params.equipment)
    ? currentMenu.params.equipment
    : null;
  exercisePickerEquipmentFilterActive = true;
  // .picker-filter-btnは豆知識のカテゴリ絞り込みボタンとも共有しているクラスなので、
  // ページ全体ではなく種目ピッカー内(#exercise-picker-modal)だけに絞る。絞らないと、
  // 種目ピッカーを開くたびに豆知識側で選択中のカテゴリの見た目(active)が無関係に
  // 消えてしまう不具合があった(2026-09-16、Codexレビュー指摘)。
  document.querySelectorAll('#exercise-picker-modal .picker-filter-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.pickerFilter === 'all');
  });
  const searchInput = document.getElementById('exercise-picker-search');
  searchInput.value = '';
  updateExercisePickerEquipmentNote();
  renderExercisePickerAndResetScroll();
  document.getElementById('exercise-picker-modal').hidden = false;
  lockBodyScroll();
}

function closeExercisePicker() {
  document.getElementById('exercise-picker-modal').hidden = true;
  exercisePickerTarget = null;
  unlockBodyScroll();
}

function handleExercisePickerSelect(id) {
  if (exercisePickerTarget === 'custom') {
    if (customExercises.some((ex) => ex.id === id)) {
      removeCustomExercise(id);
    } else {
      addCustomExercise(id);
    }
  } else if (exercisePickerTarget === 'menu') {
    toggleMenuExercise(id);
  }
  renderExercisePickerNow();
}

function wireExercisePicker() {
  document.getElementById('exercise-picker-search').addEventListener('input', renderExercisePickerAndResetScroll);
  document.getElementById('exercise-picker-close').addEventListener('click', closeExercisePicker);
  document.querySelectorAll('#exercise-picker-modal .picker-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      exercisePickerFilter = btn.dataset.pickerFilter;
      document.querySelectorAll('#exercise-picker-modal .picker-filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
      renderExercisePickerAndResetScroll();
    });
  });
  document.getElementById('exercise-picker-equipment-toggle').addEventListener('click', () => {
    exercisePickerEquipmentFilterActive = !exercisePickerEquipmentFilterActive;
    updateExercisePickerEquipmentNote();
    renderExercisePickerAndResetScroll();
  });
  document.getElementById('exercise-picker-list').addEventListener('click', (e) => {
    const favBtn = e.target.closest('[data-fav-toggle]');
    if (favBtn) {
      toggleFavoriteExercise(favBtn.dataset.favToggle);
      renderExercisePickerNow();
      return;
    }
    const item = e.target.closest('[data-picker-exercise]');
    if (item) handleExercisePickerSelect(item.dataset.pickerExercise);
  });
}

// ===== 「今日のメニュー」画面での種目の追加・削除・並べ替え（要望から作るモードでも使える） =====

function recomputeMenuWarmupCooldown() {
  const rawExercises = currentMenu.main.map((item) => findExerciseById(item.exerciseId)).filter(Boolean);
  // 「要望から作る」で選んだ時間(params.minutes)に合わせたウォームアップ・クールダウンの長さを保つ
  const { warmup, cooldown } = buildWarmupAndCooldown(rawExercises, currentMenu.params.painAreas || [], currentMenu.params.minutes,
    { circuit: currentMenu.params.format === 'circuit' });
  currentMenu.warmup = warmup;
  currentMenu.cooldown = cooldown;
}

function renderMenuScreen() {
  renderMenu(currentMenu);
  if (!menuReorderController) {
    menuReorderController = createReorderController({
      stableContainer: document.getElementById('menu-content'),
      listSelector: '#menu-exercise-list',
      onReorder: reorderMenuMain,
      onRemove: removeMenuExercise,
    });
  }
  menuReorderController.reapplyAfterRender();
}

function reorderMenuMain(keyOrder) {
  const byKey = Object.fromEntries(currentMenu.main.map((item) => [item.exerciseId, item]));
  currentMenu.main = keyOrder.map((key) => byKey[key]).filter(Boolean);
  currentMenu.userReordered = true; // 以後、種目を追加しても自動並べ替えをかけない
  renderMenuScreen();
}

function removeMenuExercise(exerciseId) {
  currentMenu.main = currentMenu.main.filter((item) => item.exerciseId !== exerciseId);
  recomputeMenuWarmupCooldown();
  renderMenuScreen();
}

function toggleMenuExercise(id) {
  const existingIndex = currentMenu.main.findIndex((item) => item.exerciseId === id);
  if (existingIndex >= 0) {
    currentMenu.main.splice(existingIndex, 1);
  } else {
    const ex = findExerciseById(id);
    if (!ex) return;
    const plan = ex.type === 'cardio'
      ? buildCustomCardioPlan(ex)
      : currentMenu.params.custom
        ? buildCustomSetPlan(ex, 90, null, currentMenu.params.format)
        : buildSetPlan(ex, currentMenu.params.level, currentMenu.params.goal);
    currentMenu.main.push(plan);
    // 「要望から作る」のメニューは、追加した種目もエクササイズの配列原則(大筋群→小筋群、
    // 体幹は終盤に、等)に沿った位置へ自動で並べ直す。「自分で作る」は手動の並び順を
    // 尊重したいユーザー向けのモードなので対象外。また、一度でも長押しドラッグで手動並べ替え
    // 済み(userReordered)なら、以後は追加のたびに勝手に並べ替えない。
    if (!currentMenu.params.custom && !currentMenu.userReordered) {
      currentMenu.main = sortByTrainingOrder(currentMenu.main);
    }
  }
  recomputeMenuWarmupCooldown();
  renderMenuScreen();
}

function wireMenuScreen() {
  document.getElementById('menu-content').addEventListener('click', (e) => {
    const addBtn = e.target.closest('#menu-add-exercise-btn');
    if (addBtn) {
      openExercisePicker('menu');
      return;
    }
    const autoSortBtn = e.target.closest('#menu-auto-sort-btn');
    if (autoSortBtn) {
      // 手動で並べ替えた後でも、このボタンを押せばいつでも①のルール順に戻せる。
      // 押した後は「手動並べ替え済み」状態を解除し、次に種目を追加した時も自動で並ぶようにする。
      currentMenu.main = sortByTrainingOrder(currentMenu.main);
      currentMenu.userReordered = false;
      renderMenuScreen();
      return;
    }
    // サーキットの「今日の周回数」「1周ごとの休憩」。選んだ値は次回の初期値として覚えておく
    const roundsBtn = e.target.closest('[data-circuit-rounds]');
    const restBtn = e.target.closest('[data-circuit-rest]');
    if ((roundsBtn || restBtn) && currentMenu.circuit) {
      if (roundsBtn) currentMenu.circuit.rounds = Number(roundsBtn.dataset.circuitRounds);
      if (restBtn) currentMenu.circuit.roundRestSec = Number(restBtn.dataset.circuitRest);
      saveCircuitLast(currentMenu.circuit);
      renderMenuScreen();
    }
  });
}

// ===== トレーニング予定（2026-10-07〜、旧「週間プラン」の作り直し） =====
// 描画はjs/ui.js(renderTodayFocus・renderRoutineScreen・renderRoutineSheet)、データと「やったか」の判定は
// js/storage.js(loadRoutineState・routineDoneDays)。予定から始めた記録にはroutineIdを付ける
// (「自分で作る」経由はcustomRoutineId、「要望から作る」経由はsetupRoutineIdで運ぶ)。

// 編集中の予定(追加・変更シート)。idがnullなら新規。draftは保存を押すまで予定に反映しない。
let routineEditing = null;
// 予定画面から「自分で作る」画面を借りて、組み合わせ・予定の中身を作る/編集している間の状態(2026-10-07〜)。
// この間は「このメニューで進む」の代わりに保存ボタンを出し、トレーニングは始めない
// (以前は予定から新しい組み合わせを作りに来ても大きな「このメニューで進む」が残っていて、押すと始まってしまった)。
// { mode: 'template'(保存した組み合わせの新規/編集) | 'routineCustom'(予定の「その場で選ぶ」の中身),
//   templateId: 編集中の組み合わせ(新規はnull), returnTo: 戻る先の予定の編集シート{id, draft}(予定画面に戻るだけならnull) }
let customEditor = null;

function renderModeWeeklyPlanSection() {
  renderTodayFocus();
}

function enterWeeklyScreenFromNav() {
  renderRoutineScreen();
}

// 保存できたかを返す(取り込みは保存できてから旧プランを消すため。Codexレビュー指摘)
function updateRoutineState(mutator) {
  const state = loadRoutineState();
  mutator(state);
  const ok = saveRoutineState(state);
  renderRoutineScreen();
  renderTodayFocus();
  return ok;
}

function openRoutineSheet(routineId) {
  const state = loadRoutineState();
  const existing = routineId ? state.items.find((r) => r.id === routineId) : null;
  const templates = loadCustomTemplates();
  const draft = existing
    ? JSON.parse(JSON.stringify(existing))
    : {
      kind: templates.length > 0 ? 'template' : 'exercise',
      templateId: '',
      exerciseId: '',
      targetMin: null,
      freq: 'daily',
      weekdays: [],
      paused: false,
    };
  if (!Array.isArray(draft.weekdays)) draft.weekdays = [];
  openRoutineSheetWithDraft(existing ? existing.id : null, draft);
}

function openRoutineSheetWithDraft(id, draft) {
  routineEditing = { id, draft };
  renderRoutineSheet(draft, !id);
  document.getElementById('routine-sheet').classList.add('open');
  lockBodyScroll();
}

// 「自分で作る」画面を編集用に開く。fromSheet=trueなら、今の予定の編集シート(編集中の内容ごと)を覚えて、保存・取り消しの後にそこへ戻る。
function openCustomEditor({ mode, templateId = null, fromSheet = false }) {
  const returnTo = fromSheet && routineEditing ? { id: routineEditing.id, draft: routineEditing.draft } : null;
  closeRoutineSheet();
  resetCustomScreenState();
  customEditor = { mode, templateId, returnTo };
  const template = templateId ? loadCustomTemplates().find((t) => t.id === templateId) : null;
  if (template) applyCustomContent(template, template.id);
  else if (mode === 'routineCustom' && returnTo && returnTo.draft.custom) applyCustomContent(returnTo.draft.custom, null);
  else renderCustomScreen();

  const isTemplate = mode === 'template';
  document.getElementById('custom-editor-desc').textContent = isTemplate
    ? (template ? '組み合わせを編集しています。種目・回数・やり方を変えて「保存」を押してください（トレーニングは始まりません）。' : '新しい組み合わせを作っています。種目を選んで名前を付け、「保存」を押してください（トレーニングは始まりません）。')
    : 'この予定だけで使う種目を選んでいます。選び終わったら「予定に入れる」を押してください（トレーニングは始まりません）。';
  document.getElementById('custom-editor-name-field').hidden = !isTemplate;
  document.getElementById('custom-editor-name').value = template ? template.name : '';
  document.getElementById('custom-editor-delete').hidden = !template;
  document.getElementById('custom-editor-cancel').textContent = returnTo ? '保存せずに予定の設定に戻る' : '保存せずに戻る';
  const saveBtn = document.getElementById('custom-editor-save-btn');
  saveBtn.textContent = isTemplate ? (returnTo ? '保存して予定の設定に戻る' : '保存して戻る') : '予定に入れる';
  saveBtn.hidden = false;
  document.getElementById('custom-generate-btn').hidden = true;
  document.getElementById('custom-editor-banner').hidden = false;
  document.getElementById('custom-screen-title').textContent = isTemplate ? (template ? '組み合わせを編集' : '新しい組み合わせ') : 'この予定の種目を選ぶ';
  const toggle = document.getElementById('custom-template-toggle');
  toggle.open = false;
  // 既存の組み合わせを編集中に別の組み合わせを読み込むと中身が丸ごと入れ替わって紛らわしいので出さない
  toggle.hidden = !!template;
  showScreen('custom');
}

function saveCustomEditor() {
  if (!customEditor) return;
  const errorEl = document.getElementById('custom-error');
  if (customExercises.length === 0) {
    errorEl.textContent = '種目を1つ以上追加してください';
    return;
  }
  const content = currentCustomContent();
  if (customEditor.mode === 'template') {
    const name = document.getElementById('custom-editor-name').value.trim();
    if (!name) {
      errorEl.textContent = '組み合わせの名前を入れてください（画面の上の欄）';
      document.getElementById('custom-editor-name').focus();
      return;
    }
    const old = customEditor.templateId ? loadCustomTemplates().find((t) => t.id === customEditor.templateId) : null;
    let id;
    if (old) {
      id = old.id;
      updateCustomTemplate({ ...old, name, ...content, updatedAt: new Date().toISOString() });
    } else {
      id = newCustomTemplateId();
      saveCustomTemplate({ id, name, createdAt: new Date().toISOString(), ...content });
    }
    finishCustomEditor(id);
    return;
  }
  if (customEditor.returnTo) customEditor.returnTo.draft.custom = content;
  finishCustomEditor(null);
}

// 編集を終えて予定画面(と、来た時は予定の編集シート)に戻る。templateIdがあれば、それを選んだ状態でシートに戻る。
function finishCustomEditor(templateId) {
  const ed = customEditor;
  closeCustomEditor();
  if (!ed) return;
  renderRoutineScreen();
  renderTodayFocus();
  showScreen('weekly');
  if (!ed.returnTo) return;
  const { draft } = ed.returnTo;
  if (templateId) {
    draft.kind = 'template';
    draft.templateId = templateId;
  }
  openRoutineSheetWithDraft(ed.returnTo.id, draft);
}

// 編集用の表示をやめて通常の「自分で作る」に戻す(下のタブ・ホームの「自分で作る」で離れた時も呼ぶ。
// 後で別の用事で開いた時に勝手に予定へ戻らないため)
function closeCustomEditor() {
  customEditor = null;
  const banner = document.getElementById('custom-editor-banner');
  if (banner) banner.hidden = true;
  document.getElementById('custom-screen-title').textContent = '自分でメニューを作る';
  document.getElementById('custom-template-toggle').hidden = false;
  document.getElementById('custom-editor-save-btn').hidden = true;
  document.getElementById('custom-generate-btn').hidden = false;
  document.getElementById('custom-save-template-btn').hidden = customExercises.length === 0;
}

function closeRoutineSheet() {
  const sheet = document.getElementById('routine-sheet');
  if (!sheet.classList.contains('open')) return;
  sheet.classList.remove('open');
  unlockBodyScroll();
  routineEditing = null;
}

function rerenderRoutineSheet() {
  if (routineEditing) renderRoutineSheet(routineEditing.draft, !routineEditing.id);
}

function saveRoutineFromSheet() {
  if (!routineEditing) return;
  const { draft } = routineEditing;
  const errorEl = document.getElementById('routine-sheet-error');
  const fail = (text) => { if (errorEl) errorEl.textContent = text; };
  if (draft.kind === 'template' && !draft.templateId) return fail('保存した組み合わせを選んでください');
  if (draft.kind === 'exercise' && !draft.exerciseId) return fail('種目を選んでください');
  if (draft.kind === 'custom' && !(draft.custom && (draft.custom.exerciseIds || []).length > 0)) return fail('「種目を選ぶ」から種目を選んでください');
  if (draft.freq === 'weekdays' && draft.weekdays.length === 0) return fail('曜日を1つ以上選んでください');

  const routine = {
    id: routineEditing.id || newRoutineId(),
    kind: draft.kind,
    freq: draft.freq,
    paused: !!draft.paused,
    createdAt: draft.createdAt || new Date().toISOString(),
  };
  if (draft.kind === 'template') routine.templateId = draft.templateId;
  if (draft.kind === 'exercise') {
    routine.exerciseId = draft.exerciseId;
    routine.targetMin = draft.targetMin || null;
  }
  if (draft.kind === 'parts') routine.parts = draft.parts;
  if (draft.kind === 'custom') {
    routine.custom = draft.custom;
    // 組み合わせを削除して移した予定は、元の組み合わせのidを持ち続ける(過去の記録で「済み」を数えるため)
    if (draft.fromTemplateId) routine.fromTemplateId = draft.fromTemplateId;
  }
  if (draft.freq === 'weekdays') routine.weekdays = [...draft.weekdays].sort((a, b) => a - b);
  if (draft.remindAt) routine.remindAt = draft.remindAt;

  updateRoutineState((state) => {
    const i = state.items.findIndex((r) => r.id === routine.id);
    if (i >= 0) state.items[i] = routine;
    else state.items.push(routine);
  });
  closeRoutineSheet();
}

function wireRoutineScreen() {
  document.getElementById('routine-add-btn').addEventListener('click', () => openRoutineSheet(null));
  document.getElementById('routine-list').addEventListener('click', (e) => {
    const card = e.target.closest('[data-routine-edit]');
    if (card) openRoutineSheet(card.dataset.routineEdit);
  });
  document.getElementById('routine-footer').addEventListener('click', (e) => {
    if (e.target.closest('[data-routine-pause-all]')) {
      updateRoutineState((state) => { state.allPaused = !state.allPaused; });
      return;
    }
    const importBtn = e.target.closest('[data-routine-import]');
    if (importBtn) {
      const plan = loadWeeklyPlans().find((p) => p.id === importBtn.dataset.routineImport);
      if (!plan) return;
      // 取り込んだものは休止中で足す(今の予定と重ならないよう、使うものだけ本人が再開する)
      const imported = routinesFromWeeklyPlan(plan).map((r) => ({ ...r, paused: true }));
      // 予定を保存できた時だけ、取り込んだプランを一覧から消す(保存に失敗したら元のプランを残す)
      if (updateRoutineState((state) => { state.items.push(...imported); })) {
        deleteWeeklyPlan(plan.id);
        renderRoutineScreen();
      }
    }
  });

  const sheet = document.getElementById('routine-sheet');
  sheet.addEventListener('click', (e) => {
    if (!routineEditing) return;
    const { draft } = routineEditing;
    if (e.target.closest('[data-routine-cancel]')) { closeRoutineSheet(); return; }
    if (e.target.closest('[data-routine-new-template]')) { openCustomEditor({ mode: 'template', fromSheet: true }); return; }
    if (e.target.closest('[data-routine-edit-template]')) { openCustomEditor({ mode: 'template', templateId: draft.templateId, fromSheet: true }); return; }
    if (e.target.closest('[data-routine-edit-custom]')) { openCustomEditor({ mode: 'routineCustom', fromSheet: true }); return; }
    const kindBtn = e.target.closest('[data-routine-kind]');
    if (kindBtn) { draft.kind = kindBtn.dataset.routineKind; rerenderRoutineSheet(); return; }
    const targetBtn = e.target.closest('[data-routine-target]');
    if (targetBtn) { draft.targetMin = targetBtn.dataset.routineTarget ? Number(targetBtn.dataset.routineTarget) : null; rerenderRoutineSheet(); return; }
    const freqBtn = e.target.closest('[data-routine-freq]');
    if (freqBtn) {
      draft.freq = freqBtn.dataset.routineFreq;
      // 曜日を選ぶに切り替えた時、まだ何も選んでいなければ今日の曜日を入れておく
      if (draft.freq === 'weekdays' && draft.weekdays.length === 0) draft.weekdays = [todayWeekdayIndex()];
      rerenderRoutineSheet();
      return;
    }
    const remindBtn = e.target.closest('[data-routine-remind]');
    if (remindBtn) {
      draft.remindAt = remindBtn.dataset.routineRemind === 'on' ? (draft.remindAt || '19:00') : null;
      rerenderRoutineSheet();
      return;
    }
    const dayBtn = e.target.closest('[data-routine-weekday]');
    if (dayBtn) {
      const d = Number(dayBtn.dataset.routineWeekday);
      draft.weekdays = draft.weekdays.includes(d) ? draft.weekdays.filter((x) => x !== d) : [...draft.weekdays, d];
      rerenderRoutineSheet();
      return;
    }
    if (e.target.closest('[data-routine-toggle-pause]')) {
      draft.paused = !draft.paused;
      saveRoutineFromSheet();
      return;
    }
    if (e.target.closest('[data-routine-delete]')) {
      if (!routineEditing.id || !confirm('この予定を削除しますか？（これまでの記録は消えません）')) return;
      const id = routineEditing.id;
      updateRoutineState((state) => { state.items = state.items.filter((r) => r.id !== id); });
      closeRoutineSheet();
    }
  });
  sheet.addEventListener('change', (e) => {
    if (!routineEditing) return;
    const field = e.target.dataset && e.target.dataset.routineField;
    if (field) routineEditing.draft[field] = e.target.value;
    // 組み合わせを選んだら「選んだ組み合わせを編集」を出す
    if (field === 'templateId') rerenderRoutineSheet();
  });
  document.getElementById('routine-save-btn').addEventListener('click', saveRoutineFromSheet);

  document.getElementById('template-manage-list').addEventListener('click', (e) => {
    const item = e.target.closest('[data-template-edit]');
    if (item) openCustomEditor({ mode: 'template', templateId: item.dataset.templateEdit });
  });
  document.getElementById('template-manage-add-btn').addEventListener('click', () => openCustomEditor({ mode: 'template' }));
}

// ホームの「今日の予定」の「始める」。押したらすぐ記録を始める(2026-10-07 ユーザー要望。以前は組み合わせだと
// 「自分で作る」画面、部位だとメニュー確認画面で止まっていた)。ただしサーキットは周回数・1周ごとの休憩を
// その日に選ぶので、メニュー確認画面で止める(ユーザー判断)。
function startRoutine(routineId) {
  const routine = loadRoutineState().items.find((r) => r.id === routineId);
  if (!routine) return;
  if (routine.kind === 'template' || routine.kind === 'custom') {
    const template = routine.kind === 'template' ? loadCustomTemplates().find((t) => t.id === routine.templateId) : null;
    const content = routine.kind === 'template' ? template : routine.custom;
    if (!content) return;
    closeCustomEditor();
    applyCustomContent(content, template ? template.id : null);
    customRoutineId = routine.id;
    if (!buildMenuFromCustom()) return;
    if (customFormat === 'circuit') {
      renderMenuScreen();
      showScreen('menu');
    } else {
      handleStartWorkout();
    }
    return;
  }
  if (routine.kind === 'parts') {
    document.querySelectorAll('#part-group input').forEach((el) => {
      el.checked = routine.parts.includes(el.dataset.part);
    });
    setupRoutineId = routine.id;
    // 設定画面の器具・時間・レベル・目的は起動時のrestoreLastSettings()で前回値が入っているので、
    // そのまま作れる。器具0件などで作れない時だけ設定画面を見せる。
    if (handleGenerate()) handleStartWorkout();
    else showScreen('setup');
    return;
  }
  if (routine.kind === 'exercise') {
    const exercise = findExerciseById(routine.exerciseId);
    if (!exercise) return;
    // クイックスタート(maybeHandleEntryParams)と同じ組み立て方にする
    const painAreas = (loadSettings() || {}).painAreas || [];
    const { warmup, cooldown } = buildWarmupAndCooldown([exercise], painAreas);
    currentMenu = {
      warmup,
      cooldown,
      main: [exercise.type === 'cardio' ? buildCustomCardioPlan(exercise, routine.targetMin || null) : buildCustomSetPlan(exercise, 90, null, 'sets')],
      generatedAt: new Date().toISOString(),
      params: { custom: true, routineId: routine.id },
      userReordered: false,
    };
    handleStartWorkout();
  }
}

function wireModeWeeklyPlanSection() {
  document.getElementById('today-focus-section').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-routine-start]');
    if (btn) startRoutine(btn.dataset.routineStart);
    const fix = e.target.closest('[data-routine-fix]');
    if (fix) {
      renderRoutineScreen();
      showScreen('weekly');
      openRoutineSheet(fix.dataset.routineFix);
    }
  });
}

// ===== 豆知識画面 =====

function renderKnowledgeScreen() {
  renderKnowledgeCategoryFilters();
  renderKnowledgeTodayTip();
  renderKnowledgeList(document.getElementById('knowledge-search').value, knowledgeCategoryFilter);
}

function wireKnowledgeScreen() {
  document.getElementById('knowledge-search').addEventListener('input', () => {
    renderKnowledgeList(document.getElementById('knowledge-search').value, knowledgeCategoryFilter);
  });
  document.getElementById('knowledge-category-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-knowledge-category]');
    if (!btn) return;
    knowledgeCategoryFilter = btn.dataset.knowledgeCategory;
    document.querySelectorAll('#knowledge-category-filters .picker-filter-btn').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
    renderKnowledgeList(document.getElementById('knowledge-search').value, knowledgeCategoryFilter);
  });
}

function wirePartExclusivity() {
  document.querySelectorAll('#part-group input').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.dataset.part === 'fullbody' && input.checked) {
        document.querySelectorAll('#part-group input').forEach((other) => {
          if (other !== input) other.checked = false;
        });
      } else if (input.checked) {
        const fullbodyInput = document.querySelector('#part-group input[data-part="fullbody"]');
        if (fullbodyInput) fullbodyInput.checked = false;
      }
    });
  });
}

function wirePainExclusivity() {
  document.querySelectorAll('#pain-group input').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.dataset.pain === 'none' && input.checked) {
        document.querySelectorAll('#pain-group input').forEach((other) => {
          if (other !== input) other.checked = false;
        });
      } else if (input.checked) {
        const noneInput = document.querySelector('#pain-group input[data-pain="none"]');
        if (noneInput) noneInput.checked = false;
      } else if (getSelectedPainAreas().length === 0) {
        const noneInput = document.querySelector('#pain-group input[data-pain="none"]');
        if (noneInput) noneInput.checked = true;
      }
    });
  });
}

// 戻り値は生成に成功してscreen-menuまで進めたか(true)、バリデーションで止まったか(false)。
// startRoutine()(部位の予定)が、設定画面を経由しない生成を試みて失敗した時に
// 設定画面へフォールバックするための判定に使う（画面遷移せず何も起きないまま
// ユーザーが取り残されるのを防ぐ）。
function handleGenerate() {
  const errorEl = document.getElementById('setup-error');
  const parts = getSelectedParts();
  const equipment = getSelectedEquipment();

  if (parts.length === 0) {
    errorEl.textContent = '「① 鍛えたい部位」を1つ以上選んでください（事前確認の欄とは別です）';
    return false;
  }
  if (equipment.length === 0) {
    errorEl.textContent = '使える器具を1つ以上選んでください';
    return false;
  }
  errorEl.textContent = '';

  const muscleGroups = parts.includes('fullbody') ? ['fullbody'] : parts.flatMap((p) => PART_TO_MUSCLES[p]);
  const minutes = Number(document.getElementById('minutes-select').value);
  const level = document.getElementById('level-select').value;
  const goal = document.getElementById('goal-select').value;
  const painAreas = getSelectedPainAreas();

  // 以前の体重の設定値(settings.bodyWeightKg、getBodyWeightKgの最後の拠り所)を消さないよう、既存の設定に上書きする。
  saveSettings({ ...(loadSettings() || {}), parts, equipment, minutes, level, goal, painAreas });

  currentMenu = generateMenu({ parts: muscleGroups, equipment, minutes, level, goal, painAreas });
  if (currentMenu.main.length === 0) {
    errorEl.textContent = '選んだ条件に合う種目が見つかりませんでした。器具や部位を見直してください。';
    return false;
  }
  // 作れた時だけ予定とのつながりを使い切る(作れずに設定画面で条件を直して作り直した時も、予定の記録にする)
  currentMenu.params.routineId = setupRoutineId;
  setupRoutineId = null;
  renderMenuScreen();
  showScreen('menu');
  return true;
}

// ホームの「トレーニングに戻る」・開始時の確認の「途中のトレーニングに戻る」から、記録中の画面へ戻る。
// ナビで離れた時に止めた経過時間の表示を再開する(開始時刻はそのまま、session-timer.js参照)。
// 記録画面のDOMはナビで離れても残っているので描き直さない(開いていた説明欄等もそのまま)。
function resumeActiveWorkout() {
  if (!currentSession) return;
  closeStartOverwriteModal();
  startSessionTimer(sessionStartTime);
  updateFinishButtonState();
  showScreen('log');
  window.scrollTo(0, 0);
  // 自分で戻ったので「操作した」扱いにする(しばらく空いてホームで開いた後に戻り、すぐ閉じた時にまたホームで開かないように)
  persistActiveSessionSnapshot();
}

// ホームの「トレーニング中」欄の「やめる」。途中の記録を保存せずに捨てる(2026-10-07 ユーザー要望。
// 以前は「下のタブで抜けられる」として捨てる手段を開始時の確認にしか置いていなかったが、やめた記録が
// 残り続けて開き直すたびに記録画面になってしまっていた)。
function discardActiveWorkout() {
  if (!currentSession) return;
  if (!window.confirm(`${activeSessionSummaryText(currentSession, sessionStartTime)}。\nこのトレーニングを記録せずにやめますか？入力した内容は消え、元に戻せません。`)) return;
  clearActiveWorkoutState();
  renderHomeResumeWorkout();
}

// 途中のトレーニングを保存せずに捨てる時の後片付け(ホームの「やめる」と、開始時の「捨てて新しく始める」で共通)。
// 止めるタイマー等を増やした時は、ここだけ直せば両方に効く。
function clearActiveWorkoutState() {
  stopHoldTimer();
  stopCardioTimer();
  endRestTimer();
  stopSessionTimer();
  currentSession = null;
  sessionLastActivityAt = null;
  clearActiveSessionSnapshot();
}

// アプリが裏で生きたまま(再読み込みなしで)戻ってきた時にも、起動時と同じ「しばらく操作していなければホーム」を
// 当てはめる(iPhoneのホーム画面アプリは裏で残ることが多く、起動時の判定だけでは足りない。2026-10-07 Codexレビュー指摘)。
function moveStaleWorkoutToHomeIfNeeded() {
  if (!currentSession || activeCardioTimer || sessionLastActivityAt == null) return;
  if (!document.getElementById('screen-log').classList.contains('active')) return;
  if (Date.now() - sessionLastActivityAt < STALE_SESSION_MS) return;
  pauseSessionTimerDisplay();
  showScreen('mode');
  window.scrollTo(0, 0);
}

function closeStartOverwriteModal() {
  document.getElementById('start-overwrite-modal').classList.remove('open');
}

// 記録中のトレーニングがあるのに別のメニューで開始しようとした時は、黙って上書きせず
// 戻るか捨てるかを選んでもらう(以前は確認なしで上書きされ、入力済みのセットが消えていた。2026-10-04)。
// 記録画面には「記録せずにやめる」手段が無いため、捨てる選択肢はここに置いている。
function handleStartWorkout() {
  if (!currentMenu || currentMenu.main.length === 0) {
    alert('種目を1つ以上追加してください');
    return;
  }
  if (currentSession) {
    document.getElementById('start-overwrite-desc').textContent = `${activeSessionSummaryText(currentSession, sessionStartTime)}。新しく始めると、途中の記録は保存されずに消えます。`;
    document.getElementById('start-overwrite-modal').classList.add('open');
    return;
  }
  startNewWorkout();
}

function discardActiveWorkoutAndStart() {
  closeStartOverwriteModal();
  clearActiveWorkoutState();
  startNewWorkout();
}

function startNewWorkout() {
  const finishError = document.getElementById('finish-workout-error');
  if (finishError) finishError.hidden = true; // 前の記録で保存に失敗した時の表示を持ち越さない
  // 確認画面で種目を足し引きした後でも「その組み合わせをやった」と数えないよう、開始する時点の種目構成で
  // 組み合わせと同じか確かめ直す(週間プランの「一日おき」の判定に使うため。2026-10-06 Codexレビュー指摘)。
  const menuForSession = { ...currentMenu, params: { ...currentMenu.params, templateId: templateIdIfSameExercises(currentMenu.params.templateId, currentMenu.main.map((item) => item.exerciseId)) } };
  currentSession = createSessionFromMenu(menuForSession, getBodyWeightKg());
  renderLog(currentSession);
  updateFinishButtonState();
  showScreen('log');
  // メニュー画面の一番下の「開始」ボタンを押した時のスクロール位置を引き継がず、記録は先頭から始める。
  window.scrollTo(0, 0);
  startSessionTimer();
  persistActiveSessionSnapshot();
}

// game-daily-manager(全体管理画面)のショートカットからの遷移用URLパラメータ(?quickstart=<exerciseId>・
// ?view=record)を読み取り、その場でURLから取り除く(history.replaceState、ページ遷移は発生させない)。
// 復元(restoreActiveSessionIfAny)するかどうかに関わらず必ず一度だけ呼ぶ必要がある。
// 復元を優先してこの関数自体の呼び出しをスキップすると、URLにパラメータが残ったままになり、
// 記録中セッションを完了した後に再度ページがリロードされた際、残っていたquickstartが
// 意図せず新しいセッションを始めてしまう不具合があった(2026-09-15、Codexレビュー指摘)。
function consumeEntryParams() {
  const params = new URLSearchParams(window.location.search);
  const exerciseId = params.get('quickstart');
  const view = params.get('view');
  if (!exerciseId && !view) return null;
  history.replaceState(null, '', window.location.pathname + window.location.hash);
  return { exerciseId, view };
}

// game-daily-manager(全体管理画面)のショートカットからの遷移用。?quickstart=<exerciseId>と
// ?view=recordの2つをここで一括判定する(以前は別々の関数だったが、Codexレビューで
// 「手作業やリンク破損で両方が同時に付いた場合、quickstartが記録画面へ進めた直後にview=record側が
// 割り込んで画面を奪ってしまう」と指摘され、1箇所で読み取って排他的に処理するよう統合した。
// game-daily-manager側が生成するリンクはどちらか一方しか付けないため通常は起こらないが、
// 手打ち・共有時のURL破損等への防御)。優先順位はquickstart→view。
// URLの読み取り・除去自体はconsumeEntryParams()が別途担うため、ここでは渡された値を使うだけ
// (記録中セッションを復元した場合はこの関数自体を呼ばない、js/app.jsのinit()参照)。
function maybeHandleEntryParams(entryParams) {
  if (!entryParams) return;
  const { exerciseId, view } = entryParams;

  if (exerciseId) {
    const exercise = findExerciseById(exerciseId);
    if (!exercise || exercise.type !== 'cardio') return; // 未知のid・非対応種目は何もせず通常のモード選択画面のまま

    // ウォームアップ/クールダウンは「自分で作る」画面と全く同じ組み立て方にする(buildWarmupAndCooldown)。
    // 当初は「有酸素単体には要らないだろう」と空にしていたが、これは誤りだった: menu-generator.jsには
    // pattern:'cardio'向けの専用ウォームアップ(「ごく軽いペースで3〜5分」)が元々用意されており、
    // 通常フローで有酸素種目だけを選んでも表示される。クイックスタートだけ勝手に省略すると、同じ種目
    // なのに通常フローと結果が変わってしまうため、統一した(2026-09-08、実機フィードバックで発覚)。
    const painAreas = (loadSettings() || {}).painAreas || [];
    const { warmup, cooldown } = buildWarmupAndCooldown([exercise], painAreas);
    currentMenu = {
      warmup,
      cooldown,
      main: [buildCustomCardioPlan(exercise)],
      generatedAt: new Date().toISOString(),
      params: { custom: true, quickstart: true },
      userReordered: false,
    };
    handleStartWorkout();
    return; // view=recordが同時に付いていても無視する(quickstart優先)
  }

  // ここに来るのはquickstartが無くviewだけ指定されている場合。game-daily-manager側の「達成」済み
  // ショートカットからの遷移用(記録タブ・カレンダーを今日を選んだ状態で直接開く)。
  if (view !== 'record') return; // 未知の値は何もせず通常のモード選択画面のまま
  renderRecordScreen({ selectToday: true });
  showScreen('record');
}

// 有酸素の「時間」欄への値反映(モデルの更新＋ラベル＋推定カロリーの表示更新)を1箇所にまとめた
// もの。ユーザーが手でスライダーをドラッグした時(handleCardioLogInput経由)と、js/cardio-timer.js
// の計測タイマーが毎秒ティックする時の両方から呼ぶ。
//
// 2026-09-16、実機で「計測中に表示していた時間(例:00:16)と、計測を終わった後にスライダーへ
// 反映されている時間(例:0分7秒)がズレる」という不具合が報告された。原因は、計測タイマー側が
// この更新を`slider.value`への代入＋`dispatchEvent('input')`というDOM経由の間接的な方法だけに
// 頼っていたこと。記録中セッションの復元(restoreActiveSessionIfAny)直後の最初のティックは、
// `#log-content`のinputリスナーがまだ登録される前に発火するため、このイベントが誰にも
// 届かず値反映が抜け落ちる（次のティックで追いつくが、その間`ex.duration`が古い値のまま
// 残ってしまう）。イベント伝播に頼らず、この関数を直接呼ぶことで確実に反映されるようにした。
function applyCardioDurationValue(exIndex, value) {
  if (!currentSession) return;
  const ex = currentSession.exercises[exIndex];
  if (!ex) return;
  ex.duration = String(value);

  const slider = document.querySelector(`[data-cardio-ex="${exIndex}"][data-cardio-field="duration"]`);
  const valueEl = slider?.closest('.slider-field')?.querySelector('.slider-value');
  if (valueEl) valueEl.textContent = formatMinSec(ex.duration);

  const calorieEl = document.querySelector(`[data-cardio-calorie="${exIndex}"]`);
  if (calorieEl) {
    const calories = estimateCardioCalories(ex.met, getBodyWeightKg(), Number(ex.duration) || 0);
    calorieEl.textContent = `推定消費カロリー: 約${Math.round(calories)}kcal`;
  }
  // 計測タイマーはDOMイベントを経由せずここを直接呼ぶため、「記録して終了」の可否もここで更新する
  // (時間が入れば完了を押していなくても記録できる、isCardioRecorded参照)。
  updateFinishButtonState();
}

// 有酸素種目は「セット」がなく、時間・距離・きつさを直接その種目に持たせているため、
// data-cardio-ex/data-cardio-fieldという別の属性でstrengthの仕組み(data-ex/data-set/data-field)
// と衝突しないようにしている。
function handleCardioLogInput(e) {
  const target = e.target;
  const exIndex = Number(target.dataset.cardioEx);
  const field = target.dataset.cardioField;

  if (field === 'duration') {
    // 計測タイマーのティックが直接applyCardioDurationValueを呼んだ後にも、この関数(スライダー
    // からのinputイベント経由)が呼ばれることがあるが、同じ値を代入し直すだけなので無害。
    applyCardioDurationValue(exIndex, target.value);
    persistActiveSessionSnapshot();
    return;
  }

  const ex = currentSession.exercises[exIndex];
  ex[field] = field === 'done' ? target.checked : target.value;
  if (field !== 'done') {
    // .parentElementではなく.closest('.slider-field')を使う理由は下のhandleLogInputの
    // コメント参照(2026-09-16、同じ原因の表示バグをまとめて修正)。
    const valueEl = target.closest('.slider-field')?.querySelector('.slider-value');
    if (valueEl) valueEl.textContent = `${Number(target.value).toFixed(1)}km`;
  }
  persistActiveSessionSnapshot();
}

// サーキットのn周目(＝各種目のn番目のセット)が全部完了したか。有酸素種目は周回に入れていない。
function circuitRoundComplete(roundIndex) {
  return currentSession.exercises
    .filter((ex) => ex.type !== 'cardio')
    .every((ex) => ex.sets[roundIndex] && ex.sets[roundIndex].done);
}

function updateCircuitRoundProgress(roundIndex) {
  const el = document.querySelector(`[data-circuit-round-progress="${roundIndex}"]`);
  if (!el) return;
  const strength = currentSession.exercises.filter((ex) => ex.type !== 'cardio');
  const done = strength.filter((ex) => ex.sets[roundIndex] && ex.sets[roundIndex].done).length;
  el.textContent = `${done}/${strength.length}`;
  el.classList.toggle('is-complete', done === strength.length);
}

function handleLogInput(e) {
  // 記録を終えた後も記録画面のDOM(数字ホイール)は非表示のまま残っており、画面サイズの変化
  // (端末の回転・ビューポート変更)でホイールのscrollが発火して値の確定処理が走ることがある。
  // その時点ではcurrentSessionがnullなので何もしない(以前はTypeErrorが大量に出ていた)。
  if (!currentSession) return;
  const target = e.target;
  if (target.dataset.cardioField) {
    handleCardioLogInput(e);
    return;
  }
  if (!target.dataset.field) return;
  const exIndex = Number(target.dataset.ex);
  const setIndex = Number(target.dataset.set);
  const field = target.dataset.field;
  const set = currentSession.exercises[exIndex].sets[setIndex];
  set[field] = field === 'done' ? target.checked : target.value;

  if (field !== 'done') {
    // 数字ホイール(回数・RPE・体重)は<input>が.slider-fieldの直接の子なのでtarget.parentElement
    // で足りるが、重量は今も実物のスライダーで、.slider-track-row(トラック両脇の範囲表示、
    // 2026-08-14追加)に包まれているためtarget.parentElementでは.slider-valueまで届かず、
    // ドラッグ中の値ラベルが更新されない不具合があった。.closest('.slider-field')なら
    // どちらの構造でも共通して.slider-valueへ辿り着ける(2026-09-16、cardio-timerの
    // 表示ズレ調査中に同じ原因の別バグとして発見・修正)。
    const valueEl = target.closest('.slider-field')?.querySelector('.slider-value');
    if (valueEl) valueEl.textContent = formatSliderValue(field, target.value, currentSession.exercises[exIndex].holdBased);
  }

  // 重量を変えたら、まだ完了していない後ろの本セットも同じ重量にする(完了済みは実際にやった記録なので変えない)。
  // 1セットずつ重量を決め直すのが面倒、というユーザー指摘(2026-10-07)。回数は疲れで減るのでセットごとのまま。
  if (field === 'weight' && !set.isWarmup) {
    currentSession.exercises[exIndex].sets.forEach((s, i) => {
      if (i <= setIndex || s.done || s.isWarmup) return;
      s.weight = target.value;
      const other = document.querySelector(`input[type="range"][data-ex="${exIndex}"][data-set="${i}"][data-field="weight"]`);
      if (!other) return;
      other.value = target.value;
      updateSliderTrackFill(other);
      const otherLabel = other.closest('.slider-field')?.querySelector('.slider-value');
      if (otherLabel) otherLabel.textContent = formatSliderValue('weight', other.value, false);
    });
  }

  if (field === 'rpe') {
    const reserveEl = target.parentElement.querySelector(`[data-rpe-reserve="${exIndex}:${setIndex}"]`);
    if (reserveEl) reserveEl.textContent = rpeReserveText(target.value);
  }

  if (field === 'reps' && !set.isWarmup) {
    const progressionEl = document.querySelector(`[data-ex-reps-progression="${exIndex}"]`);
    if (progressionEl) {
      progressionEl.textContent = buildRepsProgressionText(
        currentSession.exercises[exIndex].sets,
        currentSession.exercises[exIndex].holdBased,
      );
    }
  }

  // 回数/RPEは数字ホイール化(2026-08-14)に伴い範囲を固定にしたため、以前あった
  // 「端まで動かして離すと上限を伸ばす」ロジックは不要になり削除した
  // (js/ui.jsのnumberWheelHtmlのコメント参照)。

  // チェックボックスはinput/changeの両方が発火するため、完了処理はchange時だけ行う。
  // input時にも実行すると休憩タイマーのスクロールロックが二重にかかる。
  if (e.type === 'change' && field === 'done') {
    const exercise = currentSession.exercises[exIndex];
    const row = target.closest('.set-row');
    if (row) {
      // 完了にした後もスライダーが動かせてしまい、記録済みの値を誤って変えられて
      // しまうという指摘があったため、完了中は重量/回数/RPEのスライダーを操作不可にする。
      // あわせて行自体を縮め(is-done、CSS側でスライダー本体を隠す)、消えた値の代わりに
      // 「10回・RPE7」のような1行サマリーを見せる(完全に情報を失わないため)。
      row.classList.toggle('is-done', target.checked);
      row.querySelectorAll('input[type="range"]').forEach((slider) => {
        slider.disabled = target.checked;
      });
      const summaryEl = row.querySelector(`[data-set-summary="${exIndex}:${setIndex}"]`);
      if (summaryEl) {
        // js/ui.jsのrenderLog内でweightFieldを出す条件(重量スライダーを持つ種目か)と揃える。
        const hasWeightField = !exercise.holdBased && !!weightRangeForExercise(exercise);
        summaryEl.textContent = target.checked && !set.isWarmup ? setRowSummaryText(set, exercise.holdBased, hasWeightField) : '';
      }
    }
    if (currentSession.circuit) updateCircuitRoundProgress(setIndex);
    if (target.checked) {
      const prBadge = document.querySelector(`[data-pr-badge="${exIndex}:${setIndex}"]`);
      if (prBadge) prBadge.hidden = !isPersonalRecord(exercise, set);
      if (currentSession.circuit) {
        // サーキットは種目の間は休まない。その周の最後の1つを完了した時だけ、次の周の前に休憩を出す
        // (最後の周の後は休憩不要)。完了の順番が前後しても「その周が全部そろった時」で判定する。
        const { rounds, roundRestSec } = currentSession.circuit;
        if (circuitRoundComplete(setIndex) && setIndex < rounds - 1) startRestTimer(roundRestSec);
      } else {
        startRestTimer(exercise.restSec);
      }
    } else {
      const prBadge = document.querySelector(`[data-pr-badge="${exIndex}:${setIndex}"]`);
      if (prBadge) prBadge.hidden = true;
    }
  }
  persistActiveSessionSnapshot();
}

// 「記録して終了」は、完了したセット/有酸素が1つも無い間は押せなくする(記録が空になるため。
// 1種目だけのメニューならその種目が未完了の間は押せない)。記録画面の描画・入力のたびに呼ぶ。
function updateFinishButtonState() {
  const button = document.getElementById('finish-workout-btn');
  const hint = document.getElementById('finish-workout-hint');
  const canFinish = sessionHasAnyRecord(currentSession);
  button.disabled = !canFinish;
  hint.hidden = canFinish;
}

function closeFinishIncompleteModal() {
  document.getElementById('finish-incomplete-modal').classList.remove('open');
}

// 未完了の種目・セットがあれば、記録されない分を一覧にした軽い確認を挟む(無ければそのまま終了)。
function handleFinishWorkout() {
  if (!currentSession || !sessionHasAnyRecord(currentSession)) return;
  const { skipped, partial } = sessionIncompleteSummary(currentSession);
  if (skipped.length === 0 && partial.length === 0) {
    finishWorkout();
    return;
  }
  const lines = [];
  if (skipped.length) lines.push(`<p>完了していない種目（記録に残りません）: ${skipped.map(escapeHtml).join('、')}</p>`);
  if (partial.length) lines.push(`<p>一部のセットが未完了の種目（完了したセットだけ残ります）: ${partial.map(escapeHtml).join('、')}</p>`);
  document.getElementById('finish-incomplete-desc').innerHTML = lines.join('');
  document.getElementById('finish-incomplete-modal').classList.add('open');
}

// 保存に成功してから終了処理(タイマー停止・画面遷移)をする。以前はタイマーを止めてから保存しており、
// 容量不足等で保存に失敗すると処理が途中で止まり、押し直すと経過時間が0になっていた(2026-10-04)。
// 失敗した時は記録画面に残して理由を出す(記録のidは使い回すので、押し直しても二重にならない)。
function finishWorkout() {
  if (!currentSession) return;
  closeFinishIncompleteModal();
  stopHoldTimer();
  stopCardioTimer();
  endRestTimer();
  const errorEl = document.getElementById('finish-workout-error');
  currentSession.durationSec = sessionStartTime != null ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0;
  try {
    finalizeSession(currentSession);
  } catch (e) {
    if (errorEl) errorEl.hidden = false;
    persistActiveSessionSnapshot();
    return;
  }
  if (errorEl) errorEl.hidden = true;
  stopSessionTimer();
  currentSession = null;
  currentMenu = null;
  clearActiveSessionSnapshot();
  renderRecordScreen({ selectToday: true });
  showScreen('record');
  // 予定を済ませたので、その日の時刻の通知を取り消す(ホームを開かなくても。Codexレビュー指摘)
  renderTodayFocus();
  if (typeof scheduleRoutinePushSync === 'function') scheduleRoutinePushSync();
}

// targetIdがnullなら「すべて削除」、session.idを渡せばその1件だけの削除確認になる。
function openResetHistoryModal(targetId) {
  historyDeleteMode = targetId ? 'session' : 'all';
  historyDeleteTargetId = targetId || null;
  const titleEl = document.getElementById('reset-history-modal-title');
  const descEl = document.getElementById('reset-history-modal-desc');
  if (historyDeleteTargetId) {
    titleEl.textContent = 'この記録を削除しますか？';
    descEl.textContent = 'この回の記録だけが消え、元に戻せません。他の記録には影響しません。';
  } else {
    titleEl.textContent = '記録をすべて削除しますか？';
    descEl.textContent = 'これまでのトレーニング記録がすべて消え、元に戻せません。お気に入りや体重などの設定はそのまま残ります。';
  }
  document.getElementById('reset-history-modal').classList.add('open');
}

// 記録削除時、クラウド同期が有効ならSupabase側のtraining_sessions行もあわせて削除キューに積む
// (js/sync.jsのqueueSessionDeleteForSync)。ローカル削除は既に完了しているため、失敗しても
// ローカルには影響しないベストエフォート(workout-log.jsのqueueSessionForSync呼び出しと同じ方針。
// 2026-09-08追加: これが無いと、ローカルで削除してもgame-daily-manager側は削除前のSupabase上の
// 記録を見続けるため、全体管理画面の「達成」表示がローカル削除後も残ってしまっていた)。
function queueSessionDeleteSafe(localId) {
  try {
    if (typeof queueSessionDeleteForSync === 'function') queueSessionDeleteForSync(localId);
  } catch (e) {
    // ベストエフォートのため握りつぶす。ローカルの削除は既に完了している。
  }
}

// 「◯月◯日のデータを削除する」用。カレンダーで選択中の日に行った記録を、1日に複数回記録している
// 場合もまとめて削除する（記録画面：カレンダー統合の設計メモにある通り、1日に複数セッションがあり得るため）。
// 以前は常に「今日」が対象だったが、2026-10-03にカレンダーで選んだ日を対象にするよう変更した。
// 体重の記録は対象外(日の詳細の体重行から個別に削除できる)。
function openResetDayModal() {
  const dateKey = recordSelectedDateStr || localDateKey(new Date());
  const label = recordDateLabel(recordDateFromKey(dateKey));
  historyDeleteMode = 'day';
  historyDeleteTargetId = null;
  historyDeleteDateKey = dateKey;
  document.getElementById('reset-history-modal-title').textContent = `${label}の記録を削除しますか？`;
  document.getElementById('reset-history-modal-desc').textContent = `${label}に行ったトレーニングの記録（複数回あればすべて）が消え、元に戻せません。他の日の記録と体重の記録には影響しません。`;
  document.getElementById('reset-history-modal').classList.add('open');
}

// ===== 毎日の体重記録（ホームで入力、記録タブのカレンダー・グラフで確認。描画はjs/ui.js） =====

function saveBodyWeightFromForm(wrap) {
  // ホームの入力欄は常に「今日の体重」なので、描画時の日付ではなく保存する瞬間の日付を使う
  // (入力欄を開いたまま日付をまたぐと前日の記録を上書きしてしまうため、2026-10-02 Codexレビュー指摘)。
  // 記録タブの日の詳細は選んだ日付の記録なので、描画時の日付のまま保存する。
  const dateKey = wrap.closest('#home-bodyweight-section')
    ? localDateKey(new Date())
    : wrap.dataset.bodyweightLogDate;
  const input = wrap.querySelector('.bodyweight-log-input');
  const errorEl = wrap.querySelector('.bodyweight-log-error');
  const value = Number(input.value);
  if (!input.value || Number.isNaN(value) || value < BODYWEIGHT_MIN || value > BODYWEIGHT_MAX) {
    errorEl.textContent = `${BODYWEIGHT_MIN}〜${BODYWEIGHT_MAX}の数字を入力してください`;
    errorEl.hidden = false;
    return;
  }
  const kg = Math.round(value * 10) / 10;
  // 負荷推定等に使う体重(getBodyWeightKg)はこの記録から都度求めるので、別の設定値の更新は不要。
  saveBodyWeightEntry(dateKey, kg);
  homeBodyWeightEditing = false;
  editingBodyWeightDateStr = null;
  rerenderBodyWeightViews();
}

function rerenderBodyWeightViews() {
  renderHomeBodyWeight();
  refreshRecordViewsAfterBodyWeightChange();
}

function focusBodyWeightInput(container) {
  const input = container && container.querySelector('.bodyweight-log-input');
  if (input) input.focus();
}

function wireBodyWeightLog() {
  document.addEventListener('click', (e) => {
    const saveBtn = e.target.closest('[data-bodyweight-log-save]');
    if (saveBtn) {
      saveBodyWeightFromForm(saveBtn.closest('.bodyweight-log-form-wrap'));
      return;
    }
    const cancelBtn = e.target.closest('[data-bodyweight-log-cancel]');
    if (cancelBtn) {
      if (cancelBtn.closest('#home-bodyweight-section')) homeBodyWeightEditing = false;
      else editingBodyWeightDateStr = null;
      rerenderBodyWeightViews();
      return;
    }
    const deleteBtn = e.target.closest('[data-bodyweight-log-delete]');
    if (deleteBtn) {
      const dateKey = deleteBtn.closest('.bodyweight-log-form-wrap').dataset.bodyweightLogDate;
      if (!window.confirm(`${recordDateLabel(recordDateFromKey(dateKey))}の体重の記録を削除しますか？`)) return;
      deleteBodyWeightEntry(dateKey);
      homeBodyWeightEditing = false;
      editingBodyWeightDateStr = null;
      rerenderBodyWeightViews();
      return;
    }
    if (e.target.closest('[data-bodyweight-home-edit]')) {
      homeBodyWeightEditing = true;
      renderHomeBodyWeight();
      focusBodyWeightInput(document.getElementById('home-bodyweight-section'));
      return;
    }
    const detailEditBtn = e.target.closest('[data-bodyweight-detail-edit]');
    if (detailEditBtn) {
      editingBodyWeightDateStr = detailEditBtn.dataset.bodyweightDetailEdit;
      refreshRecordViewsAfterBodyWeightChange();
      focusBodyWeightInput(document.querySelector('.day-weight-row-editing'));
      return;
    }
    const weekNavBtn = e.target.closest('[data-weekly-summary-nav]');
    if (weekNavBtn && !weekNavBtn.disabled) {
      weeklySummaryOffset = Math.min(0, weeklySummaryOffset + Number(weekNavBtn.dataset.weeklySummaryNav));
      renderWeeklySummary();
      return;
    }
    const rangeBtn = e.target.closest('[data-bodyweight-range]');
    if (rangeBtn) {
      bodyWeightGraphRangeDays = Number(rangeBtn.dataset.bodyweightRange);
      renderBodyWeightProgressChart();
    }
  });
  // 入力欄でEnter(スマホのキーボードの「完了/改行」)を押しても記録できるようにする。
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.classList || !e.target.classList.contains('bodyweight-log-input')) return;
    e.preventDefault();
    saveBodyWeightFromForm(e.target.closest('.bodyweight-log-form-wrap'));
  });
  // 日付が変わった後にアプリへ戻ってきた時、昨日の体重を「今日の体重」として出し続けないよう描き直す。
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !homeBodyWeightEditing) renderHomeBodyWeight();
  });
  renderHomeBodyWeight();
}

// ===== 腹囲の記録（ホームと記録タブの日の詳細で入力。描画はjs/ui.jsの「腹囲の記録」節） =====

function saveWaistFromForm(wrap) {
  // ホームの入力欄は体重と同じく、保存する瞬間の日付を使う(開いたまま日付をまたいだ時に前日分を上書きしないため)。
  const dateKey = wrap.closest('#home-waist-section') ? localDateKey(new Date()) : wrap.dataset.waistLogDate;
  const input = wrap.querySelector('.waist-log-input');
  const errorEl = wrap.querySelector('.waist-log-error');
  const value = Number(input.value);
  if (!input.value || Number.isNaN(value) || value < WAIST_MIN || value > WAIST_MAX) {
    errorEl.textContent = `${WAIST_MIN}〜${WAIST_MAX}の数字を入力してください`;
    errorEl.hidden = false;
    return;
  }
  saveWaistEntry(dateKey, Math.round(value * 10) / 10);
  homeWaistEditing = false;
  editingWaistDateStr = null;
  rerenderWaistViews();
}

function rerenderWaistViews() {
  renderHomeWaist();
  // 日の詳細・グラフの描き直しは体重と共通(腹囲の行・腹囲のグラフも一緒に描き直される)
  refreshRecordViewsAfterBodyWeightChange();
}

function wireWaistLog() {
  document.addEventListener('click', (e) => {
    const saveBtn = e.target.closest('[data-waist-log-save]');
    if (saveBtn) {
      saveWaistFromForm(saveBtn.closest('.waist-log-form-wrap'));
      return;
    }
    const cancelBtn = e.target.closest('[data-waist-log-cancel]');
    if (cancelBtn) {
      if (cancelBtn.closest('#home-waist-section')) homeWaistEditing = false;
      else editingWaistDateStr = null;
      rerenderWaistViews();
      return;
    }
    const deleteBtn = e.target.closest('[data-waist-log-delete]');
    if (deleteBtn) {
      const dateKey = deleteBtn.closest('.waist-log-form-wrap').dataset.waistLogDate;
      if (!window.confirm(`${recordDateLabel(recordDateFromKey(dateKey))}の腹囲の記録を削除しますか？`)) return;
      deleteWaistEntry(dateKey);
      homeWaistEditing = false;
      editingWaistDateStr = null;
      rerenderWaistViews();
      return;
    }
    if (e.target.closest('[data-waist-home-edit]')) {
      homeWaistEditing = true;
      renderHomeWaist();
      const input = document.querySelector('#home-waist-section .waist-log-input');
      if (input) input.focus();
      return;
    }
    const detailEditBtn = e.target.closest('[data-waist-detail-edit]');
    if (detailEditBtn) {
      editingWaistDateStr = detailEditBtn.dataset.waistDetailEdit;
      refreshRecordViewsAfterBodyWeightChange();
      const input = document.querySelector('.day-weight-row-editing .waist-log-input');
      if (input) input.focus();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.classList || !e.target.classList.contains('waist-log-input')) return;
    e.preventDefault();
    saveWaistFromForm(e.target.closest('.waist-log-form-wrap'));
  });
  // 日付が変わった後に戻ってきた時、「◯日前」や「今日」の表示を描き直す
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !homeWaistEditing) renderHomeWaist();
  });
  renderHomeWaist();
}

// ===== ちょこっと記録(2026-10-07〜、食後のスクワット15回など。データはjs/storage.js、描画はjs/ui.js) =====
// 編集シートで追加中の内容(nullなら一覧を表示中)
let quickSheetDraft = null;

function newQuickId(prefix) {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function renderQuickSheetNow() {
  renderQuickSheet(!!quickSheetDraft, quickSheetDraft);
  document.querySelectorAll('#quick-sheet .number-wheel-track').forEach(initNumberWheel);
}

function closeQuickSheet() {
  const sheet = document.getElementById('quick-sheet');
  if (!sheet.classList.contains('open')) return;
  sheet.classList.remove('open');
  unlockBodyScroll();
  quickSheetDraft = null;
  renderHomeQuickLog();
}

function wireQuickLog() {
  document.getElementById('home-quick-section').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-quick-log]');
    if (btn) {
      const preset = loadQuickPresets().find((p) => p.id === btn.dataset.quickLog);
      const ex = preset && findExerciseById(preset.exerciseId);
      if (!ex) return;
      const entry = { id: newQuickId('q'), at: new Date().toISOString(), exerciseId: ex.id, name: ex.name, amount: preset.amount, timed: preset.timed };
      try {
        addQuickLogEntry(entry);
      } catch (err) {
        alert('記録できませんでした。端末の空き容量を確認してください。');
        return;
      }
      if (navigator.vibrate) navigator.vibrate(30);
      renderHomeQuickLog(entry);
      refreshRecordViewsAfterBodyWeightChange();
      return;
    }
    const undo = e.target.closest('[data-quick-undo]');
    if (undo) {
      deleteQuickLogEntry(undo.dataset.quickUndo);
      renderHomeQuickLog();
      refreshRecordViewsAfterBodyWeightChange();
      return;
    }
    if (e.target.closest('[data-quick-manage]')) {
      quickSheetDraft = loadQuickPresets().length === 0 ? { exerciseId: 'bodyweight_squat', amount: 15 } : null;
      document.getElementById('quick-sheet').classList.add('open');
      lockBodyScroll();
      renderQuickSheetNow();
    }
  });

  const sheet = document.getElementById('quick-sheet');
  sheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-quick-close]')) { closeQuickSheet(); return; }
    if (e.target.closest('[data-quick-add-open]')) {
      quickSheetDraft = { exerciseId: 'bodyweight_squat', amount: 15 };
      renderQuickSheetNow();
      return;
    }
    if (e.target.closest('[data-quick-add-cancel]')) {
      quickSheetDraft = null;
      renderQuickSheetNow();
      return;
    }
    if (e.target.closest('[data-quick-add-save]')) {
      flushNumberWheels(sheet);
      const ex = findExerciseById(quickSheetDraft.exerciseId);
      if (!ex) return;
      const presets = loadQuickPresets();
      presets.push({ id: newQuickId('p'), exerciseId: ex.id, amount: quickSheetDraft.amount, timed: !!ex.holdBased });
      saveQuickPresets(presets);
      quickSheetDraft = null;
      renderQuickSheetNow();
      renderHomeQuickLog();
      return;
    }
    const del = e.target.closest('[data-quick-preset-delete]');
    if (del) {
      if (!confirm('このボタンを削除しますか？（これまでの記録は消えません）')) return;
      saveQuickPresets(loadQuickPresets().filter((p) => p.id !== del.dataset.quickPresetDelete));
      renderQuickSheetNow();
      renderHomeQuickLog();
    }
  });
  sheet.addEventListener('change', (e) => {
    if (!quickSheetDraft || !e.target.matches('[data-quick-field="exerciseId"]')) return;
    quickSheetDraft.exerciseId = e.target.value;
    // 時間で測る種目(プランク等)と回数の種目で、選べる範囲を合わせ直す
    const ex = findExerciseById(quickSheetDraft.exerciseId);
    quickSheetDraft.amount = ex && ex.holdBased ? 30 : 15;
    renderQuickSheetNow();
  });
  sheet.addEventListener('input', (e) => {
    const input = e.target.closest('[data-quick-amount]');
    if (!input || !quickSheetDraft) return;
    quickSheetDraft.amount = Number(input.value);
    const wrap = input.closest('.slider-field');
    const numEl = wrap && wrap.querySelector('[data-sheet-value-num]');
    if (numEl) numEl.textContent = String(quickSheetDraft.amount);
    if (wrap) refreshWheelPresetMarks(wrap);
  });

  // 記録タブの日の詳細の✕(1回分を削除)
  document.addEventListener('click', (e) => {
    const del = e.target.closest('[data-quick-delete]');
    if (!del) return;
    if (!confirm('このちょこっと記録を削除しますか？')) return;
    deleteQuickLogEntry(del.dataset.quickDelete);
    renderHomeQuickLog();
    refreshRecordViewsAfterBodyWeightChange();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') renderHomeQuickLog();
  });
  renderHomeQuickLog();
}

// ===== データのバックアップ（書き出し/読み込み。形式と対象はjs/storage.jsのbuildBackupObject参照） =====

function setBackupStatus(text, isError) {
  const el = document.getElementById('backup-status');
  el.textContent = text;
  el.classList.toggle('is-error', !!isError);
}

async function exportBackup() {
  const json = JSON.stringify(buildBackupObject());
  // 書き出したファイルが読み込み時の検証(parseBackupText)で弾かれると、古いアイコンを削除した後に
  // 復元できなくなる。書き出す前に同じ検証を通し、通らなければ書き出さずに知らせる。
  try {
    parseBackupText(json);
  } catch (e) {
    setBackupStatus(`このデータは書き出せませんでした（${e.message}）。アイコンは削除しないでください。`, true);
    return;
  }
  const fileName = `compstack-backup-${localDateKey(new Date())}.json`;
  // iPhoneでは共有シート(「ファイルに保存」等)から保存できるようにする。共有に対応していない
  // ブラウザ(PC等)は通常のダウンロードにフォールバックする。
  try {
    const file = new File([json], fileName, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Compstackのバックアップ' });
      setBackupStatus(BACKUP_VERIFY_HINT);
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return; // 共有シートを閉じただけ
    // それ以外の共有の失敗は、下の通常のダウンロードで再挑戦する
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setBackupStatus(BACKUP_VERIFY_HINT);
}

// 共有シートやダウンロードが終わっても、実際にファイルが保存されたかはアプリ側からは分からない。
// アイコンを削除する前提の機能なので、成功と言い切らず保存先の確認を促す(2026-10-03 Codexレビュー指摘)。
const BACKUP_VERIFY_HINT = '書き出しました。ホーム画面のアイコンを削除する前に、保存したファイルが「ファイル」アプリ等に実際にあるか確認してください。';

function importBackupText(text) {
  let summary;
  try {
    summary = parseBackupText(text);
  } catch (e) {
    setBackupStatus(e.message, true);
    return false;
  }
  const exported = summary.exportedAt ? new Date(summary.exportedAt) : null;
  const exportedLabel = exported && !Number.isNaN(exported.getTime()) ? `${formatDate(summary.exportedAt)}に書き出した` : '';
  // 腹囲(2026-10-06追加)を含まない古いバックアップは、読み込むと今の腹囲の記録が消える(全置き換えのため)。黙って消さずに明示する。
  const currentWaistCount = waistEntriesSorted().length;
  const waistWarning = !summary.hasWaistLog && currentWaistCount > 0
    ? `\n※このバックアップには腹囲の記録が含まれていないため、今の腹囲の記録（${currentWaistCount}件）は消えます。`
    : '';
  const ok = window.confirm(
    `${exportedLabel}バックアップ（トレーニング記録${summary.sessionCount}件・体重${summary.bodyWeightCount}日分・腹囲${summary.waistCount}件）を読み込みます。\n`
    + '今この端末にあるデータは、バックアップの内容にすべて置き換わります。よろしいですか？'
    + waistWarning,
  );
  if (!ok) return false;
  try {
    applyBackupData(summary.data);
  } catch (e) {
    // applyBackupData側で書き換え前の状態に戻してある。再読み込みはしない。
    setBackupStatus(e.message, true);
    return false;
  }
  location.reload();
  return true;
}

function wireBackup() {
  const fileInput = document.getElementById('backup-import-file');
  document.getElementById('backup-export-btn').addEventListener('click', () => {
    setBackupStatus('');
    // 記録中のセッションはバックアップに含まれないため、書き出してアイコンを削除すると失われる。
    if (currentSession) {
      setBackupStatus('トレーニング中の記録はバックアップに含まれません。「記録して終了」を押してから書き出してください。', true);
      return;
    }
    void exportBackup();
  });
  document.getElementById('backup-import-btn').addEventListener('click', () => {
    setBackupStatus('');
    // 記録中に読み込むと、記録中のセッションと読み込んだデータが混ざるため止める。
    if (currentSession) {
      setBackupStatus('トレーニング中は読み込めません。記録を終えてから読み込んでください。', true);
      return;
    }
    fileInput.value = '';
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importBackupText(String(reader.result || ''));
    reader.onerror = () => setBackupStatus('ファイルを読み込めませんでした', true);
    reader.readAsText(file);
  });
}

// 「各種目の最初にウォームアップセットを入れる」スイッチ(メニュー確認画面・記録画面の
// ウォームアップ欄、js/ui.jsのbuildWarmupHtml)。切り替えた値は保存され、自分で切り替えるまで維持される。
function wireWarmupSetsToggle() {
  document.addEventListener('change', (e) => {
    if (!e.target.matches || !e.target.matches('[data-warmup-sets-toggle]')) return;
    const enabled = e.target.checked;
    saveWarmupSetsEnabled(enabled);
    if (currentMenu && document.getElementById('screen-menu').classList.contains('active')) {
      renderMenuScreen();
    }
    if (currentSession && document.getElementById('screen-log').classList.contains('active')) {
      applyWarmupSetsSetting(currentSession, enabled);
      renderLog(currentSession);
      updateFinishButtonState();
      persistActiveSessionSnapshot();
    }
  });
}

// 記録画面の保持時間系(プランク等)の「目標 ◯秒」の「変更」(js/ui.jsのbuildHoldTargetMetaHtml)。
// 保存すると種目ごとの目標として次回以降も使い、今回の記録の未完了セットの秒数も揃える。
function setHoldTargetFormOpen(exIndex, open) {
  const meta = document.querySelector(`[data-hold-target-meta="${exIndex}"]`);
  const form = document.querySelector(`[data-hold-target-form="${exIndex}"]`);
  if (!meta || !form) return;
  meta.hidden = open;
  form.hidden = !open;
  if (open) {
    const input = form.querySelector('.hold-target-input');
    const ex = currentSession && currentSession.exercises[exIndex];
    if (ex) input.value = ex.holdTargetSec != null ? ex.holdTargetSec : loadHoldTargetSec(ex.exerciseId);
    form.querySelector('.hold-target-error').hidden = true;
    input.focus();
  }
}

function saveHoldTargetFromForm(exIndex) {
  const ex = currentSession && currentSession.exercises[exIndex];
  const form = document.querySelector(`[data-hold-target-form="${exIndex}"]`);
  if (!ex || !form) return;
  const input = form.querySelector('.hold-target-input');
  const errorEl = form.querySelector('.hold-target-error');
  const sec = Number(input.value);
  if (!input.value || !Number.isInteger(sec) || sec < HOLD_TARGET_MIN_SEC || sec > HOLD_TARGET_MAX_SEC) {
    errorEl.textContent = `${HOLD_TARGET_MIN_SEC}〜${HOLD_TARGET_MAX_SEC}の整数を入力してください`;
    errorEl.hidden = false;
    return;
  }
  try {
    saveHoldTargetSec(ex.exerciseId, sec);
  } catch (e) {
    errorEl.textContent = '保存できませんでした（端末の空き容量を確認してください）';
    errorEl.hidden = false;
    return;
  }
  applyHoldTargetToExercise(ex, sec);
  renderLog(currentSession);
  updateFinishButtonState();
  persistActiveSessionSnapshot();
}

function wireHoldTargetEdit() {
  const logContent = document.getElementById('log-content');
  logContent.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-hold-target-edit]');
    if (editBtn) { setHoldTargetFormOpen(editBtn.dataset.holdTargetEdit, true); return; }
    const cancelBtn = e.target.closest('[data-hold-target-cancel]');
    if (cancelBtn) { setHoldTargetFormOpen(cancelBtn.dataset.holdTargetCancel, false); return; }
    const saveBtn = e.target.closest('[data-hold-target-save]');
    if (saveBtn) saveHoldTargetFromForm(Number(saveBtn.dataset.holdTargetSave));
  });
  // 入力欄でEnter(iPhoneのキーボードの「開く/改行」)を押しても保存できるようにする
  logContent.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.classList.contains('hold-target-input')) return;
    e.preventDefault();
    const wrap = e.target.closest('[data-hold-target-form]');
    if (wrap) saveHoldTargetFromForm(Number(wrap.dataset.holdTargetForm));
  });
}

function restoreLastSettings() {
  const settings = loadSettings();
  if (!settings) return;
  // 体重だけが保存されている(自分で作るモードしか使ったことがない)場合など、
  // 一部のフィールドしか無いことがあるため、それぞれ存在確認してから復元する。
  if (settings.parts) {
    document.querySelectorAll('#part-group input').forEach((el) => {
      el.checked = settings.parts.includes(el.dataset.part);
    });
  }
  if (settings.equipment) {
    document.querySelectorAll('#equipment-group input').forEach((el) => {
      el.checked = settings.equipment.includes(el.value);
    });
  }
  if (settings.painAreas) {
    document.querySelectorAll('#pain-group input').forEach((el) => {
      el.checked = el.dataset.pain === 'none' ? settings.painAreas.length === 0 : settings.painAreas.includes(el.dataset.pain);
    });
  }
  if (settings.minutes) document.getElementById('minutes-select').value = settings.minutes;
  if (settings.level) document.getElementById('level-select').value = settings.level;
  if (settings.goal) document.getElementById('goal-select').value = settings.goal;
}

// 初回起動時の同期選択モーダル(#sync-choice-modal)のボタン配線。js/sync.js・js/ui.js参照。
function wireSyncChoiceModal() {
  document.getElementById('sync-choice-login-btn').addEventListener('click', async () => {
    const errorEl = document.getElementById('sync-choice-error');
    errorEl.textContent = '';
    const { error } = await signInWithGoogleForSync();
    if (error) errorEl.textContent = 'ログインに失敗しました。もう一度お試しください。';
    // 成功時はGoogleのログイン画面へ遷移するため、ここから先の処理は行われない
    // (戻ってきた後はinitSupabaseAuthのonAuthStateChangeがモーダルを閉じる)。
  });
  document.getElementById('sync-choice-skip-btn').addEventListener('click', () => {
    markSyncChoiceMade();
    setSyncEnabled(false);
    closeSyncChoiceModal();
  });
}

function init() {
  wirePullToRefresh();
  renderAppVersion();
  // 新しいService Workerのキャッシュは読み込み後に作られるので、少し後にもう一度見る
  setTimeout(renderAppVersion, 3000);
  wireThemePicker();
  wirePartExclusivity();
  wirePainExclusivity();
  wireSliderEnhancements();
  wireNumberWheels();
  wireCustomScreen();
  wireExercisePicker();
  wireMenuScreen();
  wireRoutineScreen();
  wireModeWeeklyPlanSection();
  wireKnowledgeScreen();
  restoreLastSettings();
  wireBodyWeightLog();
  wireWaistLog();
  wireQuickLog();
  wireWarmupSetsToggle();
  wireHoldTargetEdit();
  wireBackup();
  renderModeWeeklyPlanSection();
  wireSyncChoiceModal();
  void initSupabaseAuth().then(() => maybeShowSyncChoiceModal());
  // URLパラメータの読み取り・除去は復元の有無に関わらず必ず一度だけ行う(consumeEntryParamsが
  // history.replaceStateで即座に取り除く)。前回終了できなかった記録中セッションがあれば
  // 先に復元し、復元した場合はその値を使ったquickstart等の実行はスキップする
  // (記録中セッションを上書きしてしまうため)。
  const entryParams = consumeEntryParams();
  if (!restoreActiveSessionIfAny()) maybeHandleEntryParams(entryParams);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistActiveSessionSnapshot({ passive: true });
    // 開いたまま日付が変わった時、週間プランの今日の予定(特に「一日おき」の今日やった/休み)を前日のまま
    // 出し続けないよう、戻ってきたら描き直す(2026-10-06 Codexレビュー指摘)。
    if (document.visibilityState === 'visible') {
      renderModeWeeklyPlanSection();
      renderRoutineScreen();
      moveStaleWorkoutToHomeIfNeeded();
    }
  });
  window.addEventListener('pagehide', () => persistActiveSessionSnapshot({ passive: true }));

  document.getElementById('mode-request-btn').addEventListener('click', () => {
    setupRoutineId = null;
    showScreen('setup');
  });
  document.getElementById('mode-custom-btn').addEventListener('click', () => {
    // 前に読み込んだ組み合わせの目標を持ち越さない(有酸素は最後に決めた目標が初期値になる。Codexレビュー指摘)
    resetCustomScreenState();
    closeCustomEditor();
    renderCustomScreen();
    showScreen('custom');
  });

  document.getElementById('generate-btn').addEventListener('click', handleGenerate);
  document.getElementById('regenerate-btn').addEventListener('click', () => {
    renderModeWeeklyPlanSection();
    showScreen('mode');
  });
  document.getElementById('start-workout-btn').addEventListener('click', handleStartWorkout);
  document.getElementById('log-content').addEventListener('input', handleLogInput);
  document.getElementById('log-content').addEventListener('change', handleLogInput);
  document.getElementById('finish-workout-btn').addEventListener('click', handleFinishWorkout);
  // 記録タブ上部の「クラウドに送れなかった記録があります」→「その他の設定」を開いて同期の欄へ移動する
  document.getElementById('sync-failed-notice-btn').addEventListener('click', () => {
    const row = document.getElementById('sync-status-row');
    const details = row && row.closest('details');
    if (details) details.open = true;
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  document.getElementById('start-overwrite-resume').addEventListener('click', resumeActiveWorkout);
  document.getElementById('start-overwrite-discard').addEventListener('click', discardActiveWorkoutAndStart);
  document.getElementById('start-overwrite-modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-start-overwrite-close]')) closeStartOverwriteModal();
  });
  document.getElementById('home-resume-workout-section').addEventListener('click', (e) => {
    if (e.target.closest('[data-resume-workout]')) resumeActiveWorkout();
    if (e.target.closest('[data-discard-workout]')) discardActiveWorkout();
  });
  document.getElementById('finish-incomplete-confirm').addEventListener('click', finishWorkout);
  document.getElementById('finish-incomplete-modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-finish-incomplete-close]')) closeFinishIncompleteModal();
  });
  // 入力のたびに押せるかを更新する(描き直し時はrenderLogの直後で、タイマーはapplyCardioDurationValueで更新)。
  document.getElementById('log-content').addEventListener('change', () => updateFinishButtonState());
  document.getElementById('log-content').addEventListener('input', () => updateFinishButtonState());

  document.getElementById('main').addEventListener('click', (e) => {
    const demoTrigger = e.target.closest('[data-demo]');
    if (demoTrigger) {
      openDemoModal(demoTrigger.dataset.demo);
      return;
    }
    const infoTrigger = e.target.closest('[data-info-toggle]');
    if (infoTrigger) {
      toggleInfoPanel(infoTrigger);
      return;
    }
    const holdTimerTrigger = e.target.closest('[data-hold-timer]');
    if (holdTimerTrigger) toggleHoldTimer(holdTimerTrigger);
    const cardioTimerTrigger = e.target.closest('[data-cardio-timer]');
    if (cardioTimerTrigger) toggleCardioTimer(cardioTimerTrigger);
    const cardioTargetTrigger = e.target.closest('[data-cardio-target-custom], [data-cardio-target-log]');
    if (cardioTargetTrigger) {
      openCardioTargetSheet(cardioTargetTrigger.dataset.cardioTargetCustom != null
        ? { kind: 'custom', exerciseId: cardioTargetTrigger.dataset.cardioTargetCustom }
        : { kind: 'log', exIndex: Number(cardioTargetTrigger.dataset.cardioTargetLog) });
      return;
    }
    const rpeInfoTrigger = e.target.closest('[data-rpe-info-toggle]');
    if (rpeInfoTrigger) openRpeInfoModal();
    const favTrigger = e.target.closest('[data-fav-toggle]');
    if (favTrigger) {
      const id = favTrigger.dataset.favToggle;
      const favorites = toggleFavoriteExercise(id);
      const isFav = favorites.includes(id);
      // その種目の★はどの画面(裏で非表示になっている画面も含む)にあっても
      // まとめて見た目を更新する。一覧の並び自体は変わらないので全体再描画は不要。
      document.querySelectorAll(`[data-fav-toggle="${CSS.escape(id)}"]`).forEach((btn) => {
        btn.textContent = isFav ? '★' : '☆';
        btn.classList.toggle('active', isFav);
        btn.setAttribute('aria-label', isFav ? 'お気に入りから外す' : 'お気に入りに追加');
      });
      return;
    }
    const chartPoint = e.target.closest('.chart-point');
    if (chartPoint) {
      const svg = chartPoint.closest('svg');
      const tooltip = chartPoint.closest('.progress-trend-chart')?.querySelector('.chart-tooltip');
      if (svg && tooltip) {
        const viewBox = svg.viewBox.baseVal;
        const cx = Number(chartPoint.getAttribute('cx'));
        const cy = Number(chartPoint.getAttribute('cy'));
        const detail = chartPoint.dataset.chartDetail;
        tooltip.textContent = `${chartPoint.dataset.chartDate}: ${chartPoint.dataset.chartValue}${detail ? `（${detail}）` : ''}`;
        tooltip.style.left = `${(cx / viewBox.width) * 100}%`;
        tooltip.style.top = `${(cy / viewBox.height) * 100}%`;
        tooltip.hidden = false;
      }
      return;
    }
    document.querySelectorAll('.chart-tooltip').forEach((t) => { t.hidden = true; });
  });
  document.getElementById('demo-modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-demo-close]')) closeDemoModal();
  });
  document.getElementById('rpe-info-modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-rpe-info-close]')) closeRpeInfoModal();
  });
  document.getElementById('reset-day-btn').addEventListener('click', openResetDayModal);
  document.getElementById('reset-history-btn').addEventListener('click', () => openResetHistoryModal(null));
  document.getElementById('screen-record').addEventListener('click', (e) => {
    const delBtn = e.target.closest('[data-history-delete]');
    if (delBtn) openResetHistoryModal(delBtn.dataset.historyDelete);
    const emptyStartBtn = e.target.closest('#empty-state-start-btn');
    if (emptyStartBtn) {
      showScreen('mode');
      renderModeWeeklyPlanSection();
    }
    const tabButton = e.target.closest('#tab-record-btn, #tab-graph-btn');
    if (tabButton) {
      setActiveRecordTab(tabButton.id === 'tab-graph-btn' ? 'graph' : 'record');
    }
    const viewModeButton = e.target.closest('#view-mode-calendar-btn, #view-mode-list-btn');
    if (viewModeButton) {
      setRecordViewMode(viewModeButton.id === 'view-mode-list-btn' ? 'list' : 'calendar');
    }
    const monthButton = e.target.closest('#cal-prev-month, #cal-next-month');
    if (monthButton) {
      recordViewMonth += monthButton.id === 'cal-prev-month' ? -1 : 1;
      if (recordViewMonth < 0) { recordViewMonth = 11; recordViewYear -= 1; }
      if (recordViewMonth > 11) { recordViewMonth = 0; recordViewYear += 1; }
      const historyMap = groupHistoryByDate(loadHistory());
      renderCalendar(historyMap);
      renderRecordDayDetail(historyMap);
    }
    const dayButton = e.target.closest('[data-record-day-prev], [data-record-day-next]');
    if (dayButton) moveSelectedRecordDay(dayButton.hasAttribute('data-record-day-prev') ? -1 : 1);
    const jumpButton = e.target.closest('[data-record-jump]');
    if (jumpButton) selectRecordDate(jumpButton.dataset.recordJump);
    const toggleDetailButton = e.target.closest('[data-toggle-detail]');
    if (toggleDetailButton) toggleSessionDetail(toggleDetailButton.dataset.toggleDetail);
    const graphExerciseButton = e.target.closest('[data-graph-exercise]');
    if (graphExerciseButton) goToExerciseGraph(graphExerciseButton.dataset.graphExercise);
  });
  document.getElementById('reset-history-modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-reset-history-close]')) {
      document.getElementById('reset-history-modal').classList.remove('open');
    }
  });
  document.getElementById('reset-history-confirm').addEventListener('click', () => {
    if (historyDeleteMode === 'session') {
      deleteSession(historyDeleteTargetId);
      queueSessionDeleteSafe(historyDeleteTargetId);
    } else if (historyDeleteMode === 'day') {
      const dateKey = historyDeleteDateKey;
      const idsToDelete = loadHistory().filter((s) => localDateKey(s.date) === dateKey).map((s) => s.id);
      deleteSessionsByDateKey(dateKey);
      idsToDelete.forEach(queueSessionDeleteSafe);
      historyDeleteDateKey = null;
    } else {
      const idsToDelete = loadHistory().map((s) => s.id);
      clearHistory();
      idsToDelete.forEach(queueSessionDeleteSafe);
    }
    historyDeleteTargetId = null;
    historyDeleteMode = 'all';
    document.getElementById('reset-history-modal').classList.remove('open');
    renderRecordScreen();
    // 記録を消して「済み」でなくなった日の通知を入れ直す
    renderTodayFocus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDemoModal();
      closeExercisePicker();
      closeRpeInfoModal();
      document.getElementById('reset-history-modal').classList.remove('open');
      closeSaveTemplateModal();
      closeWeeklyDayModal();
      closeWeeklyPlanNameModal();
      closeFinishIncompleteModal();
      closeStartOverwriteModal();
    }
  });

  document.getElementById('rest-timer-plus10').addEventListener('click', () => addRestTimerSeconds(10));
  document.getElementById('rest-timer-end').addEventListener('click', endRestTimer);
  document.getElementById('hold-timer-cancel').addEventListener('click', stopHoldTimer);
  document.getElementById('hold-timer-pause').addEventListener('click', toggleHoldTimerPause);
  document.getElementById('cardio-timer-rest-toggle').addEventListener('click', toggleCardioRest);
  document.getElementById('cardio-timer-stop').addEventListener('click', stopCardioTimer);

  document.getElementById('progress-exercise-select').addEventListener('change', (e) => {
    renderExerciseProgressChart(e.target.value);
  });

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.nav;
      // 下のタブで離れたら、予定画面からの編集は取り消す(後で別の用事で「自分で作る」を開いた時に勝手に予定へ戻らないため)
      closeCustomEditor();
      if (target === 'mode') {
        homeBodyWeightEditing = false;
        homeWaistEditing = false;
        renderHomeBodyWeight();
        renderHomeWaist();
        renderModeWeeklyPlanSection();
      }
      if (target === 'record') renderRecordScreen();
      if (target === 'weekly') enterWeeklyScreenFromNav();
      if (target === 'knowledge') renderKnowledgeScreen();
      stopHoldTimer();
      stopCardioTimer();
      endRestTimer();
      // 記録中セッション自体はまだ続いている可能性がある(このnavには「記録を終了する」機能は
      // 無く、単に別画面を見に行くだけ)ため、sessionStartTimeは消さずに表示更新だけ止める
      // (stopSessionTimerとの違いはjs/session-timer.jsのコメント参照)。
      pauseSessionTimerDisplay();
      persistActiveSessionSnapshot({ passive: true });
      showScreen(target);
    });
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
