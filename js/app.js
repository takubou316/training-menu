// エントリポイント。画面遷移とイベント配線のみを担当する。

// 全画面モーダル(種目ピッカー・RPE説明・有酸素タイマー等)を開いている間、背面ページの
// スクロールを止めるための共有ロック。カウンタ方式にしているのは、内部に独自スクロール領域
// (種目ピッカーの一覧、RPE説明の長い表など)を持つモーダルで、背面ページのスクロールと
// 競合してタッチ操作がどちらに取られるか曖昧になり、本来スクロールしたい方が操作できなくなる
// 不具合があったため。1つでも開いていればロックし、全部閉じたら解除する。
// 単純にoverflow:hiddenを付けるだけだと、特にiOS Safariでロック解除時に
// スクロール位置が一番上に戻ってしまう既知の問題があるため、ロック時の
// スクロール位置を覚えておき、bodyをposition:fixedでその位置に固定→
// 解除時にwindow.scrollToで元の位置へ戻す方式にしている。
let bodyScrollLockCount = 0;
let bodyScrollLockSavedY = 0;
function lockBodyScroll() {
  bodyScrollLockCount += 1;
  if (bodyScrollLockCount > 1) return; // 既にロック中なら何もしない
  bodyScrollLockSavedY = window.scrollY;
  document.body.classList.add('modal-open');
  document.body.style.top = `-${bodyScrollLockSavedY}px`;
}
function unlockBodyScroll() {
  bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
  if (bodyScrollLockCount > 0) return;
  document.body.classList.remove('modal-open');
  document.body.style.top = '';
  window.scrollTo(0, bodyScrollLockSavedY);
}

const PART_TO_MUSCLES = {
  fullbody: ['fullbody'],
  chest: ['chest'],
  back: ['back'],
  shoulders: ['shoulders'],
  arms: ['biceps', 'triceps'],
  legs: ['quads', 'hamstrings', 'glutes', 'calves'],
  core: ['abs'],
};

let currentMenu = null;
let currentSession = null;
let bodyWeightKg = 60; // 「要望から作る」「自分で作る」両方のスライダーで共有する体重

// 「自分で作る」モードの状態
let customExercises = []; // EXERCISESの生データを追加順に並べたもの
let customRestSec = {}; // exerciseId -> 休憩秒数
let customWarmup = { general: '', dynamic: [], staticStretch: [] };
let customCooldown = { static: [], general: '' };

// 種目ピッカーが今どちらの画面から開かれているか('custom' | 'menu')
let exercisePickerTarget = null;
// 種目ピッカーの絞り込みモード('all' | 'favorites' | 'recent')
let exercisePickerFilter = 'all';
// 種目ピッカーの器具絞り込み。「要望から作る」のメニュー画面から開いた時だけ、その時
// 選んだ器具の配列が入る(「自分で作る」からは常にnull＝絞り込みなし)。
let exercisePickerEquipmentFilter = null;
// 上記の絞り込みを今実際に適用しているか(ピッカー内のトグルでON/OFFを切り替えられる)
let exercisePickerEquipmentFilterActive = true;

// 記録削除の確認モーダルが今どちらの対象か(nullなら「すべて削除」、文字列ならその1件のsession.id)
let historyDeleteTargetId = null;

// 豆知識画面のカテゴリ絞り込み('all'またはKNOWLEDGE_CATEGORIESのいずれか)
let knowledgeCategoryFilter = 'all';

// 週間プラン画面(screen-weekly)が今どのプリセット(id)を編集中か。nullなら未作成/未選択
// （その場合は画面側が「まだ作られていません」の空の状態を出す）。
let weeklyPlanEditingId = null;
// 週間プランの曜日編集モーダルが今どの曜日(0=月〜6=日)を対象にしているか
let weeklyDayEditIndex = null;

// ===== 種目カードの長押し→ドラッグ並べ替え（スマホのホーム画面アイコンと同じ操作感） =====
// 長押しで「入れ替えモード」に入り、カードがゆれる。ゆれている間はどのカードもそのまま
// ドラッグして並べ替えできる（2つ目以降は長押し不要）。各カードの左上の×バッジで削除。
// 「完了」を押すか、もう一度長押しすると通常モードに戻る。

const REORDER_LONG_PRESS_MS = 450;
const REORDER_MOVE_TOLERANCE = 10;

