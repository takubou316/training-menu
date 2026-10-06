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
  cardio: { label: 'ごく軽いペースで3〜5分', description: '本来のペースの半分以下の軽さから入り、心拍と関節を徐々に慣らしてから本セットのペースに上げる。' },
};

// 気になる部位(painAreas、日本語表記)から、対応する静的ストレッチの部位キー(STATIC_STRETCH_BY_MUSCLEの
// キー)への近似マッピング。クールダウンのストレッチ優先順位付け(buildWarmupAndCooldown)で使う。
// 「腰」は専用の腰ストレッチが用意DBに無いため、姿勢に関連する背中・体幹のストレッチで代用する。
// 「手首」は前腕〜二頭筋ストレッチ(手のひらを反らす動作)が実質的に手首のストレッチを兼ねるため対応させる。
const PAIN_AREA_TO_STRETCH_MUSCLES = {
  肩: ['shoulders'],
  腰: ['back', 'abs'],
  膝: ['quads', 'hamstrings', 'calves'],
  手首: ['biceps'],
};

// 部位ごとの静的クールダウンストレッチ（保持時間20〜30秒が一般的な目安）
const STATIC_STRETCH_BY_MUSCLE = {
  chest: {
    label: '胸のストレッチ（壁に手をつき体を開く）20〜30秒',
    description: '壁や柱に片手を肩の高さでつき、体を反対側にゆっくりひねって胸の前面を伸ばす。反動をつけず、伸びを感じる位置で止める。',
  },
  back: {
    label: '広背筋ストレッチ（腕を前に伸ばし背中を丸める）20〜30秒',
    description: '両腕を前に伸ばして手を組み、背中を丸めながら遠くへ伸ばす。肩甲骨の間が開く感覚を意識する。',
  },
  shoulders: {
    label: '肩のストレッチ（腕を体の前で抱える）20〜30秒 左右',
    description: '片腕を体の前でまっすぐ伸ばし、反対の腕で抱えるように胸に引き寄せる。肩の後ろ側が伸びる。左右とも行う。',
  },
  biceps: {
    label: '前腕〜二頭筋ストレッチ（手のひらを反らす）20〜30秒',
    description: '腕を前に伸ばし、反対の手で手のひらを手前に反らす。前腕から二頭筋にかけて伸びを感じる位置で止める。',
  },
  triceps: {
    label: '三頭筋ストレッチ（腕を頭の後ろに）20〜30秒 左右',
    description: '片腕を上げて肘を曲げ、頭の後ろに手を回す。反対の手で肘を軽く押して二の腕の裏を伸ばす。左右とも行う。',
  },
  quads: {
    label: '大腿四頭筋ストレッチ（片足を後ろに曲げて持つ）20〜30秒 左右',
    description: '片足で立ち（不安なら壁や椅子に掴まる）、反対の足首を持って後ろに曲げ、太もも前面を伸ばす。膝は体の前に出しすぎない。左右とも行う。',
  },
  hamstrings: {
    label: 'ハムストリングスストレッチ（脚を伸ばし前屈）20〜30秒 左右',
    description: '片脚を前に伸ばして座るか立ち、膝を伸ばしたまま上体を前に倒す。背中を丸めすぎず、太もも裏の伸びを感じる位置で止める。',
  },
  glutes: {
    label: '臀筋ストレッチ（座って足を組み前屈）20〜30秒 左右',
    description: '座った状態で片足首を反対の膝に乗せ、背筋を伸ばしたまま上体を前に倒す。お尻の外側が伸びる感覚を目安にする。',
  },
  calves: {
    label: 'ふくらはぎストレッチ（壁を押し片足を後ろに引く）20〜30秒 左右',
    description: '壁に手をつき、片足を後ろに引いてかかとを床につけたまま体重を前にかける。ふくらはぎの伸びを感じる位置で止める。',
  },
  abs: {
    label: '体幹のストレッチ（うつ伏せで上体を起こす）20〜30秒',
    description: 'うつ伏せから腕で上体を軽く起こし、腰は反らしすぎない範囲でお腹の前面を伸ばす。痛みが出る場合は無理をしない。',
  },
};

