# HANDOFF.md（training-menu）

- **最終更新日時**: 2026-08-14（Claude更新）
- **変更主体**: Claude（設計相談〜実装〜PCプレビュー確認）

## 現在の目的

モード選択画面の最上部に、週間プランの「今日の予定」を出す（完了）。原点回帰UX見直しの一項目。

## 現在の実装状態（完了）

- `index.html`に`#today-focus-section`（画面最上部）を追加し、既存の「要望から作る」「自分で作る」
  の2枚のカードは`<details id="mode-cards-details">`へ格納した。
- `js/ui.js`に`renderTodayFocus`を追加。週間プラン未作成なら何も出さずカードは従来通り開いたまま
  （`.mode-cards-flat`でsummary自体を隠す）。今日が実行可能な予定なら「今日は○○の日です」＋
  「始める」を表示しカードを折りたたみ、休みの日なら「今日は休みの日です」の一言だけ表示してカードは
  開いたまま。
- `weeklyPlanDaysHtml`から今日の行を除外（`#today-focus-section`と重複するため）。今日の割り当て
  だけがある場合は「今日以外はまだ割り当てていません」と文言を分けた。
- `js/app.js`の`renderModeWeeklyPlanSection`から`renderTodayFocus`も呼ぶよう変更、`#today-focus-section`
  用のクリックリスナーを`wireModeWeeklyPlanSection`に追加（`#weekly-plan-section`とは別DOM要素のため）。
- `service-worker.js`のキャッシュ名を`training-menu-v9`へ更新。

設計判断の詳細（データモデル・`.mode-cards-flat`の仕組み・配色の理由）は
[CLAUDE.md](CLAUDE.md)の「モード選択画面：今日の予定を最上部に出す」節を参照。

## 確認方法（Claudeが実施・完了）

- `node --check`で`js/app.js`・`js/ui.js`の構文エラー無しを確認。
- PCプレビュー（`training-menu-alt`設定、8083番。別セッションが`training-menu`(8081番)を
  使用中だったため衝突回避）で、localStorageに直接データを入れて3パターンを確認:
  - 週間プラン未作成 → 最上部に何も出ず、カード2枚がそのまま表示（変更前と同じ見た目）
  - 今日が実行可能な予定（脚の日） → 「今日は脚の日です」＋「始める」を表示、カードは
    「他のメニューを作る」に折りたたみ。「始める」クリックで設定画面を経由せず脚メニューの
    確認画面まで直接遷移することを確認（コンソールエラー無し）
  - 週間プランはあるが今日が休み → 「今日は休みの日です」を表示、カードは開いたまま
- **実機（iPhone）での確認は未実施**。UI_UX_GUIDELINES.mdの方針上、実機確認をせずにUI作業の
  「完了」とはしていない点に注意。次回iPhoneで開いた際に確認をお願いしたい。

## 未確認事項・既知の問題

- 実機（iPhone、GitHub Pages経由）での確認が未実施。特に`<details>`の開閉アニメーション・
  タップ範囲の感触は実機で見るまで分からない。
- 原点回帰の残り項目（チュートリアル作成、「今日やることを最上部に」以外のChatGPT案、動画/デモ機能）
  は未着手のままObsidian Vaultのロードマップに残っている。

## 参照

- [CLAUDE.md](CLAUDE.md)（「モード選択画面：今日の予定を最上部に出す」節に設計判断の詳細）
- [AGENTS.md](AGENTS.md)
- Obsidian Vault「アイデアまとめ\03 トレーニングメニューアプリ\ロードマップ.md」