function createReorderController({ stableContainer, listSelector, onReorder, onRemove }) {
  let reorderMode = false;
  let pressTimer = null;
  let pressStart = null;
  let pressItem = null;
  let drag = null;

  function listEl() {
    if (!stableContainer) return null;
    if (stableContainer.matches && stableContainer.matches(listSelector)) return stableContainer;
    return stableContainer.querySelector(listSelector);
  }

  function items() {
    const list = listEl();
    return list ? Array.from(list.querySelectorAll(':scope > .reorder-item')) : [];
  }

  function applyModeClass() {
    const list = listEl();
    if (list) list.classList.toggle('reorder-mode', reorderMode);
  }

  function setReorderMode(on) {
    reorderMode = on;
    applyModeClass();
  }

  function clearPressTimer() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  function beginDrag(item) {
    const els = items();
    const originalOrder = els.map((el) => el.dataset.reorderKey);
    drag = {
      key: item.dataset.reorderKey,
      el: item,
      order: originalOrder.slice(),
      originalIndex: Object.fromEntries(originalOrder.map((k, i) => [k, i])),
      slotTop: els.map((el) => el.getBoundingClientRect().top),
      slotHeight: els.map((el) => el.offsetHeight),
      startClientY: null,
    };
    item.classList.add('reorder-dragging');
    const list = listEl();
    if (list) list.classList.add('dragging-active');
  }

  function updateDrag(clientY) {
    if (!drag) return;
    if (drag.startClientY == null) drag.startClientY = clientY;
    const deltaY = clientY - drag.startClientY;
    drag.el.style.transform = `translateY(${deltaY}px)`;

    const draggedSlot = drag.originalIndex[drag.key];
    const draggedCenter = drag.slotTop[draggedSlot] + drag.slotHeight[draggedSlot] / 2 + deltaY;

    let targetSlot = drag.order.indexOf(drag.key);
    let bestDist = Infinity;
    drag.slotTop.forEach((top, i) => {
      const center = top + drag.slotHeight[i] / 2;
      const dist = Math.abs(center - draggedCenter);
      if (dist < bestDist) {
        bestDist = dist;
        targetSlot = i;
      }
    });

    const currentSlot = drag.order.indexOf(drag.key);
    if (targetSlot !== currentSlot) {
      drag.order.splice(currentSlot, 1);
      drag.order.splice(targetSlot, 0, drag.key);
    }

    items().forEach((el) => {
      if (el === drag.el) return;
      const key = el.dataset.reorderKey;
      const target = drag.slotTop[drag.order.indexOf(key)];
      const orig = drag.slotTop[drag.originalIndex[key]];
      const shift = target - orig;
      el.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  }

  function endDrag() {
    if (!drag) return;
    const finalOrder = drag.order.slice();
    drag.el.classList.remove('reorder-dragging');
    drag.el.style.transform = '';
    items().forEach((el) => { el.style.transform = ''; });
    const list = listEl();
    if (list) list.classList.remove('dragging-active');
    drag = null;
    onReorder(finalOrder);
  }

  // Pointer Eventsではなく生のTouch/Mouseイベントを使う。iOSのPointer Eventsは
  // touch-action(CSS)をJSから動的に変更してもドラッグ開始時のスクロール判定に
  // 間に合わないことがある既知の制限があり(w3c/pointerevents issue #178)、
  // 実際にドラッグ中に画面ごとスクロールしてしまう不具合が起きたため、より枯れた
  // Touch Events(preventDefaultがtouchmoveで確実に効く)方式に切り替えた。

  function pointFromEvent(e) {
    if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function handleStart(e) {
    if (drag) return; // 既にドラッグ中は多重タッチ/多重クリックを無視
    if (e.target.closest('.reorder-delete-badge')) return;
    if (e.target.closest('input, button, a')) return;
    const item = e.target.closest('.reorder-item');
    const list = listEl();
    if (!item || !list || !list.contains(item)) return;
    const p = pointFromEvent(e);
    pressStart = { x: p.x, y: p.y };
    pressItem = item;
    clearPressTimer();
    if (reorderMode) {
      beginDrag(item);
    } else {
      pressTimer = setTimeout(() => {
        pressTimer = null;
        if (!pressItem) return;
        setReorderMode(true);
        beginDrag(pressItem);
      }, REORDER_LONG_PRESS_MS);
    }
  }

  function cancelPendingPress() {
    clearPressTimer();
    pressItem = null;
    pressStart = null;
  }

  // move/end/cancelはcontainerではなくdocumentで拾う。ドラッグ中に指がリストの外
  // (下部ナビや画面端)まで動いても追跡を取りこぼさないようにするため。
  function handleMove(e) {
    const p = pointFromEvent(e);
    if (pressStart && !drag) {
      if (Math.abs(p.x - pressStart.x) > REORDER_MOVE_TOLERANCE || Math.abs(p.y - pressStart.y) > REORDER_MOVE_TOLERANCE) {
        cancelPendingPress();
      }
    }
    if (drag) {
      e.preventDefault(); // touchmoveでのpreventDefaultが画面スクロール抑制の本体
      updateDrag(p.y);
    }
  }

  function handleEnd() {
    cancelPendingPress();
    if (drag) endDrag();
  }

  stableContainer.addEventListener('touchstart', handleStart, { passive: true });
  document.addEventListener('touchmove', handleMove, { passive: false });
  document.addEventListener('touchend', handleEnd);
  document.addEventListener('touchcancel', handleEnd);

  // マウス操作(PCでの動作確認用)
  stableContainer.addEventListener('mousedown', handleStart);
  document.addEventListener('mousemove', handleMove);
  document.addEventListener('mouseup', handleEnd);

  stableContainer.addEventListener('click', (e) => {
    const badge = e.target.closest('.reorder-delete-badge');
    if (badge) {
      const item = badge.closest('.reorder-item');
      if (item) onRemove(item.dataset.reorderKey);
      return;
    }
    if (e.target.closest('[data-reorder-done]')) setReorderMode(false);
  });

  return {
    reapplyAfterRender() { applyModeClass(); },
  };
}

let menuReorderController = null;
let customReorderController = null;

function findExerciseById(id) {
  return EXERCISES.find((ex) => ex.id === id);
}

function getSelectedParts() {
  return Array.from(document.querySelectorAll('#part-group input:checked')).map((el) => el.dataset.part);
}

function getSelectedEquipment() {
  return Array.from(document.querySelectorAll('#equipment-group input:checked')).map((el) => el.value);
}

function getSelectedPainAreas() {
  return Array.from(document.querySelectorAll('#pain-group input:checked'))
    .map((el) => el.dataset.pain)
    .filter((v) => v !== 'none');
}

// 体重は「要望から作る」の設定画面と「自分で作る」画面の両方にスライダーがあり、
// どちらを操作しても同じ値として扱う(片方でしか設定できないと、自分で作る派の人が
// 一度も体重を入れないまま自重種目の負荷推定が行われてしまうため)。
function getBodyWeightKg() {
  return bodyWeightKg;
}

function setBodyWeightKg(value, persist) {
  bodyWeightKg = value;
  ['bodyweight-slider', 'bodyweight-slider-custom'].forEach((id) => {
    const slider = document.getElementById(id);
    if (slider) slider.value = value;
  });
  ['bodyweight-value', 'bodyweight-value-custom'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = `${value} kg`;
  });
  if (persist) saveSettings({ ...(loadSettings() || {}), bodyWeightKg: value });
}

function wireBodyWeightSlider() {
  ['bodyweight-slider', 'bodyweight-slider-custom'].forEach((id) => {
    const slider = document.getElementById(id);
    if (!slider) return;
    slider.addEventListener('input', () => setBodyWeightKg(Number(slider.value), true));
  });
}

// ===== 「自分で作る」モード =====

function recomputeCustomWarmupCooldown() {
  // 「自分で作る」画面には気になる部位の選択UIが無いが、設定画面(要望から作る)で選んだ内容は
  // 一時的な条件ではなく本人の恒常的な特性に近いため、保存済みの設定から引き継いでクールダウンの
  // ストレッチ優先順位付けに使う。
  const painAreas = (loadSettings() || {}).painAreas || [];
  const { warmup, cooldown } = buildWarmupAndCooldown(customExercises, painAreas);
  customWarmup = warmup;
  customCooldown = cooldown;
  renderCustomWuCd(customWarmup, customCooldown);
}

function renderCustomScreen() {
  recomputeCustomWarmupCooldown();
  renderCustomExerciseList(customExercises, customRestSec);
  renderCustomTemplateList(loadCustomTemplates());
  document.getElementById('custom-save-template-btn').hidden = customExercises.length === 0;
  if (customReorderController) customReorderController.reapplyAfterRender();
}

// 保存済みの組み合わせ(種目構成・休憩時間)を「自分で作る」画面に反映する。
// 種目データが更新されて削除されたIDは無視する。
function applyCustomTemplate(template) {
  customExercises = template.exerciseIds.map((id) => findExerciseById(id)).filter(Boolean);
  customRestSec = { ...template.restSec };
  document.getElementById('custom-error').textContent = '';
  renderCustomScreen();
}

function openSaveTemplateModal() {
  document.getElementById('save-template-name').value = '';
  document.getElementById('save-template-error').textContent = '';
  document.getElementById('save-template-modal').classList.add('open');
  document.getElementById('save-template-name').focus();
}

function closeSaveTemplateModal() {
  document.getElementById('save-template-modal').classList.remove('open');
}

function confirmSaveTemplate() {
  const nameInput = document.getElementById('save-template-name');
  const name = nameInput.value.trim();
  if (!name) {
    document.getElementById('save-template-error').textContent = '名前を入力してください';
    return;
  }
  saveCustomTemplate({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: new Date().toISOString(),
    exerciseIds: customExercises.map((ex) => ex.id),
    restSec: { ...customRestSec },
  });
  closeSaveTemplateModal();
  renderCustomTemplateList(loadCustomTemplates());
}

function addCustomExercise(id) {
  if (customExercises.some((ex) => ex.id === id)) return;
  const ex = findExerciseById(id);
  if (!ex) return;
  customExercises.push(ex);
  // 有酸素種目はセット間の休憩という概念がないため、休憩時間は設定しない
  if (ex.type !== 'cardio' && customRestSec[id] == null) customRestSec[id] = 90;
  renderCustomScreen();
}

function removeCustomExercise(id) {
  customExercises = customExercises.filter((ex) => ex.id !== id);
  renderCustomScreen();
}

function reorderCustomExercises(keyOrder) {
  const byId = Object.fromEntries(customExercises.map((ex) => [ex.id, ex]));
  customExercises = keyOrder.map((key) => byId[key]).filter(Boolean);
  renderCustomExerciseList(customExercises, customRestSec);
  if (customReorderController) customReorderController.reapplyAfterRender();
}

function wireCustomScreen() {
  document.getElementById('custom-add-exercise-btn').addEventListener('click', () => openExercisePicker('custom'));

  customReorderController = createReorderController({
    stableContainer: document.getElementById('custom-exercise-list'),
    listSelector: '#custom-exercise-list',
    onReorder: reorderCustomExercises,
    onRemove: removeCustomExercise,
  });

  document.getElementById('custom-exercise-list').addEventListener('input', (e) => {
    const slider = e.target.closest('[data-custom-rest]');
    if (!slider) return;
    customRestSec[slider.dataset.customRest] = Number(slider.value);
    slider.parentElement.querySelector('.slider-value').textContent = `${slider.value} 秒`;
  });

  document.getElementById('custom-wu-cd').addEventListener('click', (e) => {
    // ⓘ(data-info-toggle)は#mainの共通ハンドラで処理されるのでここでは扱わない
    const removeWarmup = e.target.closest('[data-custom-remove-warmup]');
    if (removeWarmup) {
      customWarmup.dynamic.splice(Number(removeWarmup.dataset.customRemoveWarmup), 1);
      renderCustomWuCd(customWarmup, customCooldown);
      return;
    }
    const removeStaticStretch = e.target.closest('[data-custom-remove-static-stretch]');
    if (removeStaticStretch) {
      customWarmup.staticStretch.splice(Number(removeStaticStretch.dataset.customRemoveStaticStretch), 1);
      renderCustomWuCd(customWarmup, customCooldown);
      return;
    }
    const removeCooldown = e.target.closest('[data-custom-remove-cooldown]');
    if (removeCooldown) {
      customCooldown.static.splice(Number(removeCooldown.dataset.customRemoveCooldown), 1);
      renderCustomWuCd(customWarmup, customCooldown);
    }
  });

  document.getElementById('custom-template-list').addEventListener('click', (e) => {
    const del = e.target.closest('[data-template-delete]');
    if (del) {
      deleteCustomTemplate(del.dataset.templateDelete);
      renderCustomTemplateList(loadCustomTemplates());
      return;
    }
    const load = e.target.closest('[data-template-load]');
    if (load) {
      const template = loadCustomTemplates().find((t) => t.id === load.dataset.templateLoad);
      if (template) applyCustomTemplate(template);
      document.getElementById('custom-template-toggle').open = false;
    }
  });

  document.getElementById('custom-save-template-btn').addEventListener('click', openSaveTemplateModal);
  document.getElementById('save-template-modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-save-template-close]')) closeSaveTemplateModal();
  });
  document.getElementById('save-template-confirm').addEventListener('click', confirmSaveTemplate);
  document.getElementById('save-template-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmSaveTemplate();
  });

  document.getElementById('custom-generate-btn').addEventListener('click', () => {
    const errorEl = document.getElementById('custom-error');
    if (customExercises.length === 0) {
      errorEl.textContent = '種目を1つ以上追加してください';
      return;
    }
    errorEl.textContent = '';
    const main = customExercises.map((ex) => (ex.type === 'cardio'
      ? buildCustomCardioPlan(ex)
      : buildCustomSetPlan(ex, customRestSec[ex.id] != null ? customRestSec[ex.id] : 90)));
    currentMenu = {
      warmup: customWarmup,
      cooldown: customCooldown,
      main,
      generatedAt: new Date().toISOString(),
      params: { custom: true },
      userReordered: false,
    };
    renderMenuScreen();
    showScreen('menu');
  });
}

