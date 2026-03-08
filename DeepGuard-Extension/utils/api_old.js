// DeepGuard API helper for talking to the Django backend.
// Exposed as a global `DeepGuardAPI` object and as CommonJS exports (for tests/tooling).

(function (global) {
  const DEFAULT_BACKEND = 'http://127.0.0.1:8000';

  function normalizeBaseUrl(url) {
    if (!url) return DEFAULT_BACKEND;
    return String(url).replace(/\/+$/, '');
  }

  async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function retryFetch(url, options, attempts) {
    let lastError = null;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(url, options);
        if (!res.ok) {
          lastError = new Error('HTTP ' + res.status + ' ' + res.statusText);
        } else {
          return res;
        }
      } catch (err) {
        lastError = err;
      }
      const backoffMs = 300 * Math.pow(2, i);
      await sleep(backoffMs);
    }
    throw lastError || new Error('Request failed');
  }

  function buildHeaders(extra) {
    const headers = Object.assign(
      {
        'X-Requested-With': 'DeepGuard-Extension'
      },
      extra || {}
    );
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        headers['X-Extension-Id'] = chrome.runtime.id;
      }
    } catch (e) {
      // ignore
    }
    return headers;
  }

  async function checkStatus(backendUrl) {
    const base = normalizeBaseUrl(backendUrl);
    const url = base + '/api/status/';
    try {
      const res = await retryFetch(
        url,
        {
          method: 'GET',
          headers: buildHeaders()
        },
        3
      );
      const data = await res.json();
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  }

  async function analyzeVideo(backendUrl, file, seqLen) {
    const base = normalizeBaseUrl(backendUrl);
    const url = base + '/api/analyze-video/';
    const form = new FormData();
    form.append('video', file);
    if (seqLen) {
      form.append('sequence_length', String(seqLen));
    }

    try {
      const res = await retryFetch(
        url,
        {
          method: 'POST',
          body: form,
          headers: buildHeaders()
        },
        3
      );
      const data = await res.json();
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  }

  async function analyzeScreen(backendUrl, blob, seqLen) {
    const base = normalizeBaseUrl(backendUrl);
    const url = base + '/api/analyze-screen/';
    const form = new FormData();
    form.append('screen_video', blob, 'screen-capture.webm');
    if (seqLen) {
      form.append('sequence_length', String(seqLen));
    }

    try {
      const res = await retryFetch(
        url,
        {
          method: 'POST',
          body: form,
          headers: buildHeaders()
        },
        3
      );
      const data = await res.json();
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  }

  async function analyzeFrame(backendUrl, base64Image) {
    const base = normalizeBaseUrl(backendUrl);
    const url = base + '/api/analyze-frame/';

    try {
      const res = await retryFetch(
        url,
        {
          method: 'POST',
          headers: Object.assign(
            buildHeaders({
              'Content-Type': 'application/json'
            })
          ),
          body: JSON.stringify({ image: base64Image })
        },
        3
      );
      const data = await res.json();
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  }

  const DeepGuardAPI = {
    DEFAULT_BACKEND,
    checkStatus,
    analyzeVideo,
    analyzeScreen,
    analyzeFrame
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeepGuardAPI;
  }
  global.DeepGuardAPI = DeepGuardAPI;
})(typeof self !== 'undefined' ? self : this);

