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

  saveSettings({ parts, equipment, minutes, level, goal, painAreas });

  currentMenu = generateMenu({ parts: muscleGroups, equipment, minutes, level, goal, painAreas });
  if (currentMenu.main.length === 0) {
    errorEl.textContent = '選んだ条件に合う種目が見つかりませんでした。器具や部位を見直してください。';
    return;
  }
  renderMenu(currentMenu);
  showScreen('menu');
}

function handleStartWorkout() {
  currentSession = createSessionFromMenu(currentMenu);
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

  if (field === 'done' && target.checked) {
    const restSec = currentSession.exercises[exIndex].restSec;
    startRestTimer(restSec);
  }
}

function handleFinishWorkout() {
  if (!currentSession) return;
  currentSession.durationSec = stopSessionTimer();
  finalizeSession(currentSession);
  currentSession = null;
  currentMenu = null;
  hideRestTimer();
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
}

function init() {
  wirePartExclusivity();
  wirePainExclusivity();
  restoreLastSettings();

  document.getElementById('generate-btn').addEventListener('click', handleGenerate);
  document.getElementById('regenerate-btn').addEventListener('click', () => showScreen('setup'));
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
    if (infoTrigger) toggleInfoPanel(infoTrigger);
  });
  document.getElementById('demo-modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-demo-close]')) closeDemoModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDemoModal();
  });

  document.getElementById('rest-timer-skip').addEventListener('click', hideRestTimer);
  document.getElementById('rest-timer-plus').addEventListener('click', () => adjustRestTimer(15));
  document.getElementById('rest-timer-minus').addEventListener('click', () => adjustRestTimer(-15));

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.nav;
      if (target === 'history') renderHistory();
      hideRestTimer();
      stopSessionTimer();
      showScreen(target);
    });
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