// ===== 種目ピッカー（「自分で作る」画面／メニュー画面の両方から使う共通モーダル） =====

function isExercisePickerSelected(id) {
  if (exercisePickerTarget === 'custom') return customExercises.some((ex) => ex.id === id);
  if (exercisePickerTarget === 'menu') return currentMenu && currentMenu.main.some((item) => item.exerciseId === id);
  return false;
}

function renderExercisePickerNow() {
  const equipmentFilter = exercisePickerEquipmentFilterActive ? exercisePickerEquipmentFilter : null;
  renderExercisePicker(document.getElementById('exercise-picker-search').value, isExercisePickerSelected, exercisePickerFilter, equipmentFilter);
}

// 絞り込み(フィルター切り替え・検索)で表示される一覧そのものが変わる時に呼ぶ。
// 一覧のスクロール位置を先頭に戻さないと、長い一覧を下の方までスクロールした状態で
// 短い一覧(例:お気に入り)に切り替えた時、スクロール位置だけ残ってしまい
// 実際にはある種目が画面外(スクロールした先の空白)に隠れて何も表示されないように見えるバグがあった。
function renderExercisePickerAndResetScroll() {
  renderExercisePickerNow();
  document.getElementById('exercise-picker-list').scrollTop = 0;
}

// 器具絞り込みの案内＋トグルボタンの表示を更新する。絞り込み対象外(自分で作る、
// または要望から作るでも器具を1つも選んでいない等)なら何も出さない。
function updateExercisePickerEquipmentNote() {
  const note = document.getElementById('exercise-picker-equipment-note');
  if (!exercisePickerEquipmentFilter) {
    note.hidden = true;
    return;
  }
  note.hidden = false;
  document.getElementById('exercise-picker-equipment-note-text').textContent = exercisePickerEquipmentFilterActive
    ? '②で選んだ器具のみ表示中（有酸素は除く）'
    : 'すべての器具の種目を表示中';
  document.getElementById('exercise-picker-equipment-toggle').textContent = exercisePickerEquipmentFilterActive
    ? 'すべて表示する'
    : '器具で絞り込む';
}

