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

// 起動時の最初のgetSession()確認が終わったかどうか。記録中セッションの復元機能
// (js/app.jsのrestoreActiveSessionIfAny、2026-09-15追加)により、起動直後の最初の1秒程度で
// 前回分の記録をすぐ完了できるようになった。この確認が終わる前に「記録して終了」すると、
// 同期を選んでいる(isSyncEnabled)のにcurrentSupabaseSessionがまだ入っておらず
// isCloudSyncActive()が偽になるため、queueSessionForSyncがその記録を同期対象から
// 静かに取りこぼしてしまう不具合があった(2026-09-15、Codexレビュー指摘)。
let authInitDone = false;
let authInitWaiters = [];

function waitForAuthInit() {
  if (authInitDone) return Promise.resolve();
  return new Promise((resolve) => authInitWaiters.push(resolve));
}

function resolveAuthInit() {
  if (authInitDone) return;
  authInitDone = true;
  const waiters = authInitWaiters;
  authInitWaiters = [];
  waiters.forEach((resolve) => resolve());
}

// アプリ起動時に一度だけ呼ぶ。現在のセッションを読み込み、以後の変化(ログイン/ログアウト/
// トークン更新)を購読する。UIの再描画はrenderSyncStatus(js/ui.js)に委ねる。
async function initSupabaseAuth() {
  if (!SUPABASE_AVAILABLE) {
    resolveAuthInit();
    return;
  }
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    currentSupabaseSession = data.session;
    if (currentSupabaseSession) {
      markSyncChoiceMade();
      setSyncEnabled(true); // 既にセッションがあるのに同期フラグが立っていない状態への保険(下の注記参照)
      void flushSyncQueue(); // 起動時、既にログイン済みなら前回の未送信分を追いつかせる
    }
  } catch (e) {
    currentSupabaseSession = null;
  }
  // 最初のセッション確認はここで確定する(以後のonAuthStateChangeによる更新はauthInitDoneに影響しない)。
  // queueSessionForSyncがこの確認の完了を待てるようにするためのフラグ(上のwaitForAuthInit参照)。
  resolveAuthInit();
  // 注意: onAuthStateChangeは登録した直後、現在の状態(未ログインならsession=null)で必ず一度
  // コールバックが呼ばれる('INITIAL_SESSION'イベント、SDKの仕様)。そのため「セッションが
  // 実際に存在する時だけ」モーダルを閉じるようにしないと、初回起動時にopenSyncChoiceModal()
  // で開いた直後、このコールバックの初期通知で即座に閉じられてしまう不具合があった。
  //
  // 2026-09-07実機で発見・修正した重大バグ: setSyncEnabled(true)は元々
  // signInWithGoogleForSync()の「OAuth呼び出し成功後」にだけ置いていたが、signInWithOAuthは
  // 呼び出すと即座にページ遷移(Googleのログイン画面へのリダイレクト)が始まるため、その後に
  // 続く行(setSyncEnabled(true))が実行される保証がなかった。実際に「ログインはできて
  // currentSupabaseSessionもUI上は"クラウド同期: 有効"と表示されるのに、記録を確定しても
  // 一切Supabaseへ同期されない」という不具合が発生した(isCloudSyncActive()は
  // isSyncEnabled()も必要とするため、フラグが立っていないとローカルに保存されるだけで
  // 同期処理自体が動かない)。ページ遷移を経てから確実に発火するここ(onAuthStateChangeが
  // sessionを受け取った時点)でsetSyncEnabled(true)することで、リダイレクトの成否に関わらず
  // 確実にフラグが立つようにした。
  //
  // 将来の注意(Codexレビュー指摘): 「ログアウトはせず同期だけ一時停止したい」という機能を
  // 追加する場合、この保険処理とinitSupabaseAuth冒頭の保険処理は、次回起動時に問答無用で
  // setSyncEnabled(true)へ戻してしまう。その機能を作る際は、この2箇所のsetSyncEnabled(true)を
  // 見直すこと。
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentSupabaseSession = session;
    if (session) {
      markSyncChoiceMade();
      setSyncEnabled(true);
      if (typeof closeSyncChoiceModal === 'function') closeSyncChoiceModal();
      void flushSyncQueue(); // ログイン成功時にも未送信分があれば送る
    }
    if (typeof renderSyncStatus === 'function') renderSyncStatus();
  });
  if (typeof renderSyncStatus === 'function') renderSyncStatus();
}

