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

// 「自分で作る」モードの状態
let customExercises = []; // EXERCISESの生データを追加順に並べたもの
let customRestSec = {}; // exerciseId -> 休憩秒数
let customWarmup = { general: '', dynamic: [] };
let customCooldown = { static: [], general: '' };

// 種目ピッカーが今どちらの画面から開かれているか('custom' | 'menu')
let exercisePickerTarget = null;

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

function getBodyWeightKg() {
  return Number(document.getElementById('bodyweight-slider').value);
}

function wireBodyWeightSlider() {
  const slider = document.getElementById('bodyweight-slider');
  const valueEl = document.getElementById('bodyweight-value');
  slider.addEventListener('input', () => {
    valueEl.textContent = `${slider.value} kg`;
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
}

function addCustomExercise(id) {
  if (customExercises.some((ex) => ex.id === id)) return;
  const ex = findExerciseById(id);
  if (!ex) return;
  customExercises.push(ex);
  if (customRestSec[id] == null) customRestSec[id] = 90;
  renderCustomScreen();
}

function removeCustomExercise(id) {
  customExercises = customExercises.filter((ex) => ex.id !== id);
  renderCustomScreen();
}

function moveCustomExercise(index, direction) {
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= customExercises.length) return;
  [customExercises[index], customExercises[target]] = [customExercises[target], customExercises[index]];
  renderCustomExerciseList(customExercises, customRestSec);
}

function wireCustomScreen() {
  document.getElementById('custom-add-exercise-btn').addEventListener('click', () => openExercisePicker('custom'));

  document.getElementById('custom-exercise-list').addEventListener('click', (e) => {
    const moveBtn = e.target.closest('[data-custom-move]');
    if (moveBtn) {
      moveCustomExercise(Number(moveBtn.dataset.customIndex), moveBtn.dataset.customMove);
      return;
    }
    const removeBtn = e.target.closest('[data-custom-remove-exercise]');
    if (removeBtn) removeCustomExercise(removeBtn.dataset.customRemoveExercise);
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

  document.getElementById('custom-generate-btn').addEventListener('click', () => {
    const errorEl = document.getElementById('custom-error');
    if (customExercises.length === 0) {
      errorEl.textContent = '種目を1つ以上追加してください';
      return;
    }
    errorEl.textContent = '';
    const main = customExercises.map((ex) => buildCustomSetPlan(ex, customRestSec[ex.id] != null ? customRestSec[ex.id] : 90));
    currentMenu = {
      warmup: customWarmup,
      cooldown: customCooldown,
      main,
      generatedAt: new Date().toISOString(),
      params: { custom: true },
    };
    renderMenu(currentMenu);
    showScreen('menu');
  });
}

// ===== 種目ピッカー（「自分で作る」画面／メニュー画面の両方から使う共通モーダル） =====

function isExercisePickerSelected(id) {
  if (exercisePickerTarget === 'custom') return customExercises.some((ex) => ex.id === id);
  if (exercisePickerTarget === 'menu') return currentMenu && currentMenu.main.some((item) => item.exerciseId === id);
  return false;
}

function openExercisePicker(target) {
  exercisePickerTarget = target;
  const searchInput = document.getElementById('exercise-picker-search');
  searchInput.value = '';
  renderExercisePicker('', isExercisePickerSelected);
  document.getElementById('exercise-picker-modal').hidden = false;
  searchInput.focus();
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
  renderExercisePicker(document.getElementById('exercise-picker-search').value, isExercisePickerSelected);
}

function wireExercisePicker() {
  document.getElementById('exercise-picker-search').addEventListener('input', (e) => {
    renderExercisePicker(e.target.value, isExercisePickerSelected);
  });
  document.getElementById('exercise-picker-close').addEventListener('click', closeExercisePicker);
  document.getElementById('exercise-picker-list').addEventListener('click', (e) => {
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

function toggleMenuExercise(id) {
  const existingIndex = currentMenu.main.findIndex((item) => item.exerciseId === id);
  if (existingIndex >= 0) {
    currentMenu.main.splice(existingIndex, 1);
  } else {
    const ex = findExerciseById(id);
    if (!ex) return;
    const plan = currentMenu.params.custom
      ? buildCustomSetPlan(ex, 90)
      : buildSetPlan(ex, currentMenu.params.level, currentMenu.params.goal);
    currentMenu.main.push(plan);
  }
  recomputeMenuWarmupCooldown();
  renderMenu(currentMenu);
}

function wireMenuScreen() {
  document.getElementById('menu-content').addEventListener('click', (e) => {
    const addBtn = e.target.closest('#menu-add-exercise-btn');
    if (addBtn) {
      openExercisePicker('menu');
      return;
    }
    const moveBtn = e.target.closest('[data-menu-move]');
    if (moveBtn) {
      const index = Number(moveBtn.dataset.menuIndex);
      const target = moveBtn.dataset.menuMove === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= currentMenu.main.length) return;
      [currentMenu.main[index], currentMenu.main[target]] = [currentMenu.main[target], currentMenu.main[index]];
      renderMenu(currentMenu);
      return;
    }
    const removeBtn = e.target.closest('[data-menu-remove]');
    if (removeBtn) {
      currentMenu.main.splice(Number(removeBtn.dataset.menuIndex), 1);
      recomputeMenuWarmupCooldown();
      renderMenu(currentMenu);
    }
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
  renderMenu(currentMenu);
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

function handleLogInput(e) {
  const target = e.target;
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

  if (field === 'reps' && !currentSession.exercises[exIndex].holdBased && Number(target.value) >= Number(target.max)) {
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
  document.querySelectorAll('#part-group input').forEach((el) => {
    el.checked = settings.parts.includes(el.dataset.part);
  });
  document.querySelectorAll('#equipment-group input').forEach((el) => {
    el.checked = settings.equipment.includes(el.value);
  });
  const painAreas = settings.painAreas || [];
  document.querySelectorAll('#pain-group input').forEach((el) => {
    el.checked = el.dataset.pain === 'none' ? painAreas.length === 0 : painAreas.includes(el.dataset.pain);
  });
  document.getElementById('minutes-select').value = settings.minutes;
  document.getElementById('level-select').value = settings.level;
  document.getElementById('goal-select').value = settings.goal;
  if (settings.bodyWeightKg) {
    const slider = document.getElementById('bodyweight-slider');
    slider.value = settings.bodyWeightKg;
    document.getElementById('bodyweight-value').textContent = `${slider.value} kg`;
  }
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
  });
  document.getElementById('demo-modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-demo-close]')) closeDemoModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDemoModal();
      closeExercisePicker();
    }
  });

  document.getElementById('rest-timer-plus10').addEventListener('click', () => addRestTimerSeconds(10));
  document.getElementById('rest-timer-end').addEventListener('click', endRestTimer);

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.nav;
      if (target === 'history') renderHistory();
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
