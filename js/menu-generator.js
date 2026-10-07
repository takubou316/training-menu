// 入力（部位・器具・時間・レベル・目的）からその日のメニューを組み立てる純粋関数群。
// AIには文章生成させず、あらかじめ用意した種目DB(exercises-data.js)とルール(rules.js)の組み合わせだけで決定的に組み立てる。

// ===== ウォームアップ・クールダウン（2026-10-07に全面見直し、仕様はCodexと相談してユーザーが決定） =====
// 以前は動作パターンごとに固定の体操を1つ出していたため、自重スクワットの前に「ボディウェイトスクワット10回」が
// 出るなど、本番と同じ動きを準備として課していた。見直し後の考え方:
// - 準備は「全身を温める（足踏み）＋必要な動きを少しだけ確かめる」の2段階。静的ストレッチは準備から外し、
//   クールダウンだけに残す（ユーザー判断）
// - 本番と同じ動きでも「軽く・少ない回数の動作確認」（例: スクワットの動作確認 5回）なら出してよい（ユーザー判断）。
//   本番と同じ量・同じ書き方では出さない
// - 「何をするか」(howTo)は画面に常に出し、「なぜやるか」(why)と対象の種目はⓘの中
// - 器具は使わない（持っていないゴムバンド等は出さない）
// 回数・時間はこのアプリの初期ルールで、医学的に確立した最適値ではない。
const WARMUP_DRILLS = {
  squat_check: {
    label: 'スクワットの動作確認 5回',
    howTo: '最初は浅くしゃがみ、痛みなく動ける範囲で少しずつ本番の深さに近づける。反動をつけずに立ち上がる。',
    why: 'しゃがむ深さや足幅、膝や腰に違和感がないかを軽い負荷で確かめる。本番の回数はここではやらない。',
    estSec: 30, avoidFor: ['膝'],
  },
  hinge_check: {
    label: 'お尻を後ろへ引く練習 5回',
    howTo: '膝を軽くゆるめ、お尻を後ろへ引いて上体を前に傾けてから戻る。腰を丸めたり反らしたりして深さを稼がない。',
    why: '股関節から体を曲げる感覚をつかんでおく。',
    estSec: 30, avoidFor: ['腰'],
  },
  wall_pushup: {
    label: '壁プッシュアップ 5回',
    howTo: '壁に両手をつき、体を一直線に保ったまま肘を曲げ伸ばしする。楽にできる足の位置で行う。',
    why: '腕で体を支えて押す動きと、体をまっすぐ保つ感覚を軽い負荷で確かめる。',
    estSec: 30, avoidFor: ['手首'],
  },
  arm_raise: {
    label: '腕の上げ下げ 5回',
    howTo: '親指を上に向け、両腕を体のやや前から頭の上まで上げ下げする。腰を反らさず、肩が痛くない高さまで。',
    why: '腕を頭の上に上げる動きに備えて、肩を動かしておく。',
    estSec: 25, avoidFor: ['肩'],
  },
  shoulder_circles: {
    label: '肩回し 前後各5回',
    howTo: '肩を軽くすくめるように持ち上げ、後ろから下へゆっくり回す。逆回しも同じ回数。首に力を入れない。',
    why: '肩まわりをほぐし、腕を使う種目に備える。',
    estSec: 25, avoidFor: [],
  },
  scap_reach: {
    label: '腕の前伸ばし・引き戻し 6回',
    howTo: '両腕を胸の高さで前に伸ばして肩甲骨を広げ、肘を後ろへ引いて肩甲骨を寄せる。腰は反らさない。',
    why: '肩甲骨を寄せる・広げる動きを確かめ、引く種目で背中を使う準備をする。',
    estSec: 30, avoidFor: [],
  },
  wrist_mobility: {
    label: '手首の曲げ伸ばし 5往復',
    howTo: '肘を軽く曲げ、手を開いたまま手首をゆっくり上下に曲げ伸ばしする。反対の手で強く押し込まない。',
    why: '床に手をつく種目の前に、手首を動かしておく。',
    estSec: 20, avoidFor: [],
  },
  elbow_forearm: {
    label: '肘の曲げ伸ばし・手首返し 各5回',
    howTo: '腕を体の横に下ろしたまま肘を曲げ伸ばしし、続けて手のひらを上・下に返す。力は入れない。',
    why: '腕の種目の前に、肘と前腕を動かしておく。',
    estSec: 25, avoidFor: [],
  },
  core_slide: {
    label: '仰向けで片足ずつ滑らせる 左右3回',
    howTo: '仰向けで膝を立て、息を吐きながら片足を床に沿って前へ滑らせて戻す。腰が大きく反らない範囲で。',
    why: 'お腹に軽く力を入れたまま脚を動かし、体幹を安定させる感覚を確かめる。',
    estSec: 30, avoidFor: [],
  },
  burpee_steps: {
    label: '跳ばないバーピーの足運び 2回',
    howTo: 'しゃがんで手を床につき、片足ずつ後ろへ出して板の姿勢になり、片足ずつ戻して立つ。',
    why: '手をつく・足を出して戻す流れを、跳ばずにゆっくり確かめる。',
    estSec: 30, avoidFor: ['手首', '膝'],
  },
  ankle_knee: {
    label: '膝送り（足首の準備） 左右5回',
    howTo: '壁に手を添えて片足を少し前に出し、前足のかかとを浮かせずに膝をつま先の方向へ軽く出して戻す。',
    why: 'しゃがむ動きやふくらはぎの種目の前に、足首を動かしておく。',
    estSec: 30, avoidFor: ['膝'],
  },
  leg_swing: {
    label: '脚の前後振り 左右5往復',
    howTo: '壁に手を添え、体を反らさずに片脚を小さく前後に振る。勢いをつけず、楽に動く範囲で。',
    why: '脚の種目の前に、股関節を大きく動かしておく。',
    estSec: 30, avoidFor: ['腰'],
  },
};

