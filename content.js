(() => {
  const DEFAULT_HOURS = 7;
  const DEFAULT_MINUTES = 5;
  const STYLE_ID = 'keka-effective-hours-style';
  const CARD_ID = 'keka-effective-hours-card';
  let targetHours = DEFAULT_HOURS;
  let targetMinutes = DEFAULT_MINUTES;
  let observerTimer;
  let refreshTimer;
  let dismissed = false;
  let minimized = false;
  let dragPosition = null;
  let summaryData = null;

  const clean = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
  const formatDuration = (seconds) => {
    const totalMinutes = Math.max(0, Math.ceil(seconds / 60));
    return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, '0')}m`;
  };
  const formatClock = (date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

  function parseTime(value) {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const second = Number(match[3] || 0);
    const meridiem = match[4]?.toUpperCase();
    if (minute > 59 || second > 59) return null;
    if (meridiem) {
      if (hour < 1 || hour > 12) return null;
      if (hour === 12) hour = 0;
      if (meridiem === 'PM') hour += 12;
    } else if (hour > 23) return null;
    return hour * 3600 + minute * 60 + second;
  }

  function todayRow() {
    const rows = [...document.querySelectorAll('.attendance-logs-row')];
    if (!rows.length) return null;
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = now.toLocaleDateString('en-US', { month: 'short' });
    const weekday = now.toLocaleDateString('en-US', { weekday: 'short' });
    return rows.find((row) => {
      const value = clean(row);
      return value.includes(`${weekday}, ${day} ${month}`) || value.includes(`${weekday}, ${now.getDate()} ${month}`);
    }) || rows.find((row) => row.classList.contains('open')) || null;
  }

    function readDomToday() {
    const row = todayRow();
    if (!row) return { found: false };

    // Keka can render multiple source sections (for example Mangalore-Falnir and
    // NoviFour). Collect events from every section first; never trust DOM order.
    const events = [];
    const entries = [...row.querySelectorAll('.d-flex.mt-10')];
    for (const entry of entries) {
      const groups = [...entry.children].filter((child) => child.matches('.d-flex'));
      if (groups.length < 2) continue;
      const inGroup = groups[0];
      const outGroup = groups[1];
      const inValue = clean(inGroup);
      const outValue = clean(outGroup);
      const inTime = parseTime(inValue.replace(/^[^\d]*/, ''));
      const outTime = parseTime(outValue.replace(/^[^\d]*/, ''));
      const hasIn = Boolean(inGroup.querySelector('.ki-green') || /ki-arrow-forward.*ki-green/.test(inGroup.innerHTML));
      const hasOut = Boolean(outGroup.querySelector('.ki-red') || /ki-arrow-forward.*ki-red/.test(outGroup.innerHTML));
      if (hasIn && inTime != null) events.push({ type: 'in', seconds: inTime });
      if (hasOut && outTime != null) events.push({ type: 'out', seconds: outTime });
      // MISSING is intentionally not added as an out event. The preceding in
      // remains open until a later real out event, or until the current time.
    }

    // The source-section order is not chronological. Sort all valid events by
    // time so the latest global event determines the true current state.
    events.sort((a, b) => a.seconds - b.seconds || (a.type === 'out' ? -1 : 1));

    let completedSeconds = 0;
    let openInSeconds = null;
    for (const event of events) {
      if (event.type === 'in') {
        // A new in replaces an unclosed in so the most recent real clock-in is
        // the one used for the live interval.
        openInSeconds = event.seconds;
      } else if (openInSeconds != null && event.seconds > openInSeconds) {
        completedSeconds += event.seconds - openInSeconds;
        openInSeconds = null;
      }
    }

    const lastClockEvent = events[events.length - 1] || null;
    const isClockedIn = lastClockEvent?.type === 'in';
    const currentSeconds = new Date().getHours() * 3600 + new Date().getMinutes() * 60 + new Date().getSeconds();
    const latestIn = isClockedIn ? lastClockEvent.seconds : null;
    if (isClockedIn && latestIn != null && currentSeconds >= latestIn) {
      completedSeconds += currentSeconds - latestIn;
    }

    const targetSeconds = (targetHours * 60 + targetMinutes) * 60;
    return {
      found: true,
      completedSeconds,
      targetSeconds,
      remainingSeconds: Math.max(0, targetSeconds - completedSeconds),
      isClockedIn,
      latestType: lastClockEvent?.type || null,
      latestTime: latestIn,
      rowText: clean(row)
    };
  }

  function apiToday() {
    if (!summaryData || !Array.isArray(summaryData.data)) return null;
    const todayKey = new Date().toISOString().slice(0, 10);
    const record = summaryData.data.find((item) => String(item.attendanceDate || '').slice(0, 10) === todayKey);
    if (!record) return null;

    const entries = (record.timeEntries || []).map((entry, index) => {
      const timestamp = entry.actualTimestamp || entry.timestamp;
      const time = Date.parse(timestamp);
      const status = Number(entry.punchStatus);
      if (!Number.isFinite(time) || (status !== 0 && status !== 1)) return null;
      return { time, type: status === 0 ? 'in' : 'out', index };
    }).filter(Boolean).sort((a, b) => a.time - b.time || a.index - b.index);

    const pairs = Array.isArray(record.validInOutPairs) ? record.validInOutPairs : [];
    let completedSeconds = pairs.reduce((sum, pair) => {
      const start = Date.parse(pair.inTime);
      const end = Date.parse(pair.outTime);
      return Number.isFinite(start) && Number.isFinite(end) && end > start ? sum + (end - start) / 1000 : sum;
    }, 0);
    if (!completedSeconds && Number.isFinite(Number(record.totalEffectiveHours))) {
      completedSeconds = Number(record.totalEffectiveHours) * 3600;
    }

    const latest = entries[entries.length - 1] || null;
    const isClockedIn = latest?.type === 'in';
    if (isClockedIn) completedSeconds += Math.max(0, (Date.now() - latest.time) / 1000);
    const targetSeconds = (targetHours * 60 + targetMinutes) * 60;
    return {
      found: true,
      source: 'summary',
      completedSeconds,
      targetSeconds,
      remainingSeconds: Math.max(0, targetSeconds - completedSeconds),
      isClockedIn,
      latestType: latest?.type || null,
      latestTime: isClockedIn ? new Date(latest.time).getHours() * 3600 + new Date(latest.time).getMinutes() * 60 + new Date(latest.time).getSeconds() : null,
      rowText: record.effectiveHoursInHHMM || ''
    };
  }

  function readToday() {
    return apiToday() || readDomToday();
  }

  function css() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    const fontUrl = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap';
    if (!document.getElementById('keh-font')) {
      const link = document.createElement('link');
      link.id = 'keh-font'; link.rel = 'stylesheet'; link.href = fontUrl;
      document.head.appendChild(link);
    }
    style.textContent = `
      #${CARD_ID}{position:fixed;right:20px;bottom:20px;z-index:2147483647;width:336px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 12px 32px rgba(15,24,36,.22);font:14px/1.45 'Poppins',Arial,sans-serif;color:#0f1824;overflow:hidden;user-select:none}
      #${CARD_ID} .keh-head{padding:14px 16px;background:linear-gradient(135deg,#0f1824,#1e293b);color:#fff;font-weight:600;font-size:14px;letter-spacing:.3px;display:flex;justify-content:space-between;align-items:center;cursor:grab;touch-action:none}.keh-head:active{cursor:grabbing}
      #${CARD_ID} .keh-actions{display:flex;align-items:center;gap:6px;position:relative;z-index:3}.keh-action{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;min-width:32px;min-height:32px;margin:0;padding:0;border:0;border-radius:7px;background:rgba(255,255,255,.08);color:#fff;cursor:pointer;pointer-events:auto;touch-action:manipulation;font:700 20px/1 Arial,sans-serif;opacity:.95}.keh-action:hover,.keh-action:focus-visible{background:rgba(255,255,255,.2);opacity:1;outline:none}.keh-action:focus-visible{box-shadow:0 0 0 2px rgba(255,255,255,.75)}.keh-body{padding:16px}.keh-row{display:flex;justify-content:space-between;gap:15px;margin:9px 0}.keh-label{color:#64748b;font-size:13px}.keh-value{font-weight:600;font-size:13px;text-align:right}.keh-good{color:#16803c}.keh-warn{color:#b45309}.keh-info{color:#2563eb}.keh-note{color:#64748b;font-size:12px;margin-top:12px}.keh-error{color:#b91c1c}.keh-credit{margin-top:16px;text-align:center;font:500 11px 'Poppins',Arial,sans-serif;color:#94a3b8;letter-spacing:.6px}
    `;
    document.head.appendChild(style);
  }

  function render() {
    if (dismissed) return;
    css();
    let card = document.getElementById(CARD_ID);
    if (!card) { card = document.createElement('section'); card.id = CARD_ID; document.body.appendChild(card); }
    const data = readToday();
    const header = `<div class="keh-head"><span>Today\'s effective hours</span><span class="keh-actions"><button class="keh-action keh-minimize" title="Minimize">−</button><button class="keh-action keh-close" title="Close">×</button></span></div>`;
    if (!data.found) {
      card.innerHTML = `${header}<div class="keh-body keh-error">Today\'s summary data is not available yet. Refresh the Keka page and wait for attendance data to load.</div>`;
      wireCardActions(card);
      return;
    }
    const targetText = `${targetHours}h ${String(targetMinutes).padStart(2, '0')}m`;
    const completeText = formatDuration(data.completedSeconds);
    const remainingText = formatDuration(data.remainingSeconds);
    let statusText = 'No clock-in/out event detected';
    let statusClass = 'keh-warn';
    let nextText = '';
    let leaveText = 'Available after clocking in';
    if (data.remainingSeconds === 0) {
      statusText = 'Target reached'; statusClass = 'keh-good'; nextText = 'You have completed the required effective hours for today.'; leaveText = 'You can leave now';
    } else if (data.isClockedIn) {
      statusText = 'Currently clocked in'; statusClass = 'keh-info';
      const leaveAt = new Date(Date.now() + data.remainingSeconds * 1000);
      leaveText = `Approximately ${formatClock(leaveAt)}`;
      nextText = `Stay clocked in for ${remainingText} more.`;
    } else if (data.latestType === 'out') {
      statusText = 'Currently clocked out'; statusClass = 'keh-warn'; nextText = `Additional work required: ${remainingText}. Clock in again to continue.`;
    }
    card.innerHTML = minimized ? header : `${header}<div class="keh-body"><div class="keh-row"><span class="keh-label">Completed today</span><span class="keh-value">${completeText}</span></div><div class="keh-row"><span class="keh-label">Required target</span><span class="keh-value">${targetText}</span></div><div class="keh-row ${statusClass}"><span class="keh-label">Latest status</span><span class="keh-value">${statusText}</span></div><div class="keh-row ${statusClass}"><span class="keh-label">${data.remainingSeconds ? 'Time remaining' : 'Result'}</span><span class="keh-value">${data.remainingSeconds ? remainingText : 'Complete'}</span></div><div class="keh-row ${statusClass}"><span class="keh-label">Estimated leave time</span><span class="keh-value">${leaveText}</span></div><div class="keh-note">${nextText}</div><div class="keh-note">The target is saved in this browser. Keka data is not changed.</div><div class="keh-credit">Built by <span style="color:#475569;font-weight:600">Raaz</span></div></div>`;
    wireCardActions(card);

  }

  function applyDragPosition(card) {
    if (!dragPosition) return;
    card.style.left = `${dragPosition.left}px`;
    card.style.top = `${dragPosition.top}px`;
    card.style.right = 'auto';
    card.style.bottom = 'auto';
  }

  function wireCardActions(card) {
    applyDragPosition(card);
    const close = card.querySelector('.keh-close');
    const minimize = card.querySelector('.keh-minimize');
    const header = card.querySelector('.keh-head');
    if (close) close.addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); });
    if (minimize) minimize.addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); });
    if (close) close.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      dismissed = true;
      card.remove();
    });
    if (minimize) {
      minimize.textContent = minimized ? '+' : '−';
      minimize.title = minimized ? 'Show details' : 'Minimize';
      minimize.setAttribute('aria-label', minimize.title);
      minimize.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        minimized = !minimized;
        render();
      });
    }
    if (header) {
      header.addEventListener('pointerdown', (event) => {
        if (event.target.closest('button') || event.target.closest('.keh-actions')) return;
        event.preventDefault();
        const rect = card.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;
        const move = (moveEvent) => {
          const maxLeft = Math.max(0, window.innerWidth - rect.width);
          const maxTop = Math.max(0, window.innerHeight - rect.height);
          dragPosition = {
            left: Math.min(maxLeft, Math.max(0, moveEvent.clientX - offsetX)),
            top: Math.min(maxTop, Math.max(0, moveEvent.clientY - offsetY))
          };
          applyDragPosition(card);
        };
        const stop = () => {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', stop);
          document.removeEventListener('pointercancel', stop);
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', stop, { once: true });
        document.addEventListener('pointercancel', stop, { once: true });
      });
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'keh-show-details') return;
    dismissed = false;
    minimized = false;
    render();
  });

  window.addEventListener('keka-effective-hours-summary-response', (event) => {
    try {
      const payload = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
      if (payload && Array.isArray(payload.data)) {
        summaryData = payload;
        render();
      }
    } catch (_) {}
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;
    if (changes.targetHours) targetHours = Number.isFinite(Number(changes.targetHours.newValue)) ? Number(changes.targetHours.newValue) : DEFAULT_HOURS;
    if (changes.targetMinutes) targetMinutes = Number.isFinite(Number(changes.targetMinutes.newValue)) ? Number(changes.targetMinutes.newValue) : DEFAULT_MINUTES;
    dismissed = false;
    render();
  });

  chrome.storage.sync.get({ targetHours: DEFAULT_HOURS, targetMinutes: DEFAULT_MINUTES }, (settings) => {
    targetHours = Number(settings.targetHours);
    targetMinutes = Number(settings.targetMinutes);
    if (!Number.isFinite(targetHours)) targetHours = DEFAULT_HOURS;
    if (!Number.isFinite(targetMinutes)) targetMinutes = DEFAULT_MINUTES;
    render();
    refreshTimer = setInterval(render, 30000);
    new MutationObserver(() => { clearTimeout(observerTimer); observerTimer = setTimeout(render, 250); }).observe(document.body, { childList: true, subtree: true });
  });
})();