function openExercisePicker(target) {
  exercisePickerTarget = target;
  exercisePickerFilter = 'all';
  // 「要望から作る」で生成したメニュー画面からの追加時だけ、その時選んだ器具で絞り込む
  // （「自分で作る」は元々器具条件を選んでいないモードなので対象外）。
  exercisePickerEquipmentFilter = (target === 'menu' && currentMenu && !currentMenu.params.custom && currentMenu.params.equipment)
    ? currentMenu.params.equipment
    : null;
  exercisePickerEquipmentFilterActive = true;
  document.querySelectorAll('.picker-filter-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.pickerFilter === 'all');
  });
  const searchInput = document.getElementById('exercise-picker-search');
  searchInput.value = '';
  updateExercisePickerEquipmentNote();
  renderExercisePickerAndResetScroll();
  document.getElementById('exercise-picker-modal').hidden = false;
  lockBodyScroll();
}

function closeExercisePicker() {
  document.getElementById('exercise-picker-modal').hidden = true;
  exercisePickerTarget = null;
  unlockBodyScroll();
}

function handleExercisePickerSelect(id) {
  if (exercisePickerTarget === 'custom') {
    if (customExercises.some((ex) => ex.id === id)) {
      removeCustomExercise(id);
    } else {
      addCustomExercise(id);
    }
  } else if (exercisePickerTarget === 'menu') {
    toggleMenuExercise(id);
  }
  renderExercisePickerNow();
}

function wireExercisePicker() {
  document.getElementById('exercise-picker-search').addEventListener('input', renderExercisePickerAndResetScroll);
  document.getElementById('exercise-picker-close').addEventListener('click', closeExercisePicker);
  document.querySelectorAll('.picker-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      exercisePickerFilter = btn.dataset.pickerFilter;
      document.querySelectorAll('.picker-filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
      renderExercisePickerAndResetScroll();
    });
  });
  document.getElementById('exercise-picker-equipment-toggle').addEventListener('click', () => {
    exercisePickerEquipmentFilterActive = !exercisePickerEquipmentFilterActive;
    updateExercisePickerEquipmentNote();
    renderExercisePickerAndResetScroll();
  });
  document.getElementById('exercise-picker-list').addEventListener('click', (e) => {
    const favBtn = e.target.closest('[data-fav-toggle]');
    if (favBtn) {
      toggleFavoriteExercise(favBtn.dataset.favToggle);
      renderExercisePickerNow();
      return;
    }
    const item = e.target.closest('[data-picker-exercise]');
    if (item) handleExercisePickerSelect(item.dataset.pickerExercise);
  });
}

// ===== 「今日のメニュー」画面での種目の追加・削除・並べ替え（要望から作るモードでも使える） =====

function recomputeMenuWarmupCooldown() {
  const rawExercises = currentMenu.main.map((item) => findExerciseById(item.exerciseId)).filter(Boolean);
  const { warmup, cooldown } = buildWarmupAndCooldown(rawExercises, currentMenu.params.painAreas || []);
  currentMenu.warmup = warmup;
  currentMenu.cooldown = cooldown;
}

function renderMenuScreen() {
  renderMenu(currentMenu);
  if (!menuReorderController) {
    menuReorderController = createReorderController({
      stableContainer: document.getElementById('menu-content'),
      listSelector: '#menu-exercise-list',
      onReorder: reorderMenuMain,
      onRemove: removeMenuExercise,
    });
  }
  menuReorderController.reapplyAfterRender();
}

function reorderMenuMain(keyOrder) {
  const byKey = Object.fromEntries(currentMenu.main.map((item) => [item.exerciseId, item]));
  currentMenu.main = keyOrder.map((key) => byKey[key]).filter(Boolean);
  currentMenu.userReordered = true; // 以後、種目を追加しても自動並べ替えをかけない
  renderMenuScreen();
}

function removeMenuExercise(exerciseId) {
  currentMenu.main = currentMenu.main.filter((item) => item.exerciseId !== exerciseId);
  recomputeMenuWarmupCooldown();
  renderMenuScreen();
}

function toggleMenuExercise(id) {
  const existingIndex = currentMenu.main.findIndex((item) => item.exerciseId === id);
  if (existingIndex >= 0) {
    currentMenu.main.splice(existingIndex, 1);
  } else {
    const ex = findExerciseById(id);
    if (!ex) return;
    const plan = ex.type === 'cardio'
      ? buildCustomCardioPlan(ex)
      : currentMenu.params.custom
        ? buildCustomSetPlan(ex, 90)
        : buildSetPlan(ex, currentMenu.params.level, currentMenu.params.goal);
    currentMenu.main.push(plan);
    // 「要望から作る」のメニューは、追加した種目もエクササイズの配列原則(大筋群→小筋群、
    // 体幹は終盤に、等)に沿った位置へ自動で並べ直す。「自分で作る」は手動の並び順を
    // 尊重したいユーザー向けのモードなので対象外。また、一度でも長押しドラッグで手動並べ替え
    // 済み(userReordered)なら、以後は追加のたびに勝手に並べ替えない。
    if (!currentMenu.params.custom && !currentMenu.userReordered) {
      currentMenu.main = sortByTrainingOrder(currentMenu.main);
    }
  }
  recomputeMenuWarmupCooldown();
  renderMenuScreen();
}

function wireMenuScreen() {
  document.getElementById('menu-content').addEventListener('click', (e) => {
    const addBtn = e.target.closest('#menu-add-exercise-btn');
    if (addBtn) {
      openExercisePicker('menu');
      return;
    }
    const autoSortBtn = e.target.closest('#menu-auto-sort-btn');
    if (autoSortBtn) {
      // 手動で並べ替えた後でも、このボタンを押せばいつでも①のルール順に戻せる。
      // 押した後は「手動並べ替え済み」状態を解除し、次に種目を追加した時も自動で並ぶようにする。
      currentMenu.main = sortByTrainingOrder(currentMenu.main);
      currentMenu.userReordered = false;
      renderMenuScreen();
    }
  });
}

// ===== 週間プラン画面 =====
// 週間プランは「自分で作る」の保存済み組み合わせと同じ考え方で、名前付きの複数プリセットとして
// 持てる。screen-weekly（この節）は常に「今どれを編集中か(weeklyPlanEditingId)」を1つだけ持ち、
// 使用中(active)のプリセットはモード選択画面の表示に使う別概念（wireModeWeeklyPlanSection以下）。

// 今、使用中(active)のプリセット本体を返す。無ければnull。
function getActiveWeeklyPlan() {
  const id = getActiveWeeklyPlanId();
  if (!id) return null;
  return loadWeeklyPlans().find((p) => p.id === id) || null;
}

// 今、週間プラン画面(screen-weekly)で編集中のプリセット本体を返す。無ければnull
// （1つも作られていない、または編集中に削除された場合）。
function getEditingWeeklyPlan() {
  if (!weeklyPlanEditingId) return null;
  return loadWeeklyPlans().find((p) => p.id === weeklyPlanEditingId) || null;
}

