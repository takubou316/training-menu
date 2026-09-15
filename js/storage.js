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
};

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

// 既存履歴がある状態で機能を追加した場合も、初回更新時に過去の連続日数を引き継ぐ。
function getTrainingStreak() {
  const saved = loadTrainingStreak();
  if (saved) return saved;
  const derived = calculateTrainingStreak(loadHistory());
  if (derived) saveTrainingStreak(derived);
  return derived;
}

// セッションを記録した日単位で継続日数を更新する。同日中の複数記録は1日として扱う。
function updateTrainingStreak(sessionDate) {
  const today = localDateKey(sessionDate);
  if (!today) return loadTrainingStreak();

  const current = getTrainingStreak();
  if (current && current.last === today) return current;

  const next = {
    last: today,
    count: current && current.last === previousDateKey(today) ? current.count + 1 : 1,
  };
  saveTrainingStreak(next);
  return next;
}

// トレーニング記録だけを削除する（お気に入り・体重などの設定は残す）。
function clearHistory() {
  localStorage.removeItem(STORAGE_KEYS.history);
}

// 記録一覧から特定の1回分だけを削除する（他の記録には影響しない）。
function deleteSession(id) {
  const history = loadHistory().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
  return history;
}

// 指定した日付(dateKey、localDateKey形式)に行った記録をまとめて削除する（他の日には影響しない）。
// 1日に複数回記録している場合(記録画面：カレンダー統合の設計メモ参照)もすべて対象になる。
function deleteSessionsByDateKey(dateKey) {
  const history = loadHistory().filter((s) => localDateKey(s.date) !== dateKey);
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
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

if (typeof module !== 'undefined') {
  module.exports = {
    loadSettings, saveSettings, loadHistory, saveSession, loadTrainingStreak, getTrainingStreak, updateTrainingStreak,
    clearHistory, deleteSession, deleteSessionsByDateKey, findLastPerformance,
    loadFavorites, isFavoriteExercise, toggleFavoriteExercise, recentExerciseIds,
    loadCustomTemplates, saveCustomTemplate, deleteCustomTemplate,
    defaultWeeklyPlanDays, loadWeeklyPlans, saveWeeklyPlans, createWeeklyPlan, updateWeeklyPlanDays,
    deleteWeeklyPlan, getActiveWeeklyPlanId, setActiveWeeklyPlanId,
    saveActiveSessionSnapshot, loadActiveSessionSnapshot, clearActiveSessionSnapshot,
  };
}