// オンライン復帰時にも追いつかせる。オフライン中に記録した分がここで送信される想定。
window.addEventListener('online', () => { void flushSyncQueue(); });

// ===== 記録データの同期(フェーズ4) =====
//
// js/workout-log.jsのfinalizeSession()が記録をlocalStorageへ保存した直後、クラウド同期が
// 有効なら1回だけqueueSessionForSyncを呼ぶ。ここでは「ローカルへの保存が常に先に完了している」
// 前提を崩さない(クラウド側の処理はすべてこの後追いの複製であり、失敗してもローカルの記録は
// 一切影響を受けない)。

const PENDING_SYNC_KEY = 'training-menu:pending-sync';

// キューの1エントリは{ localId, userId, record }。userIdを持たせるのは、ログアウトして
// 別アカウントでログインした場合に、前のアカウント宛てのキューを誤って新アカウントの下で
// 送信してしまわないようにするため(2026-09-07、Codexレビュー指摘のアカウント混在対策)。
function loadPendingSyncQueue() {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function savePendingSyncQueue(queue) {
  localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(queue));
}

// キューの各エントリを一意に識別するID。同じlocalIdに対してupsertとdeleteが両方キューに
// 積まれるケース(例: オフライン中に記録→すぐ削除)がありうるため、成功/失敗の記録は
// localIdではなくこのentryId単位で行う(下のflushSyncQueue参照。2026-09-08、Codexレビュー指摘:
// localId単位で管理すると、片方の操作が成功しただけでdoneIdsにlocalIdが入り、その後失敗した
// もう片方の操作までマージ時に誤って取り除かれてしまうバグがあった)。
function generateSyncEntryId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// js/workout-log.jsのfinalizeSession()から呼ばれる。クラウド同期が有効な場合だけキューに
// 追加し、その場で送信を試みる(即座に成功すればユーザーはほぼ気付かない。オフライン中なら
// キューに残り、次にオンラインになった時・次回起動時に自動で追いつく)。
// opを持たないエントリは(過去に積まれた分も含めて)'upsert'として扱う(下のflushSyncQueue参照)。
//
// 呼び出し元(workout-log.js)はfire-and-forgetで同期的なtry/catchに包んでいるだけなので、
// await前に投げる例外は呼び出し元のcatchで拾えるが、await後の失敗はここで自前に握りつぶす
// 必要がある(呼び出し元まで伝播すると未処理のPromise rejectionになるだけで、記録自体は
// 既にローカル保存済みなので実害は無いが、意図を明示するため)。
async function queueSessionForSync(record) {
  // 同期を選んでいるのに、起動直後でまだ最初のセッション確認(initSupabaseAuth)が終わって
  // いない場合はここで待つ。待たずにisCloudSyncActive()だけで判定すると、記録中セッションの
  // 復元機能により起動直後すぐ「記録して終了」された時、まだcurrentSupabaseSessionが
  // 入っていないというだけの理由でこの記録が同期対象から静かに漏れてしまう
  // (2026-09-15、Codexレビュー指摘)。
  if (SUPABASE_AVAILABLE && isSyncEnabled() && !authInitDone) {
    await waitForAuthInit();
  }
  if (!isCloudSyncActive()) return;
  try {
    const userId = currentSupabaseSession.user.id;
    const queue = loadPendingSyncQueue();
    queue.push({ entryId: generateSyncEntryId(), localId: record.id, userId, record, op: 'upsert' });
    savePendingSyncQueue(queue);
    void flushSyncQueue();
  } catch (e) {
    // ベストエフォート。ローカルの記録(record)は既に保存済みで無事。
  }
}

