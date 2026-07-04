// 種目データベース。
// 各種目は「主動筋(primary)」「補助筋(secondary)」「種目カテゴリ」「必要器具」「動作パターン」「片側種目か」を持つ。
// 出典の考え方: JATI/NSCA/ACSMなど公的資格団体が共通して教える一般的な運動分類・筋肉部位の対応関係を基にした一般知識であり、
// 特定の書籍・教材の文章をそのまま転記したものではない。数値基準(セット/レップ/休憩)は js/rules.js 側で管理する。

const MUSCLE_GROUPS = {
  chest: '胸',
  back: '背中',
  shoulders: '肩',
  biceps: '上腕二頭筋',
  triceps: '上腕三頭筋',
  quads: '大腿四頭筋',
  hamstrings: 'ハムストリングス',
  glutes: '臀筋',
  calves: 'ふくらはぎ',
  abs: '体幹・腹筋',
};

// 全身メニュー作成時に「これだけは1つずつ入れたい」動作パターンの並び順（大きい筋群/複合関節種目を先に）
const PATTERN_ORDER = ['squat', 'hinge', 'push_horizontal', 'push_vertical', 'pull_horizontal', 'pull_vertical', 'core', 'isolation'];

const EXERCISES = [
  // ===== 胸 =====
  { id: 'pushup', name: 'プッシュアップ（腕立て伏せ）', primary: ['chest'], secondary: ['triceps', 'shoulders'], category: 'compound', equipment: ['bodyweight'], pattern: 'push_horizontal', unilateral: false },
  { id: 'incline_pushup', name: 'インクラインプッシュアップ', primary: ['chest'], secondary: ['triceps', 'shoulders'], category: 'compound', equipment: ['bodyweight'], pattern: 'push_horizontal', unilateral: false, note: '初心者向け・負荷を下げたい時' },
  { id: 'decline_pushup', name: 'デクラインプッシュアップ', primary: ['chest'], secondary: ['triceps', 'shoulders'], category: 'compound', equipment: ['bodyweight'], pattern: 'push_horizontal', unilateral: false, note: '上級者向け・負荷を上げたい時' },
  { id: 'db_bench_press', name: 'ダンベルベンチプレス', primary: ['chest'], secondary: ['triceps', 'shoulders'], category: 'compound', equipment: ['dumbbell'], pattern: 'push_horizontal', unilateral: false },
  { id: 'db_incline_press', name: 'ダンベルインクラインプレス', primary: ['chest'], secondary: ['shoulders', 'triceps'], category: 'compound', equipment: ['dumbbell'], pattern: 'push_horizontal', unilateral: false },
  { id: 'barbell_bench_press', name: 'バーベルベンチプレス', primary: ['chest'], secondary: ['triceps', 'shoulders'], category: 'compound', equipment: ['barbell'], pattern: 'push_horizontal', unilateral: false },
  { id: 'barbell_incline_press', name: 'バーベルインクラインベンチプレス', primary: ['chest'], secondary: ['shoulders', 'triceps'], category: 'compound', equipment: ['barbell'], pattern: 'push_horizontal', unilateral: false },
  { id: 'chest_press_machine', name: 'チェストプレスマシン', primary: ['chest'], secondary: ['triceps', 'shoulders'], category: 'compound', equipment: ['machine'], pattern: 'push_horizontal', unilateral: false },
  { id: 'db_fly', name: 'ダンベルフライ', primary: ['chest'], secondary: [], category: 'isolation', equipment: ['dumbbell'], pattern: 'isolation', unilateral: false },
  { id: 'cable_fly', name: 'ケーブルフライ', primary: ['chest'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'isolation', unilateral: false },
  { id: 'pec_deck', name: 'ペックデックフライ', primary: ['chest'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'isolation', unilateral: false },

  // ===== 背中 =====
  { id: 'pullup', name: '懸垂（プルアップ）', primary: ['back'], secondary: ['biceps'], category: 'compound', equipment: ['bodyweight'], pattern: 'pull_vertical', unilateral: false, note: '要バー' },
  { id: 'inverted_row', name: 'インバーテッドロウ（テーブル/バーを使う）', primary: ['back'], secondary: ['biceps'], category: 'compound', equipment: ['bodyweight'], pattern: 'pull_horizontal', unilateral: false },
  { id: 'db_row', name: 'ダンベルワンハンドロウ', primary: ['back'], secondary: ['biceps'], category: 'compound', equipment: ['dumbbell'], pattern: 'pull_horizontal', unilateral: true },
  { id: 'db_row_both', name: 'ダンベルベントオーバーロウ', primary: ['back'], secondary: ['biceps'], category: 'compound', equipment: ['dumbbell'], pattern: 'pull_horizontal', unilateral: false },
  { id: 'barbell_row', name: 'バーベルベントオーバーロウ', primary: ['back'], secondary: ['biceps'], category: 'compound', equipment: ['barbell'], pattern: 'pull_horizontal', unilateral: false },
  { id: 'lat_pulldown', name: 'ラットプルダウン', primary: ['back'], secondary: ['biceps'], category: 'compound', equipment: ['machine'], pattern: 'pull_vertical', unilateral: false },
  { id: 'seated_row_machine', name: 'シーテッドロウマシン', primary: ['back'], secondary: ['biceps'], category: 'compound', equipment: ['machine'], pattern: 'pull_horizontal', unilateral: false },
  { id: 'straight_arm_pulldown', name: 'ストレートアームプルダウン', primary: ['back'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'isolation', unilateral: false },
  { id: 'superman', name: 'スーパーマン（背筋反らし）', primary: ['back'], secondary: ['glutes'], category: 'isolation', equipment: ['bodyweight'], pattern: 'isolation', unilateral: false },

  // ===== 肩 =====
  { id: 'pike_pushup', name: 'パイクプッシュアップ', primary: ['shoulders'], secondary: ['triceps'], category: 'compound', equipment: ['bodyweight'], pattern: 'push_vertical', unilateral: false },
  { id: 'db_shoulder_press', name: 'ダンベルショルダープレス', primary: ['shoulders'], secondary: ['triceps'], category: 'compound', equipment: ['dumbbell'], pattern: 'push_vertical', unilateral: false },
  { id: 'barbell_shoulder_press', name: 'バーベルショルダープレス', primary: ['shoulders'], secondary: ['triceps'], category: 'compound', equipment: ['barbell'], pattern: 'push_vertical', unilateral: false },
  { id: 'shoulder_press_machine', name: 'ショルダープレスマシン', primary: ['shoulders'], secondary: ['triceps'], category: 'compound', equipment: ['machine'], pattern: 'push_vertical', unilateral: false },
  { id: 'db_lateral_raise', name: 'ダンベルサイドレイズ', primary: ['shoulders'], secondary: [], category: 'isolation', equipment: ['dumbbell'], pattern: 'isolation', unilateral: false },
  { id: 'db_front_raise', name: 'ダンベルフロントレイズ', primary: ['shoulders'], secondary: [], category: 'isolation', equipment: ['dumbbell'], pattern: 'isolation', unilateral: false },
  { id: 'db_rear_delt_fly', name: 'ダンベルリアレイズ', primary: ['shoulders'], secondary: ['back'], category: 'isolation', equipment: ['dumbbell'], pattern: 'isolation', unilateral: false },
  { id: 'cable_lateral_raise', name: 'ケーブルサイドレイズ', primary: ['shoulders'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'isolation', unilateral: false },

  // ===== 腕（二頭・三頭） =====
  { id: 'db_curl', name: 'ダンベルカール', primary: ['biceps'], secondary: [], category: 'isolation', equipment: ['dumbbell'], pattern: 'isolation', unilateral: false },
  { id: 'barbell_curl', name: 'バーベルカール', primary: ['biceps'], secondary: [], category: 'isolation', equipment: ['barbell'], pattern: 'isolation', unilateral: false },
  { id: 'hammer_curl', name: 'ハンマーカール', primary: ['biceps'], secondary: [], category: 'isolation', equipment: ['dumbbell'], pattern: 'isolation', unilateral: false },
  { id: 'cable_curl', name: 'ケーブルカール', primary: ['biceps'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'isolation', unilateral: false },
  { id: 'bench_dip', name: 'ベンチディップス', primary: ['triceps'], secondary: ['chest', 'shoulders'], category: 'compound', equipment: ['bodyweight'], pattern: 'isolation', unilateral: false },
  { id: 'diamond_pushup', name: 'ダイヤモンドプッシュアップ', primary: ['triceps'], secondary: ['chest'], category: 'compound', equipment: ['bodyweight'], pattern: 'push_horizontal', unilateral: false },
  { id: 'db_triceps_extension', name: 'ダンベルトライセプスエクステンション', primary: ['triceps'], secondary: [], category: 'isolation', equipment: ['dumbbell'], pattern: 'isolation', unilateral: false },
  { id: 'db_kickback', name: 'ダンベルキックバック', primary: ['triceps'], secondary: [], category: 'isolation', equipment: ['dumbbell'], pattern: 'isolation', unilateral: false },
  { id: 'cable_pushdown', name: 'ケーブルプッシュダウン', primary: ['triceps'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'isolation', unilateral: false },

  // ===== 脚（大腿四頭筋・ハムストリングス・臀筋・ふくらはぎ） =====
  { id: 'bodyweight_squat', name: 'スクワット（自重）', primary: ['quads'], secondary: ['glutes', 'hamstrings'], category: 'compound', equipment: ['bodyweight'], pattern: 'squat', unilateral: false },
  { id: 'split_squat', name: 'スプリットスクワット', primary: ['quads'], secondary: ['glutes'], category: 'compound', equipment: ['bodyweight'], pattern: 'squat', unilateral: true },
  { id: 'bulgarian_split_squat', name: 'ブルガリアンスプリットスクワット', primary: ['quads'], secondary: ['glutes'], category: 'compound', equipment: ['dumbbell'], pattern: 'squat', unilateral: true },
  { id: 'db_goblet_squat', name: 'ダンベルゴブレットスクワット', primary: ['quads'], secondary: ['glutes'], category: 'compound', equipment: ['dumbbell'], pattern: 'squat', unilateral: false },
  { id: 'barbell_back_squat', name: 'バーベルスクワット', primary: ['quads'], secondary: ['glutes', 'hamstrings'], category: 'compound', equipment: ['barbell'], pattern: 'squat', unilateral: false },
  { id: 'leg_press', name: 'レッグプレス', primary: ['quads'], secondary: ['glutes'], category: 'compound', equipment: ['machine'], pattern: 'squat', unilateral: false },
  { id: 'leg_extension', name: 'レッグエクステンション', primary: ['quads'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'isolation', unilateral: false },
  { id: 'db_romanian_deadlift', name: 'ダンベルルーマニアンデッドリフト', primary: ['hamstrings'], secondary: ['glutes'], category: 'compound', equipment: ['dumbbell'], pattern: 'hinge', unilateral: false },
  { id: 'barbell_romanian_deadlift', name: 'バーベルルーマニアンデッドリフト', primary: ['hamstrings'], secondary: ['glutes'], category: 'compound', equipment: ['barbell'], pattern: 'hinge', unilateral: false },
  { id: 'barbell_deadlift', name: 'バーベルデッドリフト', primary: ['hamstrings'], secondary: ['glutes', 'back'], category: 'compound', equipment: ['barbell'], pattern: 'hinge', unilateral: false },
  { id: 'leg_curl_machine', name: 'レッグカールマシン', primary: ['hamstrings'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'isolation', unilateral: false },
  { id: 'glute_bridge', name: 'グルートブリッジ', primary: ['glutes'], secondary: ['hamstrings'], category: 'compound', equipment: ['bodyweight'], pattern: 'hinge', unilateral: false },
  { id: 'hip_thrust', name: 'ヒップスラスト', primary: ['glutes'], secondary: ['hamstrings'], category: 'compound', equipment: ['dumbbell'], pattern: 'hinge', unilateral: false },
  { id: 'hip_abduction_machine', name: 'ヒップアブダクションマシン', primary: ['glutes'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'isolation', unilateral: false },
  { id: 'calf_raise', name: 'カーフレイズ（自重）', primary: ['calves'], secondary: [], category: 'isolation', equipment: ['bodyweight'], pattern: 'isolation', unilateral: false },
  { id: 'db_calf_raise', name: 'ダンベルカーフレイズ', primary: ['calves'], secondary: [], category: 'isolation', equipment: ['dumbbell'], pattern: 'isolation', unilateral: false },
  { id: 'calf_raise_machine', name: 'カーフレイズマシン', primary: ['calves'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'isolation', unilateral: false },

  // ===== 体幹・腹筋 =====
  { id: 'plank', name: 'プランク', primary: ['abs'], secondary: [], category: 'isolation', equipment: ['bodyweight'], pattern: 'core', unilateral: false },
  { id: 'side_plank', name: 'サイドプランク', primary: ['abs'], secondary: [], category: 'isolation', equipment: ['bodyweight'], pattern: 'core', unilateral: true },
  { id: 'crunch', name: 'クランチ', primary: ['abs'], secondary: [], category: 'isolation', equipment: ['bodyweight'], pattern: 'core', unilateral: false },
  { id: 'leg_raise', name: 'レッグレイズ', primary: ['abs'], secondary: [], category: 'isolation', equipment: ['bodyweight'], pattern: 'core', unilateral: false },
  { id: 'mountain_climber', name: 'マウンテンクライマー', primary: ['abs'], secondary: ['shoulders'], category: 'isolation', equipment: ['bodyweight'], pattern: 'core', unilateral: false },
  { id: 'cable_crunch', name: 'ケーブルクランチ', primary: ['abs'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'core', unilateral: false },
  { id: 'ab_wheel', name: 'アブローラー', primary: ['abs'], secondary: ['shoulders'], category: 'compound', equipment: ['bodyweight'], pattern: 'core', unilateral: false, note: '中級者以上向け' },
];

if (typeof module !== 'undefined') {
  module.exports = { MUSCLE_GROUPS, PATTERN_ORDER, EXERCISES };
}
