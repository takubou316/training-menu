// 目的別のセット/レップ/休憩時間の基準値。
// ACSM/NSCAなど各種資格団体のテキストで共通して示されている一般的な目安値（筋肥大なら6-12reps・60-90秒休憩、
// 筋力向上なら1-5reps・低レップ高休憩、筋持久力なら15reps以上・短休憩、というのは業界内で広く共有されている一般知識）を
// レベル別に微調整して数値化したもの。特定文献の丸写しではない。

const GOALS = {
  hypertrophy: {
    label: '筋肥大（大きくしたい）',
    repsRange: [8, 12],
    restSec: { compound: 90, isolation: 60 },
  },
  strength: {
    label: '筋力アップ（重いものを扱えるようになりたい）',
    repsRange: [4, 6],
    restSec: { compound: 180, isolation: 120 },
  },
  endurance: {
    label: '引き締め・持久力（軽い負荷で回数をこなしたい）',
    repsRange: [15, 20],
    restSec: { compound: 45, isolation: 30 },
  },
};

const LEVELS = {
  beginner: { label: '初心者', setsCompound: 2, setsIsolation: 2, warmupSets: 1 },
  intermediate: { label: '中級者', setsCompound: 3, setsIsolation: 3, warmupSets: 1 },
  advanced: { label: '上級者', setsCompound: 4, setsIsolation: 3, warmupSets: 2 },
};

// 利用時間(分)ごとに、種目数の目安（ウォームアップ/クールダウンを除いた本編の種目数）
const TIME_TO_EXERCISE_COUNT = [
  { maxMinutes: 15, count: 2 },
  { maxMinutes: 30, count: 4 },
  { maxMinutes: 45, count: 6 },
  { maxMinutes: 60, count: 8 },
  { maxMinutes: Infinity, count: 10 },
];

function exerciseCountForTime(minutes) {
  const found = TIME_TO_EXERCISE_COUNT.find((t) => minutes <= t.maxMinutes);
  return found ? found.count : 6;
}

// 進捗（プログレッシブオーバーロード）の目安。
// 直近セットが全て「目標レップ上限に到達 かつ RPE7以下（≒まだ余裕がある）」なら、次回は重量を少し上げる提案をする。
// そうでなく目標レップ上限未満なら、まずは同重量でレップを増やす提案をする。
const PROGRESSION = {
  upperBodyIncrementKg: 1.25,
  lowerBodyIncrementKg: 2.5,
  rpeThresholdForWeightIncrease: 7,
};

if (typeof module !== 'undefined') {
  module.exports = { GOALS, LEVELS, exerciseCountForTime, PROGRESSION };
}
