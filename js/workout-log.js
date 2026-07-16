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

// 有酸素種目の消費カロリー目安。運動生理学でよく使われる簡易式
// 「kcal = MET × 体重(kg) × 時間(h)」（出典はexercises-data.jsのコメント参照）。
// 以前はRPE(きつさ)による独自の強度補正を掛けていたが、根拠のない自作の式だった上、
// レジスタンストレーニング向けのRPE(Reps in Reserveベース)を有酸素に流用すること自体が
// 概念として合っていなかったため撤廃した。種目ごとのMET値の違い(ウォーキング/ランニング等)で
// 強度差はある程度表現されている。
function estimateCardioCalories(met, bodyWeightKg, durationMinutes) {
  return met * bodyWeightKg * (Number(durationMinutes) / 60);
}

function createSessionFromMenu(menu, bodyWeightKg) {
  return {
    date: new Date().toISOString(),
    goal: menu.params.goal,
    warmup: menu.warmup,
    cooldown: menu.cooldown,
    exercises: menu.main.map((item) => {
      if (item.type === 'cardio') {
        return {
          exerciseId: item.exerciseId,
          name: item.name,
          type: 'cardio',
          primary: item.primary,
          hasDistance: item.hasDistance,
          met: item.met,
          description: item.description,
          demoMedia: item.demoMedia,
          duration: 0,
          distance: item.hasDistance ? 0 : null,
          restLog: [], // cardio-timer.jsの「休憩」で記録される休憩区間(開始時刻・秒数)の履歴
          done: false,
        };
      }
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
        primary: item.primary,
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
    if (ex.type === 'cardio') return total; // 有酸素は重量の概念がないため挙上量には含めない
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
    exercises: session.exercises.map((e) => (e.type === 'cardio'
      ? {
        exerciseId: e.exerciseId,
        name: e.name,
        type: 'cardio',
        duration: e.duration,
        distance: e.distance,
        restLog: e.restLog || [],
        met: e.met,
        done: e.done,
      }
      : {
        exerciseId: e.exerciseId,
        name: e.name,
        sets: e.sets,
      })),
  };
  saveSession(record);
  return record;
}

// 指定した種目の、過去のセッションごとの進捗値を古い→新しい順で返す（グラフ表示用）。
// 種目のタイプによって「何を見れば分かりやすいか」が違うため、指標を出し分ける:
// - 保持時間系(プランク等): そのセットで一番長く保持できた秒数
// - 自重種目(プッシュアップ等): 重量という概念がわかりにくいので、一番多くできた回数
// - 重量を設定するタイプ(ダンベル/バーベル/マシン): 一番重いセットの重量(その時の回数も内訳として保持)
// 以前は重量と回数を推定1RMの式で1つの数値にまとめていたが、Epley式は本来コンパウンド種目の
// 低レップ(〜10回程度)向けの推定式で、高レップのセットやアイソレーション種目では誤差が大きく
// 当てにならないと分かったため、種目タイプ別に素直な実測値を見せる方式に変更した。
function exerciseProgressSeries(exerciseId, exerciseMeta, limit) {
  const history = loadHistory(); // 新しい順
  const holdBased = exerciseMeta.holdBased;
  const isBodyweight = isBodyweightLoadExercise(exerciseMeta);
  const points = [];
  for (const session of history) {
    const ex = session.exercises.find((e) => e.exerciseId === exerciseId);
    if (!ex) continue;
    if (exerciseMeta.type === 'cardio') {
      if (!ex.done || !ex.duration) continue;
      // 距離が測れる種目(屋外)は距離を、室内マシン系は時間を進捗の目安にする
      const value = exerciseMeta.hasDistance ? Number(ex.distance) || 0 : Number(ex.duration) || 0;
      if (value <= 0) continue;
      points.push({ date: session.date, value, duration: Number(ex.duration) || 0 });
      if (limit && points.length >= limit) break;
      continue;
    }
    const workingSets = ex.sets.filter((s) => s.done && !s.isWarmup);
    if (workingSets.length === 0) continue;
    if (holdBased || isBodyweight) {
      const value = Math.max(...workingSets.map((s) => Number(s.reps) || 0));
      points.push({ date: session.date, value });
    } else {
      let best = null;
      workingSets.forEach((s) => {
        const weight = Number(s.weight) || 0;
        const reps = Number(s.reps) || 0;
        if (!best || weight > best.value) best = { value: weight, reps };
      });
      if (!best) continue;
      points.push({ date: session.date, ...best });
    }
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
    exerciseProgressSeries, overallVolumeSeries, estimateCardioCalories,
  };
}