// 種目ごとに必要な準備(WARMUP_DRILLSのキー、優先順)。種目データに個別の指定が無ければ動作パターンから決める。
const WARMUP_NEEDS_BY_EXERCISE = {
  half_burpee: ['burpee_steps', 'squat_check', 'wrist_mobility'],
};
const WARMUP_NEEDS_BY_PATTERN = {
  squat: ['squat_check', 'ankle_knee'],
  hinge: ['hinge_check', 'leg_swing'],
  push_horizontal: ['wall_pushup'],
  push_vertical: ['arm_raise', 'shoulder_circles'],
  pull_horizontal: ['scap_reach'],
  pull_vertical: ['shoulder_circles', 'scap_reach'],
  core: ['core_slide'],
};
const WARMUP_NEEDS_BY_ISOLATION_MUSCLE = {
  chest: ['shoulder_circles'], back: ['scap_reach'], shoulders: ['shoulder_circles'],
  biceps: ['elbow_forearm'], triceps: ['elbow_forearm'], quads: ['leg_swing'], hamstrings: ['leg_swing'],
  glutes: ['leg_swing'], calves: ['ankle_knee'], abs: ['core_slide'],
};
// 息が上がる・跳ぶ種目。ある日は温める時間を1分足し、確かめる動きを1つ増やし、クールダウンも長めにする。
const BREATHLESS_EXERCISE_IDS = ['half_burpee', 'jump_rope', 'running', 'stair_climbing'];

function warmupNeedsOf(ex) {
  if (WARMUP_NEEDS_BY_EXERCISE[ex.id]) return WARMUP_NEEDS_BY_EXERCISE[ex.id];
  if (ex.pattern === 'isolation') return WARMUP_NEEDS_BY_ISOLATION_MUSCLE[(ex.primary || [])[0]] || ['shoulder_circles'];
  const needs = WARMUP_NEEDS_BY_PATTERN[ex.pattern] || [];
  // 床に手をつく自重の押す種目(プッシュアップ等)は手首も
  if (ex.pattern === 'push_horizontal' && (ex.equipment || []).includes('bodyweight')) return [...needs, 'wrist_mobility'];
  return needs;
}

// 重りを使う種目か(ダンベル・バーベル・マシン)。ウォームアップセット(軽い重さで数回)はこの種目だけに付ける。
// 以前はequipment[0]だけを見ていたが、配列の順番で結果が変わるので「自重でもできる種目か」で判断する。
function isExternallyLoadedExercise(ex) {
  if (!ex || ex.type === 'cardio') return false;
  return !(ex.equipment || []).includes('bodyweight');
}