// js/app.jsの記録削除(今日のデータを削除する／記録データをすべて削除する／個別削除)から呼ばれる。
// ローカル削除は既に完了している前提で、Supabase側のtraining_sessions行(と、on delete cascadeで
// 連動するtraining_session_exercises/training_session_sets)を後追いで削除するだけの
// ベストエフォート処理(2026-09-08追加。それまではローカル削除がクラウド側に伝播せず、
// game-daily-manager側の「達成」表示がローカル削除後も残ってしまっていた)。
// queueSessionForSyncと同じく、起動直後で最初のセッション確認が終わっていなければ待つ
// (以前は待たずに判定していたため、起動直後に削除するとクラウド側が消えないことがあった。
// 2026-10-04、Codex指摘)。await後の失敗は呼び出し元のtry/catchに届かないためここで握りつぶす。
async function queueSessionDeleteForSync(localId) {
  if (SUPABASE_AVAILABLE && isSyncEnabled() && !authInitDone) {
    await waitForAuthInit();
  }
  if (!isCloudSyncActive()) return;
  try {
    // 待っている間にバックアップの読み込み等でその記録が端末内に戻っていたら、削除予約は積まない
    // (積むと端末には残っているのにクラウドからだけ消えてしまう。2026-10-04 Codexレビュー指摘)。
    if (loadHistory().some((s) => s.id === localId)) return;
    const userId = currentSupabaseSession.user.id;
    const queue = loadPendingSyncQueue();
    queue.push({ entryId: generateSyncEntryId(), localId, userId, op: 'delete' });
    savePendingSyncQueue(queue);
    void flushSyncQueue();
  } catch (e) {
    // ベストエフォート。ローカルの削除は既に完了している。
  }
}

let isFlushingSyncQueue = false;
let flushRequestedDuringRun = false;

// 同じエントリがエラーコード付きでこの回数断られ続けたら、恒久的な問題(権限・データ不整合等)とみなし、
// 自動送信をやめて「送れなかった記録」(SYNC_FAILED_KEY)へ移す。ローカルの記録自体は消えず、
// 記録タブの「もう一度送る」(retryFailedSyncEntries)で送信待ちに戻せる。
// 以前は通信エラーも区別せずに数えて5回で捨てており、画面も「有効」のままで気付けなかった(2026-10-04)。
const MAX_SYNC_ATTEMPTS = 5;
const SYNC_FAILED_KEY = 'training-menu:sync-failed';
const SYNC_LAST_SUCCESS_KEY = 'training-menu:sync-last-success';

function loadFailedSyncEntries() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_FAILED_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveFailedSyncEntries(entries) {
  localStorage.setItem(SYNC_FAILED_KEY, JSON.stringify(entries));
}

// 圏外・通信エラー・サーバーの一時的な不調・ログインの期限切れは、時間を置けば送れる見込みがあるので
// 失敗回数に数えず、次の機会(起動時・オンライン復帰時・次の記録時)に送り直す。supabase-jsは通信エラーを
// code:''、サーバーの503等をcodeなしで返すため、エラーコードの有無とHTTPステータスで判定する
// (syncSessionToSupabase等がerror.httpStatusを付けて投げる)。
function isTransientSyncError(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (!error || !error.code) return true;
  const status = Number(error.httpStatus) || 0;
  if (status === 0 || status === 408 || status === 429 || status >= 500) return true;
  return error.code === 'PGRST301'; // JWT expired: SDKのトークン更新後に送れる
}

function throwSupabaseError(error, status) {
  if (error && typeof error === 'object') error.httpStatus = status;
  throw error;
}

