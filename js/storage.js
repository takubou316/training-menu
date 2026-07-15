// localStorageへの永続化。バックエンドサーバーを持たないため、全データは端末内のみに保存される。

const STORAGE_KEYS = {
  settings: 'training-menu:settings',
  history: 'training-menu:history',
  favorites: 'training-menu:favorites',
  customTemplates: 'training-menu:custom-templates',
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

// トレーニング記録だけを削除する（お気に入り・体重などの設定は残す）。
function clearHistory() {
  localStorage.removeItem(STORAGE_KEYS.history);
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

if (typeof module !== 'undefined') {
  module.exports = {
    loadSettings, saveSettings, loadHistory, saveSession, clearHistory, findLastPerformance,
    loadFavorites, isFavoriteExercise, toggleFavoriteExercise, recentExerciseIds,
    loadCustomTemplates, saveCustomTemplate, deleteCustomTemplate,
  };
}