// STATIC_STRETCH_BY_MUSCLEのエントリを、ウォームアップ用の短時間版(10秒)に変換する。
// 『健康運動実践指導者 養成用テキスト』第8章Aによれば、ウォームアップの理想的な構成は
// 「①軽い有酸素運動→②関節を動かす体操→③主要部位の10秒程度の短い静的 or 動的ストレッチ」
// の3段階だが、以前はクールダウン用の本格的なストレッチ(20〜30秒保持)しか持っていなかった。
// クールダウンと全く同じ内容・同じやり方で保持時間だけ短くする、という教科書の考え方に沿い、
// 新規にストレッチ内容を作らずクールダウン用エントリを流用する(表記だけ「10秒」に変える)。
function toWarmupShortStretch(entry) {
  return { label: entry.label.replace('20〜30秒', '10秒'), description: entry.description };
}

function filterByEquipment(exercises, equipmentAvailable) {
  return exercises.filter((ex) => ex.equipment.some((e) => equipmentAvailable.includes(e)));
}

// 気になる部位・痛みがある部位に負担がかかりやすい種目をあらかじめ除外する。
// あくまで一般的な目安による除外であり、医学的な診断・アドバイスではない。
function filterByPainAreas(exercises, painAreas) {
  if (!painAreas || painAreas.length === 0) return exercises;
  return exercises.filter((ex) => !(ex.riskAreas || []).some((area) => painAreas.includes(area)));
}