// キューに溜まった記録を古い順にSupabaseへ送信する。起動時・オンライン復帰時・ログイン成功時・
// 記録確定時など複数の場所から呼ばれるため、同時に走らないよう簡易ロック(isFlushingSyncQueue)
// を掛けている。今ログイン中のユーザー宛てのものだけを対象にする。
// - 通信の問題(isTransientSyncError)で失敗したら、後続も同じ理由で失敗する可能性が高いので打ち切る
// - エラーコード付きで断られたら、別の記録の送信は続けるが、**同じ記録(localId)への後続の操作は
//   今回は送らない**(順番を守るため。例: 送信→削除の順に積まれた記録で、送信が断られたまま削除だけ
//   成功すると、後日送信が通った時に端末では削除済みの記録がクラウドに復活してしまう。2026-10-04 Codexレビュー指摘)
// - MAX_SYNC_ATTEMPTS回断られたら「送れなかった記録」へ移す。削除に成功した時は、同じ記録の
//   「送れなかった送信」も取り除く(再送で復活させないため)
//
// 2026-09-07Codexレビュー指摘を反映: 「flush開始時に読んだキュー」をそのまま上書き保存すると、
// 実行中に他の呼び出し(記録確定直後に立て続けにもう1件記録した場合など)がキューへ追加した分を
// まるごと消してしまう競合があった(read-modify-writeの非アトミック性)。書き戻す直前に最新の
// キューを再読込し、「今回処理し終えたentryIdの集合」だけを差し引くマージ方式に変更して解消した。
//
// 上記の修正だけでは、実行中に届いた新しいエントリがロックのせいでスキップされたまま
// 放置される(データは消えないが送信もされない)別の問題が残っていたため、ロック中に
// flushSyncQueue()が呼ばれたら`flushRequestedDuringRun`を立てておき、今回の実行完了後に
// もう一度実行し直すようにした(Claudeが実装後の実地テストで発見・修正)。
async function flushSyncQueue() {
  if (isFlushingSyncQueue) {
    flushRequestedDuringRun = true;
    return;
  }
  if (!isCloudSyncActive()) return;
  isFlushingSyncQueue = true;
  try {
    const userId = currentSupabaseSession.user.id;
    const queue = loadPendingSyncQueue();
    const doneEntryIds = new Set(); // 送信成功、または「送れなかった記録」へ移してキューから取り除くもの
    const attemptUpdates = new Map(); // entryId -> 更新後の失敗回数(まだキューに残すもの)
    const newlyFailed = []; // 「送れなかった記録」へ移すエントリ
    const blockedLocalIds = new Set(); // 今回断られた記録。同じ記録への後続の操作は送らない
    const deletedLocalIds = new Set(); // 今回クラウドから削除できた記録
    let anySuccess = false;
    let stopEarly = false;
    for (const item of queue) {
      if (stopEarly || item.userId !== userId) continue;
      if (blockedLocalIds.has(item.localId)) continue;
      // entryIdを持たない古いエントリ(この仕組み導入前にキューに積まれたもの)はlocalIdで代用する。
      // 古い形式は常にupsertのみだったため、localId単位の管理でも従来通り正しく動く。
      const entryId = item.entryId || item.localId;
      try {
        if (item.op === 'delete') {
          await deleteSessionFromSupabase(item.localId, userId);
          deletedLocalIds.add(item.localId);
        } else {
          await syncSessionToSupabase(item.record, userId);
        }
        doneEntryIds.add(entryId);
        anySuccess = true;
      } catch (e) {
        if (isTransientSyncError(e)) {
          // 通信の問題は後続も同じ理由で失敗する可能性が高いので打ち切り、回数は数えない
          stopEarly = true;
          continue;
        }
        // エラーコード付きで断られた。別の記録の送信は続けるが、同じ記録の後続の操作は順番を守るため送らない
        blockedLocalIds.add(item.localId);
        const attempts = (item.attempts || 0) + 1;
        if (attempts >= MAX_SYNC_ATTEMPTS) {
          newlyFailed.push({ ...item, attempts, lastError: String((e && (e.message || e.code)) || ''), failedAt: new Date().toISOString() });
        } else {
          attemptUpdates.set(entryId, attempts);
        }
      }
    }
    // 「送れなかった記録」を更新する: 今回移すものを足し、今回クラウドから削除できた記録の古い送信は取り除く。
    // 先に書いてからキューから外す(逆順だと途中で失敗した時に行方不明になる)。書き込めなければ
    // (容量不足等)キューに残したまま回数だけ更新し、次の機会にまた移す。
    if (newlyFailed.length > 0 || deletedLocalIds.size > 0) {
      const failedNow = loadFailedSyncEntries();
      const nextFailed = failedNow
        .filter((item) => !(item.userId === userId && deletedLocalIds.has(item.localId)))
        .concat(newlyFailed);
      try {
        if (nextFailed.length !== failedNow.length || newlyFailed.length > 0) saveFailedSyncEntries(nextFailed);
        newlyFailed.forEach((item) => {
          console.warn(`training-menu: クラウド同期に${MAX_SYNC_ATTEMPTS}回失敗したため、この記録を「送れなかった記録」に移しました(local_id: ${item.localId}, op: ${item.op || 'upsert'})`);
          doneEntryIds.add(item.entryId || item.localId);
        });
      } catch (e) {
        newlyFailed.forEach((item) => attemptUpdates.set(item.entryId || item.localId, item.attempts));
      }
    }
    if (anySuccess) {
      try {
        let lastByUser = null;
        try { lastByUser = JSON.parse(localStorage.getItem(SYNC_LAST_SUCCESS_KEY) || '{}'); } catch (e) { lastByUser = null; }
        const next = lastByUser && typeof lastByUser === 'object' && !Array.isArray(lastByUser) ? lastByUser : {};
        next[userId] = new Date().toISOString();
        localStorage.setItem(SYNC_LAST_SUCCESS_KEY, JSON.stringify(next));
      } catch (e) { /* 表示用のみ */ }
    }
    if (doneEntryIds.size > 0 || attemptUpdates.size > 0) {
      const latest = loadPendingSyncQueue();
      const merged = latest
        .filter((item) => !doneEntryIds.has(item.entryId || item.localId))
        .map((item) => {
          const entryId = item.entryId || item.localId;
          return attemptUpdates.has(entryId) ? { ...item, attempts: attemptUpdates.get(entryId) } : item;
        });
      savePendingSyncQueue(merged);
    }
  } catch (e) {
    // キューの書き戻し自体に失敗した(容量不足等)。キューは書き換わっていないので次の機会に送り直される。
    // ここで投げると下の再実行・表示の更新まで飛ばされるため握りつぶす。
    console.warn('training-menu: 送信待ちの更新に失敗しました', e);
  } finally {
    isFlushingSyncQueue = false;
  }
  if (flushRequestedDuringRun) {
    flushRequestedDuringRun = false;
    await flushSyncQueue(); // 実行中に追加された分をこの1回で拾う
    return;
  }
  if (typeof renderSyncStatus === 'function') renderSyncStatus(); // 送信待ち件数等の表示を更新
}

