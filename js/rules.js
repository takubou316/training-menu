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

// RPE(自覚的運動強度)のスケール。レジスタンストレーニング向けのRPEは1〜10で、
// 高強度側(6以降)は0.5刻みで「あと何レップできるか(Reps in Reserve)」を精緻に表現するのが一般的
// （Zourdos et al., 2016, NSCA発行のStrength and Conditioning Journal掲載の
// Repetitions in Reserve-based RPEスケールに基づく）。
const RPE_SCALE = { min: 1, max: 10, step: 0.5, default: 7 };

// RPEの値から「あと何回できそうか(Reps in Reserve)」の短い目安テキストを返す。
// 整数値(10/9/8/7/6)は#rpe-info-modalの説明文と同じ言い回しに揃え、0.5刻みの中間値は
// RIRベースのRPEスケールの考え方通り「あと2〜3回」のように前後の範囲で表現する。
function rpeReserveText(rpe) {
  const r = Number(rpe);
  if (Number.isNaN(r)) return '';
  if (r >= 10) return 'あと0回。限界';
  if (r <= 5.5) return 'かなり軽い（ウォームアップ向き）';
  if (r === 6) return 'あと4回以上できそう';
  const rir = 10 - r;
  if (Number.isInteger(rir)) return `あと${rir}回はできそう`;
  return `あと${Math.floor(rir)}〜${Math.ceil(rir)}回はできそう`;
}

// 進捗（プログレッシブオーバーロード）の目安。
// 直近セットが全て「目標レップ上限に到達 かつ RPE7以下（＝目標を達成しつつ限界(RPE8以上)ではない）」
// なら、次回は重量を少し上げる提案をする。「レップ目標を上回り、かつ主観的にまだ限界でなければ
// 増量する」というRPEベースの負荷調整はレジスタンストレーニングの自己調整(autoregulation)手法として
// 広く行われている一般的な考え方だが、この閾値(RPE7)自体の効果を直接検証した特定の研究があるわけではなく、
// このアプリ独自の目安値である。RPE7自体は本アプリのRPE説明（ⓘ）で「まずはここを目安に」としている
// 推奨強度そのものであり、「余裕がある」という意味ではない点に注意（RPE6以下が本来の「余裕あり」）。
// そうでなく目標レップ上限未満なら、まずは同重量でレップを増やす提案をする。
const PROGRESSION = {
  upperBodyIncrementKg: 1.25,
  lowerBodyIncrementKg: 2.5,
  rpeThresholdForWeightIncrease: 7,
};

if (typeof module !== 'undefined') {
  module.exports = { GOALS, LEVELS, exerciseCountForTime, PROGRESSION, RPE_SCALE, rpeReserveText };
}
