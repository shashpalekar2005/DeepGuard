// DeepGuard API helper for talking to the Django backend.
// Exposed as a global `DeepGuardAPI` object and as CommonJS exports (for tests/tooling).

(function (global) {
  const DEFAULT_BACKEND = 'http://127.0.0.1:8000';
  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 30000;

  function normalizeBaseUrl(url) {
    if (!url) return DEFAULT_BACKEND;
    return String(url).replace(/\/+$/, '');
  }

  async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function retryFetch(url, options, attempts = MAX_RETRIES) {
    let lastError = null;
    
    for (let i = 0; i < attempts; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        
        const fetchOptions = {
          ...options,
          signal: controller.signal
        };

        const res = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);
        
        if (!res.ok) {
          lastError = new Error(`HTTP ${res.status} ${res.statusText}`);
          lastError.status = res.status;
          lastError.response = res;
        } else {
          return res;
        }
      } catch (err) {
        lastError = err;
        if (err.name === 'AbortError') {
          lastError = new Error('Request timeout');
        }
      }
      
      if (i < attempts - 1) {
        const backoffMs = Math.min(1000 * Math.pow(2, i), 5000);
        await sleep(backoffMs);
      }
    }
    
    throw lastError || new Error('Request failed');
  }

  function buildHeaders(extra = {}) {
    const headers = {
      'X-Requested-With': 'DeepGuard-Extension',
      'Content-Type': 'application/json',
      ...extra
    };

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        headers['X-Extension-Id'] = chrome.runtime.id;
      }
    } catch (e) {
      // Ignore chrome API errors
    }

    return headers;
  }

  async function handleResponse(response) {
    try {
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error);
        }
        
        return data;
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Invalid JSON response');
      }
      throw error;
    }
  }

  // API Methods
  const DeepGuardAPI = {
    DEFAULT_BACKEND,

    async checkStatus(baseUrl) {
      const url = `${normalizeBaseUrl(baseUrl)}/api/status/`;
      
      try {
        const response = await retryFetch(url, {
          method: 'GET',
          headers: buildHeaders()
        });

        return await handleResponse(response);
      } catch (error) {
        console.error('Status check failed:', error);
        throw new Error(`Backend unavailable: ${error.message}`);
      }
    },

    async analyzeVideo(baseUrl, file, sequenceLength = 20) {
      const url = `${normalizeBaseUrl(baseUrl)}/api/analyze-video/`;
      
      if (!file) {
        throw new Error('No file provided');
      }

      if (!file.type.startsWith('video/')) {
        throw new Error('Invalid file type. Please select a video file.');
      }

      const formData = new FormData();
      formData.append('video', file);
      formData.append('sequence_length', sequenceLength.toString());

      try {
        const response = await retryFetch(url, {
          method: 'POST',
          headers: buildHeaders({}), // Let browser set Content-Type for FormData
          body: formData
        });

        return await handleResponse(response);
      } catch (error) {
        console.error('Video analysis failed:', error);
        throw new Error(`Video analysis failed: ${error.message}`);
      }
    },

    async analyzeScreen(baseUrl, blob) {
      const url = `${normalizeBaseUrl(baseUrl)}/api/analyze-screen/`;
      
      if (!blob) {
        throw new Error('No screen recording provided');
      }

      const formData = new FormData();
      formData.append('screen_video', blob, 'screen-recording.webm');
      formData.append('sequence_length', '10'); // Use 10 frames for screen analysis

      try {
        const response = await retryFetch(url, {
          method: 'POST',
          headers: buildHeaders({}), // Let browser set Content-Type for FormData
          body: formData
        });

        return await handleResponse(response);
      } catch (error) {
        console.error('Screen analysis failed:', error);
        throw new Error(`Screen analysis failed: ${error.message}`);
      }
    },

    async analyzeFrame(baseUrl, base64Data) {
      const url = `${normalizeBaseUrl(baseUrl)}/api/analyze-frame/`;
      
      if (!base64Data) {
        throw new Error('No frame data provided');
      }

      try {
        const response = await retryFetch(url, {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify({
            image: base64Data
          })
        });

        return await handleResponse(response);
      } catch (error) {
        console.error('Frame analysis failed:', error);
        throw new Error(`Frame analysis failed: ${error.message}`);
      }
    },

    // Utility method to test connectivity
    async testConnection(baseUrl) {
      try {
        const status = await this.checkStatus(baseUrl);
        return {
          success: true,
          message: 'Connection successful',
          details: status
        };
      } catch (error) {
        return {
          success: false,
          message: error.message,
          details: null
        };
      }
    },

    // Batch analysis for multiple videos
    async analyzeBatch(baseUrl, files, sequenceLength = 20) {
      const results = [];
      
      for (let i = 0; i < files.length; i++) {
        try {
          const result = await this.analyzeVideo(baseUrl, files[i], sequenceLength);
          results.push({
            file: files[i].name,
            success: true,
            result
          });
        } catch (error) {
          results.push({
            file: files[i].name,
            success: false,
            error: error.message
          });
        }
      }

      return results;
    }
  };

  // Error types for better error handling
  DeepGuardAPI.errors = {
    NetworkError: class NetworkError extends Error {
      constructor(message) {
        super(message);
        this.name = 'NetworkError';
      }
    },
    
    ValidationError: class ValidationError extends Error {
      constructor(message) {
        super(message);
        this.name = 'ValidationError';
      }
    },
    
    TimeoutError: class TimeoutError extends Error {
      constructor(message) {
        super(message);
        this.name = 'TimeoutError';
      }
    }
  };

  // Export for different environments
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeepGuardAPI;
  } else if (typeof exports !== 'undefined') {
    exports.DeepGuardAPI = DeepGuardAPI;
  } else {
    global.DeepGuardAPI = DeepGuardAPI;
  }

})(typeof window !== 'undefined' ? window : this);