// レベルが技術難度に見合わない種目(exercises-data.jsのminLevel参照)を除外する。
// 「レベル」は今までセット数・休憩時間にしか反映されておらず、初心者を選んでも
// バーベルスクワット・懸垂のような技術難度の高い種目がそのまま選ばれることがあった。
const LEVEL_RANK = { beginner: 0, intermediate: 1, advanced: 2 };
function filterByLevel(exercises, level) {
  const rank = LEVEL_RANK[level] != null ? LEVEL_RANK[level] : 0;
  return exercises.filter((ex) => LEVEL_RANK[ex.minLevel || 'beginner'] <= rank);
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
    pattern: exercise.pattern,
    minLevel: exercise.minLevel || null,
    unilateral: exercise.unilateral,
    sets,
    repsMin: goalInfo.repsRange[0],
    repsMax: goalInfo.repsRange[1],
    restSec,
    warmupSets: exercise.category === 'compound' ? levelInfo.warmupSets : 0,
    note: exercise.note || '',
    description: exercise.description || '',
    demoMedia: exercise.demoMedia || null,
    holdBased: exercise.holdBased || false,
    equipment: exercise.equipment,
    bodyweightLoadFactor: exercise.bodyweightLoadFactor != null ? exercise.bodyweightLoadFactor : 1,
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

// 部位を優先度順(muscleGroups)にラウンドロビンで回しながら、matchFnに一致する候補で
// selected/usedIdsをexerciseCountまで埋める(pickTargetedExercisesの内部処理)。
// 部位ごとに専用のインデックス(idx)を進めるのがポイントで、全部位共通のラウンド番号を
// そのままインデックスに使うと、他の部位と主動筋が重なる種目が使用済みになって配列から
// 欠けた時にラウンド番号とインデックスがズレ、まだ選べるはずの候補を飛ばしてしまう
// バグがあった。
function fillTargetedRoundRobin(selected, usedIds, pool, muscleGroups, matchFn, exerciseCount) {
  const perMuscleCandidates = {};
  const perMuscleIndex = {};
  muscleGroups.forEach((muscle) => {
    perMuscleCandidates[muscle] = pool
      .filter((ex) => matchFn(ex, muscle) && !usedIds.has(ex.id))
      .sort((a, b) => (a.category === 'compound' ? -1 : 1) - (b.category === 'compound' ? -1 : 1));
    perMuscleIndex[muscle] = 0;
  });

  let addedInRound = true;
  while (selected.length < exerciseCount && addedInRound) {
    addedInRound = false;
    for (const muscle of muscleGroups) {
      if (selected.length >= exerciseCount) break;
      const candidates = perMuscleCandidates[muscle];
      while (perMuscleIndex[muscle] < candidates.length && usedIds.has(candidates[perMuscleIndex[muscle]].id)) {
        perMuscleIndex[muscle] += 1;
      }
      if (perMuscleIndex[muscle] < candidates.length) {
        const ex = candidates[perMuscleIndex[muscle]];
        selected.push(ex);
        usedIds.add(ex.id);
        perMuscleIndex[muscle] += 1;
        addedInRound = true;
      }
    }
  }
}

function pickTargetedExercises(pool, muscleGroups, exerciseCount) {
  const selected = [];
  const usedIds = new Set();

  // まず主動筋(primary)が一致する種目から埋める
  fillTargetedRoundRobin(selected, usedIds, pool, muscleGroups, (ex, muscle) => ex.primary.includes(muscle), exerciseCount);

  // 主動筋だけでは目安数に届かない場合、補助筋(secondary)として関与する種目も候補に加える
  // (例: 上腕二頭筋を狙いたい時、二頭筋が補助的に働くローイング系種目も候補に含める)。
  // 器具やレベルを絞った時に種目数が1〜2個まで減ってしまうのを防ぐためのフォールバック。
  if (selected.length < exerciseCount) {
    fillTargetedRoundRobin(selected, usedIds, pool, muscleGroups, (ex, muscle) => ex.secondary.includes(muscle), exerciseCount);
  }

  return selected;
}

// エクササイズの配列(並び順)の原則。出典: JATIトレーニング指導者テキスト［実践編］3章2節
// 「エクササイズの配列」(p72〜73)の8原則のうち、選び終わった種目リストの並べ替えだけで
// 反映できるものを実装。「どれを選ぶか」(pickFullBodyExercises/pickTargetedExercises)は
// 変更せず、選んだ後の順番だけを直す（要望から作る専用。自分で作るは手動の並び順を尊重する
// ため対象外）。
// - 大筋群→小筋群、複合種目(多関節)→単関節: PATTERN_ORDER(squat/hinge/push/pull→core→
//   isolation)の並び順が既にこの考え方に沿っているので、そのインデックスをそのまま順位に使う
// - 姿勢支持筋(体幹)の種目は終盤に行う: pattern='core'または主動筋にabsを含む種目は最後尾
// - 高度なテクニックが要求される種目は疲労していない状態(=前の方)で行う: minLevel='intermediate'
//   （技術難度が高いとして初心者向けから除外している種目、exercises-data.jsの既存分類を流用した
//   近似で、教科書の「高度なテクニック」の定義そのものではない）の種目を、同じ階層内では先に並べる
function trainingOrderRank(ex) {
  if (ex.pattern === 'core' || (ex.primary || []).includes('abs')) return PATTERN_ORDER.length;
  const idx = PATTERN_ORDER.indexOf(ex.pattern);
  return idx === -1 ? PATTERN_ORDER.length - 1 : idx;
}

function sortByTrainingOrder(exercises) {
  return exercises.slice().sort((a, b) => {
    const rankDiff = trainingOrderRank(a) - trainingOrderRank(b);
    if (rankDiff !== 0) return rankDiff;
    const aAdvanced = a.minLevel === 'intermediate' ? 0 : 1;
    const bAdvanced = b.minLevel === 'intermediate' ? 0 : 1;
    return aAdvanced - bAdvanced;
  });
}

// 選んだ種目一覧（EXERCISESの生データ）から、動作パターン・部位に応じたウォームアップ/クールダウンを組み立てる。
// 「要望から作る」「自分で作る」どちらのモードからも同じロジックを使う。
// painAreas: 設定画面で選んだ「気になる部位」(肩/腰/膝/手首、日本語)。渡すとクールダウンの
// ストレッチの並び順に反映される(下記参照)。省略時(自分で作るで未取得の場合など)は空扱い。
// minutes: 「要望から作る」で選んだ全体の時間(分)。渡すと、ウォームアップ・クールダウンをその長さに
// 合わせる(2026-10-04〜)。教科書(docs/knowledge/warmup-cooldown-stretching.md)の「どちらも運動時間全体の
// 10%前後」「時間が取れない時は優先度の高い部位から」に沿って:
// ①有酸素は全体の10%(切り捨て、1〜5分) ②クールダウンのストレッチは短い日ほど優先度の高い部位に絞る
// (15分以下2つ・30分以下3つ) ③ウォームアップの10秒ストレッチは15分以下では省き(使う部位の準備は
// 動的ウォームアップとウォームアップセットで行う)、30分以下は2つまで ④15分以下は深呼吸も1分。
// 動的ウォームアップは本番の動作の準備なので時間に関わらず削らない。
// 省略時(自分で作る等)は従来どおり有酸素5分・全部位。
function buildWarmupAndCooldown(chosen, painAreas = [], minutes = null) {
  const patternsUsed = new Set(chosen.map((ex) => ex.pattern));
  const musclesUsed = new Set(chosen.flatMap((ex) => ex.primary));
  const total = Number(minutes) || 0;
  const isShort = total > 0 && total <= 15;
  const isMedium = total > 15 && total <= 30;
  const generalMin = total > 0 ? Math.min(5, Math.max(1, Math.floor(total / 10))) : 5;
  const stretchLimit = isShort ? 2 : isMedium ? 3 : Infinity;
  const warmupStretchLimit = isShort ? 0 : isMedium ? 2 : Infinity;

  // クールダウンのストレッチの並び順(優先順位)。教科書は「疲労感の強い部位／傷害歴のある部位」を
  // 優先すべきとしているため、以下の2段階で並べ替える(どちらも既存データからの近似・代理指標であり、
  // 本人の主観申告に基づくものではない点に注意):
  // 1. 気になる部位(painAreas)に近い部位のストレッチを最優先
  //    (該当する種目自体はfilterByPainAreasで既に除外済みだが、周辺部位のケアとして優先する意図)
  // 2. その次は、このセッションで主動筋として使われた回数が多い部位ほど先
  //    (疲労感の強さを、実際に申告してもらう代わりに使用頻度で近似する)
  const painMuscles = new Set(painAreas.flatMap((area) => PAIN_AREA_TO_STRETCH_MUSCLES[area] || []));
  const muscleFrequency = {};
  chosen.forEach((ex) => (ex.primary || []).forEach((m) => { muscleFrequency[m] = (muscleFrequency[m] || 0) + 1; }));

  const prioritizedStretches = Array.from(musclesUsed)
    .map((m) => ({ muscle: m, entry: STATIC_STRETCH_BY_MUSCLE[m] }))
    .filter((x) => x.entry)
    .sort((a, b) => {
      const painRank = (painMuscles.has(a.muscle) ? 0 : 1) - (painMuscles.has(b.muscle) ? 0 : 1);
      if (painRank !== 0) return painRank;
      return (muscleFrequency[b.muscle] || 0) - (muscleFrequency[a.muscle] || 0);
    })
    .map((x) => x.entry)
    .slice(0, stretchLimit);

  const warmup = {
    general: `軽い有酸素運動（足踏み・その場ジョグなど）${generalMin}分で体温を上げる`,
    generalMin, // 所要時間の見積もり(estimateMenuSeconds)用
    dynamic: Array.from(patternsUsed).map((p) => {
      const info = DYNAMIC_WARMUP_BY_PATTERN[p] || DYNAMIC_WARMUP_BY_PATTERN.isolation;
      const forExercises = chosen.filter((ex) => ex.pattern === p).map((ex) => ex.name);
      // estSec: 所要時間の見積もり用。有酸素は「ごく軽いペースで3〜5分」なので4分と見なす
      return { label: info.label, description: info.description, forExercises, estSec: p === 'cardio' ? 240 : DYNAMIC_WARMUP_SEC };
    }),
    // ①有酸素→②動的な体操(上のdynamic)の後に行う、③主要部位の短い静的ストレッチ(10秒)。
    // クールダウンと同じ部位(同じ優先順位・同じ絞り込み)を対象にし、保持時間だけ短い表記に変えて流用する。
    staticStretch: prioritizedStretches.slice(0, warmupStretchLimit).map(toWarmupShortStretch),
  };

  const cooldown = {
    static: prioritizedStretches,
    general: isShort ? '深呼吸を意識しながら1分クールダウン' : '深呼吸を意識しながら1〜2分クールダウン',
    generalSec: isShort ? 60 : 90, // 所要時間の見積もり(estimateMenuSeconds)用
  };

  return { warmup, cooldown };
}

// 「自分で作る」の種目ごとの目標(2026-10-06〜、それ以前はセット数3・8〜12回の固定)。
// timed: 時間で測るか(回数ならfalse)。種目データのholdBasedが既定だが、編集画面で切り替えられる
// (ハーフバーピーを「45秒」でも「20回」でも組めるように)。reps/secは切り替えても換算せず、
// それぞれの値を別々に覚えておく(「20回」が「20秒」に化けないように)。sets: 「種目ごと」のセット数。
// サーキットでは使わない(各種目1セットずつ×周回数)。
const CUSTOM_REPS_MIN = 1;
const CUSTOM_REPS_MAX = 100;
const CUSTOM_SEC_MIN = 5;
const CUSTOM_SEC_MAX = 300;
const CUSTOM_SEC_STEP = 5;
const CUSTOM_SETS_MIN = 1;
const CUSTOM_SETS_MAX = 10;
const CUSTOM_DEFAULT_SETS = 3;
const CUSTOM_DEFAULT_REPS = 10;

function defaultCustomTarget(exercise) {
  const holdSec = typeof loadHoldTargetSec === 'function' ? loadHoldTargetSec(exercise.id) : 30;
  return {
    timed: !!exercise.holdBased,
    reps: CUSTOM_DEFAULT_REPS,
    // 秒は5秒刻みで選ぶので、保存済みの目標秒数(1秒単位)も5秒単位に揃える
    sec: Math.min(CUSTOM_SEC_MAX, Math.max(CUSTOM_SEC_MIN, Math.round(holdSec / CUSTOM_SEC_STEP) * CUSTOM_SEC_STEP)),
    sets: CUSTOM_DEFAULT_SETS,
  };
}

// 保存データなど外から来た目標を、範囲内のきれいな値に直す(足りない項目は既定で補う)。
function normalizeCustomTarget(exercise, target) {
  const base = defaultCustomTarget(exercise);
  const t = target && typeof target === 'object' ? target : {};
  const clampInt = (v, min, max, fallback) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  return {
    timed: typeof t.timed === 'boolean' ? t.timed : base.timed,
    reps: clampInt(t.reps, CUSTOM_REPS_MIN, CUSTOM_REPS_MAX, base.reps),
    sec: Math.round(clampInt(t.sec, CUSTOM_SEC_MIN, CUSTOM_SEC_MAX, base.sec) / CUSTOM_SEC_STEP) * CUSTOM_SEC_STEP,
    sets: clampInt(t.sets, CUSTOM_SETS_MIN, CUSTOM_SETS_MAX, base.sets),
  };
}

// 「自分で作る」モード用。目的/レベルの選択がないため、セット数・回数(または秒数)は本人が種目ごとに
// 決めた目標(target、normalizeCustomTarget参照)を使い、休憩時間も種目ごとの指定(デフォルト90秒)を使う。
// format==='circuit'(サーキット)では各種目1セット・種目間の休憩なし・ウォームアップセットなしにし、
// 周回数は開始時に選ぶ(js/workout-log.jsのcreateSessionFromMenuがセット数＝周回数に展開する)。
function buildCustomSetPlan(exercise, restSec, target, format) {
  const t = normalizeCustomTarget(exercise, target);
  const isCircuit = format === 'circuit';
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    category: exercise.category,
    primary: exercise.primary,
    pattern: exercise.pattern,
    minLevel: exercise.minLevel || null,
    unilateral: exercise.unilateral,
    sets: isCircuit ? 1 : t.sets,
    // 目標は範囲ではなく1つの値(「20回」)。重量種目の提案(buildSuggestion)が使うrepsMaxも同じ値にしておく
    repsMin: t.reps,
    repsMax: t.reps,
    targetSec: t.timed ? t.sec : null,
    fixedTarget: true,
    restSec: isCircuit ? 0 : restSec,
    // 時間で測る種目(ハーフバーピー45秒等)に「軽い重量で数回」のウォームアップセットは合わないので付けない
    warmupSets: !isCircuit && !t.timed && exercise.category === 'compound' ? 1 : 0,
    note: exercise.note || '',
    description: exercise.description || '',
    demoMedia: exercise.demoMedia || null,
    holdBased: t.timed,
    equipment: exercise.equipment,
    bodyweightLoadFactor: exercise.bodyweightLoadFactor != null ? exercise.bodyweightLoadFactor : 1,
  };
}

