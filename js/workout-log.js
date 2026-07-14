// 生成されたメニューから「実施中セッション」の状態を作り、セットごとの実績記録・
// 前回実績を踏まえた重量/レップの提案（プログレッシブオーバーロード）を行う。

const LOWER_BODY_MUSCLES = ['quads', 'hamstrings', 'glutes', 'calves'];

// 自重種目は「重量」という概念がわかりにくい（プッシュアップは体重の何%も胸にかかっているわけではない）ため、
// 体重×推定負荷率(bodyweightLoadFactor)で自動計算し、ユーザーが手動で重量を入力する必要がないようにする。
function isBodyweightLoadExercise(planItem) {
  return !planItem.holdBased && planItem.equipment && planItem.equipment[0] === 'bodyweight';
}

function buildSuggestion(planItem, bodyWeightKg) {
  if (isBodyweightLoadExercise(planItem)) {
    const estWeight = Math.round(bodyWeightKg * planItem.bodyweightLoadFactor * 2) / 2;
    const last = findLastPerformance(planItem.exerciseId);
    if (!last) {
      return {
        text: `初回記録です。体重${bodyWeightKg}kgから負荷を約${estWeight}kgと推定しています。フォームを優先しましょう。`,
        weight: estWeight,
      };
    }
    const repsList = last.sets.map((s) => s.reps).join('/');
    return {
      text: `前回 ${repsList}回。負荷は体重から自動計算（約${estWeight}kg）されるので、レップ数を伸ばすことを目指しましょう。`,
      weight: estWeight,
    };
  }

  const last = findLastPerformance(planItem.exerciseId);
  if (!last) {
    return { text: '初回記録です。フォームを優先し、無理のない重量から始めましょう。', weight: null };
  }
  const sets = last.sets;
  const lastWeight = Number(sets[sets.length - 1].weight) || 0;
  const repsList = sets.map((s) => s.reps).join('/');
  const allAtTopRange = sets.every((s) => Number(s.reps) >= planItem.repsMax);
  const rpeValues = sets.map((s) => Number(s.rpe)).filter((v) => !Number.isNaN(v) && v > 0);
  const maxRpe = rpeValues.length ? Math.max(...rpeValues) : 0;
  const isLowerBody = planItem.primary.some((m) => LOWER_BODY_MUSCLES.includes(m));
  const increment = isLowerBody ? PROGRESSION.lowerBodyIncrementKg : PROGRESSION.upperBodyIncrementKg;

  if (allAtTopRange && (maxRpe === 0 || maxRpe <= PROGRESSION.rpeThresholdForWeightIncrease)) {
    const nextWeight = lastWeight + increment;
    return {
      text: `前回 ${lastWeight}kg×${repsList}。今回は${nextWeight}kgに挑戦してみましょう。`,
      weight: nextWeight,
    };
  }
  return {
    text: `前回 ${lastWeight}kg×${repsList}。同じ重量で目標レップ数(${planItem.repsMax}回)を目指しましょう。`,
    weight: lastWeight || null,
  };
}

function createSessionFromMenu(menu, bodyWeightKg) {
  return {
    date: new Date().toISOString(),
    goal: menu.params.goal,
    warmup: menu.warmup,
    cooldown: menu.cooldown,
    exercises: menu.main.map((item) => {
      const suggestion = buildSuggestion(item, bodyWeightKg);
      const defaultWeight = suggestion.weight != null ? suggestion.weight : 0;
      const defaultReps = item.holdBased ? 20 : Math.max(10, Math.round(item.repsMin / 10) * 10);
      const defaultRpe = RPE_SCALE.default;
      const warmupWeight = suggestion.weight != null ? Math.round(suggestion.weight * 0.5 * 2) / 2 : 0;
      const warmupSetEntries = Array.from({ length: item.warmupSets || 0 }, () => ({
        weight: String(warmupWeight),
        reps: String(defaultReps),
        rpe: String(defaultRpe),
        done: false,
        isWarmup: true,
      }));
      const workingSetEntries = Array.from({ length: item.sets }, () => ({
        weight: String(defaultWeight),
        reps: String(defaultReps),
        rpe: String(defaultRpe),
        done: false,
      }));
      return {
        exerciseId: item.exerciseId,
        name: item.name,
        category: item.category,
        unilateral: item.unilateral,
        restSec: item.restSec,
        repsMin: item.repsMin,
        repsMax: item.repsMax,
        description: item.description,
        demoMedia: item.demoMedia,
        holdBased: item.holdBased,
        equipment: item.equipment,
        suggestion,
        sets: [...warmupSetEntries, ...workingSetEntries],
      };
    }),
  };
}

function computeSessionVolume(session) {
  return session.exercises.reduce((total, ex) => {
    const exVolume = ex.sets.reduce((sum, s) => {
      if (!s.done || s.isWarmup) return sum;
      return sum + (Number(s.weight) || 0) * (Number(s.reps) || 0);
    }, 0);
    return total + exVolume;
  }, 0);
}

function finalizeSession(session) {
  const record = {
    id: `session-${Date.now()}`,
    date: session.date,
    goal: session.goal,
    volume: computeSessionVolume(session),
    durationSec: session.durationSec || 0,
    exercises: session.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      name: e.name,
      sets: e.sets,
    })),
  };
  saveSession(record);
  return record;
}

// 指定した種目の、過去のセッションごとの進捗値を古い→新しい順で返す（グラフ表示用）。
// 保持時間系はそのセットで一番長く保持できた秒数、それ以外は重量×回数の合計(挙上量)を使う。
function exerciseProgressSeries(exerciseId, holdBased, limit) {
  const history = loadHistory(); // 新しい順
  const points = [];
  for (const session of history) {
    const ex = session.exercises.find((e) => e.exerciseId === exerciseId);
    if (!ex) continue;
    const workingSets = ex.sets.filter((s) => s.done && !s.isWarmup);
    if (workingSets.length === 0) continue;
    const value = holdBased
      ? Math.max(...workingSets.map((s) => Number(s.reps) || 0))
      : workingSets.reduce((sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
    points.push({ date: session.date, value });
    if (limit && points.length >= limit) break;
  }
  return points.reverse();
}

// 直近セッションの総挙上量(volume)推移を古い→新しい順で返す（履歴画面の全体グラフ用）。
function overallVolumeSeries(limit) {
  const history = loadHistory(); // 新しい順
  const sliced = limit ? history.slice(0, limit) : history;
  return sliced.map((s) => ({ date: s.date, value: s.volume || 0 })).reverse();
}

if (typeof module !== 'undefined') {
  module.exports = {
    createSessionFromMenu, computeSessionVolume, finalizeSession, buildSuggestion,
    exerciseProgressSeries, overallVolumeSeries,
  };
}
