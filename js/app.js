// エントリポイント。画面遷移とイベント配線のみを担当する。

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
let customWarmup = { general: '', dynamic: [] };
let customCooldown = { static: [], general: '' };

// 種目ピッカーが今どちらの画面から開かれているか('custom' | 'menu')
let exercisePickerTarget = null;
// 種目ピッカーの絞り込みモード('all' | 'favorites' | 'recent')
let exercisePickerFilter = 'all';

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
  const { warmup, cooldown } = buildWarmupAndCooldown(customExercises);
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
  renderExercisePicker(document.getElementById('exercise-picker-search').value, isExercisePickerSelected, exercisePickerFilter);
}

function openExercisePicker(target) {
  exercisePickerTarget = target;
  exercisePickerFilter = 'all';
  document.querySelectorAll('.picker-filter-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.pickerFilter === 'all');
  });
  const searchInput = document.getElementById('exercise-picker-search');
  searchInput.value = '';
  renderExercisePickerNow();
  document.getElementById('exercise-picker-modal').hidden = false;
}

function closeExercisePicker() {
  document.getElementById('exercise-picker-modal').hidden = true;
  exercisePickerTarget = null;
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
  document.getElementById('exercise-picker-search').addEventListener('input', renderExercisePickerNow);
  document.getElementById('exercise-picker-close').addEventListener('click', closeExercisePicker);
  document.querySelectorAll('.picker-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      exercisePickerFilter = btn.dataset.pickerFilter;
      document.querySelectorAll('.picker-filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
      renderExercisePickerNow();
    });
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
  const { warmup, cooldown } = buildWarmupAndCooldown(rawExercises);
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
  }
  recomputeMenuWarmupCooldown();
  renderMenuScreen();
}

function wireMenuScreen() {
  document.getElementById('menu-content').addEventListener('click', (e) => {
    const addBtn = e.target.closest('#menu-add-exercise-btn');
    if (addBtn) openExercisePicker('menu');
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

function handleGenerate() {
  const errorEl = document.getElementById('setup-error');
  const parts = getSelectedParts();
  const equipment = getSelectedEquipment();

  if (parts.length === 0) {
    errorEl.textContent = '「① 鍛えたい部位」を1つ以上選んでください（事前確認の欄とは別です）';
    return;
  }
  if (equipment.length === 0) {
    errorEl.textContent = '使える器具を1つ以上選んでください';
    return;
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
    return;
  }
  renderMenuScreen();
  showScreen('menu');
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
      valueEl.textContent = field === 'duration' ? `${target.value}分` : `${Number(target.value).toFixed(1)}km`;
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

  if (field === 'done' && target.checked) {
    startRestTimer(currentSession.exercises[exIndex].restSec);
  }
}

function handleFinishWorkout() {
  if (!currentSession) return;
  stopHoldTimer();
  endRestTimer();
  currentSession.durationSec = stopSessionTimer();
  finalizeSession(currentSession);
  currentSession = null;
  currentMenu = null;
  renderHistory();
  showScreen('history');
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
  restoreLastSettings();

  document.getElementById('mode-request-btn').addEventListener('click', () => showScreen('setup'));
  document.getElementById('mode-custom-btn').addEventListener('click', () => {
    customExercises = [];
    customRestSec = {};
    document.getElementById('custom-error').textContent = '';
    renderCustomScreen();
    showScreen('custom');
  });

  document.getElementById('generate-btn').addEventListener('click', handleGenerate);
  document.getElementById('regenerate-btn').addEventListener('click', () => showScreen('mode'));
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
  document.getElementById('reset-history-btn').addEventListener('click', () => {
    document.getElementById('reset-history-modal').classList.add('open');
  });
  document.getElementById('reset-history-modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-reset-history-close]')) {
      document.getElementById('reset-history-modal').classList.remove('open');
    }
  });
  document.getElementById('reset-history-confirm').addEventListener('click', () => {
    clearHistory();
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
    }
  });

  document.getElementById('rest-timer-plus10').addEventListener('click', () => addRestTimerSeconds(10));
  document.getElementById('rest-timer-end').addEventListener('click', endRestTimer);
  document.getElementById('hold-timer-cancel').addEventListener('click', stopHoldTimer);

  document.getElementById('progress-exercise-select').addEventListener('change', (e) => {
    renderExerciseProgressChart(e.target.value);
  });

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.nav;
      if (target === 'history') renderHistory();
      if (target === 'progress') renderProgressScreen();
      stopHoldTimer();
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
