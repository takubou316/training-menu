# HANDOFF.md（training-menu）

- **最終更新日時**: 2026-08-14（Claude更新）
- **変更主体**: Codex（初回実装）＋Claude（移植漏れの発見・修正、PCプレビュー確認、ロードマップ更新）

## 現在の目的

記録一覧とグラフ画面をカレンダー統合画面に一本化する（完了）。

## 現在の実装状態（完了）

- `index.html`の`#screen-history`と`#screen-progress`を`#screen-record`へ統合し、記録／グラフの上位タブと、カレンダー／リストの表示切り替えを追加した。ボトムナビは5個から4個（メニュー作成／週間プラン／記録／豆知識）になった。
- カレンダーは実データを日付単位でグループ化し、複数セッション同日、日付移動、前後の記録日ジャンプ、記録スタンプ（`assets/stamp-record.svg`）、空状態導線に対応。
- 日の詳細ヘッダーは`position: sticky`で画面内に固定（`js/ui.js`の`updateStickyHeaderOffset()`）。
- 記録カードはデフォルト種目名だけの軽量表示。「セットの詳細を見る」で重量・回数・RPEを展開（`buildSessionCardHtml`／`buildExerciseDetailHtml`）。種目名タップでグラフタブの該当種目推移へ直接ジャンプ（`goToExerciseGraph`）。
- グラフタブから「総挙上量の推移」を削除し、「種目ごとの推移」のみに（`overallVolumeSeries`関数ごと削除）。
- `service-worker.js`のキャッシュ名を`training-menu-v8`へ更新し、新規アセットをキャッシュ対象に追加。
- 試作ファイル`prototype-history-calendar.html`・`prototype-assets/`は中身をCLAUDE.mdへ転記の上、削除済み。

**経緯（次に似た作業をする時の参考）**: Codexへの初回委譲では実データ対応（cardio/holdBased/削除ボタン等）は正しく実装されたが、プロトタイプで検証済みだったsticky固定・種目名タップ→グラフ導線・詳細トグルの3点が移植漏れしていた。Claudeが監査で発見し直接修正した（Codexへの再委譲はせず）。原因と再発防止策は記憶`feedback_prototype_to_production_spec`に記録済み。

## 確認方法（Claudeが実施・完了）

- `node --check`で全対象ファイルの構文エラー無しを確認。
- PCプレビューで、ボトムナビ4個化・空状態導線・記録作成〜スタンプ表示・カレンダー⇄リスト切替・個別削除／全削除・🔥連続日数バッジ・sticky固定ヘッダー（種目数の多いセッションでスクロール確認）・種目タップ→グラフ遷移・詳細トグル展開・複数セッション同日の重ね表示・前後の記録日へのジャンプリンク・グラフタブ（総挙上量削除後の表示）を確認。コンソールエラー無し、`assets/stamp-record.svg`が200 OKで読み込まれることを確認。
- **実機（iPhone、GitHub Pages経由）で確認済み（2026-08-14、ユーザー確認）**。ローカルLANサーバー(HTTP)ではなくGitHub Pages(HTTPS)経由にしたのは、Service WorkerがHTTPS(またはlocalhost)でないと正しく登録されない仕様のため。

## 未確認事項・既知の問題

- 上記「これから」に該当する未着手項目（アクセントカラーの使いすぎの棚卸し、カレンダー「今日」表示の低視力配慮）は、Obsidian Vaultの`アイデアまとめ\03 トレーニングメニューアプリ\ロードマップ.md`の「これから」欄に記録済み。今回のタスクの対象外。

## 参照

- [CLAUDE.md](CLAUDE.md)（「記録画面：カレンダー統合」節に設計判断の詳細）
- [AGENTS.md](AGENTS.md)
- Obsidian Vault「アイデアまとめ\03 トレーニングメニューアプリ\ロードマップ.md」（完了済み欄に記録）
