const ALARM_NAME = 'keka-timesheet-reminder';
const LAST_REMINDER_KEY = 'lastTimesheetReminderDate';
const REMINDER_HOUR = 16;
const REMINDER_MINUTE = 0;

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function nextFourPm(from = new Date()) {
  const next = new Date(from);
  next.setHours(REMINDER_HOUR, REMINDER_MINUTE, 0, 0);
  if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

function scheduleNextReminder() {
  chrome.alarms.create(ALARM_NAME, { when: nextFourPm().getTime() });
}

function sendReminderOnceToday() {
  const today = localDateKey();
  chrome.storage.local.get({ [LAST_REMINDER_KEY]: '' }, (stored) => {
    if (stored[LAST_REMINDER_KEY] === today) return;
    chrome.notifications.create('keka-timesheet-' + today, {
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Timesheet reminder',
      message: 'Fill the timesheet',
      priority: 2,
      requireInteraction: true
    }, () => {
      if (chrome.runtime.lastError) {
        chrome.notifications.create('keka-timesheet-fallback-' + today, {
          type: 'basic',
          title: 'Timesheet reminder',
          message: 'Fill the timesheet',
          priority: 2
        });
      }
      chrome.storage.local.set({ [LAST_REMINDER_KEY]: today });
    });
  });
}

function checkReminderWindow() {
  const now = new Date();
  if (now.getHours() >= REMINDER_HOUR) sendReminderOnceToday();
  scheduleNextReminder();
}

chrome.runtime.onInstalled.addListener(checkReminderWindow);
chrome.runtime.onStartup.addListener(checkReminderWindow);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  sendReminderOnceToday();
  scheduleNextReminder();
});
