// ===== 情報タブの「AIに聞く」（2026-10-27〜、枠と記録を渡す前の許可の仕組みだけ。AIへの送信はまだ無い） =====
// ユーザー要望「豆知識を『情報』にして、中のタブでAIと豆知識を切り替えたい」。AIはSign in with ChatGPT
// (ユーザーのChatGPTの契約の範囲で使う)を使う予定だが、ネット上に置いたアプリはOpenAIの承認が要るため、
// 承認待ちの間は送信ボタンを使えないままにしている。
// 方針(ユーザー判断):
// - アプリの「実行時にAIを呼ばない」方針の例外は、この「情報」タブの中だけ
// - 答えが正しいとは限らないことを、常に見える所に書く
// - 記録を見たうえで答えてほしいが、無許可では渡さない → 質問ごとに「この質問だけ見せる」を選んだ時だけ、
//   選んだ項目を、送る前にそのまま見せた文章で渡す。既定は「見せない」で、タブを開き直した時・送った後に戻す
// localStorage(js/storage.js)とui.jsのescapeHtml/formatMinSec、workout-log.jsのexerciseHasRecordに依存する。

const AI_INFO_TAB_KEY = 'training-menu:info-tab'; // 最後に開いていたタブ(この端末だけの便宜、バックアップ対象外)
const AI_SHARE_ITEMS = [
  { key: 'trainings', label: 'トレーニングの記録', note: '直近14日', days: 14 },
  { key: 'quick', label: 'ちょこっと記録', note: '直近14日', days: 14 },
  { key: 'bodyweight', label: '体重', note: '直近30日', days: 30 },
  { key: 'waist', label: '腹囲', note: '直近90日', days: 90 },
  { key: 'routines', label: 'トレーニング予定', note: '今の予定' },
];
const AI_SHARE_DEFAULT_ITEMS = ['trainings', 'bodyweight'];

// 記録を渡す許可。sharing=trueは「この質問だけ見せる」を選んだ状態(1回の質問ごとに選び直す)
const aiInfoState = {
  question: '',
  sharing: false,
  items: new Set(AI_SHARE_DEFAULT_ITEMS),
  shownShareText: '', // 画面のプレビューに出した文章(送る時はこれを使う)
};

// 送った後・タブを開き直した時に、記録を見せる許可を「見せない」に戻す(次の質問で黙って渡さないため)。
// 選んだ項目の組み合わせは覚えておく(許可そのものではないので、次に「見せる」を選んだ時の手間を減らすだけ)
function resetAiShareConsent() {
  aiInfoState.sharing = false;
  aiInfoState.shownShareText = '';
}

// 送信を実装した時に使う、この質問で渡してよい記録の文章(「見せない」なら空)。画面に見せた文章そのもの
function aiShareTextForSend() {
  return aiInfoState.sharing ? aiInfoState.shownShareText : '';
}

function aiShareSinceKey(days, now) {
  return shiftDateKey(localDateKey(now), -(days - 1));
}

function aiTrainingLines(days, now) {
  const since = aiShareSinceKey(days, now);
  const sessions = loadHistory()
    .filter((s) => { const key = localDateKey(s.date); return key && key >= since; })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (sessions.length === 0) return ['（この期間の記録はありません）'];
  return sessions.map((s) => {
    const parts = (s.exercises || []).filter(exerciseHasRecord).map((ex) => {
      const name = ex.name || (findExerciseById(ex.exerciseId) || {}).name || ex.exerciseId;
      if (ex.type === 'cardio') {
        const dist = Number(ex.distance) > 0 ? `・${ex.distance}km` : '';
        return `${name} ${formatMinSec(Number(ex.duration) || 0)}${dist}`;
      }
      // 自重種目の重量は体重から計算した目安なので、実際の重りと誤解されないよう渡さない
      const meta = findExerciseById(ex.exerciseId);
      const bodyweight = !!(meta && meta.equipment && meta.equipment[0] === 'bodyweight');
      const sets = (ex.sets || []).filter((set) => set.done !== false && !set.isWarmup).map((set) => {
        const amount = ex.holdBased ? `${set.reps}秒` : `${set.reps}回`;
        const weight = !bodyweight && Number(set.weight) > 0 ? `${set.weight}kg×` : '';
        const rpe = set.rpe ? `(RPE${set.rpe})` : '';
        return `${weight}${amount}${rpe}`;
      });
      return `${name} ${sets.join(' / ')}`;
    });
    const d = new Date(s.date);
    return `- ${localDateKey(d)} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}開始: ${parts.join('、') || '（内容なし）'}`;
  });
}

