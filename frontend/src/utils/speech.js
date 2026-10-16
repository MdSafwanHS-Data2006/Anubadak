/**
 * Browser Web Speech API feature detection and strict language voice matching.
 * Never falls back to an English or Spanish voice when Bengali (bn) is requested.
 */

export const DEFAULT_SPEECH_RATE = 1.0;
export const MIN_SPEECH_RATE = 0.5;
export const MAX_SPEECH_RATE = 1.5;

const PREFERRED_LOCALE_ORDER = {
  bn: ['bn-bd', 'bn_bd', 'bn-in', 'bn_in', 'bn'],
  en: ['en-us', 'en_us', 'en-gb', 'en_gb', 'en'],
  es: ['es-es', 'es_es', 'es-mx', 'es_mx', 'es-419', 'es'],
};

/**
 * Clamp a requested speech rate to the supported [0.5, 1.5] range rounded to 1 decimal place.
 *
 * @param {number|string} rate
 * @returns {number}
 */
export function clampSpeechRate(rate) {
  const parsed = Number(rate);
  if (Number.isNaN(parsed)) {
    return DEFAULT_SPEECH_RATE;
  }
  const clamped = Math.min(MAX_SPEECH_RATE, Math.max(MIN_SPEECH_RATE, parsed));
  return Math.round(clamped * 10) / 10;
}

/**
 * Normalize a BCP-47 voice language tag for comparison.
 *
 * @param {string} langTag
 * @returns {string}
 */
export function normalizeVoiceLang(langTag) {
  if (!langTag || typeof langTag !== 'string') return '';
  return langTag.trim().toLowerCase().replace(/_/g, '-');
}

/**
 * Determine whether a single SpeechSynthesisVoice genuinely supports the target language code.
 * Never allows a non-Bengali voice to match 'bn'.
 *
 * @param {{ lang?: string, name?: string }} voice
 * @param {string} langCode - 'en' | 'bn' | 'es'
 * @returns {boolean}
 */
export function isVoiceMatchForLanguage(voice, langCode) {
  if (!voice || typeof voice !== 'object') return false;
  const target = normalizeVoiceLang(langCode);
  if (!target) return false;

  const voiceLang = normalizeVoiceLang(voice.lang || '');
  if (!voiceLang) return false;

  // Exact match (e.g. 'bn') or regional prefix match (e.g. 'bn-bd', 'bn-in')
  if (voiceLang === target || voiceLang.startsWith(`${target}-`)) {
    return true;
  }

  // Some speech synthesis engines and voice packages report ISO 639-2 'ben' for Bengali
  if (target === 'bn' && (voiceLang === 'ben' || voiceLang.startsWith('ben-'))) {
    return true;
  }

  return false;
}

/**
 * Select the best genuine SpeechSynthesisVoice for a language code (`en`, `bn`, `es`).
 * Returns null if no genuine voice for that language exists in `voices`.
 *
 * @param {Array<{ lang?: string, name?: string, default?: boolean, localService?: boolean }>} voices
 * @param {string} langCode
 * @returns {object | null}
 */
export function selectVoiceForLanguage(voices, langCode) {
  if (!Array.isArray(voices) || voices.length === 0) {
    return null;
  }

  const matching = voices.filter((v) => isVoiceMatchForLanguage(v, langCode));
  if (matching.length === 0) {
    return null;
  }

  const preferredOrder = PREFERRED_LOCALE_ORDER[langCode] || [langCode];
  matching.sort((a, b) => {
    const langA = normalizeVoiceLang(a.lang);
    const langB = normalizeVoiceLang(b.lang);
    const rankA = preferredOrder.findIndex((p) => langA === p.replace(/_/g, '-'));
    const rankB = preferredOrder.findIndex((p) => langB === p.replace(/_/g, '-'));
    const normRankA = rankA === -1 ? 999 : rankA;
    const normRankB = rankB === -1 ? 999 : rankB;
    if (normRankA !== normRankB) {
      return normRankA - normRankB;
    }
    return 0;
  });

  return matching[0];
}

/**
 * Check whether the current browser environment supports the Web Speech Synthesis API.
 *
 * @returns {boolean}
 */
export function isSpeechSynthesisSupported() {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined' &&
    typeof window.speechSynthesis.getVoices === 'function'
  );
}