function renderWeeklyEditorScreen() {
  const plan = getEditingWeeklyPlan();
  const hasPlan = !!plan;
  document.getElementById('weekly-empty-state').hidden = hasPlan;
  document.getElementById('weekly-editor-content').hidden = !hasPlan;
  document.getElementById('weekly-editor-plan-name').textContent = hasPlan ? `「${plan.name}」を編集中` : '';
  if (hasPlan) renderWeeklyPlan(plan.days, loadCustomTemplates());
}

// 指定したプリセットを編集対象にして週間プラン画面を表示する。
function openWeeklyPlanEditor(planId) {
  weeklyPlanEditingId = planId;
  renderWeeklyEditorScreen();
  showScreen('weekly');
}

// ボトムナビ「週間プラン」からの入場。使用中(active)のプリセットがあればそれを、
// 無くても何かプリセットがあれば先頭のものを編集対象にする(使用中も追従させる)。
// 1つも無ければ編集対象なしのまま→画面側が空の状態を出す。
function enterWeeklyScreenFromNav() {
  const plans = loadWeeklyPlans();
  let plan = plans.find((p) => p.id === getActiveWeeklyPlanId());
  if (!plan && plans.length > 0) {
    [plan] = plans;
    setActiveWeeklyPlanId(plan.id);
  }
  weeklyPlanEditingId = plan ? plan.id : null;
  renderWeeklyEditorScreen();
}

function applyAutoWeeklySplit() {
  const plan = getEditingWeeklyPlan();
  if (!plan) return;
  const days = Number(document.getElementById('weekly-auto-days').value);
  plan.days = proposeWeeklySplit(days);
  updateWeeklyPlanDays(plan.id, plan.days);
  renderWeeklyEditorScreen();
}

function updateWeeklyDayModalVisibility(kind) {
  document.getElementById('weekly-day-part-group').hidden = kind !== 'parts';
  document.getElementById('weekly-day-template-row').hidden = kind !== 'template';
}

function openWeeklyDayModal(dayIndex) {
  const plan = getEditingWeeklyPlan();
  if (!plan) return;
  weeklyDayEditIndex = dayIndex;
  const day = plan.days[dayIndex] || { kind: 'rest' };
  const kind = day.kind || 'rest';

  document.getElementById('weekly-day-modal-title').textContent = `${WEEKDAY_LABELS[dayIndex]}曜日の内容`;
  document.getElementById('weekly-day-error').textContent = '';

  document.querySelectorAll('#weekly-day-kind-group input').forEach((el) => {
    el.checked = el.value === kind;
  });
  document.querySelectorAll('#weekly-day-part-group input').forEach((el) => {
    el.checked = kind === 'parts' && (day.parts || []).includes(el.dataset.part);
  });

  const templates = loadCustomTemplates();
  const select = document.getElementById('weekly-day-template-select');
  select.innerHTML = templates.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  document.getElementById('weekly-day-template-empty').hidden = templates.length > 0;
  select.hidden = templates.length === 0;
  if (kind === 'template' && day.templateId) select.value = day.templateId;

  updateWeeklyDayModalVisibility(kind);
  document.getElementById('weekly-day-modal').classList.add('open');
  lockBodyScroll();
}

function closeWeeklyDayModal() {
  document.getElementById('weekly-day-modal').classList.remove('open');
  weeklyDayEditIndex = null;
  unlockBodyScroll();
}

function confirmWeeklyDaySave() {
  if (weeklyDayEditIndex == null) return;
  const plan = getEditingWeeklyPlan();
  if (!plan) return;
  const errorEl = document.getElementById('weekly-day-error');
  const checkedKind = document.querySelector('#weekly-day-kind-group input:checked');
  const kind = checkedKind ? checkedKind.value : 'rest';

  let entry;
  if (kind === 'parts') {
    const parts = Array.from(document.querySelectorAll('#weekly-day-part-group input:checked')).map((el) => el.dataset.part);
    if (parts.length === 0) {
      errorEl.textContent = '部位を1つ以上選んでください';
      return;
    }
    entry = { kind: 'parts', parts };
  } else if (kind === 'template') {
    const select = document.getElementById('weekly-day-template-select');
    if (!select.value) {
      errorEl.textContent = '保存した組み合わせを選んでください';
      return;
    }
    entry = { kind: 'template', templateId: select.value };
  } else {
    entry = { kind: 'rest' };
  }

  errorEl.textContent = '';
  plan.days[weeklyDayEditIndex] = entry;
  updateWeeklyPlanDays(plan.id, plan.days);
  closeWeeklyDayModal();
  renderWeeklyEditorScreen();
}

function deleteEditingWeeklyPlan() {
  if (!weeklyPlanEditingId) return;
  deleteWeeklyPlan(weeklyPlanEditingId);
  weeklyPlanEditingId = null;
  renderModeWeeklyPlanSection();
  showScreen('mode');
}

function wireWeeklyScreen() {
  document.getElementById('weekly-empty-create-btn').addEventListener('click', openWeeklyPlanNameModal);
  document.getElementById('weekly-editor-delete-btn').addEventListener('click', deleteEditingWeeklyPlan);
  document.getElementById('weekly-auto-btn').addEventListener('click', applyAutoWeeklySplit);

  document.getElementById('weekly-day-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-weekly-day-edit]');
    if (btn) openWeeklyDayModal(Number(btn.dataset.weeklyDayEdit));
  });

  document.getElementById('weekly-day-kind-group').addEventListener('change', (e) => {
    if (e.target.name === 'weekly-day-kind') updateWeeklyDayModalVisibility(e.target.value);
  });

  // 全身を選んだら他の部位は解除する（「要望から作る」画面の#part-groupと同じ排他ルール）
  document.querySelectorAll('#weekly-day-part-group input').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.dataset.part === 'fullbody' && input.checked) {
        document.querySelectorAll('#weekly-day-part-group input').forEach((other) => {
          if (other !== input) other.checked = false;
        });
      } else if (input.checked) {
        const fullbodyInput = document.querySelector('#weekly-day-part-group input[data-part="fullbody"]');
        if (fullbodyInput) fullbodyInput.checked = false;
      }
    });
  });

  document.getElementById('weekly-day-modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-weekly-day-close]')) closeWeeklyDayModal();
  });
  document.getElementById('weekly-day-save').addEventListener('click', confirmWeeklyDaySave);
}

// ===== モード選択画面：「週間プラン」セクション =====
// 使用中(active)のプリセットを参照する。今日にあたる曜日の行はセクション内で
// ハイライト＋「始める」表示される(js/ui.jsのweeklyPlanDaysHtml)。screen-modeを
// 表示するたびに再計算する(週間プランをその場で編集・切り替えた直後に戻ってきても
// 最新の内容を反映するため)。専用バナーを別途置いていたが「うるさい」との指摘で撤廃し、
// このセクションに統合した。

function renderModeWeeklyPlanSection() {
  renderWeeklyPlanSection(loadWeeklyPlans(), getActiveWeeklyPlanId(), loadCustomTemplates());
}

