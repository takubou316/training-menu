// localStorageへの永続化。バックエンドサーバーを持たないため、全データは端末内のみに保存される。

const STORAGE_KEYS = {
  settings: 'training-menu:settings',
  history: 'training-menu:history',
  favorites: 'training-menu:favorites',
  customTemplates: 'training-menu:custom-templates',
  weeklyPlans: 'training-menu:weekly-plans',
  activeWeeklyPlanId: 'training-menu:active-weekly-plan-id',
  streak: 'training-menu:streak',
  activeSession: 'training-menu:active-session',
  theme: 'training-menu:theme',
  bodyWeightLog: 'training-menu:bodyweight-log',
  warmupSetsEnabled: 'training-menu:warmup-sets-enabled',
};

// 毎日の体重記録。{ 'YYYY-MM-DD'(localDateKey): kg } の形で1日1件だけ持つ(同じ日に記録し直すと上書き)。
// 設定(settings.bodyWeightKg、自重種目の負荷推定に使う「今の体重」)とは別に、推移を見るための履歴として持つ。
// トレーニング記録の削除(clearHistory等)の対象外。クラウド同期もしない(端末内のみ)。
function loadBodyWeightLog() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.bodyWeightLog);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveBodyWeightEntry(dateKey, kg) {
  const log = loadBodyWeightLog();
  log[dateKey] = kg;
  localStorage.setItem(STORAGE_KEYS.bodyWeightLog, JSON.stringify(log));
  return log;
}

function deleteBodyWeightEntry(dateKey) {
  const log = loadBodyWeightLog();
  delete log[dateKey];
  localStorage.setItem(STORAGE_KEYS.bodyWeightLog, JSON.stringify(log));
  return log;
}

// 体重記録を日付の古い→新しい順の配列で返す([{ dateKey, kg }])。
function bodyWeightEntriesSorted() {
  return Object.entries(loadBodyWeightLog())
    .filter(([dateKey, kg]) => /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && Number.isFinite(Number(kg)))
    .map(([dateKey, kg]) => ({ dateKey, kg: Number(kg) }))
    .sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
}

// 各種目の最初にウォームアップセットを入れるか。未設定(初回)は従来通り入れる(true)。
// 一度切り替えたらユーザーが自分で切り替えるまでその値を使い続ける。
function loadWarmupSetsEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEYS.warmupSetsEnabled) !== 'false';
  } catch (e) {
    return true;
  }
}

function saveWarmupSetsEnabled(enabled) {
  localStorage.setItem(STORAGE_KEYS.warmupSetsEnabled, enabled ? 'true' : 'false');
}

// 選べるテーマのid一覧('amber'が既定、css/style.cssの[data-theme]・index.htmlの
// .theme-pickerと対応させる)。想定外の値(壊れたlocalStorage等)を弾くためexport。
const THEME_IDS = ['amber', 'mono', 'rose', 'sage'];

function loadTheme() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.theme);
    return THEME_IDS.includes(raw) ? raw : 'amber';
  } catch (e) {
    return 'amber';
  }
}

function saveTheme(theme) {
  if (!THEME_IDS.includes(theme)) return;
  localStorage.setItem(STORAGE_KEYS.theme, theme);
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.history);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveSession(session) {
  const history = loadHistory();
  history.unshift(session); // 新しい記録を先頭に
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
}

function loadTrainingStreak() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.streak);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed.last !== 'string' || !Number.isInteger(parsed.count) || parsed.count < 1) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function saveTrainingStreak(streak) {
  localStorage.setItem(STORAGE_KEYS.streak, JSON.stringify(streak));
}

function localDateKey(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function previousDateKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() - 1);
  return localDateKey(date);
}

function calculateTrainingStreak(history) {
  const dateKeys = [...new Set(history
    .map((session) => localDateKey(session.date))
    .filter(Boolean))]
    .sort()
    .reverse();
  if (dateKeys.length === 0) return null;

  let count = 1;
  for (let i = 1; i < dateKeys.length; i += 1) {
    if (dateKeys[i] !== previousDateKey(dateKeys[i - 1])) break;
    count += 1;
  }
  return { last: dateKeys[0], count };
}

