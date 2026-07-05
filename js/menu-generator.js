// 入力（部位・器具・時間・レベル・目的）からその日のメニューを組み立てる純粋関数群。
// AIには文章生成させず、あらかじめ用意した種目DB(exercises-data.js)とルール(rules.js)の組み合わせだけで決定的に組み立てる。

// 動作パターンごとの動的ウォームアップ（本番動作の可動域確認・体温上昇が目的）
const DYNAMIC_WARMUP_BY_PATTERN = {
  squat: 'ボディウェイトスクワット 10回',
  hinge: 'ヒップヒンジ（お尻を後ろに引く動作）10回',
  push_horizontal: '肩甲骨まわし＋腕立て伏せの姿勢キープ10秒×2',
  push_vertical: '肩まわし＋アームサークル前後各10回',
  pull_horizontal: 'バンドプルアパートまたは肩甲骨寄せ10回',
  pull_vertical: 'ラットストレッチ（腕を上げて体側伸ばし）10回',
  core: 'デッドバグ（仰向け対角伸ばし）左右5回ずつ',
  isolation: '対象部位の関節を大きく動かすリラックス運動10回',
};

// 部位ごとの静的クールダウンストレッチ（保持時間20〜30秒が一般的な目安）
const STATIC_STRETCH_BY_MUSCLE = {
  chest: '胸のストレッチ（壁に手をつき体を開く）20〜30秒',
  back: '広背筋ストレッチ（腕を前に伸ばし背中を丸める）20〜30秒',
  shoulders: '肩のストレッチ（腕を体の前で抱える）20〜30秒 左右',
  biceps: '前腕〜二頭筋ストレッチ（手のひらを反らす）20〜30秒',
  triceps: '三頭筋ストレッチ（腕を頭の後ろに）20〜30秒 左右',
  quads: '大腿四頭筋ストレッチ（片足を後ろに曲げて持つ）20〜30秒 左右',
  hamstrings: 'ハムストリングスストレッチ（脚を伸ばし前屈）20〜30秒 左右',
  glutes: '臀筋ストレッチ（座って足を組み前屈）20〜30秒 左右',
  calves: 'ふくらはぎストレッチ（壁を押し片足を後ろに引く）20〜30秒 左右',
  abs: '体幹のストレッチ（うつ伏せで上体を起こす）20〜30秒',
};

function filterByEquipment(exercises, equipmentAvailable) {
  return exercises.filter((ex) => ex.equipment.some((e) => equipmentAvailable.includes(e)));
}

function buildSetPlan(exercise, level, goal) {
  const levelInfo = LEVELS[level];
  const goalInfo = GOALS[goal];
  const sets = exercise.category === 'compound' ? levelInfo.setsCompound : levelInfo.setsIsolation;
  const restSec = goalInfo.restSec[exercise.category];
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    category: exercise.category,
    primary: exercise.primary,
    unilateral: exercise.unilateral,
    sets,
    repsMin: goalInfo.repsRange[0],
    repsMax: goalInfo.repsRange[1],
    restSec,
    warmupSets: exercise.category === 'compound' ? levelInfo.warmupSets : 0,
    note: exercise.note || '',
    description: exercise.description || '',
  };
}

function pickFullBodyExercises(pool, exerciseCount) {
  const selected = [];
  const usedIds = new Set();

  // まず主要な動作パターンを1つずつ、複合種目優先で埋める
  for (const pattern of PATTERN_ORDER) {
    if (selected.length >= exerciseCount) break;
    if (pattern === 'isolation') continue;
    const candidates = pool
      .filter((ex) => ex.pattern === pattern && !usedIds.has(ex.id))
      .sort((a, b) => (a.category === 'compound' ? -1 : 1) - (b.category === 'compound' ? -1 : 1));
    if (candidates.length > 0) {
      selected.push(candidates[0]);
      usedIds.add(candidates[0].id);
    }
  }

  // 残り枠は未使用の腕・ふくらはぎ・体幹の種目で埋める（大きい筋群を優先済みなので仕上げの部位を追加）
  const fillOrder = ['abs', 'biceps', 'triceps', 'calves'];
  let fillIndex = 0;
  while (selected.length < exerciseCount && fillIndex < fillOrder.length * 3) {
    const muscle = fillOrder[fillIndex % fillOrder.length];
    const candidate = pool.find((ex) => ex.primary.includes(muscle) && !usedIds.has(ex.id));
    if (candidate) {
      selected.push(candidate);
      usedIds.add(candidate.id);
    }
    fillIndex += 1;
  }

  return selected;
}

function pickTargetedExercises(pool, muscleGroups, exerciseCount) {
  const selected = [];
  const usedIds = new Set();
  const perMuscleCandidates = {};
  muscleGroups.forEach((muscle) => {
    perMuscleCandidates[muscle] = pool
      .filter((ex) => ex.primary.includes(muscle))
      .sort((a, b) => (a.category === 'compound' ? -1 : 1) - (b.category === 'compound' ? -1 : 1));
  });

  let round = 0;
  while (selected.length < exerciseCount) {
    let addedInRound = false;
    for (const muscle of muscleGroups) {
      if (selected.length >= exerciseCount) break;
      const candidates = perMuscleCandidates[muscle].filter((ex) => !usedIds.has(ex.id));
      if (candidates[round]) {
        selected.push(candidates[round]);
        usedIds.add(candidates[round].id);
        addedInRound = true;
      }
    }
    round += 1;
    if (!addedInRound) break; // どの部位ももう候補が無い
  }
  return selected;
}

function generateMenu({ parts, equipment, minutes, level, goal }) {
  const pool = filterByEquipment(EXERCISES, equipment);
  const exerciseCount = exerciseCountForTime(minutes);
  const isFullBody = parts.includes('fullbody');

  const chosen = isFullBody
    ? pickFullBodyExercises(pool, exerciseCount)
    : pickTargetedExercises(pool, parts, exerciseCount);

  const main = chosen.map((ex) => buildSetPlan(ex, level, goal));

  const patternsUsed = new Set(chosen.map((ex) => ex.pattern));
  const musclesUsed = new Set(chosen.flatMap((ex) => ex.primary));

  const warmup = {
    general: '軽い有酸素運動（足踏み・その場ジョグなど）5分で体温を上げる',
    dynamic: Array.from(patternsUsed).map((p) => DYNAMIC_WARMUP_BY_PATTERN[p] || DYNAMIC_WARMUP_BY_PATTERN.isolation),
  };

  const cooldown = {
    static: Array.from(musclesUsed).map((m) => STATIC_STRETCH_BY_MUSCLE[m]).filter(Boolean),
    general: '深呼吸を意識しながら1〜2分クールダウン',
  };

  return { warmup, main, cooldown, generatedAt: new Date().toISOString(), params: { parts, equipment, minutes, level, goal } };
}

if (typeof module !== 'undefined') {
  module.exports = { generateMenu };
}
