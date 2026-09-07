// クラウド同期(Supabase)関連。2026-09-07、game-daily-manager統合の一環で追加。
//
// このアプリの既存方針(ビルドステップなし・依存ライブラリなし・localStorageのみ)は変えず、
// クラウド同期は完全にオプトインの追加機能として載せている。「ローカルが常に正、クラウドは
// 後追いの複製」という設計方針の詳細はgame-daily-manager/CLAUDE.mdの「training-menu側の方針」
// および「認証は別オリジンで共有しない」を参照(training-menuとgame-daily-managerは別オリジンの
// GitHub Pagesサイトのため、ログインは共有されない。割り切ってそれぞれ別々にログインする)。
//
// Supabase JS SDKはCDN経由のUMDビルドをindex.htmlで<script>タグ1行読み込むだけにし、
// npm/Viteは導入しない。CDN読み込みに失敗してwindow.supabaseが無い場合は、SUPABASE_AVAILABLEが
// falseになり、クラウド関連のUIは全て自動的に無効化される(アプリ本体のローカル機能には影響しない)。
//
// URL・publishable keyはgame-daily-managerと同じSupabaseプロジェクトのもの(無料枠のプロジェクト
// 自動停止を避けるため、新規プロジェクトは作らずゲームタスク管理と相乗りしている)。publishable keyは
// クライアント公開前提の値でRLSにより保護されるため、直書きで問題ない。

const SUPABASE_URL = 'https://ytlbjyyuqdfbscjmbwbh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ieJx1vxKiVvOTl7aPtKjqg_wSf0YxGZ';

const SUPABASE_AVAILABLE = typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function';

const supabaseClient = SUPABASE_AVAILABLE
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

const SYNC_CHOICE_MADE_KEY = 'training-menu:sync-choice-made';
const SYNC_ENABLED_KEY = 'training-menu:sync-enabled';

// 初回起動時の「ログインする/しない」選択をまだしていないかどうか。
// falseの間だけ、init()が同期選択モーダルを表示する。
function hasSyncChoiceBeenMade() {
  return localStorage.getItem(SYNC_CHOICE_MADE_KEY) === '1';
}

function markSyncChoiceMade() {
  localStorage.setItem(SYNC_CHOICE_MADE_KEY, '1');
}

// 「クラウド同期を使うつもりがあるか」の意思表示。実際にログインしていない間はfalse相当として扱われる
// (isCloudSyncActiveを参照)。設定画面からのログアウト操作でも明示的にfalseへ戻す。
function isSyncEnabled() {
  return SUPABASE_AVAILABLE && localStorage.getItem(SYNC_ENABLED_KEY) === '1';
}

function setSyncEnabled(enabled) {
  localStorage.setItem(SYNC_ENABLED_KEY, enabled ? '1' : '0');
}

let currentSupabaseSession = null;

// 「実際に今クラウド同期が有効か」の最終判定。SDKが使えて・ユーザーが同期を選んでいて・
// ログインセッションが存在する、の3つが揃って初めて真になる。フェーズ4で記録の同期処理を
// 実装する際は、この関数で分岐する想定。
function isCloudSyncActive() {
  return SUPABASE_AVAILABLE && isSyncEnabled() && Boolean(currentSupabaseSession);
}

// アプリ起動時に一度だけ呼ぶ。現在のセッションを読み込み、以後の変化(ログイン/ログアウト/
// トークン更新)を購読する。UIの再描画はrenderSyncStatus(js/ui.js)に委ねる。
async function initSupabaseAuth() {
  if (!SUPABASE_AVAILABLE) return;
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    currentSupabaseSession = data.session;
    if (currentSupabaseSession) markSyncChoiceMade();
  } catch (e) {
    currentSupabaseSession = null;
  }
  // 注意: onAuthStateChangeは登録した直後、現在の状態(未ログインならsession=null)で必ず一度
  // コールバックが呼ばれる('INITIAL_SESSION'イベント、SDKの仕様)。そのため「セッションが
  // 実際に存在する時だけ」モーダルを閉じるようにしないと、初回起動時にopenSyncChoiceModal()
  // で開いた直後、このコールバックの初期通知で即座に閉じられてしまう不具合があった。
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentSupabaseSession = session;
    if (session) {
      markSyncChoiceMade();
      if (typeof closeSyncChoiceModal === 'function') closeSyncChoiceModal();
    }
    if (typeof renderSyncStatus === 'function') renderSyncStatus();
  });
  if (typeof renderSyncStatus === 'function') renderSyncStatus();
}

// Googleログインを開始する。成功するとブラウザがリダイレクトされ、戻ってきた時点で
// onAuthStateChangeが発火する(detectSessionInUrl: trueのため、URL中のトークンを自動処理)。
// 2026-09-07Codexレビュー指摘を反映: setSyncEnabled(true)はOAuth呼び出しが実際に成功して
// からにする(以前は呼び出し前に楽観的にtrueへしていたため、失敗時にフラグだけ残ってしまう
// 不整合があった)。redirectToもクエリ/ハッシュを含まないオリジン+パスだけに絞り、Supabaseが
// 付与するトークン用ハッシュと衝突しないようにした。
async function signInWithGoogleForSync() {
  if (!SUPABASE_AVAILABLE) return { error: new Error('クラウド同期が利用できません') };
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
  });
  if (error) return { error };
  setSyncEnabled(true);
  return { error: null };
}

// 2026-09-07Codexレビュー指摘を反映: signOut()のエラーを無視せず、失敗時はローカルの
// 同期フラグ・セッションをそのままにする(UI上「ログアウト成功」に見えるのに実際は
// セッションが残っている、という不整合を避けるため)。呼び出し元でerrorを見て表示する。
async function signOutFromSync() {
  if (!SUPABASE_AVAILABLE) return { error: null };
  const { error } = await supabaseClient.auth.signOut();
  if (error) return { error };
  setSyncEnabled(false);
  currentSupabaseSession = null;
  if (typeof renderSyncStatus === 'function') renderSyncStatus();
  return { error: null };
}