// 連続日数は常に記録(history)から計算し直す。以前は保存値を優先していたため、記録を削除しても
// 連続日数が減らなかった(2026-10-04修正)。保存値(streakキー)はバックアップ互換のため同期して残すだけで、
// 表示には使わない。同日中の複数記録は1日として扱う。
function getTrainingStreak() {
  return calculateTrainingStreak(loadHistory());
}

// 記録を追加・削除した後に呼び、保存値を記録の内容に合わせる。
function refreshTrainingStreak() {
  const streak = getTrainingStreak();
  try {
    if (streak) saveTrainingStreak(streak);
    else localStorage.removeItem(STORAGE_KEYS.streak);
  } catch (e) { /* 保存値は表示に使わないため、書き込めなくても問題ない */ }
  return streak;
}

// トレーニング記録だけを削除する（お気に入り・体重などの設定は残す）。
function clearHistory() {
  localStorage.removeItem(STORAGE_KEYS.history);
  refreshTrainingStreak();
}

// 記録一覧から特定の1回分だけを削除する（他の記録には影響しない）。
function deleteSession(id) {
  const history = loadHistory().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
  refreshTrainingStreak();
  return history;
}

// 指定した日付(dateKey、localDateKey形式)に行った記録をまとめて削除する（他の日には影響しない）。
// 1日に複数回記録している場合(記録画面：カレンダー統合の設計メモ参照)もすべて対象になる。
function deleteSessionsByDateKey(dateKey) {
  const history = loadHistory().filter((s) => localDateKey(s.date) !== dateKey);
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
  refreshTrainingStreak();
  return history;
}

// 指定した種目の直近の記録（最後に行ったセット内容）を返す。無ければnull。
function findLastPerformance(exerciseId) {
  const history = loadHistory();
  for (const session of history) {
    const found = session.exercises.find((e) => e.exerciseId === exerciseId);
    if (found) {
      const workingSets = found.sets.filter((s) => s.done && !s.isWarmup);
      if (workingSets.length > 0) {
        return { date: session.date, sets: workingSets };
      }
    }
  }
  return null;
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.favorites);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function isFavoriteExercise(exerciseId) {
  return loadFavorites().includes(exerciseId);
}

function toggleFavoriteExercise(exerciseId) {
  const favorites = loadFavorites();
  const idx = favorites.indexOf(exerciseId);
  if (idx >= 0) favorites.splice(idx, 1);
  else favorites.push(exerciseId);
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(favorites));
  return favorites;
}

// 「自分で作る」で組んだ種目構成(種目の並び・休憩時間)を名前付きで保存しておき、後から呼び出せる。
function loadCustomTemplates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.customTemplates);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveCustomTemplate(template) {
  const templates = loadCustomTemplates();
  templates.unshift(template); // 新しいものを先頭に
  localStorage.setItem(STORAGE_KEYS.customTemplates, JSON.stringify(templates));
  return templates;
}

function deleteCustomTemplate(id) {
  const templates = loadCustomTemplates().filter((t) => t.id !== id);
  localStorage.setItem(STORAGE_KEYS.customTemplates, JSON.stringify(templates));
  return templates;
}

// 記録履歴(新しい順)から、実施したことのある種目IDを直近順・重複なしで返す。
function recentExerciseIds(limit) {
  const history = loadHistory();
  const seen = new Set();
  const result = [];
  for (const session of history) {
    for (const ex of session.exercises) {
      if (!seen.has(ex.exerciseId)) {
        seen.add(ex.exerciseId);
        result.push(ex.exerciseId);
        if (limit && result.length >= limit) return result;
      }
    }
  }
  return result;
}