function formatWarmupSeconds(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m ? `${m}分` : ''}${s}秒` : `${m}分`;
}

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
    // ウォームアップセット(軽い重さで数回)は重りを使う種目だけ。自重種目は軽くできないので付けない(2026-10-07)
    warmupSets: exercise.category === 'compound' && isExternallyLoadedExercise(exercise) ? levelInfo.warmupSets : 0,
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

// 選んだ種目一覧（EXERCISESの生データ、並びは実施順）から、ウォームアップ/クールダウンを組み立てる。
// 「要望から作る」「自分で作る」どちらのモードからも同じロジックを使う(考え方は上の「ウォームアップ・クールダウン」節)。
// painAreas: 「気になる部位」(肩/腰/膝/手首)。その部位に負担がかかる準備の動き(avoidFor)を出さない。
// minutes: 全体の時間(分)。足踏みの長さ・確かめる動きの数・クールダウンのストレッチの本数を合わせる
//   (足踏み 15分以下60秒/30分以下90秒/それ以上・指定なし120秒、動き 15分以下2つ/それ以外3つ、ストレッチ 15分以下2本/30分以下3本)。
//   息が上がる種目(BREATHLESS_EXERCISE_IDS)がある日は足踏み+60秒・動き+1つ。
// circuit: サーキットか。クールダウンの歩く・足踏みを5分ほどにする(息が上がる種目がある日も同じ)。
// 有酸素だけの日は「はじめの3〜5分をゆっくり」、有酸素から始める/有酸素で終わる日はその区間で代わりにする(計測時間に含めるので所要時間に足さない)。
function buildWarmupAndCooldown(chosen, painAreas = [], minutes = null, { circuit = false } = {}) {
  const total = Number(minutes) || 0;
  const isShort = total > 0 && total <= 15;
  const isMedium = total > 15 && total <= 30;
  const stretchLimit = isShort ? 2 : isMedium ? 3 : Infinity;
  const strength = chosen.filter((ex) => ex.type !== 'cardio');
  const hasCardio = chosen.length > strength.length;
  const breathless = chosen.some((ex) => BREATHLESS_EXERCISE_IDS.includes(ex.id));
  const firstIsCardio = chosen.length > 0 && chosen[0].type === 'cardio';
  const lastIsCardio = chosen.length > 0 && chosen[chosen.length - 1].type === 'cardio';

  // クールダウンのストレッチは、このセッションで主に使った回数が多い部位から。以前は「気になる部位」を最優先に
  // していたが、痛い所を優先して伸ばす規則は避ける(Codexの指摘、2026-10-07)。気になる部位は種目の除外に使う。
  const muscleFrequency = {};
  chosen.forEach((ex) => (ex.primary || []).forEach((m) => { muscleFrequency[m] = (muscleFrequency[m] || 0) + 1; }));
  const stretches = Object.keys(muscleFrequency)
    .filter((m) => STATIC_STRETCH_BY_MUSCLE[m])
    .sort((a, b) => muscleFrequency[b] - muscleFrequency[a])
    .map((m) => STATIC_STRETCH_BY_MUSCLE[m])
    .slice(0, stretchLimit);

  // ----- ウォームアップ -----
  let general;
  let generalSec;
  if (strength.length === 0) {
    // 有酸素だけの日: 最初の数分をゆっくりにするだけ(計測する時間に含めてよいので、所要時間には足さない)
    general = hasCardio ? 'はじめの3〜5分はゆっくりのペースで（計測する時間に含めてOK）' : '';
    generalSec = 0;
  } else if (firstIsCardio) {
    general = '最初の有酸素の、はじめの3〜5分をゆっくりのペースにする（足踏みは不要）';
    generalSec = 0;
  } else {
    generalSec = (isShort ? 60 : isMedium ? 90 : 120) + (breathless ? 60 : 0);
    general = `その場で足踏み（慣れてきたら軽いジョグ）${formatWarmupSeconds(generalSec)}`;
  }

  const drillLimit = (isShort ? 2 : 3) + (breathless ? 1 : 0);
  const picked = [];
  const forExercises = {};
  // 各種目の1番目の準備を種目の順に入れ、枠が余れば2番目以降を入れる(同じ準備は1つにまとめる)
  const needLists = strength.map((ex) => ({ ex, needs: warmupNeedsOf(ex).filter((k) => {
    const d = WARMUP_DRILLS[k];
    return d && !(d.avoidFor || []).some((a) => painAreas.includes(a));
  }) }));
  const maxDepth = Math.max(0, ...needLists.map((n) => n.needs.length));
  for (let depth = 0; depth < maxDepth; depth += 1) {
    needLists.forEach(({ ex, needs }) => {
      const key = needs[depth];
      if (!key) return;
      if (!forExercises[key]) forExercises[key] = [];
      if (!forExercises[key].includes(ex.name)) forExercises[key].push(ex.name);
      if (!picked.includes(key) && picked.length < drillLimit) picked.push(key);
    });
  }

  const warmup = {
    general,
    generalSec, // 所要時間の見積もり(estimateMenuSeconds)用
    note: strength.length ? '痛みのない範囲で。痛みが出たらその動きはやめる。' : '',
    dynamic: picked.map((key) => {
      const d = WARMUP_DRILLS[key];
      return { key, label: d.label, howTo: d.howTo, description: d.why, forExercises: forExercises[key] || [], estSec: d.estSec };
    }),
  };

  // ----- クールダウン -----
  let cdGeneral;
  let cdGeneralSec;
  if (lastIsCardio) {
    cdGeneral = '最後の有酸素の、終わりの3〜5分はペースを落として呼吸を整える（計測する時間に含めてOK）';
    cdGeneralSec = 0;
  } else if (circuit || breathless) {
    cdGeneral = 'ゆっくり歩くか足踏みを5分ほど（呼吸が落ち着かなければ続けてOK）';
    cdGeneralSec = 300;
  } else {
    cdGeneral = 'ゆっくり歩くか足踏みを1〜2分（呼吸が落ち着くまで）';
    cdGeneralSec = isShort ? 60 : 90;
  }
  const cooldown = {
    general: chosen.length ? cdGeneral : '',
    generalSec: chosen.length ? cdGeneralSec : 0,
    static: stretches,
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

// 「自分で作る」の有酸素種目の目標時間(分、nullなら目標なし)。customTargets[id]に{cardioMin}があればそれ
// (nullも「目標なしと決めた」として尊重する)、まだ決めていなければ最後に決めた目標(loadCardioTargetMin)。
function customCardioTargetMin(exercise, target) {
  if (target && typeof target === 'object' && 'cardioMin' in target) {
    const min = Math.round(Number(target.cardioMin));
    return target.cardioMin != null && Number.isFinite(min)
      ? Math.min(CARDIO_TARGET_MIN_MAX, Math.max(CARDIO_TARGET_MIN_MIN, min)) : null;
  }
  return typeof loadCardioTargetMin === 'function' ? loadCardioTargetMin(exercise.id) : null;
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
    // ウォームアップセット(軽い重さで数回)は重りを使う種目だけ(2026-10-07〜。以前は自重のスクワット50回にも
    // 「準備50回」が付いていた)。時間で測る種目・サーキットにも付けない
    warmupSets: !isCircuit && !t.timed && exercise.category === 'compound' && isExternallyLoadedExercise(exercise) ? 1 : 0,
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
// targetMinは目標時間(分、nullなら目標なし)。省略時は最後に決めた目標(storage.jsのloadCardioTargetMin)を使う。
function buildCustomCardioPlan(exercise, targetMin) {
  const min = targetMin !== undefined ? targetMin
    : (typeof loadCardioTargetMin === 'function' ? loadCardioTargetMin(exercise.id) : null);
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    type: 'cardio',
    targetSec: min ? min * 60 : null,
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
const CARDIO_PLANNED_SEC = 600;   // 有酸素は目標時間が無ければ10分と見なす(目標があればその時間)
const DYNAMIC_WARMUP_SEC = 40;    // 動的ウォームアップ1つ(「スクワット10回」等)
const COOLDOWN_STRETCH_SEC = 50;  // クールダウンの20〜30秒ストレッチ1つ(左右ある分を含む)
const COOLDOWN_GENERAL_SEC = 90;  // 終わりの1〜2分(cooldown.generalSecが無い古いメニュー用)

function estimateMenuSeconds(menu) {
  const warmup = menu.warmup || {};
  const cooldown = menu.cooldown || {};
  // 足踏み: 新しいメニューはgeneralSec(0もあり=有酸素の最初をゆっくりにする日)、古いメニューはgeneralMin(分)
  const generalSec = warmup.generalSec != null ? Number(warmup.generalSec) || 0 : (Number(warmup.generalMin) || 5) * 60;
  // 準備の10秒ストレッチ(warmup.staticStretch)は2026-10-07に廃止。古いメニューに残っていても表示しないので数えない
  let sec = generalSec
    + (warmup.dynamic || []).reduce((sum, d) => sum + (Number(d.estSec) || DYNAMIC_WARMUP_SEC), 0)
    + (cooldown.static || []).length * COOLDOWN_STRETCH_SEC
    + (cooldown.generalSec != null ? Number(cooldown.generalSec) || 0 : COOLDOWN_GENERAL_SEC);
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
    const cardioSec = (menu.main || []).filter((item) => item.type === 'cardio')
      .reduce((sum, item) => sum + (item.targetSec || CARDIO_PLANNED_SEC) + EXERCISE_TRANSITION_SEC, 0);
    const oneRoundSec = items.reduce((sum, item, i) => {
      const workSec = item.holdBased ? holdSecOf(item) + HOLD_SET_SETUP_SEC : repsWorkSec(item);
      return sum + (item.unilateral ? workSec * 2 : workSec) + (i > 0 ? CIRCUIT_TRANSITION_SEC : 0);
    }, 0);
    const roundsSec = items.length > 0 ? rounds * oneRoundSec + Math.max(0, rounds - 1) * roundRestSec : 0;
    return sec + roundsSec + cardioSec;
  }
  (menu.main || []).forEach((item, i) => {
    if (i > 0) sec += EXERCISE_TRANSITION_SEC;
    if (item.type === 'cardio') {
      sec += item.targetSec || CARDIO_PLANNED_SEC;
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
    defaultCustomTarget, normalizeCustomTarget, customCardioTargetMin,
    sortByTrainingOrder, estimateMenuSeconds, fitMenuToTime,
  };
}
