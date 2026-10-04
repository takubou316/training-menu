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
      // 体重を一度も記録していない間は仮の値(60kg)での推定なので、その旨とホームでの記録を案内する。
      const hasWeight = typeof bodyWeightHasStoredValue === 'function' && bodyWeightHasStoredValue();
      return {
        text: hasWeight
          ? `初回記録です。体重${bodyWeightKg}kgから負荷を約${estWeight}kgと推定しています。フォームを優先しましょう。`
          : `初回記録です。仮の体重${bodyWeightKg}kgから負荷を約${estWeight}kgと推定しています（ホームで今日の体重を記録すると正確になります）。フォームを優先しましょう。`,
        weight: estWeight,
      };
    }
    const repsList = last.sets.map((s) => s.reps).join('/');
    return {
      text: `前回 ${repsList}回。負荷は体重から自動計算（約${estWeight}kg）されるので、レップ数を伸ばすことを目指しましょう。`,
      weight: estWeight,
    };
  }

  // 保持時間系(プランク等)は「重量」という概念自体がなく(記録画面でも重量スライダーは
  // 表示していない)、重量ベースの提案文をそのまま使うと「前回0kg×45秒。同じ重量で...」の
  // ように意味のない「0kg」が出てしまうため、保持秒数だけを見て提案する専用の分岐にする。
  if (planItem.holdBased) {
    const lastHold = findLastPerformance(planItem.exerciseId);
    if (!lastHold) {
      return { text: '初回記録です。フォームを優先し、無理のない時間から始めましょう。', weight: null };
    }
    const secList = lastHold.sets.map((s) => s.reps).join('/');
    const bestSec = Math.max(...lastHold.sets.map((s) => Number(s.reps) || 0));
    return {
      text: `前回 ${secList}秒。今回は${bestSec}秒以上を目指しましょう。`,
      weight: null,
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
function estimateCardioCalories(met, bodyWeightKg, durationSec) {
  return met * bodyWeightKg * (Number(durationSec) / 3600);
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
      // ウォームアップセットを入れるかはユーザー設定(loadWarmupSetsEnabled)に従う。記録中に
      // 切り替えた時に入れ直せるよう、本来入る数と重量・回数の初期値は設定に関わらず保持しておく
      // (applyWarmupSetsSetting参照)。
      const warmupSetTemplate = { weight: String(warmupWeight), reps: String(defaultReps), rpe: String(defaultRpe) };
      const plannedWarmupSets = item.warmupSets || 0;
      const warmupSetEntries = loadWarmupSetsEnabled() ? buildWarmupSetEntries(plannedWarmupSets, warmupSetTemplate) : [];
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
        plannedWarmupSets,
        warmupSetTemplate,
        sets: [...warmupSetEntries, ...workingSetEntries],
      };
    }),
  };
}

function buildWarmupSetEntries(count, template) {
  return Array.from({ length: count }, () => ({ ...template, done: false, isWarmup: true }));
}

// 記録中のセッションに、ウォームアップセットのON/OFF設定を反映し直す(記録画面で切り替えた時用)。
// OFF: まだ完了していないウォームアップセットを取り除く(完了済みのものは実際にやった記録なので残す)。
// ON: ウォームアップセットが1つも無い種目にだけ、本来の数を先頭へ入れ直す。
// plannedWarmupSets/warmupSetTemplateを持たない古いスナップショット(この機能の追加前に始めた記録)は
// メニュー生成時と同じ基準(コンパウンド種目なら1セット)で補う。
function applyWarmupSetsSetting(session, enabled) {
  session.exercises.forEach((ex) => {
    if (ex.type === 'cardio' || !Array.isArray(ex.sets)) return;
    if (!enabled) {
      ex.sets = ex.sets.filter((s) => !s.isWarmup || s.done);
      return;
    }
    if (ex.sets.some((s) => s.isWarmup)) return;
    const count = ex.plannedWarmupSets != null ? ex.plannedWarmupSets : (ex.category === 'compound' ? 1 : 0);
    const firstWorking = ex.sets[0] || {};
    const template = ex.warmupSetTemplate || {
      weight: String(Math.round((Number(firstWorking.weight) || 0) * 0.5 * 2) / 2),
      reps: firstWorking.reps || '10',
      rpe: String(RPE_SCALE.default),
    };
    ex.sets = [...buildWarmupSetEntries(count, template), ...ex.sets];
  });
}

// ===== 「完了」したかの判定（2026-10-03〜） =====
// 有酸素は「完了」を押し忘れても、時間が計測・入力されていれば実施したものとして扱う
// (ウォーキングを計測したのに完了を押さずに記録を終え、記録に残らなかった実例があったため)。
function isCardioRecorded(ex) {
  return !!ex.done || Number(ex.duration) > 0;
}