// 今ログイン中のユーザー宛ての送信待ち・送れなかった記録の件数(記録タブの同期状態の表示用)。
function syncQueueCounts() {
  const userId = currentSupabaseSession && currentSupabaseSession.user.id;
  const mine = (item) => item && item.userId === userId;
  // 最後に送れた日時はアカウントごと({userId: ISO日時})。別アカウントの日時を出して誤認させないため。
  let lastSuccessAt = null;
  try {
    const lastByUser = JSON.parse(localStorage.getItem(SYNC_LAST_SUCCESS_KEY) || '{}');
    if (lastByUser && typeof lastByUser === 'object' && typeof lastByUser[userId] === 'string') lastSuccessAt = lastByUser[userId];
  } catch (e) { /* 表示しないだけ */ }
  return {
    pending: loadPendingSyncQueue().filter(mine).length,
    failed: loadFailedSyncEntries().filter(mine).length,
    lastSuccessAt,
  };
}

// 「もう一度送る」: 今のユーザーの「送れなかった記録」を失敗回数0で送信待ちに戻して送り直す。
// 既に送信待ちに同じエントリがあれば重複させない。端末でもう削除した記録の送信は戻さずに捨てる
// (戻すと、送信待ちに後から積まれた削除より後ろに並び、クラウドに復活してしまうため)。
// localStorageに書けない時は例外を投げる(呼び出し元の記録タブが失敗を表示する)。
async function retryFailedSyncEntries() {
  if (!isCloudSyncActive()) return;
  const userId = currentSupabaseSession.user.id;
  const failed = loadFailedSyncEntries();
  const mine = failed.filter((item) => item.userId === userId);
  if (mine.length === 0) return;
  const queue = loadPendingSyncQueue();
  const queuedIds = new Set(queue.map((item) => item.entryId || item.localId));
  const localIds = new Set(loadHistory().map((s) => s.id));
  const restored = mine
    .filter((item) => !queuedIds.has(item.entryId || item.localId))
    .filter((item) => item.op === 'delete' || localIds.has(item.localId))
    .map(({ attempts, lastError, failedAt, ...item }) => item);
  savePendingSyncQueue([...queue, ...restored]);
  saveFailedSyncEntries(failed.filter((item) => item.userId !== userId));
  await flushSyncQueue();
}

