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

// 期間に入る日付キーか(今日からdays日前〜今日。端末の時計のずれで保存された未来の日付や、形の壊れたキーは入れない。Codexレビュー指摘)
function aiShareInRange(key, days, now) {
  if (typeof key !== 'string' || !DATE_KEY_PATTERN.test(key)) return false;
  const today = localDateKey(now);
  return key >= shiftDateKey(today, -(days - 1)) && key <= today;
}

function aiTrainingLines(days, now) {
  // 履歴は形を検証せずに読むので、壊れた1件でプレビュー全体が描けなくならないよう、形の合うものだけ使う(Codexレビュー指摘)
  const history = loadHistory();
  const sessions = (Array.isArray(history) ? history : [])
    .filter((s) => isPlainObject(s) && Array.isArray(s.exercises) && aiShareInRange(localDateKey(s.date), days, now))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (sessions.length === 0) return ['（この期間の記録はありません）'];
  return sessions.map((s) => {
    const parts = s.exercises.filter((ex) => isPlainObject(ex)
      && (ex.type === 'cardio' || (Array.isArray(ex.sets) && ex.sets.every(isPlainObject))) && exerciseHasRecord(ex)).map((ex) => {
      const name = ex.name || (findExerciseById(ex.exerciseId) || {}).name || ex.exerciseId;
      if (ex.type === 'cardio') {
        const dist = Number(ex.distance) > 0 ? `・${ex.distance}km` : '';
        return `${name} ${formatMinSec(Number(ex.duration) || 0)}${dist}`;
      }
      // 自重種目の重量は体重から計算した目安なので、実際の重りと誤解されないよう渡さない
      const meta = findExerciseById(ex.exerciseId);
      const bodyweight = !!(meta && meta.equipment && meta.equipment[0] === 'bodyweight');
      const sets = ex.sets.filter((set) => isPlainObject(set) && set.done !== false && !set.isWarmup).map((set) => {
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
  const byDay = new Map();
  loadQuickLog().forEach((e) => {
    const key = localDateKey(e.at);
    if (!aiShareInRange(key, days, now)) return;
    const label = `${e.name} ${e.timed ? `${e.amount}秒` : `${e.amount}回`}`;
    if (!byDay.has(key)) byDay.set(key, new Map());
    const m = byDay.get(key);
    m.set(label, (m.get(label) || 0) + 1);
  });
  if (byDay.size === 0) return ['（この期間の記録はありません）'];
  return [...byDay.keys()].sort().map((key) => `- ${key}: ${[...byDay.get(key)].map(([label, n]) => (n > 1 ? `${label}×${n}` : label)).join('、')}`);
}

function aiDateValueLines(log, days, now, unit) {
  const keys = Object.keys(isPlainObject(log) ? log : {})
    .filter((k) => aiShareInRange(k, days, now) && Number.isFinite(Number(log[k])) && Number(log[k]) > 0).sort();
  if (keys.length === 0) return ['（この期間の記録はありません）'];
  return keys.map((k) => `- ${k}: ${Number(log[k])}${unit}`);
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
  const { sharing } = aiInfoState;
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

      <div class="sheet-field-head"><span class="sheet-field-label" id="ai-share-label">自分の記録をAIに見せる</span></div>
      <div class="segmented" role="radiogroup" aria-labelledby="ai-share-label">
        <label class="segmented-btn ai-share-choice"><input type="radio" name="ai-share" value="off" data-ai-share ${sharing ? '' : 'checked'}>見せない</label>
        <label class="segmented-btn ai-share-choice"><input type="radio" name="ai-share" value="on" data-ai-share ${sharing ? 'checked' : ''}>この質問だけ見せる</label>
      </div>
      <div id="ai-share-area"></div>

      <button type="button" class="primary-btn ai-send-btn" disabled>送る（承認されたら使えます）</button>`;
  renderAiShareArea();
}

// 「見せない／この質問だけ見せる」の下(項目の選択とプレビュー)。ラジオボタン自体は描き直さない(操作中のフォーカスを失わないため。Codexレビュー指摘)
function renderAiShareArea() {
  const area = document.getElementById('ai-share-area');
  if (!area) return;
  if (!aiInfoState.sharing) {
    aiInfoState.shownShareText = '';
    area.innerHTML = '<p class="hint-text">記録は見せずに、質問の文だけを送ります。記録を踏まえて答えてほしい時は「この質問だけ見せる」を選んでください。</p>';
    return;
  }
  const itemsHtml = AI_SHARE_ITEMS.map((item) => `
          <label class="ai-share-item">
            <input type="checkbox" data-ai-share-item="${item.key}" ${aiInfoState.items.has(item.key) ? 'checked' : ''}>
            <span>${escapeHtml(item.label)}<span class="ai-share-item-note">${escapeHtml(item.note)}</span></span>
          </label>`).join('');
  area.innerHTML = `
      <div class="ai-share-box">
        <p class="hint-text">見せるものを選んでください。下の「AIに渡す内容」の文章だけが、この質問と一緒にOpenAIに送られます（名前・メールアドレスは送りません）。送った後は「見せない」に戻ります。</p>
        <div class="ai-share-items">${itemsHtml}
        </div>
        <details class="ai-share-preview" open>
          <summary id="ai-share-summary"></summary>
          <pre class="ai-share-text" id="ai-share-text"></pre>
        </details>
      </div>`;
  updateAiSharePreview();
}

// 渡す文章を作り直してプレビューだけを書き換える(チェックの付け外しで項目のチェックボックスを作り直さない)。
// 作れなかった時は「見せない」に戻す(画面は「見せない」なのに内部だけ見せる状態、にならないように。Codexレビュー指摘)
function updateAiSharePreview() {
  let text;
  try {
    text = buildAiShareText(aiInfoState.items);
  } catch (e) {
    resetAiShareConsent();
    const off = document.querySelector('[data-ai-share][value="off"]');
    if (off) off.checked = true;
    const area = document.getElementById('ai-share-area');
    if (area) area.innerHTML = '<p class="error-text">記録を読み取れなかったため、記録は見せない設定に戻しました。</p>';
    return;
  }
  // 送る時は作り直さず、画面に見せたこの文章を渡す(見せた後に記録が増えた・日付をまたいだ時のずれを防ぐ。Codexレビュー指摘)
  aiInfoState.shownShareText = text;
  document.getElementById('ai-share-summary').textContent = `AIに渡す内容（${text.length}文字）`;
  document.getElementById('ai-share-text').textContent = text || '（何も選ばれていません）';
}

function setInfoTab(tab) {
  const ai = tab === 'ai';
  document.querySelectorAll('[data-info-tab]').forEach((btn) => {
    const on = btn.dataset.infoTab === tab;
    btn.setAttribute('aria-selected', String(on));
    // 選ばれているタブだけTabキーで止まり、タブ同士は←→で移る(WAI-ARIAのタブの作法)
    btn.tabIndex = on ? 0 : -1;
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
  const tabs = [...document.querySelectorAll('[data-info-tab]')];
  const selectTab = (btn) => {
    // タブを切り替えて戻ってきた時も、許可は選び直してもらう
    if (btn.dataset.infoTab === 'ai') resetAiShareConsent();
    setInfoTab(btn.dataset.infoTab);
  };
  tabs.forEach((btn, i) => {
    btn.addEventListener('click', () => selectTab(btn));
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      selectTab(next);
      next.focus();
    });
  });
  const panel = document.getElementById('info-panel-ai');
  panel.addEventListener('change', (e) => {
    if (e.target.matches('[data-ai-share]')) {
      aiInfoState.sharing = e.target.value === 'on';
      renderAiShareArea();
      return;
    }
    const box = e.target.closest('[data-ai-share-item]');
    if (!box) return;
    if (box.checked) aiInfoState.items.add(box.dataset.aiShareItem);
    else aiInfoState.items.delete(box.dataset.aiShareItem);
    updateAiSharePreview();
  });
  // 質問の文は描き直しても消えないよう覚えておく
  panel.addEventListener('input', (e) => {
    if (e.target.id === 'ai-question') aiInfoState.question = e.target.value;
  });
}