// 週間プランは「自分で作る」の保存済み組み合わせと同じ考え方で、名前付きの複数プリセットとして
// 保存できる（例:「通常週」「旅行中の軽い週」）。1つは常に「使用中(active)」として選ばれており、
// モード選択画面の「今日は◯◯の日です」バナー等はこれを参照する。
// 各プリセットは { id, name, createdAt, days } で、daysは曜日ごとの割り当て(月曜始まりで7要素固定)。
// days の各要素は { kind: 'rest' } | { kind: 'parts', parts: [...] } | { kind: 'template', templateId }。
function defaultWeeklyPlanDays() {
  return Array.from({ length: 7 }, () => ({ kind: 'rest' }));
}

function loadWeeklyPlans() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.weeklyPlans);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveWeeklyPlans(plans) {
  localStorage.setItem(STORAGE_KEYS.weeklyPlans, JSON.stringify(plans));
}

// 名前を付けて新しいプリセットを作成し、一覧の先頭に追加する(他の保存済みデータと同じ新しい順)。
// 曜日の割り当てはすべて「休み」の状態から始まり、週間プラン画面で組んでいく。
function createWeeklyPlan(name) {
  const plans = loadWeeklyPlans();
  const plan = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: new Date().toISOString(),
    days: defaultWeeklyPlanDays(),
  };
  plans.unshift(plan);
  saveWeeklyPlans(plans);
  return plan;
}

function updateWeeklyPlanDays(id, days) {
  const plans = loadWeeklyPlans();
  const plan = plans.find((p) => p.id === id);
  if (!plan) return plans;
  plan.days = days;
  saveWeeklyPlans(plans);
  return plans;
}

// プリセットを削除する。削除したものが使用中(active)だった場合は、残りの先頭を新しい使用中にする
// (残りが無ければ使用中なし)。
function deleteWeeklyPlan(id) {
  const plans = loadWeeklyPlans().filter((p) => p.id !== id);
  saveWeeklyPlans(plans);
  if (getActiveWeeklyPlanId() === id) {
    setActiveWeeklyPlanId(plans.length > 0 ? plans[0].id : null);
  }
  return plans;
}

// トレーニング中のセッション(currentSession)・タイマー状態のスナップショット。
// OSがバックグラウンドのタブ/PWAプロセスを終了させ、復帰時にページが丸ごとリロードされると
// (真のバックグラウンド実行ができないブラウザ/PWAの制約、js/cardio-timer.js冒頭コメント参照)
// メモリ上のcurrentSessionと計測中のタイマーが両方失われ、計測中の時間も記録の完了もできなくなる
// 不具合があったため追加した。記録中は随時ここへ保存し、次回起動時に未完了のセッションがあれば
// 復元する(js/app.jsのrestoreActiveSessionIfAny/persistActiveSessionSnapshot)。
function saveActiveSessionSnapshot(snapshot) {
  try {
    localStorage.setItem(STORAGE_KEYS.activeSession, JSON.stringify(snapshot));
  } catch (e) {
    // 保存に失敗しても記録画面の操作自体は継続する
  }
}

function loadActiveSessionSnapshot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.activeSession);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function clearActiveSessionSnapshot() {
  localStorage.removeItem(STORAGE_KEYS.activeSession);
}

function getActiveWeeklyPlanId() {
  return localStorage.getItem(STORAGE_KEYS.activeWeeklyPlanId);
}

function setActiveWeeklyPlanId(id) {
  if (id) localStorage.setItem(STORAGE_KEYS.activeWeeklyPlanId, id);
  else localStorage.removeItem(STORAGE_KEYS.activeWeeklyPlanId);
}