// 週間プランセクションの今日の行にある「始める」。
// 以前は①鍛えたい部位のチェックを合わせて設定画面を必ず経由していたが、器具・時間・レベル・
// 目的は`restoreLastSettings()`で既に前回値が復元済みのため、「今日も同じ内容でいいですか？」を
// 実質無言で毎回聞き直しているだけだった（値の再入力は不要なのに画面遷移・タップ数だけが
// 増えていた）。知識があって毎回作るのが面倒な人ほど、この一手間が離脱の原因になりうるため、
// 設定画面を経由せず生成済みのメニュー確認画面まで直接進めるようにした。
// 「今日は器具が無い」等いつもと状況が違う時の調整は、メニュー確認画面の「条件を変える」から
// 引き続きできる（安全弁として残す。生成自体を無条件に信用させきらない）。
function startTodayFromActivePlan() {
  const active = getActiveWeeklyPlan();
  if (!active) return;
  const entry = active.days[todayWeekdayIndex()];
  if (!entry) return;

  if (entry.kind === 'template') {
    const template = loadCustomTemplates().find((t) => t.id === entry.templateId);
    if (!template) return;
    applyCustomTemplate(template);
    showScreen('custom');
  } else if (entry.kind === 'parts') {
    document.querySelectorAll('#part-group input').forEach((el) => {
      el.checked = entry.parts.includes(el.dataset.part);
    });
    // 設定画面のDOM値(器具・時間・レベル・目的等)は起動時のrestoreLastSettings()で
    // 既に前回値が入っている状態なので、そのままhandleGenerate()を呼べば設定画面を
    // 表示しなくても正しい内容で生成できる。器具0件などバリデーションに引っかかった
    // 場合だけ、エラー文言を見せられる設定画面へフォールバックする。
    if (!handleGenerate()) {
      showScreen('setup');
    }
  }
}

function openWeeklyPlanNameModal() {
  document.getElementById('weekly-plan-name-input').value = '';
  document.getElementById('weekly-plan-name-error').textContent = '';
  document.getElementById('weekly-plan-name-modal').classList.add('open');
  document.getElementById('weekly-plan-name-input').focus();
}

function closeWeeklyPlanNameModal() {
  document.getElementById('weekly-plan-name-modal').classList.remove('open');
}

// 新しいプリセットを名前付きで作成し、使用中にした上で編集画面を開く。
function confirmWeeklyPlanName() {
  const input = document.getElementById('weekly-plan-name-input');
  const name = input.value.trim();
  if (!name) {
    document.getElementById('weekly-plan-name-error').textContent = '名前を入力してください';
    return;
  }
  const plan = createWeeklyPlan(name);
  setActiveWeeklyPlanId(plan.id);
  closeWeeklyPlanNameModal();
  openWeeklyPlanEditor(plan.id);
}

function wireModeWeeklyPlanSection() {
  document.getElementById('weekly-plan-section').addEventListener('click', (e) => {
    if (e.target.closest('#weekly-plan-create-btn')) {
      // 0件の状態からは名前モーダルをいきなり開かず、まず週間プラン画面の空状態
      // （「まだ1つも作られていません。曜日ごとに...決めておける機能です」の説明）を経由させる。
      // 複数プリセットを保存できる仕組みだと知らない初見ユーザーに、前置きなく
      // 「名前を付けてください」だけ聞くと唐突なため。
      weeklyPlanEditingId = null;
      renderWeeklyEditorScreen();
      showScreen('weekly');
      return;
    }
    if (e.target.closest('#weekly-plan-new-btn')) {
      // 既に1つ以上プランがある状態からの追加作成は、仕組みを知っている前提なので
      // 従来通り直接名前モーダルを開く。
      openWeeklyPlanNameModal();
      return;
    }
    if (e.target.closest('[data-weekly-plan-start-today]')) {
      startTodayFromActivePlan();
      return;
    }
    const editBtn = e.target.closest('[data-weekly-plan-edit]');
    if (editBtn) {
      openWeeklyPlanEditor(editBtn.dataset.weeklyPlanEdit);
      return;
    }
    const useBtn = e.target.closest('[data-weekly-plan-use]');
    if (useBtn) {
      setActiveWeeklyPlanId(useBtn.dataset.weeklyPlanUse);
      renderModeWeeklyPlanSection();
      return;
    }
    const delBtn = e.target.closest('[data-weekly-plan-delete]');
    if (delBtn) {
      deleteWeeklyPlan(delBtn.dataset.weeklyPlanDelete);
      renderModeWeeklyPlanSection();
    }
  });

  document.getElementById('weekly-plan-name-modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-weekly-plan-name-close]')) closeWeeklyPlanNameModal();
  });
  document.getElementById('weekly-plan-name-confirm').addEventListener('click', confirmWeeklyPlanName);
  document.getElementById('weekly-plan-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmWeeklyPlanName();
  });
}

// ===== 豆知識画面 =====

function renderKnowledgeScreen() {
  renderKnowledgeCategoryFilters();
  renderKnowledgeTodayTip();
  renderKnowledgeList(document.getElementById('knowledge-search').value, knowledgeCategoryFilter);
}

function wireKnowledgeScreen() {
  document.getElementById('knowledge-search').addEventListener('input', () => {
    renderKnowledgeList(document.getElementById('knowledge-search').value, knowledgeCategoryFilter);
  });
  document.getElementById('knowledge-category-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-knowledge-category]');
    if (!btn) return;
    knowledgeCategoryFilter = btn.dataset.knowledgeCategory;
    document.querySelectorAll('#knowledge-category-filters .picker-filter-btn').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
    renderKnowledgeList(document.getElementById('knowledge-search').value, knowledgeCategoryFilter);
  });
}

function wirePartExclusivity() {
  document.querySelectorAll('#part-group input').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.dataset.part === 'fullbody' && input.checked) {
        document.querySelectorAll('#part-group input').forEach((other) => {
          if (other !== input) other.checked = false;
        });
      } else if (input.checked) {
        const fullbodyInput = document.querySelector('#part-group input[data-part="fullbody"]');
        if (fullbodyInput) fullbodyInput.checked = false;
      }
    });
  });
}

function wirePainExclusivity() {
  document.querySelectorAll('#pain-group input').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.dataset.pain === 'none' && input.checked) {
        document.querySelectorAll('#pain-group input').forEach((other) => {
          if (other !== input) other.checked = false;
        });
      } else if (input.checked) {
        const noneInput = document.querySelector('#pain-group input[data-pain="none"]');
        if (noneInput) noneInput.checked = false;
      } else if (getSelectedPainAreas().length === 0) {
        const noneInput = document.querySelector('#pain-group input[data-pain="none"]');
        if (noneInput) noneInput.checked = true;
      }
    });
  });
}