function aiQuickLines(days, now) {
  const since = aiShareSinceKey(days, now);
  const byDay = new Map();
  loadQuickLog().forEach((e) => {
    const key = localDateKey(e.at);
    if (!key || key < since) return;
    const label = `${e.name} ${e.timed ? `${e.amount}秒` : `${e.amount}回`}`;
    if (!byDay.has(key)) byDay.set(key, new Map());
    const m = byDay.get(key);
    m.set(label, (m.get(label) || 0) + 1);
  });
  if (byDay.size === 0) return ['（この期間の記録はありません）'];
  return [...byDay.keys()].sort().map((key) => `- ${key}: ${[...byDay.get(key)].map(([label, n]) => (n > 1 ? `${label}×${n}` : label)).join('、')}`);
}

function aiDateValueLines(log, days, now, unit) {
  const since = aiShareSinceKey(days, now);
  const keys = Object.keys(log).filter((k) => k >= since).sort();
  if (keys.length === 0) return ['（この期間の記録はありません）'];
  return keys.map((k) => `- ${k}: ${log[k]}${unit}`);
}

function aiRoutineLines() {
  const state = loadRoutineState();
  const templates = loadCustomTemplates();
  const items = state.allPaused ? [] : state.items.filter((r) => !r.paused);
  if (items.length === 0) return ['（使っている予定はありません）'];
  return items.map((r) => {
    const perDay = routinePerDay(r);
    const target = r.kind === 'exercise' && r.targetMin ? `・目標${r.targetMin}分` : '';
    return `- ${routineContentText(r, templates)}（${routineFreqText(r)}${perDay > 1 ? `・1日${perDay}回` : ''}${target}）`;
  });
}

// AIに渡す記録の文章。送る前にこの文章をそのまま画面で見せ、送る時もこれだけを渡す(名前・メールアドレス等は入れない)
function buildAiShareText(itemKeys, now = new Date()) {
  const sections = [];
  AI_SHARE_ITEMS.filter((item) => itemKeys.has(item.key)).forEach((item) => {
    let lines;
    if (item.key === 'trainings') lines = aiTrainingLines(item.days, now);
    else if (item.key === 'quick') lines = aiQuickLines(item.days, now);
    else if (item.key === 'bodyweight') lines = aiDateValueLines(loadBodyWeightLog(), item.days, now, 'kg');
    else if (item.key === 'waist') lines = aiDateValueLines(loadWaistLog(), item.days, now, 'cm');
    else lines = aiRoutineLines();
    sections.push(`■ ${item.label}（${item.note}）\n${lines.join('\n')}`);
  });
  if (sections.length === 0) return '';
  return `今日は${localDateKey(now)}です。以下は筋トレ記録アプリ「Compstack」の、本人の記録です。\n\n${sections.join('\n\n')}`;
}

