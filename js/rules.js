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

// 利用時間(分)ごとに、種目数の目安（ウォームアップ/クールダウンを除いた本編の種目数）。
// 15分でも最低3種目は確保したいので、下限を2から3に上げてある。
const TIME_TO_EXERCISE_COUNT = [
  { maxMinutes: 15, count: 3 },
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

// 週間プラン画面の曜日表示。月曜始まり(0=月〜6=日)で統一する。
const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

// 週のトレーニング日数ごとの部位分割の目安。全身法・上下分割・プッシュプル脚(PPL)分割・
// 部位別(bro split)など、JATI/NSCA等が教える一般的な分割の考え方（週の頻度が増えるほど
// 1回あたりの部位を絞る）を参考にした簡易ローテーションであり、特定文献の丸写しではない。
// 日数以外の並び順・組み合わせの最適性を厳密に検証したものではなく、あくまで自動提案の
// たたき台（手動で調整できる）。出典: JATIトレーニング指導者テキスト［実践編］3訂版
// 3章2節「レジスタンストレーニング」11トレーニング頻度・12プログラムの分割(p78〜79)。
const WEEKLY_SPLIT_TEMPLATES = {
  1: [['fullbody']],
  2: [['chest', 'back', 'shoulders', 'arms'], ['legs', 'core']],
  3: [['chest', 'shoulders'], ['back', 'arms'], ['legs', 'core']],
  4: [['chest'], ['back'], ['legs'], ['shoulders', 'arms', 'core']],
  5: [['chest'], ['back'], ['legs'], ['shoulders'], ['arms', 'core']],
  6: [['chest', 'shoulders'], ['back'], ['legs'], ['chest', 'shoulders'], ['back'], ['legs', 'core']],
  7: [['chest', 'shoulders'], ['back'], ['legs'], ['chest', 'shoulders'], ['back'], ['legs', 'core'], ['fullbody']],
};

// 上記の部位分割を、週のどの曜日(0=月〜6=日)に置くか。以前は月曜から隙間なく詰めて
// 残りを全部休みにしていたが（例:3日なら月火水→木〜日が丸ごと休み）、これは教科書の
// どの実施例パターンとも一致しないことが分かったため、休みを挟んで分散させる配置に変更した。
// 出典は上記WEEKLY_SPLIT_TEMPLATESと同じ(p78〜79 表21・22)。
// - 週2〜3日: 「中1〜2日空けて」が基本目安（3日は表22の3分割週3回パターンと厳密に一致: 月水金）
// - 週4日: 表22の2分割週4回パターンと一致（月火 木金、2連続→休み→2連続→休み）
// - 週5〜6日: 表21の「2 on 1 off」「3 on 1 off」ローテーションを月曜始まりの1週間に当てはめたもの
// - 週7日: 空ける余地が無いため全曜日。ただしWEEKLY_SPLIT_TEMPLATES側で近い曜日に同じ部位が
//   極力連続しないよう既に組んであり（例:胸月→背中火→脚水→胸木は中2日空く）、部位単位では
//   「中1〜2日空けて」の考え方を維持できている
const WEEKLY_SPLIT_DAY_POSITIONS = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 3, 4, 6],
  6: [0, 1, 2, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
};

if (typeof module !== 'undefined') {
  module.exports = {
    GOALS, LEVELS, exerciseCountForTime, PROGRESSION, RPE_SCALE, rpeReserveText,
    WEEKDAY_LABELS, WEEKLY_SPLIT_TEMPLATES, WEEKLY_SPLIT_DAY_POSITIONS,
  };
}
