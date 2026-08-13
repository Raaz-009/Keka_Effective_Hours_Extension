(() => {
  const SUMMARY_PATH = '/k/attendance/api/mytime/attendance/summary';
  const EVENT_NAME = 'keka-effective-hours-summary-response';

  function isSummaryUrl(url) {
    try {
      return new URL(url, location.href).pathname.endsWith(SUMMARY_PATH);
    } catch (_) {
      return String(url || '').includes(SUMMARY_PATH);
    }
  }

  function publish(payload) {
    try {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: JSON.stringify(payload) }));
    } catch (_) {}
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function (...args) {
      const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      const promise = originalFetch.apply(this, args);
      if (isSummaryUrl(requestUrl)) {
        promise.then((response) => {
          response.clone().json().then((json) => publish(json)).catch(() => {});
        }).catch(() => {});
      }
      return promise;
    };
  }

  const OriginalXHR = window.XMLHttpRequest;
  if (OriginalXHR) {
    const open = OriginalXHR.prototype.open;
    const send = OriginalXHR.prototype.send;
    OriginalXHR.prototype.open = function (method, url, ...rest) {
      this.__kekaSummaryUrl = url;
      return open.call(this, method, url, ...rest);
    };
    OriginalXHR.prototype.send = function (...args) {
      if (isSummaryUrl(this.__kekaSummaryUrl)) {
        this.addEventListener('load', () => {
          try {
            if (this.status >= 200 && this.status < 300) publish(JSON.parse(this.responseText));
          } catch (_) {}
        });
      }
      return send.apply(this, args);
    };
  }
})();