// 有酸素種目(type:'cardio')用のプラン。セット/レップ/重量の概念がないため、
// buildCustomSetPlanとは別の専用ビルダーにしている。「自分で作る」「今日のメニュー」
// どちらから追加しても同じものを使う（目的・レベルの選択に依存しないため）。
function buildCustomCardioPlan(exercise) {
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    type: 'cardio',
    primary: exercise.primary,
    hasDistance: exercise.hasDistance,
    met: exercise.met,
    note: exercise.note || '',
    description: exercise.description || '',
    demoMedia: exercise.demoMedia || null,
    equipment: exercise.equipment,
  };
}

// ===== 所要時間の見積もりと、指定時間に収める調整（2026-10-04〜） =====
// 以前は「時間」で種目数を決めるだけで、セット数・休憩(レベルと目的で決まる)を考えておらず、
// 上級者×筋力アップだと「15分」で本編だけ約1時間になっていた。指定時間はウォームアップ・
// クールダウンを含めた全体の時間とする(ユーザー判断)。見積もりの前提(あくまで目安):
const SET_WORK_SEC = 40;          // 1セットの動作＋準備
const HOLD_SET_SETUP_SEC = 15;    // 保持時間系は目標秒数＋姿勢を作る時間
const EXERCISE_TRANSITION_SEC = 60; // 種目の切り替え(器具の準備・移動)
const REP_SEC = 2.5;              // 「自分で作る」で回数を決めた種目の1回あたり(50回なら約2分。40秒では収まらないため)
const CIRCUIT_TRANSITION_SEC = 15; // サーキットの種目の切り替え(休憩なしで次の種目へ)
const CARDIO_PLANNED_SEC = 600;   // 有酸素はメニュー時点で時間が決まっていないので10分と見なす
const DYNAMIC_WARMUP_SEC = 40;    // 動的ウォームアップ1つ(「スクワット10回」等)
const WARMUP_STRETCH_SEC = 20;    // ウォームアップの10秒ストレッチ1つ(左右ある分を含む)
const COOLDOWN_STRETCH_SEC = 50;  // クールダウンの20〜30秒ストレッチ1つ(左右ある分を含む)
const COOLDOWN_GENERAL_SEC = 90;  // 深呼吸1〜2分(cooldown.generalSecが無い古いメニュー用)

