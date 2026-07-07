# 引き継ぎメモ: Rigifyベースのキャラクター作り直し (2026-07-07時点)

## 経緯(要約)
プッシュアップ解説動画を円柱プリミティブ→メタボールで作っていたが、
「関節がなめらかに繋がらない・見た目が安っぽい」という指摘を受け、
Blender公式のちゃんとした人体メッシュ+ボーンリグに作り直すことにした。

## できたこと(このフォルダの中身)
- **`character_rigged.blend`** — 完成品。Blender Studio公式配布の
  無料人体メッシュ(CC0ライセンス、著作権フリー)`stylized_body_male`を
  Rigify(Blender標準アドオン)の人体リグで自動リギングし、
  「自動のウェイトで」メッシュとボーンを結合済み。
  - オブジェクト名: `GEO-body_male_stylized` (メッシュ), `rig` (アーマチュア)
  - 身長スケール調整・Tポーズ→Aポーズ(腕を下ろす)への回転も適用済み
- **`build_character.py`** — 上記を最初から作るスクリプト
  (メッシュのダウンロード→Rigifyメタリグ追加→スケール・Aポーズ回転)
- **`generate_and_bind.py`** — `build_character.py`が保存した
  `character_wip.blend`を開き、Rigifyでリグ生成→自動ウェイトで結合する
  (このスクリプトは`character_wip.blend`という中間ファイルを読む前提だが、
  そのファイル自体はセッション固有のscratchpadにしかなく消えている可能性が
  高い。**再生成する場合は build_character.py を先に実行して
  character_wip.blend を作ってから generate_and_bind.py を実行すること**)
- **`test_pose_render.py`** — 動作確認用。`character_rigged.blend`を開き、
  肘を曲げて(FKボーン`forearm_fk.L/R`を回転)レンダリングする。
  結果は`pose_test_reference.png`(肘がなめらかに曲がることを確認済み)。

## 素材の入手元
- 人体メッシュ: Blender Studio「Human Base Meshes」(CC0)
  公式配布ページ: https://download.blender.org/demo/asset-bundles/human-base-meshes/
  (直リンクが403だったのでarchive.orgミラー経由で取得した:
  https://archive.org/download/human-base-meshes-bundle-v1.0.0/human-base-meshes-bundle-v1.0.0.zip )
  ローカル展開先: `C:\Users\takub\Tools\human-base-meshes\human_base_meshes_bundle.blend`
  使ったオブジェクト名: `GEO-body_male_stylized` (男性・スタイライズ版。
  リストには他に女性版・リアル版・パーツ単体なども含まれる)
- Rigify: Blenderに標準搭載。有効化は
  `bpy.ops.preferences.addon_enable(module='rigify')`
  **Blenderプロセスを新しく起動するたびに毎回この有効化が必要**
  (アドオン有効化状態はプロセス間で保持されない。これで1回ハマった)

## ボーン構造の要点(pose_bones)
Rigifyが生成する主なFK(順運動学)コントロールボーン:
- `upper_arm_fk.L/R`, `forearm_fk.L/R`, `hand_fk.L/R`
- 脚も同様に `thigh_fk.L/R`, `shin_fk.L/R`, `foot_fk.L/R` のはず(要確認)
- IK(逆運動学)も使える: `hand_ik.L/R`, `upper_arm_ik_target.L/R` など
  (プッシュアップは手足を床に固定する動きなので、Rigify自体のIK機能を
  使った方が今までの自前IK計算より楽にできる可能性が高い。要検討)

## ハマった点(次回同じ罠を踏まないために)
1. **`bpy.ops.pose.rigify_generate()`は`--background`の新規プロセスで
   毎回`rigify`アドオンを`addon_enable`しないと"could not be found"エラーになる**
2. **メタリグのボーンをPythonで回転させる時、`use_connect=True`の子ボーンの
   `head`を直接書き換えると親の`tail`と競合して意図しない上書きが起きる**
   (子ボーンは`tail`だけ設定し、`head`は`use_connect`でない時だけ設定する)
3. **appendした人体メッシュのオブジェクトが`location=(-0.45,0,0)`のように
   ワールド原点からズレていた**(元ファイルの独自シーン配置のせい)。
   ボーンとメッシュが噛み合わなくなるので、append直後に
   `body.location = (0,0,0)`で原点に戻す必要がある
4. バンドル内のオブジェクト名に注意: `stylized_body_male`という名前は
   実は**カメラ**で、実際のメッシュは`GEO-body_male_stylized`という別名。
   紛らわしいので`bpy.data.libraries.load()`で対象を絞る前に
   `data_from.objects`の中身とタイプを確認すること

## 次にやること
1. 腕のAポーズ角度(現在Y軸56度回転)は目視確認していない可能性があるので、
   実際にメッシュを立たせてレンダリングし、腕の見た目(特に手の横幅)が
   おかしくないか確認する(前回の数値チェックでは手の位置がメッシュの
   実際の腕幅より内側に寄っている可能性が示唆されていた)
2. 脚のボーン(thigh/shin/foot)も同様にA-pose確認・必要なら角度調整
3. これまでの`build_pushup.py`の逆運動学ロジック(手足を床に固定して
   肩・肘の角度を逆算する部分)を、このRigifyキャラクターのボーンを
   動かす形に移植する。Rigify自体のIK機能(`hand_ik.L/R`を床の固定点に
   configureする)を使うと自前IKを書き直さずに済む可能性がある
4. カメラ位置・ライティング・ジムの背景セット(壁・ダンベルラック・
   ミラー等、以前の`build_pushup.py`にあったもの)をこの新しいキャラクター
   の身長・プロポーションに合わせて再調整する
5. VOICEVOXナレーション・字幕・カメラ切り替え(肘の見下ろしショット等)の
   仕組みは既存のもの(`generate_narration.py`, `render_pushup.py`)を
   そのまま流用できるはず(タイムラインの仕組み自体は変更不要)

## 環境メモ
- Blender: `%USERPROFILE%\Tools\blender-5.1.2-windows-x64\blender.exe`
- ffmpeg: `C:\Users\takub\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe`
- VOICEVOXエンジン: `%USERPROFILE%\Tools\voicevox\VOICEVOX\vv-engine\run.exe`
  (起動してから`http://localhost:50021/version`で確認できる。
  起動していないとナレーション生成`generate_narration.py`が失敗する)
- 人体メッシュバンドル(元データ): `C:\Users\takub\Tools\human-base-meshes\human_base_meshes_bundle.blend`