// 戻り値は生成に成功してscreen-menuまで進めたか(true)、バリデーションで止まったか(false)。
// startTodayFromActivePlan()が、設定画面を経由しない生成を試みて失敗した時に
// 設定画面へフォールバックするための判定に使う（画面遷移せず何も起きないまま
// ユーザーが取り残されるのを防ぐ）。
function handleGenerate() {
  const errorEl = document.getElementById('setup-error');
  const parts = getSelectedParts();
  const equipment = getSelectedEquipment();

  if (parts.length === 0) {
    errorEl.textContent = '「① 鍛えたい部位」を1つ以上選んでください（事前確認の欄とは別です）';
    return false;
  }
  if (equipment.length === 0) {
    errorEl.textContent = '使える器具を1つ以上選んでください';
    return false;
  }
  errorEl.textContent = '';

  const muscleGroups = parts.includes('fullbody') ? ['fullbody'] : parts.flatMap((p) => PART_TO_MUSCLES[p]);
  const minutes = Number(document.getElementById('minutes-select').value);
  const level = document.getElementById('level-select').value;
  const goal = document.getElementById('goal-select').value;
  const painAreas = getSelectedPainAreas();

  const bodyWeightKg = getBodyWeightKg();
  saveSettings({ parts, equipment, minutes, level, goal, painAreas, bodyWeightKg });

  currentMenu = generateMenu({ parts: muscleGroups, equipment, minutes, level, goal, painAreas });
  if (currentMenu.main.length === 0) {
    errorEl.textContent = '選んだ条件に合う種目が見つかりませんでした。器具や部位を見直してください。';
    return false;
  }
  renderMenuScreen();
  showScreen('menu');
  return true;
}

function handleStartWorkout() {
  if (!currentMenu || currentMenu.main.length === 0) {
    alert('種目を1つ以上追加してください');
    return;
  }
  currentSession = createSessionFromMenu(currentMenu, getBodyWeightKg());
  renderLog(currentSession);
  showScreen('log');
  startSessionTimer();
}

// 有酸素種目は「セット」がなく、時間・距離・きつさを直接その種目に持たせているため、
// data-cardio-ex/data-cardio-fieldという別の属性でstrengthの仕組み(data-ex/data-set/data-field)
// と衝突しないようにしている。
function handleCardioLogInput(e) {
  const target = e.target;
  const exIndex = Number(target.dataset.cardioEx);
  const field = target.dataset.cardioField;
  const ex = currentSession.exercises[exIndex];
  ex[field] = field === 'done' ? target.checked : target.value;

  if (field !== 'done') {
    const valueEl = target.parentElement.querySelector('.slider-value');
    if (valueEl) {
      valueEl.textContent = field === 'duration' ? formatMinSec(target.value) : `${Number(target.value).toFixed(1)}km`;
    }
  }

  if (field === 'duration') {
    const calorieEl = document.querySelector(`[data-cardio-calorie="${exIndex}"]`);
    if (calorieEl) {
      const calories = estimateCardioCalories(ex.met, getBodyWeightKg(), Number(ex.duration) || 0);
      calorieEl.textContent = `推定消費カロリー: 約${Math.round(calories)}kcal`;
    }
  }
}

function handleLogInput(e) {
  const target = e.target;
  if (target.dataset.cardioField) {
    handleCardioLogInput(e);
    return;
  }
  if (!target.dataset.field) return;
  const exIndex = Number(target.dataset.ex);
  const setIndex = Number(target.dataset.set);
  const field = target.dataset.field;
  const set = currentSession.exercises[exIndex].sets[setIndex];
  set[field] = field === 'done' ? target.checked : target.value;

  if (field !== 'done') {
    const valueEl = target.parentElement.querySelector('.slider-value');
    if (valueEl) valueEl.textContent = formatSliderValue(field, target.value, currentSession.exercises[exIndex].holdBased);
  }

  if (field === 'rpe') {
    const reserveEl = target.parentElement.querySelector(`[data-rpe-reserve="${exIndex}:${setIndex}"]`);
    if (reserveEl) reserveEl.textContent = rpeReserveText(target.value);
  }

  if (field === 'reps' && !set.isWarmup) {
    const progressionEl = document.querySelector(`[data-ex-reps-progression="${exIndex}"]`);
    if (progressionEl) {
      progressionEl.textContent = buildRepsProgressionText(
        currentSession.exercises[exIndex].sets,
        currentSession.exercises[exIndex].holdBased,
      );
    }
  }

  // ドラッグ中(input)ではなく指を離した瞬間(change)にだけ上限を伸ばす。
  // input時に伸ばすとドラッグの途中で上限が先回りして伸びてしまい、
  // 「右端まで行って離すと+10」という直感的な挙動にならないため。
  if (e.type === 'change' && field === 'reps' && !currentSession.exercises[exIndex].holdBased && Number(target.value) >= Number(target.max)) {
    target.max = Number(target.max) + 10;
  }

  // チェックボックスはinput/changeの両方が発火するため、完了処理はchange時だけ行う。
  // input時にも実行すると休憩タイマーのスクロールロックが二重にかかる。
  if (e.type === 'change' && field === 'done') {
    if (target.checked) {
      const exercise = currentSession.exercises[exIndex];
      const prBadge = document.querySelector(`[data-pr-badge="${exIndex}:${setIndex}"]`);
      if (prBadge) prBadge.hidden = !isPersonalRecord(exercise, set);
      startRestTimer(currentSession.exercises[exIndex].restSec);
    } else {
      const prBadge = document.querySelector(`[data-pr-badge="${exIndex}:${setIndex}"]`);
      if (prBadge) prBadge.hidden = true;
    }
  }
}

function handleFinishWorkout() {
  if (!currentSession) return;
  stopHoldTimer();
  stopCardioTimer();
  endRestTimer();
  currentSession.durationSec = stopSessionTimer();
  finalizeSession(currentSession);
  currentSession = null;
  currentMenu = null;
  renderHistory();
  showScreen('history');
}

// targetIdがnullなら「すべて削除」、session.idを渡せばその1件だけの削除確認になる。
function openResetHistoryModal(targetId) {
  historyDeleteTargetId = targetId || null;
  const titleEl = document.getElementById('reset-history-modal-title');
  const descEl = document.getElementById('reset-history-modal-desc');
  if (historyDeleteTargetId) {
    titleEl.textContent = 'この記録を削除しますか？';
    descEl.textContent = 'この回の記録だけが消え、元に戻せません。他の記録には影響しません。';
  } else {
    titleEl.textContent = '記録をすべて削除しますか？';
    descEl.textContent = 'これまでのトレーニング記録がすべて消え、元に戻せません。お気に入りや体重などの設定はそのまま残ります。';
  }
  document.getElementById('reset-history-modal').classList.add('open');
}

