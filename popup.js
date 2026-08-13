const DEFAULT_HOURS = 7;
const DEFAULT_MINUTES = 5;
const hours = document.getElementById('hours');
const minutes = document.getElementById('minutes');
const status = document.getElementById('status');

chrome.storage.sync.get({ targetHours: DEFAULT_HOURS, targetMinutes: DEFAULT_MINUTES }, (settings) => {
  hours.value = settings.targetHours;
  minutes.value = settings.targetMinutes;
});

document.getElementById('show-details').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: 'keh-show-details' }, () => {
      void chrome.runtime.lastError;
    });
  });
});

document.getElementById('save').addEventListener('click', () => {
  const h = Number(hours.value);
  const m = Number(minutes.value);
  if (!Number.isInteger(h) || h < 0 || h > 24 || !Number.isInteger(m) || m < 0 || m > 59) {
    status.textContent = 'Enter valid hours and minutes.';
    status.style.color = '#b45309';
    return;
  }
  chrome.storage.sync.set({ targetHours: h, targetMinutes: m }, () => {
    status.textContent = `Saved: ${h}h ${String(m).padStart(2, '0')}m`;
    status.style.color = '#16803c';
  });
});