function estimateMenuSeconds(menu) {
  const warmup = menu.warmup || {};
  const cooldown = menu.cooldown || {};
  let sec = (Number(warmup.generalMin) || 5) * 60
    + (warmup.dynamic || []).reduce((sum, d) => sum + (Number(d.estSec) || DYNAMIC_WARMUP_SEC), 0)
    + (warmup.staticStretch || []).length * WARMUP_STRETCH_SEC
    + (cooldown.static || []).length * COOLDOWN_STRETCH_SEC
    + (Number(cooldown.generalSec) || COOLDOWN_GENERAL_SEC);
  const warmupSetsOn = typeof loadWarmupSetsEnabled !== 'function' || loadWarmupSetsEnabled();
  const holdSecOf = (item) => (item.targetSec != null ? item.targetSec
    : (typeof loadHoldTargetSec === 'function' ? loadHoldTargetSec(item.exerciseId) : 30));
  // 1セットの動作時間。回数を1つの値で決めた種目(fixedTarget)は回数から見積もり、それ以外は一律SET_WORK_SEC
  const repsWorkSec = (item) => (item.fixedTarget ? Math.max(SET_WORK_SEC, Math.round(item.repsMin * REP_SEC)) : SET_WORK_SEC);
  // サーキット: 各種目1セットずつを周回数だけ繰り返す。種目間は休憩なしで次へ進むだけなので、
  // 切り替えは器具の準備を見込んだ60秒ではなく短め(CIRCUIT_TRANSITION_SEC)に見積もる。
  if (menu.params && menu.params.format === 'circuit') {
    const circuit = menu.circuit || {};
    const rounds = Math.max(1, Number(circuit.rounds) || 1);
    const roundRestSec = Number(circuit.roundRestSec) || 0;
    // 有酸素種目は周回に入れず、全周の後に1回だけ行う(記録画面もそう表示する)ので、周回とは別に1回分だけ足す
    const items = (menu.main || []).filter((item) => item.type !== 'cardio');
    const cardioCount = (menu.main || []).length - items.length;
    const oneRoundSec = items.reduce((sum, item, i) => {
      const workSec = item.holdBased ? holdSecOf(item) + HOLD_SET_SETUP_SEC : repsWorkSec(item);
      return sum + (item.unilateral ? workSec * 2 : workSec) + (i > 0 ? CIRCUIT_TRANSITION_SEC : 0);
    }, 0);
    const roundsSec = items.length > 0 ? rounds * oneRoundSec + Math.max(0, rounds - 1) * roundRestSec : 0;
    return sec + roundsSec + cardioCount * (CARDIO_PLANNED_SEC + EXERCISE_TRANSITION_SEC);
  }
  (menu.main || []).forEach((item, i) => {
    if (i > 0) sec += EXERCISE_TRANSITION_SEC;
    if (item.type === 'cardio') {
      sec += CARDIO_PLANNED_SEC;
      return;
    }
    const oneSideSec = item.holdBased ? holdSecOf(item) + HOLD_SET_SETUP_SEC : repsWorkSec(item);
    const setSec = item.unilateral ? oneSideSec * 2 : oneSideSec; // 「左右それぞれ」の種目は両側分
    const n = (item.sets || 0) + (warmupSetsOn ? (item.warmupSets || 0) : 0);
    sec += n * setSec + Math.max(0, n - 1) * (item.restSec || 0);
  });
  return sec;
}

