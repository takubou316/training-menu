// 入力（部位・器具・時間・レベル・目的）からその日のメニューを組み立てる純粋関数群。
// AIには文章生成させず、あらかじめ用意した種目DB(exercises-data.js)とルール(rules.js)の組み合わせだけで決定的に組み立てる。

// 動作パターンごとの動的ウォームアップ（本番動作の可動域確認・体温上昇が目的）。
// descriptionは「なぜこれをやるのか」、forExercisesは実際のメニュー生成時に紐づく種目名を後から埋める。
const DYNAMIC_WARMUP_BY_PATTERN = {
  squat: { label: 'ボディウェイトスクワット 10回', description: 'しゃがむ動作に使う股関節・膝・足首を温め、可動域を確認する。' },
  hinge: { label: 'ヒップヒンジ（お尻を後ろに引く動作）10回', description: '膝を軽く曲げたままお尻を後ろに引く練習。股関節から曲げる感覚を本セット前に掴んでおく。' },
  push_horizontal: { label: '肩甲骨まわし＋腕立て伏せの姿勢キープ10秒×2', description: '肩甲骨を動かして肩まわりをほぐし、体を一直線に保つ感覚を確認する。' },
  push_vertical: { label: '肩まわし＋アームサークル前後各10回', description: '腕を大きく前後に回して肩関節の可動域を広げ、頭上に押し上げる動きに備える。' },
  pull_horizontal: { label: 'バンドプルアパートまたは肩甲骨寄せ10回', description: '肩甲骨を寄せる動きを繰り返し、引く動作で背中を使う感覚を温める。' },
  pull_vertical: { label: 'ラットストレッチ（腕を上げて体側伸ばし）10回', description: '腕を上げて体側を伸ばし、広背筋・肩まわりをほぐしておく。' },
  core: { label: 'デッドバグ（仰向け対角伸ばし）左右5回ずつ', description: '腹に軽く力を入れたまま手足を動かし、体幹を安定させる感覚を確認する。' },
  isolation: { label: '対象部位の関節を大きく動かすリラックス運動10回', description: 'これから使う関節を無理のない範囲で大きく動かし、血流を上げておく。' },
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

// 気になる部位・痛みがある部位に負担がかかりやすい種目をあらかじめ除外する。
// あくまで一般的な目安による除外であり、医学的な診断・アドバイスではない。
function filterByPainAreas(exercises, painAreas) {
  if (!painAreas || painAreas.length === 0) return exercises;
  return exercises.filter((ex) => !(ex.riskAreas || []).some((area) => painAreas.includes(area)));
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
    demoMedia: exercise.demoMedia || null,
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

function generateMenu({ parts, equipment, minutes, level, goal, painAreas = [] }) {
  let pool = filterByEquipment(EXERCISES, equipment);
  pool = filterByPainAreas(pool, painAreas);
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
    dynamic: Array.from(patternsUsed).map((p) => {
      const info = DYNAMIC_WARMUP_BY_PATTERN[p] || DYNAMIC_WARMUP_BY_PATTERN.isolation;
      const forExercises = chosen.filter((ex) => ex.pattern === p).map((ex) => ex.name);
      return { label: info.label, description: info.description, forExercises };
    }),
  };

  const cooldown = {
    static: Array.from(musclesUsed).map((m) => STATIC_STRETCH_BY_MUSCLE[m]).filter(Boolean),
    general: '深呼吸を意識しながら1〜2分クールダウン',
  };

  return {
    warmup,
    main,
    cooldown,
    generatedAt: new Date().toISOString(),
    params: { parts, equipment, minutes, level, goal, painAreas },
  };
}

if (typeof module !== 'undefined') {
  module.exports = { generateMenu };
}