function restoreLastSettings() {
  const settings = loadSettings();
  if (!settings) return;
  // 体重だけが保存されている(自分で作るモードしか使ったことがない)場合など、
  // 一部のフィールドしか無いことがあるため、それぞれ存在確認してから復元する。
  if (settings.parts) {
    document.querySelectorAll('#part-group input').forEach((el) => {
      el.checked = settings.parts.includes(el.dataset.part);
    });
  }
  if (settings.equipment) {
    document.querySelectorAll('#equipment-group input').forEach((el) => {
      el.checked = settings.equipment.includes(el.value);
    });
  }
  if (settings.painAreas) {
    document.querySelectorAll('#pain-group input').forEach((el) => {
      el.checked = el.dataset.pain === 'none' ? settings.painAreas.length === 0 : settings.painAreas.includes(el.dataset.pain);
    });
  }
  if (settings.minutes) document.getElementById('minutes-select').value = settings.minutes;
  if (settings.level) document.getElementById('level-select').value = settings.level;
  if (settings.goal) document.getElementById('goal-select').value = settings.goal;
  if (settings.bodyWeightKg) setBodyWeightKg(settings.bodyWeightKg, false);
}

function init() {
  wirePartExclusivity();
  wirePainExclusivity();
  wireBodyWeightSlider();
  wireCustomScreen();
  wireExercisePicker();
  wireMenuScreen();
  wireWeeklyScreen();
  wireModeWeeklyPlanSection();
  wireKnowledgeScreen();
  restoreLastSettings();
  renderModeWeeklyPlanSection();

  document.getElementById('mode-request-btn').addEventListener('click', () => showScreen('setup'));
  document.getElementById('mode-custom-btn').addEventListener('click', () => {
    customExercises = [];
    customRestSec = {};
    document.getElementById('custom-error').textContent = '';
    renderCustomScreen();
    showScreen('custom');
  });

  document.getElementById('generate-btn').addEventListener('click', handleGenerate);
  document.getElementById('regenerate-btn').addEventListener('click', () => {
    renderModeWeeklyPlanSection();
    showScreen('mode');
  });
  document.getElementById('start-workout-btn').addEventListener('click', handleStartWorkout);
  document.getElementById('log-content').addEventListener('input', handleLogInput);
  document.getElementById('log-content').addEventListener('change', handleLogInput);
  document.getElementById('finish-workout-btn').addEventListener('click', handleFinishWorkout);

  document.getElementById('main').addEventListener('click', (e) => {
    const demoTrigger = e.target.closest('[data-demo]');
    if (demoTrigger) {
      openDemoModal(demoTrigger.dataset.demo);
      return;
    }
    const infoTrigger = e.target.closest('[data-info-toggle]');
    if (infoTrigger) {
      toggleInfoPanel(infoTrigger);
      return;
    }
    const holdTimerTrigger = e.target.closest('[data-hold-timer]');
    if (holdTimerTrigger) toggleHoldTimer(holdTimerTrigger);
    const cardioTimerTrigger = e.target.closest('[data-cardio-timer]');
    if (cardioTimerTrigger) toggleCardioTimer(cardioTimerTrigger);
    const rpeInfoTrigger = e.target.closest('[data-rpe-info-toggle]');
    if (rpeInfoTrigger) openRpeInfoModal();
    const favTrigger = e.target.closest('[data-fav-toggle]');
    if (favTrigger) {
      const id = favTrigger.dataset.favToggle;
      const favorites = toggleFavoriteExercise(id);
      const isFav = favorites.includes(id);
      // その種目の★はどの画面(裏で非表示になっている画面も含む)にあっても
      // まとめて見た目を更新する。一覧の並び自体は変わらないので全体再描画は不要。
      document.querySelectorAll(`[data-fav-toggle="${CSS.escape(id)}"]`).forEach((btn) => {
        btn.textContent = isFav ? '★' : '☆';
        btn.classList.toggle('active', isFav);
        btn.setAttribute('aria-label', isFav ? 'お気に入りから外す' : 'お気に入りに追加');
      });
      return;
    }
    const chartPoint = e.target.closest('.chart-point');
    if (chartPoint) {
      const svg = chartPoint.closest('svg');
      const tooltip = chartPoint.closest('.progress-trend-chart')?.querySelector('.chart-tooltip');
      if (svg && tooltip) {
        const viewBox = svg.viewBox.baseVal;
        const cx = Number(chartPoint.getAttribute('cx'));
        const cy = Number(chartPoint.getAttribute('cy'));
        const detail = chartPoint.dataset.chartDetail;
        tooltip.textContent = `${chartPoint.dataset.chartDate}: ${chartPoint.dataset.chartValue}${detail ? `（${detail}）` : ''}`;
        tooltip.style.left = `${(cx / viewBox.width) * 100}%`;
        tooltip.style.top = `${(cy / viewBox.height) * 100}%`;
        tooltip.hidden = false;
      }
      return;
    }
    document.querySelectorAll('.chart-tooltip').forEach((t) => { t.hidden = true; });
  });
  document.getElementById('demo-modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-demo-close]')) closeDemoModal();
  });
  document.getElementById('rpe-info-modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-rpe-info-close]')) closeRpeInfoModal();
  });
  document.getElementById('reset-history-btn').addEventListener('click', () => openResetHistoryModal(null));
  document.getElementById('history-content').addEventListener('click', (e) => {
    const delBtn = e.target.closest('[data-history-delete]');
    if (delBtn) openResetHistoryModal(delBtn.dataset.historyDelete);
  });
  document.getElementById('reset-history-modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-reset-history-close]')) {
      document.getElementById('reset-history-modal').classList.remove('open');
    }
  });
  document.getElementById('reset-history-confirm').addEventListener('click', () => {
    if (historyDeleteTargetId) {
      deleteSession(historyDeleteTargetId);
    } else {
      clearHistory();
    }
    historyDeleteTargetId = null;
    document.getElementById('reset-history-modal').classList.remove('open');
    renderHistory();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDemoModal();
      closeExercisePicker();
      closeRpeInfoModal();
      document.getElementById('reset-history-modal').classList.remove('open');
      closeSaveTemplateModal();
      closeWeeklyDayModal();
      closeWeeklyPlanNameModal();
    }
  });

  document.getElementById('rest-timer-plus10').addEventListener('click', () => addRestTimerSeconds(10));
  document.getElementById('rest-timer-end').addEventListener('click', endRestTimer);
  document.getElementById('hold-timer-cancel').addEventListener('click', stopHoldTimer);
  document.getElementById('cardio-timer-rest-toggle').addEventListener('click', toggleCardioRest);
  document.getElementById('cardio-timer-stop').addEventListener('click', stopCardioTimer);

  document.getElementById('progress-exercise-select').addEventListener('change', (e) => {
    renderExerciseProgressChart(e.target.value);
  });

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.nav;
      if (target === 'mode') renderModeWeeklyPlanSection();
      if (target === 'history') renderHistory();
      if (target === 'progress') renderProgressScreen();
      if (target === 'weekly') enterWeeklyScreenFromNav();
      if (target === 'knowledge') renderKnowledgeScreen();
      stopHoldTimer();
      stopCardioTimer();
      endRestTimer();
      stopSessionTimer();
      showScreen(target);
    });
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