// 指定時間(分)に収まるよう、体への効果を損ないにくい順に調整する。本セットの数は減らさない(ユーザー判断)。
// ①(ウォームアップ・クールダウンはbuildWarmupAndCooldownで時間に合わせ済み)②休憩を目的ごとの下限
// (GOALS[goal].minRestSec、一般的な目安の範囲内)まで短くする ③ウォームアップセットを1セットにする
// ④種目を減らす(並びの後ろ=単関節・体幹の種目から外し、最低1種目は残す。ただし鍛えたい部位に直接効く
// 種目(主動筋が一致)は、補助筋つながりで補欠として入った種目より後に外す。並び順は実施順であって
// 選んだ優先度ではないため。例: 腕を選んだ日に補欠の背中種目が残ってアームカールが消える、を防ぐ)。
// 1割(最低1分)の超過は許容する(menuOverBudgetと同じ基準)。何をしたかをadjustmentsで返し、画面に一言添える。
function menuToleranceSec(minutes) {
  return Math.max(60, Number(minutes) * 60 * 0.1);
}

// 指定時間(分)を許容範囲を超えて上回るか。メニュー画面の注意(js/ui.jsのrenderMenu)とfitMenuToTimeで同じ判定を使う。
function menuOverBudget(menu, minutes) {
  const budgetSec = Number(minutes) * 60;
  if (!budgetSec) return false;
  return estimateMenuSeconds(menu) > budgetSec + menuToleranceSec(minutes);
}