// 1回分のトレーニング記録(js/workout-log.jsのfinalizeSessionが作るrecord、localStorageの
// 保存形式そのまま)を、正規化した3テーブルへ複製する。各階層でlocal_idを使ったupsertに
// しているため、同じrecordを再送しても重複登録されない
// (game-daily-manager/supabase/migrations/20260906_add_training_integration.sql参照)。
//
// 注意: これは複数の独立したHTTPリクエストの積み重ねであり、1つのトランザクションではない
// (2026-09-07Codexレビュー指摘)。途中(例えば3種目目のsetsのupsert)で失敗した場合、それより
// 前のsession/exercise行はSupabase側に残ったままになる。ただしlocal_idが決定的(配列インデックス
// 基準)なため、次回の再送で同じrecordを渡せば、既にできている行は同じ内容で上書きされるだけで
// 無害、未完了だった分は改めて作られる。つまり非アトミックだが、再送すれば自然に辻褄が合う。
async function syncSessionToSupabase(record, userId) {
  const sessionDate = localDateKey(record.date);
  const { data: sessionRow, error: sessionError, status: sessionStatus } = await supabaseClient
    .from('training_sessions')
    .upsert({
      user_id: userId,
      local_id: record.id,
      session_date: sessionDate,
      started_at: record.date,
      goal: record.goal || null,
      duration_sec: record.durationSec || null,
      // 送信時点の最新体重ではなく、運動した日(以前で一番新しい)の体重を送る。その日の体重記録を
      // 後から直した場合は、次の再送でその値に変わる。
      body_weight_kg: typeof bodyWeightKgOnDate === 'function' ? bodyWeightKgOnDate(sessionDate) : null,
    }, { onConflict: 'user_id,local_id' })
    .select('id')
    .single();
  if (sessionError) throwSupabaseError(sessionError, sessionStatus);
  const sessionId = sessionRow.id;

  for (let i = 0; i < record.exercises.length; i += 1) {
    const ex = record.exercises[i];
    const isCardio = ex.type === 'cardio';
    const { data: exRow, error: exError, status: exStatus } = await supabaseClient
      .from('training_session_exercises')
      .upsert({
        user_id: userId,
        session_id: sessionId,
        local_id: `ex-${i}`,
        exercise_id: ex.exerciseId,
        name: ex.name,
        order_index: i,
        exercise_type: isCardio ? 'cardio' : 'strength',
        distance_km: isCardio && ex.distance != null ? ex.distance : null,
        duration_sec: isCardio && ex.duration != null ? ex.duration : null,
      }, { onConflict: 'session_id,local_id' })
      .select('id')
      .single();
    if (exError) throwSupabaseError(exError, exStatus);

    if (isCardio || !Array.isArray(ex.sets) || ex.sets.length === 0) continue;
    // holdBased種目(プランク等)は「reps」欄に実際は保持秒数が入っている(js/ui.js等の既存表示ロジックと
    // 同じ解釈)。2026-10-06〜は記録自体が測り方(holdBased)を持つ(同じ種目でも回数/時間を切り替えられる
    // ため)。持たない古い記録はexercises-data.jsのEXERCISESから元の種目定義を引いて振り分ける。
    const isHoldBased = typeof recordedExerciseIsTimed === 'function'
      ? recordedExerciseIsTimed(ex)
      : Boolean((typeof EXERCISES !== 'undefined' ? EXERCISES.find((item) => item.id === ex.exerciseId) : null)?.holdBased);
    const setPayload = ex.sets.map((s, si) => ({
      user_id: userId,
      session_exercise_id: exRow.id,
      local_id: `set-${si}`,
      set_index: si,
      weight: !isHoldBased && s.weight !== '' && s.weight != null ? Number(s.weight) : null,
      reps: !isHoldBased && s.reps !== '' && s.reps != null ? Number(s.reps) : null,
      hold_sec: isHoldBased && s.reps !== '' && s.reps != null ? Number(s.reps) : null,
      rpe: s.rpe !== '' && s.rpe != null ? Number(s.rpe) : null,
      is_warmup: Boolean(s.isWarmup),
      done: Boolean(s.done),
    }));
    const { error: setsError, status: setsStatus } = await supabaseClient
      .from('training_session_sets')
      .upsert(setPayload, { onConflict: 'session_exercise_id,local_id' });
    if (setsError) throwSupabaseError(setsError, setsStatus);
  }
}

