/**
 * UTF-8 byte counting, Unicode code-point counting, and client-side input validation.
 */

export const MAX_UTF8_BYTES = 500;
export const SUPPORTED_LANGUAGES = ['en', 'bn', 'es'];

/**
 * Compute exact UTF-8 byte length of a string.
 * Uses standard TextEncoder when available, with a pure UTF-8 byte calculator fallback.
 *
 * @param {string} text
 * @returns {number}
 */
export function getUtf8ByteLength(text) {
  if (!text) return 0;
  const str = String(text);
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).length;
  }
  let bytes = 0;
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // Surrogate pair (4 UTF-8 bytes)
      bytes += 4;
      i += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/**
 * Count Unicode code points in a string so astral symbols are counted accurately.
 *
 * @param {string} text
 * @returns {number}
 */
export function getCharacterCount(text) {
  if (!text) return 0;
  return Array.from(String(text)).length;
}

/**
 * Validate input text and language pair before dispatching a translation request.
 *
 * @param {string} text
 * @param {string} sourceLang
 * @param {string} targetLang
 * @returns {{ valid: boolean, errorCode: string | null, byteLength: number }}
 */
export function validateTranslationRequest(text, sourceLang, targetLang) {
  const raw = typeof text === 'string' ? text : '';
  const byteLength = getUtf8ByteLength(raw);
  const trimmed = raw.trim();

  if (!trimmed) {
    return { valid: false, errorCode: 'EMPTY_TEXT', byteLength };
  }

  const trimmedBytes = getUtf8ByteLength(trimmed);
  if (byteLength > MAX_UTF8_BYTES || trimmedBytes > MAX_UTF8_BYTES) {
    return { valid: false, errorCode: 'TEXT_TOO_LONG', byteLength: Math.max(byteLength, trimmedBytes) };
  }

  if (!SUPPORTED_LANGUAGES.includes(sourceLang)) {
    return { valid: false, errorCode: 'UNSUPPORTED_SOURCE_LANG', byteLength };
  }

  if (!SUPPORTED_LANGUAGES.includes(targetLang)) {
    return { valid: false, errorCode: 'UNSUPPORTED_TARGET_LANG', byteLength };
  }

  if (sourceLang === targetLang) {
    return { valid: false, errorCode: 'IDENTICAL_LANGUAGES', byteLength };
  }

  return { valid: true, errorCode: null, byteLength };
}

/**
 * Resolve the next target language when the user changes source language,
 * ensuring source and target languages never become identical.
 *
 * @param {string} newSourceLang
 * @param {string} currentSourceLang
 * @param {string} currentTargetLang
 * @returns {{ sourceLang: string, targetLang: string, swapped: boolean }}
 */
export function resolveSourceLanguageChange(newSourceLang, currentSourceLang, currentTargetLang) {
  if (newSourceLang === currentTargetLang) {
    return {
      sourceLang: newSourceLang,
      targetLang: currentSourceLang,
      swapped: true,
    };
  }
  return {
    sourceLang: newSourceLang,
    targetLang: currentTargetLang,
    swapped: false,
  };
}

/**
 * Resolve the next source language when the user changes target language,
 * ensuring source and target languages never become identical.
 *
 * @param {string} newTargetLang
 * @param {string} currentSourceLang
 * @param {string} currentTargetLang
 * @returns {{ sourceLang: string, targetLang: string, swapped: boolean }}
 */
export function resolveTargetLanguageChange(newTargetLang, currentSourceLang, currentTargetLang) {
  if (newTargetLang === currentSourceLang) {
    return {
      sourceLang: currentTargetLang,
      targetLang: newTargetLang,
      swapped: true,
    };
  }
  return {
    sourceLang: currentSourceLang,
    targetLang: newTargetLang,
    swapped: false,
  };
}