function fitMenuToTime(chosen, { level, goal, minutes, painAreas, parts = [] }) {
  const budgetSec = Number(minutes) * 60;
  const isFocus = (ex) => parts.includes('fullbody') || (ex.primary || []).some((m) => parts.includes(m));
  const minRest = (GOALS[goal] && GOALS[goal].minRestSec) || null;
  const adjustments = [];
  let exercises = chosen.slice();
  let restFloor = false;
  let singleWarmupSet = false;

  const build = () => {
    const main = exercises.map((ex) => {
      const plan = buildSetPlan(ex, level, goal);
      if (restFloor && minRest && plan.type !== 'cardio') plan.restSec = Math.min(plan.restSec, minRest[ex.category] || plan.restSec);
      if (singleWarmupSet && plan.warmupSets > 1) plan.warmupSets = 1;
      return plan;
    });
    const { warmup, cooldown } = buildWarmupAndCooldown(exercises, painAreas, minutes);
    return { warmup, main, cooldown };
  };
  const fits = (menu) => !menuOverBudget(menu, minutes);

  let menu = build();
  if (!budgetSec || fits(menu)) return { menu, adjustments };

  if (minRest) {
    restFloor = true;
    menu = build();
    if (menu.main.some((m, i) => m.restSec < buildSetPlan(exercises[i], level, goal).restSec)) adjustments.push('rest');
    if (fits(menu)) return { menu, adjustments };
  }
  // ウォームアップセットをOFFにしている時は時間に含まれないので、減らしても意味が無い(説明も誤解を招く)
  const warmupSetsOn = typeof loadWarmupSetsEnabled !== 'function' || loadWarmupSetsEnabled();
  if (warmupSetsOn && menu.main.some((m) => m.warmupSets > 1)) {
    singleWarmupSet = true;
    menu = build();
    adjustments.push('warmupSets');
    if (fits(menu)) return { menu, adjustments };
  }
  const originalCount = exercises.length;
  while (exercises.length > 1 && !fits(menu)) {
    // 後ろから見て、鍛えたい部位に直接効かない(補欠の)種目があればそれを先に外す。無ければ一番後ろ。
    let dropIndex = -1;
    for (let i = exercises.length - 1; i >= 0; i -= 1) {
      if (!isFocus(exercises[i])) { dropIndex = i; break; }
    }
    if (dropIndex === -1) dropIndex = exercises.length - 1;
    exercises = exercises.filter((_, i) => i !== dropIndex);
    menu = build();
  }
  if (exercises.length < originalCount) adjustments.push(`drop:${originalCount}:${exercises.length}`);
  return { menu, adjustments };
}