// ===== データのバックアップ（書き出し/読み込み、2026-10-03〜） =====
// iPhoneのホーム画面に追加したWebアプリはアイコンごとに保存領域が分かれており、アイコンを削除すると
// データも消える。追加し直し・機種変更の前に端末内のデータを1つのJSONにまとめて書き出し、新しい方で
// 読み込めるようにする。対象は端末内のデータだけで、クラウド同期関連(ログイン状態・同期のON/OFF・
// 送信待ちキュー)と記録中のセッションは含めない(新しい方でログインし直せば以後は通常通り同期される。
// 記録のidは元のまま復元されるため、Supabase側のlocal_idによるupsert/削除とも食い違わない)。
const BACKUP_FORMAT = 'compstack-backup';
const BACKUP_VERSION = 1;
const BACKUP_KEYS = [
  'settings', 'history', 'favorites', 'customTemplates', 'weeklyPlans', 'activeWeeklyPlanId',
  'streak', 'theme', 'bodyWeightLog', 'warmupSetsEnabled',
];
// クラウド同期の送信待ちキュー(js/sync.jsのPENDING_SYNC_KEYと同じ値)。バックアップには含めない。
const PENDING_SYNC_STORAGE_KEY = 'training-menu:pending-sync';

function buildBackupObject() {
  const data = {};
  BACKUP_KEYS.forEach((name) => {
    const raw = localStorage.getItem(STORAGE_KEYS[name]);
    if (raw != null) data[STORAGE_KEYS[name]] = raw;
  });
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
}

// 読み込む値ごとの形の検証。読み込んだ後にアプリ側の各処理(履歴の集計・お気に入り判定・週間プラン等)が
// 想定外の形で落ちて起動できなくなるのを防ぐため、書き込む前にすべて検証する(2026-10-03 Codexレビュー指摘)。
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validateHistoryValue(history) {
  if (!Array.isArray(history)) return false;
  const ids = new Set();
  return history.every((s) => {
    if (!isPlainObject(s) || typeof s.id !== 'string' || !s.id || ids.has(s.id)) return false;
    ids.add(s.id);
    if (Number.isNaN(new Date(s.date).getTime()) || !Array.isArray(s.exercises)) return false;
    return s.exercises.every((ex) => isPlainObject(ex) && typeof ex.exerciseId === 'string'
      && (ex.type === 'cardio' || (Array.isArray(ex.sets) && ex.sets.every(isPlainObject))));
  });
}

const BACKUP_VALIDATORS = {
  settings: (v) => isPlainObject(v),
  history: validateHistoryValue,
  favorites: (v) => Array.isArray(v) && v.every((id) => typeof id === 'string'),
  customTemplates: (v) => Array.isArray(v) && v.every((t) => isPlainObject(t) && typeof t.id === 'string'),
  weeklyPlans: (v) => Array.isArray(v) && v.every((p) => isPlainObject(p) && typeof p.id === 'string' && Array.isArray(p.days)),
  activeWeeklyPlanId: null, // 生の文字列(JSONではない)
  streak: (v) => isPlainObject(v),
  theme: null, // 生の文字列。loadThemeが想定外の値を既定に戻すので検証不要
  bodyWeightLog: (v) => isPlainObject(v) && Object.values(v).every((kg) => Number.isFinite(Number(kg))),
  warmupSetsEnabled: null, // 'true'/'false'の生文字列
};

// 読み込む前に中身を検証し、確認画面に出す概要を返す。不正ならErrorを投げる(この時点では何も書き込まない)。
function parseBackupText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error('バックアップのファイルとして読み取れませんでした');
  }
  if (!isPlainObject(parsed) || parsed.format !== BACKUP_FORMAT || !isPlainObject(parsed.data)) {
    throw new Error('Compstackのバックアップファイルではありません');
  }
  if (!Number.isInteger(parsed.version) || parsed.version < 1) {
    throw new Error('Compstackのバックアップファイルではありません');
  }
  if (parsed.version > BACKUP_VERSION) {
    throw new Error('新しいバージョンのアプリで書き出されたファイルです。アプリを更新してから読み込んでください');
  }
  const data = {};
  BACKUP_KEYS.forEach((name) => {
    const key = STORAGE_KEYS[name];
    if (!(key in parsed.data)) return; // 書き出し元に無かった項目(読み込むと空に戻る)
    const raw = parsed.data[key];
    // 認識できる項目なのに形が違う場合は「無かった」扱いにせず読み込み自体を止める
    // (黙って捨てると、確認画面の件数と食い違ったまま既存データを消してしまうため)。
    if (typeof raw !== 'string') throw new Error('バックアップの中身が壊れています');
    const validate = BACKUP_VALIDATORS[name];
    if (validate) {
      let value;
      try { value = JSON.parse(raw); } catch (e) { throw new Error('バックアップの中身が壊れています'); }
      if (!validate(value)) throw new Error('バックアップの中身が壊れています');
    }
    data[key] = raw;
  });
  const history = JSON.parse(data[STORAGE_KEYS.history] || '[]');
  const bodyWeightCount = Object.keys(JSON.parse(data[STORAGE_KEYS.bodyWeightLog] || '{}')).length;
  return { data, exportedAt: parsed.exportedAt, sessionCount: history.length, bodyWeightCount };
}

