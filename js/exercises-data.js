// 種目データベース。
// 各種目は「主動筋(primary)」「補助筋(secondary)」「種目カテゴリ」「必要器具」「動作パターン」「片側種目か」を持つ。
// description は初心者向けのフォームのポイント・注意点の短い説明（iアイコンから表示）。
// bodyweightLoadFactor は自重種目で実際に体のどれくらいの割合が負荷になっているかの推定値（体重×この値＝推定負荷）。
// プッシュアップ系のみ研究値（Ebben et al., 2011, J Strength Cond Res「Kinetic Analysis of Several
// Variations of Push-Up」）に基づく数値を設定し、根拠のある数値が見当たらない種目は未設定のまま
// （その場合は体重100%をそのまま負荷とみなす）。
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
  { id: 'pushup', name: 'プッシュアップ（腕立て伏せ）', primary: ['chest'], secondary: ['triceps', 'shoulders'], category: 'compound', equipment: ['bodyweight'], pattern: 'push_horizontal', unilateral: false, riskAreas: ['手首'], bodyweightLoadFactor: 0.64,
    description: '手は肩幅よりやや広め。体は頭からかかとまで一直線を保ち、お尻が上下しないように。胸が床に近づくまで下ろす。',
    demoMedia: 'media/exercises/pushup.mp4' },
  { id: 'incline_pushup', name: 'インクラインプッシュアップ', primary: ['chest'], secondary: ['triceps', 'shoulders'], category: 'compound', equipment: ['bodyweight'], pattern: 'push_horizontal', unilateral: false, riskAreas: ['手首'], bodyweightLoadFactor: 0.5, note: '初心者向け・負荷を下げたい時',
    description: '台や椅子に手をついて行う腕立て伏せ。角度が急なほど負荷が下がるので、通常のプッシュアップがきつい人はここから。' },
  { id: 'decline_pushup', name: 'デクラインプッシュアップ', primary: ['chest'], secondary: ['triceps', 'shoulders'], category: 'compound', equipment: ['bodyweight'], pattern: 'push_horizontal', unilateral: false, riskAreas: ['手首', '肩'], bodyweightLoadFactor: 0.7, note: '上級者向け・負荷を上げたい時',
    description: '足を台に乗せて行う腕立て伏せ。上半身側が下がる分、通常より負荷が上がる。体幹が反らないよう腹に力を入れる。' },
  { id: 'db_bench_press', name: 'ダンベルベンチプレス', primary: ['chest'], secondary: ['triceps', 'shoulders'], category: 'compound', equipment: ['dumbbell'], pattern: 'push_horizontal', unilateral: false, riskAreas: ['肩'],
    description: 'ベンチに仰向けになり、ダンベルを胸の横まで下ろしてから押し上げる。肩をすくめず、肩甲骨をベンチに寄せて固定する。' },
  { id: 'db_incline_press', name: 'ダンベルインクラインプレス', primary: ['chest'], secondary: ['shoulders', 'triceps'], category: 'compound', equipment: ['dumbbell'], pattern: 'push_horizontal', unilateral: false, riskAreas: ['肩'],
    description: 'ベンチを30〜45度に傾けて行うプレス。胸の上部に効きやすい。角度をつけすぎると肩に負担が集中するので注意。' },
  { id: 'barbell_bench_press', name: 'バーベルベンチプレス', primary: ['chest'], secondary: ['triceps', 'shoulders'], category: 'compound', equipment: ['barbell'], pattern: 'push_horizontal', unilateral: false, riskAreas: ['肩'],
    description: '肩甲骨を寄せてベンチに固定し、バーを胸の中央あたりまで下ろす。高重量を扱う種目なので必ずセーフティバーかスポッターを用意する。' },
  { id: 'barbell_incline_press', name: 'バーベルインクラインベンチプレス', primary: ['chest'], secondary: ['shoulders', 'triceps'], category: 'compound', equipment: ['barbell'], pattern: 'push_horizontal', unilateral: false, riskAreas: ['肩'],
    description: 'インクラインベンチでのバーベルプレス。胸上部を狙う種目。フラットより扱える重量は下がるのが普通。' },
  { id: 'chest_press_machine', name: 'チェストプレスマシン', primary: ['chest'], secondary: ['triceps', 'shoulders'], category: 'compound', equipment: ['machine'], pattern: 'push_horizontal', unilateral: false, riskAreas: [],
    description: 'シートの高さを、グリップが胸の高さにくるよう調整する。軌道が固定されているためフォームを覚えるのに向く。' },
  { id: 'db_fly', name: 'ダンベルフライ', primary: ['chest'], secondary: [], category: 'isolation', equipment: ['dumbbell'], pattern: 'isolation', unilateral: false, riskAreas: ['肩'],
    description: '肘を軽く曲げたまま円を描くように腕を開閉する。肩の高さより下げすぎると肩関節に負担がかかるので可動域は無理をしない。' },
  { id: 'cable_fly', name: 'ケーブルフライ', primary: ['chest'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'isolation', unilateral: false, riskAreas: ['肩'],
    description: 'ケーブルを胸の高さで両手から前方に絞り込む。最後にひと絞りするイメージで胸を収縮させる。' },
  { id: 'pec_deck', name: 'ペックデックフライ', primary: ['chest'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'isolation', unilateral: false, riskAreas: [],
    description: '背中をパッドにつけたまま、腕を胸の前で閉じる。反動を使わずゆっくり戻すことで胸への負荷を保てる。' },

  // ===== 背中 =====
  { id: 'pullup', name: '懸垂（プルアップ）', primary: ['back'], secondary: ['biceps'], category: 'compound', equipment: ['bodyweight'], pattern: 'pull_vertical', unilateral: false, riskAreas: ['肩'], note: '要バー',
    description: '肩幅よりやや広めにバーを握り、顎がバーを超えるまで体を引き上げる。反動を使わず肩甲骨を下げてから引くとフォームが安定する。' },
  { id: 'inverted_row', name: 'インバーテッドロウ（テーブル/バーを使う）', primary: ['back'], secondary: ['biceps'], category: 'compound', equipment: ['bodyweight'], pattern: 'pull_horizontal', unilateral: false, riskAreas: ['肩'],
    description: '固定したバーや頑丈なテーブルの下に入り、体を一直線に保ったまま胸をバーに近づける。角度で負荷を調整できる。' },
  { id: 'db_row', name: 'ダンベルワンハンドロウ', primary: ['back'], secondary: ['biceps'], category: 'compound', equipment: ['dumbbell'], pattern: 'pull_horizontal', unilateral: true, riskAreas: ['腰'],
    description: '片手・片膝をベンチにつき、上体を床と平行に保ってダンベルを腰に引き寄せる。体を捻らず肘を後方に引くのがポイント。' },
  { id: 'db_row_both', name: 'ダンベルベントオーバーロウ', primary: ['back'], secondary: ['biceps'], category: 'compound', equipment: ['dumbbell'], pattern: 'pull_horizontal', unilateral: false, riskAreas: ['腰'],
    description: '股関節から上体を前傾させ、背中を丸めずにダンベルを腹の方へ引く。腰への負担が大きいので前傾角度を無理に深くしすぎない。' },
  { id: 'barbell_row', name: 'バーベルベントオーバーロウ', primary: ['back'], secondary: ['biceps'], category: 'compound', equipment: ['barbell'], pattern: 'pull_horizontal', unilateral: false, riskAreas: ['腰'],
    description: '前傾姿勢でバーをへそのあたりに引く。腰が丸まると怪我のリスクが上がるため、背中は常に真っ直ぐを意識する。' },
  { id: 'lat_pulldown', name: 'ラットプルダウン', primary: ['back'], secondary: ['biceps'], category: 'compound', equipment: ['machine'], pattern: 'pull_vertical', unilateral: false, riskAreas: ['肩'],
    description: 'バーを鎖骨の少し下あたりまで引き下げる。体を大きく反らして反動を使わず、広背筋で引く意識を持つ。' },
  { id: 'seated_row_machine', name: 'シーテッドロウマシン', primary: ['back'], secondary: ['biceps'], category: 'compound', equipment: ['machine'], pattern: 'pull_horizontal', unilateral: false, riskAreas: [],
    description: '胸を張った姿勢を保ち、グリップを腹のあたりに引き寄せる。肩をすくめず肩甲骨を寄せる動きを意識する。' },
  { id: 'straight_arm_pulldown', name: 'ストレートアームプルダウン', primary: ['back'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'isolation', unilateral: false, riskAreas: ['肩'],
    description: '肘をほぼ伸ばしたまま、バーを弧を描くように太もも前まで押し下げる。広背筋の収縮を感じやすい種目。' },
  { id: 'superman', name: 'スーパーマン（背筋反らし）', primary: ['back'], secondary: ['glutes'], category: 'isolation', equipment: ['bodyweight'], pattern: 'isolation', unilateral: false, riskAreas: ['腰'],
    description: 'うつ伏せで手足を同時に軽く持ち上げ数秒キープする。反動をつけず、腰を痛めない範囲でゆっくり行う。' },

  // ===== 肩 =====
  { id: 'pike_pushup', name: 'パイクプッシュアップ', primary: ['shoulders'], secondary: ['triceps'], category: 'compound', equipment: ['bodyweight'], pattern: 'push_vertical', unilateral: false, riskAreas: ['肩', '手首'],
    description: 'お尻を高く上げた「への字」の姿勢から頭を床に近づける腕立て伏せ。肩に縦方向の負荷がかかる。手首・肩に痛みがあれば中止する。' },
  { id: 'db_shoulder_press', name: 'ダンベルショルダープレス', primary: ['shoulders'], secondary: ['triceps'], category: 'compound', equipment: ['dumbbell'], pattern: 'push_vertical', unilateral: false, riskAreas: ['肩'],
    description: '座るか立った状態で、肩の横からダンベルを頭上へ押し上げる。腰を反らしすぎないよう腹に力を入れて体幹を安定させる。' },
  { id: 'barbell_shoulder_press', name: 'バーベルショルダープレス', primary: ['shoulders'], secondary: ['triceps'], category: 'compound', equipment: ['barbell'], pattern: 'push_vertical', unilateral: false, riskAreas: ['肩'],
    description: '鎖骨の前あたりからバーを頭上へ押し上げる。押し上げる時に顔にバーが当たらないよう軌道を少し前後させる。' },
  { id: 'shoulder_press_machine', name: 'ショルダープレスマシン', primary: ['shoulders'], secondary: ['triceps'], category: 'compound', equipment: ['machine'], pattern: 'push_vertical', unilateral: false, riskAreas: [],
    description: 'グリップが肩の高さにくるようシートを調整する。軌道が固定されているので肩関節への負担が少なめ。' },
  { id: 'db_lateral_raise', name: 'ダンベルサイドレイズ', primary: ['shoulders'], secondary: [], category: 'isolation', equipment: ['dumbbell'], pattern: 'isolation', unilateral: false, riskAreas: ['肩'],
    description: '肘を軽く曲げたまま、腕を体の横から肩の高さまで上げる。勢いをつけず、肩をすくめないようにゆっくり行う。' },
  { id: 'db_front_raise', name: 'ダンベルフロントレイズ', primary: ['shoulders'], secondary: [], category: 'isolation', equipment: ['dumbbell'], pattern: 'isolation', unilateral: false, riskAreas: ['肩'],
    description: '腕を体の前から肩の高さまで上げる。反動をつけず、上げすぎて肩がすくまない高さで止める。' },
  { id: 'db_rear_delt_fly', name: 'ダンベルリアレイズ', primary: ['shoulders'], secondary: ['back'], category: 'isolation', equipment: ['dumbbell'], pattern: 'isolation', unilateral: false, riskAreas: ['肩'],
    description: '上体を前傾させ、腕を横に開いて肩の後ろ側を鍛える。背中が丸まらないよう胸を張った姿勢を保つ。' },
  { id: 'cable_lateral_raise', name: 'ケーブルサイドレイズ', primary: ['shoulders'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'isolation', unilateral: false, riskAreas: ['肩'],
    description: 'ケーブルを体の横から肩の高さまで上げる。ダンベルと違い動作中ずっと負荷がかかり続けるのが特徴。' },

  // ===== 腕（二頭・三頭） =====
  { id: 'db_curl', name: 'ダンベルカール', primary: ['biceps'], secondary: [], category: 'isolation', equipment: ['dumbbell'], pattern: 'isolation', unilateral: false, riskAreas: [],
    description: '肘の位置を固定したまま、前腕だけを動かしてダンベルを持ち上げる。体を反らして反動をつけないよう注意。' },
  { id: 'barbell_curl', name: 'バーベルカール', primary: ['biceps'], secondary: [], category: 'isolation', equipment: ['barbell'], pattern: 'isolation', unilateral: false, riskAreas: [],
    description: '肘を体の横に固定し、バーを巻き上げる。腰を反らして反動で挙げると効果が薄れるので重量は上げすぎない。' },
  { id: 'hammer_curl', name: 'ハンマーカール', primary: ['biceps'], secondary: [], category: 'isolation', equipment: ['dumbbell'], pattern: 'isolation', unilateral: false, riskAreas: [],
    description: '手のひらを向かい合わせたまま（ハンマーを持つ向き）カールする。前腕にも刺激が入りやすい。' },
  { id: 'cable_curl', name: 'ケーブルカール', primary: ['biceps'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'isolation', unilateral: false, riskAreas: [],
    description: 'ケーブルを使ったカール。ダンベルと違い上げきった位置でも負荷が抜けにくい。' },
  { id: 'bench_dip', name: 'ベンチディップス', primary: ['triceps'], secondary: ['chest', 'shoulders'], category: 'compound', equipment: ['bodyweight'], pattern: 'isolation', unilateral: false, riskAreas: ['肩', '手首'],
    description: 'ベンチに手をつき、肘を曲げてお尻を下ろしてから押し上げる。肩をすくめず、肘を体の後方に開きすぎないようにする。' },
  { id: 'diamond_pushup', name: 'ダイヤモンドプッシュアップ', primary: ['triceps'], secondary: ['chest'], category: 'compound', equipment: ['bodyweight'], pattern: 'push_horizontal', unilateral: false, riskAreas: ['手首', '肩'], bodyweightLoadFactor: 0.64,
    description: '両手の親指と人差し指でダイヤモンド形を作って行う腕立て伏せ。通常より三頭筋への負荷が強く、手首への負担も増えるので注意。' },
  { id: 'db_triceps_extension', name: 'ダンベルトライセプスエクステンション', primary: ['triceps'], secondary: [], category: 'isolation', equipment: ['dumbbell'], pattern: 'isolation', unilateral: false, riskAreas: ['肩'],
    description: '頭上でダンベルを持ち、肘を支点にして後頭部側へ下ろしてから伸ばす。肘が左右に開かないよう固定する。' },
  { id: 'db_kickback', name: 'ダンベルキックバック', primary: ['triceps'], secondary: [], category: 'isolation', equipment: ['dumbbell'], pattern: 'isolation', unilateral: false, riskAreas: [],
    description: '上体を前傾させ、肘を体の横に固定したまま前腕だけを後方に伸ばす。肘の位置が動かないよう意識する。' },
  { id: 'cable_pushdown', name: 'ケーブルプッシュダウン', primary: ['triceps'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'isolation', unilateral: false, riskAreas: [],
    description: '肘を体の横に固定し、バーやロープを下に押し下げる。肘が前後に動くと負荷が逃げるので固定を意識する。' },

  // ===== 脚（大腿四頭筋・ハムストリングス・臀筋・ふくらはぎ） =====
  { id: 'bodyweight_squat', name: 'スクワット（自重）', primary: ['quads'], secondary: ['glutes', 'hamstrings'], category: 'compound', equipment: ['bodyweight'], pattern: 'squat', unilateral: false, riskAreas: ['膝'],
    description: '足は肩幅程度に開き、お尻を後ろに引きながら膝を曲げる。膝がつま先より内側に入らないよう、太ももが床と平行になるくらいまで下ろす。' },
  { id: 'split_squat', name: 'スプリットスクワット', primary: ['quads'], secondary: ['glutes'], category: 'compound', equipment: ['bodyweight'], pattern: 'squat', unilateral: true, riskAreas: ['膝'],
    description: '前後に足を大きく開き、その場で上下する片脚寄りのスクワット。前膝がつま先より大きく前に出すぎないよう注意。' },
  { id: 'bulgarian_split_squat', name: 'ブルガリアンスプリットスクワット', primary: ['quads'], secondary: ['glutes'], category: 'compound', equipment: ['dumbbell'], pattern: 'squat', unilateral: true, riskAreas: ['膝'],
    description: '後ろ足を台に乗せて行うスプリットスクワット。バランスが難しいので、まず自重で慣れてからダンベルを持つとよい。' },
  { id: 'db_goblet_squat', name: 'ダンベルゴブレットスクワット', primary: ['quads'], secondary: ['glutes'], category: 'compound', equipment: ['dumbbell'], pattern: 'squat', unilateral: false, riskAreas: ['膝'],
    description: 'ダンベルを胸の前で両手で抱えて行うスクワット。重りが体の近くにあるためバランスを取りやすく、フォーム習得に向く。' },
  { id: 'barbell_back_squat', name: 'バーベルスクワット', primary: ['quads'], secondary: ['glutes', 'hamstrings'], category: 'compound', equipment: ['barbell'], pattern: 'squat', unilateral: false, riskAreas: ['膝', '腰'],
    description: 'バーを僧帽筋の上に担いでしゃがむ。高重量を扱うため、ラックのセーフティバーの高さを必ず調整してから行う。' },
  { id: 'leg_press', name: 'レッグプレス', primary: ['quads'], secondary: ['glutes'], category: 'compound', equipment: ['machine'], pattern: 'squat', unilateral: false, riskAreas: ['膝'],
    description: 'シートに座り足でプレートを押す。腰が座面から浮くほど深く曲げすぎない範囲で可動域をとる。' },
  { id: 'leg_extension', name: 'レッグエクステンション', primary: ['quads'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'isolation', unilateral: false, riskAreas: ['膝'],
    description: '座った状態で膝を伸ばしパッドを蹴り上げる。反動をつけず、下ろす時もゆっくりコントロールする。' },
  { id: 'db_romanian_deadlift', name: 'ダンベルルーマニアンデッドリフト', primary: ['hamstrings'], secondary: ['glutes'], category: 'compound', equipment: ['dumbbell'], pattern: 'hinge', unilateral: false, riskAreas: ['腰'],
    description: '膝を軽く曲げたまま、お尻を後ろに引いてダンベルをすねの前あたりまで下ろす。背中は丸めず、ハムストリングスが伸びる感覚を意識する。' },
  { id: 'barbell_romanian_deadlift', name: 'バーベルルーマニアンデッドリフト', primary: ['hamstrings'], secondary: ['glutes'], category: 'compound', equipment: ['barbell'], pattern: 'hinge', unilateral: false, riskAreas: ['腰'],
    description: 'バーを体に沿わせながら股関節を後ろに引いて下ろす。背中の丸まりが最も怪我につながりやすいので特に注意する。' },
  { id: 'barbell_deadlift', name: 'バーベルデッドリフト', primary: ['hamstrings'], secondary: ['glutes', 'back'], category: 'compound', equipment: ['barbell'], pattern: 'hinge', unilateral: false, riskAreas: ['腰', '膝'],
    description: '床のバーを股関節と膝を同時に使って引き上げる全身種目。背中を丸めないフォームが最重要。初めては軽い重量からフォーム習得を優先する。' },
  { id: 'leg_curl_machine', name: 'レッグカールマシン', primary: ['hamstrings'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'isolation', unilateral: false, riskAreas: ['膝'],
    description: 'うつ伏せまたは座った状態で膝を曲げてパッドを引きつける。腰が反りすぎないよう腹に軽く力を入れる。' },
  { id: 'glute_bridge', name: 'グルートブリッジ', primary: ['glutes'], secondary: ['hamstrings'], category: 'compound', equipment: ['bodyweight'], pattern: 'hinge', unilateral: false, riskAreas: ['腰'],
    description: '仰向けで膝を立て、お尻を締めながら腰を持ち上げる。腰を反りすぎず、お尻の力で持ち上げる意識を持つ。' },
  { id: 'hip_thrust', name: 'ヒップスラスト', primary: ['glutes'], secondary: ['hamstrings'], category: 'compound', equipment: ['dumbbell'], pattern: 'hinge', unilateral: false, riskAreas: ['腰'],
    description: '肩甲骨をベンチに乗せ、ダンベルを腰の上に乗せて腰を突き上げる。臀筋にしっかり効かせるため、一番上でお尻を締める。' },
  { id: 'hip_abduction_machine', name: 'ヒップアブダクションマシン', primary: ['glutes'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'isolation', unilateral: false, riskAreas: [],
    description: '座った状態で両膝を外側に開く。反動をつけず、お尻の外側の筋肉で開く意識を持つ。' },
  { id: 'calf_raise', name: 'カーフレイズ（自重）', primary: ['calves'], secondary: [], category: 'isolation', equipment: ['bodyweight'], pattern: 'isolation', unilateral: false, riskAreas: [],
    description: 'つま先立ちになりかかとを上げ下げする。段差の上でかかとを下まで下ろすとより可動域が広がる。' },
  { id: 'db_calf_raise', name: 'ダンベルカーフレイズ', primary: ['calves'], secondary: [], category: 'isolation', equipment: ['dumbbell'], pattern: 'isolation', unilateral: false, riskAreas: [],
    description: 'ダンベルを持ってつま先立ちを繰り返す。バランスを崩しやすいので壁や柱に手を添えて行うと安全。' },
  { id: 'calf_raise_machine', name: 'カーフレイズマシン', primary: ['calves'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'isolation', unilateral: false, riskAreas: [],
    description: 'マシンでつま先立ちを繰り返す。かかとを下げた時にふくらはぎがしっかり伸びる範囲まで下ろす。' },

  // ===== 体幹・腹筋 =====
  { id: 'plank', name: 'プランク', primary: ['abs'], secondary: [], category: 'isolation', equipment: ['bodyweight'], pattern: 'core', unilateral: false, riskAreas: ['手首', '肩'], holdBased: true,
    description: '肘とつま先で体を支え、頭からかかとまで一直線を保つ。お尻が上がったり腰が反ったりしないよう意識してキープする。' },
  { id: 'side_plank', name: 'サイドプランク', primary: ['abs'], secondary: [], category: 'isolation', equipment: ['bodyweight'], pattern: 'core', unilateral: true, riskAreas: ['手首', '肩'], holdBased: true,
    description: '横向きで肘と足の側面で体を支える。腰が落ちないよう体を一直線に保ってキープする。' },
  { id: 'crunch', name: 'クランチ', primary: ['abs'], secondary: [], category: 'isolation', equipment: ['bodyweight'], pattern: 'core', unilateral: false, riskAreas: [],
    description: '仰向けで膝を立て、肩甲骨が浮く程度に上体を丸める。首に力を入れて引っ張らないよう注意する。' },
  { id: 'leg_raise', name: 'レッグレイズ', primary: ['abs'], secondary: [], category: 'isolation', equipment: ['bodyweight'], pattern: 'core', unilateral: false, riskAreas: ['腰'],
    description: '仰向けで脚を伸ばしたまま上げ下げする。腰が床から浮いて反ってしまう場合は膝を軽く曲げて行う。' },
  { id: 'mountain_climber', name: 'マウンテンクライマー', primary: ['abs'], secondary: ['shoulders'], category: 'isolation', equipment: ['bodyweight'], pattern: 'core', unilateral: false, riskAreas: ['手首', '肩'], bodyweightLoadFactor: 0.64,
    description: '腕立て伏せの姿勢から交互に膝を胸へ引きつける。お尻が上がりすぎないよう体幹を固定したまま行う。' },
  { id: 'cable_crunch', name: 'ケーブルクランチ', primary: ['abs'], secondary: [], category: 'isolation', equipment: ['machine'], pattern: 'core', unilateral: false, riskAreas: [],
    description: 'ケーブルを頭の後ろで持ち、股関節を動かさず背中を丸めるように上体を下げる。腕の力で引かないようにする。' },
  { id: 'ab_wheel', name: 'アブローラー', primary: ['abs'], secondary: ['shoulders'], category: 'compound', equipment: ['bodyweight'], pattern: 'core', unilateral: false, riskAreas: ['腰', '肩', '手首'], note: '中級者以上向け',
    description: '膝立ちでローラーを前に転がし、体が伸びきる手前で戻す。腰が反ると負担が大きいので無理のない範囲で戻す。' },

  // ===== 有酸素 =====
  // type:'cardio'の種目は「セット×回数×重量」ではなく「時間・距離・RPE」で記録する別UIを使う
  // （js/ui.jsのrenderLog内でtype==='cardio'を分岐）。metは2024 Adult Compendium of Physical
  // Activities（Ainsworth et al.）に基づく中強度時の代表値。hasDistanceは距離入力欄を出すかどうか
  // （屋外で実際の距離が測れる種目のみtrue。エアロバイク等の室内マシンは時間・RPEのみで記録する）。
  // primary/patternは強度別の自動メニュー生成では使わない(自分で作る/今日のメニューへの手動追加のみ対応)が、
  // ウォームアップ・クールダウンの自動提案（動作パターン・使う筋肉ベース）とは連動する。
  { id: 'walking', name: 'ウォーキング', primary: ['quads', 'hamstrings', 'calves'], secondary: [], category: 'cardio', equipment: ['cardio_outdoor'], pattern: 'cardio', unilateral: false, riskAreas: [],
    type: 'cardio', hasDistance: true, met: 3.8,
    description: '普通〜やや速歩のペース。背筋を伸ばし、かかとから着地してつま先で蹴り出すことを意識する。' },
  { id: 'running', name: 'ランニング', primary: ['quads', 'hamstrings', 'calves', 'glutes'], secondary: [], category: 'cardio', equipment: ['cardio_outdoor'], pattern: 'cardio', unilateral: false, riskAreas: ['膝'],
    type: 'cardio', hasDistance: true, met: 9.3,
    description: '時速6km前後の一定ペースを目安に。着地の衝撃が大きいので、膝や足首に違和感がある時は無理をしない。' },
  { id: 'outdoor_cycling', name: '自転車（屋外）', primary: ['quads', 'hamstrings', 'glutes'], secondary: ['calves'], category: 'cardio', equipment: ['cardio_outdoor'], pattern: 'cardio', unilateral: false, riskAreas: [],
    type: 'cardio', hasDistance: true, met: 8.0,
    description: '時速12〜14km程度のペースを目安に。サドルの高さはペダルが一番下にきた時に膝が軽く曲がる程度に調整する。' },
  { id: 'stationary_bike', name: 'エアロバイク（室内）', primary: ['quads', 'hamstrings', 'glutes'], secondary: ['calves'], category: 'cardio', equipment: ['cardio_machine'], pattern: 'cardio', unilateral: false, riskAreas: [],
    type: 'cardio', hasDistance: false, met: 6.8,
    description: '負荷を調整して一定のペースを保つ。天候に左右されず自宅で行える。サドル位置は屋外の自転車と同様に調整する。' },
  { id: 'elliptical', name: 'エリプティカル（クロストレーナー）', primary: ['quads', 'hamstrings', 'glutes'], secondary: ['shoulders'], category: 'cardio', equipment: ['cardio_machine'], pattern: 'cardio', unilateral: false, riskAreas: [],
    type: 'cardio', hasDistance: false, met: 5.0,
    description: '足が地面から離れないため着地の衝撃が少ない。ハンドルを前後に押し引きすると上半身も一緒に使える。' },
  { id: 'rowing_machine', name: 'ローイングマシン', primary: ['back', 'hamstrings', 'quads'], secondary: ['biceps'], category: 'cardio', equipment: ['cardio_machine'], pattern: 'cardio', unilateral: false, riskAreas: ['腰'],
    type: 'cardio', hasDistance: false, met: 7.0,
    description: '脚→体幹→腕の順に力を伝えて引き、戻す時は腕→体幹→脚の順で戻る。腰を丸めたまま引かないよう注意する。' },
  { id: 'jump_rope', name: '縄跳び', primary: ['calves', 'quads'], secondary: ['shoulders'], category: 'cardio', equipment: ['cardio_outdoor'], pattern: 'cardio', unilateral: false, riskAreas: ['膝'],
    type: 'cardio', hasDistance: false, met: 11.0,
    description: '高く跳びすぎず、足首とふくらはぎの弾みだけで小さく跳ぶ。着地の衝撃が大きいので膝に不安がある時は控えめに。' },
  { id: 'stair_climbing', name: '階段昇降・ステッパー', primary: ['quads', 'glutes', 'calves'], secondary: [], category: 'cardio', equipment: ['cardio_machine'], pattern: 'cardio', unilateral: false, riskAreas: ['膝'],
    type: 'cardio', hasDistance: false, met: 8.8,
    description: '一段ずつ足裏全体で踏むイメージで。膝がつま先より内側に入らないよう注意する。' },
  { id: 'swimming', name: '水泳', primary: ['back', 'shoulders', 'quads'], secondary: ['triceps', 'abs'], category: 'cardio', equipment: ['cardio_pool'], pattern: 'cardio', unilateral: false, riskAreas: ['肩'],
    type: 'cardio', hasDistance: false, met: 6.0,
    description: '呼吸のタイミングを一定にし、無理なく続けられるペースで。肩に痛みがある場合は無理に大きく回さない。' },
];

if (typeof module !== 'undefined') {
  module.exports = { MUSCLE_GROUPS, PATTERN_ORDER, EXERCISES };
}