function generateMenu({ parts, equipment, minutes, level, goal, painAreas = [] }) {
  // autoExclude: 部位別の選定に向かない種目(ハーフバーピー等の全身コンディショニング)は自動生成の候補にしない
  let pool = filterByEquipment(EXERCISES.filter((ex) => !ex.autoExclude), equipment);
  pool = filterByPainAreas(pool, painAreas);
  pool = filterByLevel(pool, level);
  const exerciseCount = exerciseCountForTime(minutes);
  const isFullBody = parts.includes('fullbody');

  const chosenRaw = isFullBody
    ? pickFullBodyExercises(pool, exerciseCount)
    : pickTargetedExercises(pool, parts, exerciseCount);
  const chosen = sortByTrainingOrder(chosenRaw);

  // 種目数の目安(exerciseCount)で選んだ後、セット数・休憩込みの所要時間が指定時間に収まるよう調整する
  const { menu: fitted, adjustments } = fitMenuToTime(chosen, { level, goal, minutes, painAreas, parts });

  return {
    warmup: fitted.warmup,
    main: fitted.main,
    cooldown: fitted.cooldown,
    generatedAt: new Date().toISOString(),
    params: { parts, equipment, minutes, level, goal, painAreas },
    // 条件(器具・レベル・痛み等)が絞られすぎて本来の目安種目数(exerciseCount)に届かなかった場合、
    // js/ui.jsのrenderMenuで理由を添えた注記を出すために保持しておく。時間に収めるために減らした分は
    // 「条件に合う種目が少ない」とは別なので、選べた数(availableCount)で判定する。
    requestedCount: exerciseCount,
    availableCount: chosen.length,
    // 指定時間に収めるために行った調整(fitMenuToTime)。メニュー画面に一言添える。
    timeAdjustments: adjustments,
    // ユーザーが長押しドラッグで手動並べ替えをしたかどうか。一度でも手動で並べ替えたら、
    // それ以降「＋種目を追加」しても自動並べ替え(sortByTrainingOrder)はかけない
    // （せっかく直した順番を、追加のたびに勝手に上書きしてしまわないため）。
    userReordered: false,
  };
}

// 週のトレーニング日数から、曜日ごとの部位割り当て案(月曜始まり、7要素固定)を作る。
// js/rules.jsのWEEKLY_SPLIT_TEMPLATES(部位の分割内容)をWEEKLY_SPLIT_DAY_POSITIONS
// (曜日への配置)に従って割り当てる純粋関数。以前は月曜から隙間なく詰めていたため、
// 例えば3日なら月火水と3連続でトレーニングし木〜日が丸ごと休みになっていたが、
// これは教科書(WEEKLY_SPLIT_DAY_POSITIONSのコメント参照)のどの実施例とも一致しないと
// 分かったため、休みを挟んで分散配置するようになっている。
function proposeWeeklySplit(trainingDaysPerWeek) {
  const days = Math.min(7, Math.max(1, Number(trainingDaysPerWeek) || 3));
  const template = WEEKLY_SPLIT_TEMPLATES[days] || WEEKLY_SPLIT_TEMPLATES[3];
  const positions = WEEKLY_SPLIT_DAY_POSITIONS[days] || WEEKLY_SPLIT_DAY_POSITIONS[3];
  const plan = Array.from({ length: 7 }, () => ({ kind: 'rest' }));
  positions.forEach((dayIndex, i) => {
    if (template[i]) plan[dayIndex] = { kind: 'parts', parts: template[i].slice() };
  });
  return plan;
}

if (typeof module !== 'undefined') {
  module.exports = {
    generateMenu, buildWarmupAndCooldown, buildCustomSetPlan, buildCustomCardioPlan, proposeWeeklySplit,
    defaultCustomTarget, normalizeCustomTarget,
    sortByTrainingOrder, estimateMenuSeconds, fitMenuToTime,
  };
}