function renderAiPanel() {
  const panel = document.getElementById('info-panel-ai');
  if (!panel) return;
  const { sharing, items } = aiInfoState;
  const shareText = sharing ? buildAiShareText(items) : '';
  // 送る時は作り直さず、画面に見せたこの文章を渡す(見せた後に記録が増えた・日付をまたいだ時のずれを防ぐ。Codexレビュー指摘)
  aiInfoState.shownShareText = shareText;
  const itemsHtml = AI_SHARE_ITEMS.map((item) => `
          <label class="ai-share-item">
            <input type="checkbox" data-ai-share-item="${item.key}" ${items.has(item.key) ? 'checked' : ''}>
            <span>${escapeHtml(item.label)}<span class="ai-share-item-note">${escapeHtml(item.note)}</span></span>
          </label>`).join('');
  panel.innerHTML = `
      <div class="ai-caution" role="note">
        <div class="ai-caution-title">AIの答えは正しいとは限りません</div>
        <p>AIはもっともらしい間違いを言うことがあります。記録の数字の読み取りや計算を間違えることもあります。大事なことは自分でも確かめてください。けが・痛み・病気・薬・食事制限の判断には使わず、気になる時は医師などの専門家に相談してください。</p>
      </div>

      <div class="ai-status">
        <span class="ai-status-badge">準備中</span>
        <p>OpenAIの利用の承認を待っています。承認されたら、ChatGPT（Plus／Pro）のアカウントでログインして、その契約の利用枠の中で使えるようにする予定です。</p>
      </div>

      <label class="sheet-field-label" for="ai-question">質問</label>
      <textarea id="ai-question" class="ai-question" rows="3" maxlength="1000" placeholder="例: 最近のスクワットの回数の伸び方をどう思う？">${escapeHtml(aiInfoState.question)}</textarea>

      <div class="sheet-field-head"><span class="sheet-field-label">自分の記録をAIに見せる</span></div>
      <div class="segmented" role="radiogroup" aria-label="自分の記録をAIに見せるか">
        <button type="button" class="segmented-btn" role="radio" aria-checked="${!sharing}" data-ai-share="off">見せない</button>
        <button type="button" class="segmented-btn" role="radio" aria-checked="${sharing}" data-ai-share="on">この質問だけ見せる</button>
      </div>
      ${sharing ? `
      <div class="ai-share-box">
        <p class="hint-text">見せるものを選んでください。下の「AIに渡す内容」の文章だけが、この質問と一緒にOpenAIに送られます（名前・メールアドレスは送りません）。送った後は「見せない」に戻ります。</p>
        <div class="ai-share-items">${itemsHtml}
        </div>
        <details class="ai-share-preview" open>
          <summary>AIに渡す内容（${shareText.length}文字）</summary>
          <pre class="ai-share-text">${shareText ? escapeHtml(shareText) : '（何も選ばれていません）'}</pre>
        </details>
      </div>` : `
      <p class="hint-text">記録は見せずに、質問の文だけを送ります。記録を踏まえて答えてほしい時は「この質問だけ見せる」を選んでください。</p>`}

      <button type="button" class="primary-btn ai-send-btn" disabled>送る（承認されたら使えます）</button>`;
}

function setInfoTab(tab) {
  const ai = tab === 'ai';
  document.querySelectorAll('[data-info-tab]').forEach((btn) => {
    const on = btn.dataset.infoTab === tab;
    btn.setAttribute('aria-selected', String(on));
    btn.setAttribute('aria-checked', String(on));
  });
  document.getElementById('info-panel-ai').hidden = !ai;
  document.getElementById('info-panel-knowledge').hidden = ai;
  try { localStorage.setItem(AI_INFO_TAB_KEY, tab); } catch (e) { /* 覚えられなくても動く */ }
  if (ai) renderAiPanel();
}

// 情報画面を開いた時(下のタブ)。前回のタブで開き、記録を見せる許可は毎回「見せない」から始める
function enterInfoScreen() {
  resetAiShareConsent();
  let tab = 'knowledge';
  try { if (localStorage.getItem(AI_INFO_TAB_KEY) === 'ai') tab = 'ai'; } catch (e) { /* 既定の豆知識で開く */ }
  setInfoTab(tab);
}

function wireInfoScreen() {
  document.querySelectorAll('[data-info-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      // タブを切り替えて戻ってきた時も、許可は選び直してもらう
      if (btn.dataset.infoTab === 'ai') resetAiShareConsent();
      setInfoTab(btn.dataset.infoTab);
    });
  });
  const panel = document.getElementById('info-panel-ai');
  panel.addEventListener('click', (e) => {
    const share = e.target.closest('[data-ai-share]');
    if (share) {
      aiInfoState.sharing = share.dataset.aiShare === 'on';
      renderAiPanel();
    }
  });
  panel.addEventListener('change', (e) => {
    const box = e.target.closest('[data-ai-share-item]');
    if (!box) return;
    if (box.checked) aiInfoState.items.add(box.dataset.aiShareItem);
    else aiInfoState.items.delete(box.dataset.aiShareItem);
    renderAiPanel();
  });
  // 質問の文は描き直しても消えないよう覚えておく
  panel.addEventListener('input', (e) => {
    if (e.target.id === 'ai-question') aiInfoState.question = e.target.value;
  });
}