// 1回分のトレーニング記録をクラウド側からも削除する(queueSessionDeleteForSync経由)。
// training_session_exercises/training_session_setsはon delete cascadeで自動的に消える
// (game-daily-manager/supabase/schema.sql参照)ため、親のtraining_sessions行だけ消せばよい。
async function deleteSessionFromSupabase(localId, userId) {
  const { error, status } = await supabaseClient
    .from('training_sessions')
    .delete()
    .eq('user_id', userId)
    .eq('local_id', localId);
  if (error) throwSupabaseError(error, status);
}

// Googleログインを開始する。成功するとブラウザがリダイレクトされ、戻ってきた時点で
// onAuthStateChangeが発火する(detectSessionInUrl: trueのため、URL中のトークンを自動処理)。
// redirectToはクエリ/ハッシュを含まないオリジン+パスだけに絞り、Supabaseが付与するトークン用
// ハッシュと衝突しないようにしている(2026-09-07Codexレビュー指摘)。
//
// 注意: ここでは意図的にsetSyncEnabled(true)を呼んでいない。signInWithOAuthは呼び出すと
// 即座にページ遷移(Googleのログイン画面へのリダイレクト)が始まるため、この関数の続きの行が
// 実行される保証がない。実際に「ここでsetSyncEnabled(true)する」設計にした結果、ページ遷移で
// 実行が中断され、UIには"クラウド同期: 有効"と出るのに記録が一切同期されない、という重大バグを
// 実機で踏んだ(2026-09-07)。同期フラグは、ページに戻ってきた後に確実に発火するinitSupabaseAuth
// のonAuthStateChangeコールバック側でsetSyncEnabled(true)している。
async function signInWithGoogleForSync() {
  if (!SUPABASE_AVAILABLE) return { error: new Error('クラウド同期が利用できません') };
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
  });
  return { error: error || null };
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