// その種目に記録として残る内容があるか。筋トレ系はウォームアップ以外の完了セットが1つ以上あること。
// ウォームアップだけ完了した種目は記録しない(履歴の表示はウォームアップを除いて出すため、残すと
// 「未記録」の行になってしまう。2026-10-03 Codexレビューで指摘されたが、要望に沿って意図的にこの判定)。
function exerciseHasRecord(ex) {
  if (ex.type === 'cardio') return isCardioRecorded(ex);
  return Array.isArray(ex.sets) && ex.sets.some((s) => s.done && !s.isWarmup);
}

function sessionHasAnyRecord(session) {
  return !!session && session.exercises.some(exerciseHasRecord);
}

// 「記録して終了」の前の警告に出す、未完了の内訳。
// skipped: 完了が1つも無く、記録から丸ごと外れる種目名 / partial: 一部の本セットが未完了の種目名(その分だけ外れる)
function sessionIncompleteSummary(session) {
  const skipped = [];
  const partial = [];
  session.exercises.forEach((ex) => {
    if (!exerciseHasRecord(ex)) skipped.push(ex.name);
    else if (ex.type !== 'cardio' && ex.sets.some((s) => !s.done && !s.isWarmup)) partial.push(ex.name);
  });
  return { skipped, partial };
}

// 総挙上量(重量×回数の単純合算)は種目をまたいで足しても意味が薄いため、2026-10-02に表示ごと廃止し、
// 記録にも保存しなくなった(以前の記録に残っているvolumeフィールドは使われないまま残る)。
// 記録として見た時に「未記録」の行ができないよう、完了が1つも無い種目と未完了のセットは保存しない
// (2026-10-03〜。それ以前の記録には未完了の種目・セットが残っている場合がある)。
function finalizeSession(session) {
  const record = {
    id: `session-${Date.now()}`,
    date: session.date,
    goal: session.goal,
    durationSec: session.durationSec || 0,
    exercises: session.exercises.filter(exerciseHasRecord).map((e) => (e.type === 'cardio'
      ? {
        exerciseId: e.exerciseId,
        name: e.name,
        type: 'cardio',
        duration: e.duration,
        distance: e.distance,
        restLog: e.restLog || [],
        met: e.met,
        done: true,
      }
      : {
        exerciseId: e.exerciseId,
        name: e.name,
        sets: e.sets.filter((s) => s.done),
      })),
  };
  saveSession(record);
  refreshTrainingStreak();
  // ローカル保存が完了した後に、クラウド同期が有効な場合だけ後追いで複製する(js/sync.js参照)。
  // 失敗してもローカルの記録には一切影響しない(常にローカルが正)、という設計方針を徹底するため
  // try/catchで包む(2026-09-07Codexレビュー指摘: queueSessionForSync内のlocalStorage書き込みが
  // QuotaExceededError等で同期的に例外を投げた場合、ここまで伝播してfinalizeSessionの呼び出し元
  // (記録画面の遷移処理)まで壊れてしまう可能性があった)。
  try {
    if (typeof queueSessionForSync === 'function') queueSessionForSync(record);
  } catch (e) {
    // ベストエフォートのため握りつぶす。ローカルの記録(record)は既に保存済みで無事。
  }
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
      if (!isCardioRecorded(ex) || !ex.duration) continue;
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

// 記録画面で完了した本セットを、種目別の進捗グラフと同じ指標に変換する。
// 過去最高そのものは exerciseProgressSeries から取得し、ここでは今回のセットの値だけを対応づける。
function exerciseProgressValue(exerciseMeta, set) {
  if (!exerciseMeta || exerciseMeta.type === 'cardio' || !set || set.isWarmup || !set.done) return null;
  if (exerciseMeta.holdBased || isBodyweightLoadExercise(exerciseMeta)) {
    return Number(set.reps) || 0;
  }
  return Number(set.weight) || 0;
}

// 保存済み履歴に対してのみ比較するため、初回記録は自己ベスト更新扱いにしない。
// 有酸素種目とウォームアップセットは対象外。
function isPersonalRecord(exercise, set) {
  const currentValue = exerciseProgressValue(exercise, set);
  if (currentValue === null) return false;
  const previousPoints = exerciseProgressSeries(exercise.exerciseId, exercise, 0);
  if (previousPoints.length === 0) return false;
  const previousBest = Math.max(...previousPoints.map((point) => point.value));
  return currentValue > previousBest;
}

if (typeof module !== 'undefined') {
  module.exports = {
    createSessionFromMenu, applyWarmupSetsSetting, finalizeSession, buildSuggestion,
    isCardioRecorded, exerciseHasRecord, sessionHasAnyRecord, sessionIncompleteSummary,
    exerciseProgressSeries, exerciseProgressValue, isPersonalRecord,
    estimateCardioCalories,
  };
}