// バックアップの内容で端末内のデータを置き換える(バックアップに無い項目は空に戻す)。
// 途中で保存に失敗した(容量不足等)場合は、書き換える前の値にすべて戻してからErrorを投げる
// (一部だけ置き換わった中途半端な状態を残さないため)。
// クラウド同期の送信待ちキューは、置き換え後の記録と矛盾する操作だけを取り除く:
// 復元した記録に対する削除予約(実行されるとクラウド側から消えてしまう)と、復元後に存在しない
// 記録の送信予約。それ以外(復元した記録の送信・復元後に無い記録の削除)は正しい操作なので残す。
function applyBackupData(data) {
  const keys = BACKUP_KEYS.map((name) => STORAGE_KEYS[name]).concat(PENDING_SYNC_STORAGE_KEY);
  const previous = {};
  keys.forEach((key) => { previous[key] = localStorage.getItem(key); });
  try {
    BACKUP_KEYS.forEach((name) => {
      const key = STORAGE_KEYS[name];
      if (key in data) localStorage.setItem(key, data[key]);
      else localStorage.removeItem(key);
    });
    const restoredIds = new Set(JSON.parse(data[STORAGE_KEYS.history] || '[]').map((s) => s.id));
    let queue = [];
    try { queue = JSON.parse(previous[PENDING_SYNC_STORAGE_KEY] || '[]'); } catch (e) { queue = []; }
    if (Array.isArray(queue) && queue.length) {
      const kept = queue.filter((item) => (item && item.op === 'delete'
        ? !restoredIds.has(item.localId)
        : item && restoredIds.has(item.localId)));
      localStorage.setItem(PENDING_SYNC_STORAGE_KEY, JSON.stringify(kept));
    }
  } catch (e) {
    keys.forEach((key) => {
      try {
        if (previous[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, previous[key]);
      } catch (e2) { /* 元に戻す処理自体の失敗は無視(できる限り戻す) */ }
    });
    throw new Error('保存に失敗したため読み込みを取り消しました（端末の空き容量を確認してください）');
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    loadSettings, saveSettings, loadHistory, saveSession, loadTrainingStreak, getTrainingStreak, refreshTrainingStreak,
    clearHistory, deleteSession, deleteSessionsByDateKey, findLastPerformance,
    loadFavorites, isFavoriteExercise, toggleFavoriteExercise, recentExerciseIds,
    loadCustomTemplates, saveCustomTemplate, deleteCustomTemplate,
    defaultWeeklyPlanDays, loadWeeklyPlans, saveWeeklyPlans, createWeeklyPlan, updateWeeklyPlanDays,
    deleteWeeklyPlan, getActiveWeeklyPlanId, setActiveWeeklyPlanId,
    saveActiveSessionSnapshot, loadActiveSessionSnapshot, clearActiveSessionSnapshot,
    loadTheme, saveTheme,
    loadBodyWeightLog, saveBodyWeightEntry, deleteBodyWeightEntry, bodyWeightEntriesSorted,
    loadWarmupSetsEnabled, saveWarmupSetsEnabled,
  };
}
