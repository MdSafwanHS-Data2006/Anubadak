/**
 * Translation API client communicating exclusively with the Anubadak FastAPI backend.
 * Never embeds provider API credentials in frontend code.
 */

const DEFAULT_API_BASE_URL = 'http://localhost:8000';
const DEFAULT_TIMEOUT_MS = 12000;

/**
 * Resolve the configured backend API base URL without trailing slash.
 *
 * @returns {string}
 */
export function getApiBaseUrl() {
  let raw = '';
  try {
    if (typeof window !== 'undefined' && window.__ANUBADAK_API_BASE_URL__) {
      raw = window.__ANUBADAK_API_BASE_URL__;
    } else if (
      typeof import.meta !== 'undefined' &&
      import.meta.env &&
      import.meta.env.VITE_API_BASE_URL
    ) {
      raw = import.meta.env.VITE_API_BASE_URL;
    } else if (
      typeof window !== 'undefined' &&
      window.location &&
      window.location.hostname &&
      (window.location.protocol === 'http:' || window.location.protocol === 'https:')
    ) {
      raw = `${window.location.protocol}//${window.location.hostname}:8000`;
    }
  } catch (_err) {
    raw = DEFAULT_API_BASE_URL;
  }
  return String(raw || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

export class ApiTranslationError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} [status=0]
   */
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'ApiTranslationError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Request a translation from the backend `POST /translate` endpoint.
 *
 * @param {{
 *   text: string,
 *   sourceLang: string,
 *   targetLang: string,
 *   signal?: AbortSignal,
 *   timeoutMs?: number,
 *   fetchImpl?: typeof fetch
 * }} options
 * @returns {Promise<{ translatedText: string, sourceLang: string, targetLang: string, provider: string }>}
 */
export async function requestTranslation({
  text,
  sourceLang,
  targetLang,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl,
}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiTranslationError(
      'OFFLINE_ERROR',
      'Browser reports offline network status.',
      0
    );
  }

  const activeFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!activeFetch) {
    throw new ApiTranslationError('NETWORK_ERROR', 'Fetch API is not available.', 0);
  }

  const timeoutController =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timedOut = false;

  const timerId = setTimeout(() => {
    timedOut = true;
    if (timeoutController) {
      try {
        timeoutController.abort();
      } catch (_err) {
        // Ignore abort errors
      }
    }
  }, timeoutMs);

  const onCallerAbort = () => {
    if (timeoutController) {
      try {
        timeoutController.abort();
      } catch (_err) {
        // Ignore abort errors
      }
    }
  };

  if (signal && typeof signal.addEventListener === 'function') {
    if (signal.aborted) {
      clearTimeout(timerId);
      const abortErr = new Error('Request aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    signal.addEventListener('abort', onCallerAbort, { once: true });
  }

  try {
    const response = await activeFetch(`${getApiBaseUrl()}/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        text,
        source_lang: sourceLang,
        target_lang: targetLang,
      }),
      signal: timeoutController ? timeoutController.signal : signal,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (_jsonErr) {
      payload = null;
    }

    if (!response.ok) {
      const errorCode =
        (payload && payload.error && payload.error.code) ||
        (response.status === 429
          ? 'QUOTA_EXHAUSTED'
          : response.status === 504
          ? 'TRANSLATION_TIMEOUT'
          : response.status >= 500
          ? 'PROVIDER_UNAVAILABLE'
          : 'INVALID_PROVIDER_RESPONSE');

      const errorMessage =
        (payload && payload.error && payload.error.message) ||
        (payload && payload.detail) ||
        `Translation failed with HTTP ${response.status}.`;

      throw new ApiTranslationError(errorCode, errorMessage, response.status);
    }

    if (
      !payload ||
      typeof payload.translated_text !== 'string' ||
      !payload.translated_text.trim()
    ) {
      throw new ApiTranslationError(
        'INVALID_PROVIDER_RESPONSE',
        'Backend returned an empty or malformed translation response.',
        502
      );
    }

    return {
      translatedText: payload.translated_text,
      sourceLang: payload.source_lang || sourceLang,
      targetLang: payload.target_lang || targetLang,
      provider: payload.provider || 'mymemory',
    };
  } catch (err) {
    if (err instanceof ApiTranslationError) {
      throw err;
    }
    if (timedOut) {
      throw new ApiTranslationError(
        'TRANSLATION_TIMEOUT',
        'The translation request timed out.',
        504
      );
    }
    if (
      (signal && signal.aborted) ||
      (err && (err.name === 'AbortError' || err.code === 'ABORT_ERR'))
    ) {
      const abortErr = new Error('Request aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    throw new ApiTranslationError(
      'NETWORK_ERROR',
      'Unable to connect to the translation backend.',
      0
    );
  } finally {
    clearTimeout(timerId);
    if (signal && typeof signal.removeEventListener === 'function') {
      signal.removeEventListener('abort', onCallerAbort);
    }
  }
}
