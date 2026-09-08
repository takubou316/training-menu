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
    if (currentSupabaseSession) {
      markSyncChoiceMade();
      setSyncEnabled(true); // 既にセッションがあるのに同期フラグが立っていない状態への保険(下の注記参照)
      void flushSyncQueue(); // 起動時、既にログイン済みなら前回の未送信分を追いつかせる
    }
  } catch (e) {
    currentSupabaseSession = null;
  }
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
function queueSessionForSync(record) {
  if (!isCloudSyncActive()) return;
  const userId = currentSupabaseSession.user.id;
  const queue = loadPendingSyncQueue();
  queue.push({ entryId: generateSyncEntryId(), localId: record.id, userId, record, op: 'upsert' });
  savePendingSyncQueue(queue);
  void flushSyncQueue();
}

// js/app.jsの記録削除(今日のデータを削除する／記録データをすべて削除する／個別削除)から呼ばれる。
// ローカル削除は既に完了している前提で、Supabase側のtraining_sessions行(と、on delete cascadeで
// 連動するtraining_session_exercises/training_session_sets)を後追いで削除するだけの
// ベストエフォート処理(2026-09-08追加。それまではローカル削除がクラウド側に伝播せず、
// game-daily-manager側の「達成」表示がローカル削除後も残ってしまっていた)。
function queueSessionDeleteForSync(localId) {
  if (!isCloudSyncActive()) return;
  const userId = currentSupabaseSession.user.id;
  const queue = loadPendingSyncQueue();
  queue.push({ entryId: generateSyncEntryId(), localId, userId, op: 'delete' });
  savePendingSyncQueue(queue);
  void flushSyncQueue();
}

let isFlushingSyncQueue = false;
let flushRequestedDuringRun = false;

// 同じエントリがこの回数失敗し続けたら、恒久的な問題(データ不整合等)とみなして隔離する。
// 隔離してもローカルの記録自体は消えない。クラウドへの複製だけを諦める。
const MAX_SYNC_ATTEMPTS = 5;

// キューに溜まった記録を古い順にSupabaseへ送信する。起動時・オンライン復帰時・ログイン成功時・
// 記録確定時など複数の場所から呼ばれるため、同時に走らないよう簡易ロック(isFlushingSyncQueue)
// を掛けている。今ログイン中のユーザー宛てのものだけを対象にする。1件失敗したら(オフライン等、
// 同じ理由で以降も失敗する可能性が高いため)以降は打ち切り、次回に持ち越す。ただし同じエントリが
// MAX_SYNC_ATTEMPTS回失敗し続けた場合は、それだけ隔離して後続の正常なエントリの送信を止めない
// ようにする(2026-09-07Codexレビュー指摘: 恒久的に失敗するエントリが先頭に居座ると、それより
// 後ろの正常なエントリが永久に送信されなくなる問題への対応)。
//
// 2026-09-07Codexレビュー指摘を反映: 「flush開始時に読んだキュー」をそのまま上書き保存すると、
// 実行中に他の呼び出し(記録確定直後に立て続けにもう1件記録した場合など)がキューへ追加した分を
// まるごと消してしまう競合があった(read-modify-writeの非アトミック性)。書き戻す直前に最新の
// キューを再読込し、「今回処理し終えたlocalIdの集合」だけを差し引くマージ方式に変更して解消した。
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
    const doneEntryIds = new Set(); // 送信成功、または隔離してキューから取り除くもの
    const attemptUpdates = new Map(); // entryId -> 更新後の失敗回数(まだキューに残すもの)
    let stopEarly = false;
    for (const item of queue) {
      if (stopEarly || item.userId !== userId) continue;
      // entryIdを持たない古いエントリ(この仕組み導入前にキューに積まれたもの)はlocalIdで代用する。
      // 古い形式は常にupsertのみだったため、localId単位の管理でも従来通り正しく動く。
      const entryId = item.entryId || item.localId;
      try {
        if (item.op === 'delete') {
          await deleteSessionFromSupabase(item.localId, userId);
        } else {
          await syncSessionToSupabase(item.record, userId);
        }
        doneEntryIds.add(entryId);
      } catch (e) {
        const attempts = (item.attempts || 0) + 1;
        if (attempts >= MAX_SYNC_ATTEMPTS) {
          console.warn(`training-menu: クラウド同期に${MAX_SYNC_ATTEMPTS}回失敗したため、この記録の自動送信を停止しました(local_id: ${item.localId}, op: ${item.op || 'upsert'})`);
          doneEntryIds.add(entryId);
        } else {
          attemptUpdates.set(entryId, attempts);
          stopEarly = true;
        }
      }
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
  } finally {
    isFlushingSyncQueue = false;
  }
  if (flushRequestedDuringRun) {
    flushRequestedDuringRun = false;
    await flushSyncQueue(); // 実行中に追加された分をこの1回で拾う
  }
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
  const { data: sessionRow, error: sessionError } = await supabaseClient
    .from('training_sessions')
    .upsert({
      user_id: userId,
      local_id: record.id,
      session_date: sessionDate,
      started_at: record.date,
      goal: record.goal || null,
      duration_sec: record.durationSec || null,
      body_weight_kg: (typeof bodyWeightHasStoredValue === 'function' && typeof getBodyWeightKg === 'function' && bodyWeightHasStoredValue())
        ? getBodyWeightKg() : null,
    }, { onConflict: 'user_id,local_id' })
    .select('id')
    .single();
  if (sessionError) throw sessionError;
  const sessionId = sessionRow.id;

  for (let i = 0; i < record.exercises.length; i += 1) {
    const ex = record.exercises[i];
    const isCardio = ex.type === 'cardio';
    const { data: exRow, error: exError } = await supabaseClient
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
    if (exError) throw exError;

    if (isCardio || !Array.isArray(ex.sets) || ex.sets.length === 0) continue;
    // holdBased種目(プランク等)は「reps」欄に実際は保持秒数が入っている(js/ui.js等の既存表示ロジックと
    // 同じ解釈)。exercises-data.jsのEXERCISESから元の種目定義を引いて振り分ける。
    const exerciseMeta = typeof EXERCISES !== 'undefined' ? EXERCISES.find((item) => item.id === ex.exerciseId) : null;
    const isHoldBased = Boolean(exerciseMeta && exerciseMeta.holdBased);
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
    const { error: setsError } = await supabaseClient
      .from('training_session_sets')
      .upsert(setPayload, { onConflict: 'session_exercise_id,local_id' });
    if (setsError) throw setsError;
  }
}

// 1回分のトレーニング記録をクラウド側からも削除する(queueSessionDeleteForSync経由)。
// training_session_exercises/training_session_setsはon delete cascadeで自動的に消える
// (game-daily-manager/supabase/schema.sql参照)ため、親のtraining_sessions行だけ消せばよい。
async function deleteSessionFromSupabase(localId, userId) {
  const { error } = await supabaseClient
    .from('training_sessions')
    .delete()
    .eq('user_id', userId)
    .eq('local_id', localId);
  if (error) throw error;
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
