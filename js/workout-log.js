// 生成されたメニューから「実施中セッション」の状態を作り、セットごとの実績記録・
// 前回実績を踏まえた重量/レップの提案（プログレッシブオーバーロード）を行う。

const LOWER_BODY_MUSCLES = ['quads', 'hamstrings', 'glutes', 'calves'];

function buildSuggestion(planItem) {
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

function createSessionFromMenu(menu) {
  return {
    date: new Date().toISOString(),
    goal: menu.params.goal,
    warmup: menu.warmup,
    cooldown: menu.cooldown,
    exercises: menu.main.map((item) => {
      const suggestion = buildSuggestion(item);
      const warmupWeight = suggestion.weight != null ? Math.round(suggestion.weight * 0.5 * 2) / 2 : null;
      const warmupSetEntries = Array.from({ length: item.warmupSets || 0 }, () => ({
        weight: warmupWeight != null ? String(warmupWeight) : '',
        reps: '',
        rpe: '',
        done: false,
        isWarmup: true,
      }));
      const workingSetEntries = Array.from({ length: item.sets }, () => ({
        weight: suggestion.weight != null ? String(suggestion.weight) : '',
        reps: '',
        rpe: '',
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
    exercises: session.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      name: e.name,
      sets: e.sets,
    })),
  };
  saveSession(record);
  return record;
}

if (typeof module !== 'undefined') {
  module.exports = { createSessionFromMenu, computeSessionVolume, finalizeSession, buildSuggestion };
}
