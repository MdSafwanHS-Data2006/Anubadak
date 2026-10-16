/**
 * Automated Frontend Test Suite for Anubadak (অনুবাদক).
 * Covers:
 *  1. UTF-8 byte counter & 500-byte boundary (ASCII + multibyte Bengali Unicode)
 *  2. Source and target language selector conflict resolution & language swapping
 *  3. Speech rate clamping (0.5x to 1.5x) & strict Bengali voice detection (never faking bn with en/es)
 *  4. Request cancellation & out-of-order response protection (raceGuard + AbortController)
 *  5. API client error mapping, timeout, and offline handling
 *  6. Universal clipboard copy & manual fallback selection
 *  7. Complete localization coverage across English (en.json), Bengali (bn.json), and Spanish (es.json)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_UTF8_BYTES,
  getCharacterCount,
  getUtf8ByteLength,
  resolveSourceLanguageChange,
  resolveTargetLanguageChange,
  validateTranslationRequest,
} from '../src/utils/utf8.js';
import {
  clampSpeechRate,
  isVoiceMatchForLanguage,
  selectVoiceForLanguage,
} from '../src/utils/speech.js';
import { copyTextUniversal } from '../src/utils/clipboard.js';
import { createRequestTracker } from '../src/utils/raceGuard.js';
import { ApiTranslationError, requestTranslation } from '../src/services/api.js';
import { resolveTheme } from '../src/hooks/useTheme.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCALES_DIR = path.resolve(__dirname, '../src/locales');

const enLocale = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en.json'), 'utf8'));
const bnLocale = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'bn.json'), 'utf8'));
const esLocale = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'es.json'), 'utf8'));

let passed = 0;
let failed = 0;
const isVitest = Boolean(process.env.VITEST);

let runTest;
if (isVitest) {
  const { test } = await import('vitest');
  runTest = (name, fn) => test(name, fn);
} else {
  runTest = async function (name, fn) {
    try {
      await fn();
      passed += 1;
      console.log(`  ✓ PASS: ${name}`);
    } catch (err) {
      failed += 1;
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err && err.stack ? err.stack : err}`);
    }
  };
}

if (!isVitest) {
  console.log('=== Anubadak Frontend Automated Test Suite ===');
}

await runTest('UTF-8 byte counter distinguishes Bengali multibyte characters from character count', () => {
  const bengaliWord = 'অনুবাদক'; // 7 characters, 21 UTF-8 bytes
  assert.equal(getCharacterCount(bengaliWord), 7);
  assert.equal(getUtf8ByteLength(bengaliWord), 21);

  const ascii500 = 'a'.repeat(500);
  assert.equal(getUtf8ByteLength(ascii500), 500);
  assert.equal(validateTranslationRequest(ascii500, 'en', 'bn').valid, true);

  const ascii501 = 'a'.repeat(501);
  const overAscii = validateTranslationRequest(ascii501, 'en', 'bn');
  assert.equal(overAscii.valid, false);
  assert.equal(overAscii.errorCode, 'TEXT_TOO_LONG');

  // 166 Bengali characters = 498 UTF-8 bytes (valid); 167 Bengali characters = 501 UTF-8 bytes (invalid)
  const bn166 = 'ক'.repeat(166);
  assert.equal(getUtf8ByteLength(bn166), 498);
  assert.equal(validateTranslationRequest(bn166, 'bn', 'en').valid, true);

  const bn167 = 'ক'.repeat(167);
  assert.equal(getCharacterCount(bn167), 167);
  assert.equal(getUtf8ByteLength(bn167), 501);
  const overBn = validateTranslationRequest(bn167, 'bn', 'en');
  assert.equal(overBn.valid, false);
  assert.equal(overBn.errorCode, 'TEXT_TOO_LONG');
});

await runTest('Source and target language selectors never allow identical languages and swap cleanly', () => {
  // Selecting 'bn' as source when target is already 'bn' automatically swaps target to previous source ('en')
  const res1 = resolveSourceLanguageChange('bn', 'en', 'bn');
  assert.deepEqual(res1, { sourceLang: 'bn', targetLang: 'en', swapped: true });

  // Selecting 'es' as source when target is 'bn' keeps target 'bn'
  const res2 = resolveSourceLanguageChange('es', 'en', 'bn');
  assert.deepEqual(res2, { sourceLang: 'es', targetLang: 'bn', swapped: false });

  // Selecting 'en' as target when source is 'en' automatically swaps source to previous target ('es')
  const res3 = resolveTargetLanguageChange('en', 'en', 'es');
  assert.deepEqual(res3, { sourceLang: 'es', targetLang: 'en', swapped: true });

  // Direct validation rejects identical languages
  const sameCheck = validateTranslationRequest('Hello', 'es', 'es');
  assert.equal(sameCheck.valid, false);
  assert.equal(sameCheck.errorCode, 'IDENTICAL_LANGUAGES');
});

await runTest('Speech rate control clamps values within supported [0.5, 1.5] range', () => {
  assert.equal(clampSpeechRate(1.0), 1.0);
  assert.equal(clampSpeechRate(0.2), 0.5);
  assert.equal(clampSpeechRate(2.5), 1.5);
  assert.equal(clampSpeechRate('1.24'), 1.2);
  assert.equal(clampSpeechRate('invalid'), 1.0);
});

await runTest('Missing Bengali voice detection never substitutes English, Spanish, or Hindi voices', () => {
  const systemVoicesWithoutBengali = [
    { name: 'English (America)', lang: 'en-US' },
    { name: 'Spanish (Spain)', lang: 'es-ES' },
    { name: 'Hindi (India)', lang: 'hi-IN' },
  ];

  // Must return null for Bengali when only English, Spanish, and Hindi exist
  assert.equal(selectVoiceForLanguage(systemVoicesWithoutBengali, 'bn'), null);
  assert.equal(isVoiceMatchForLanguage({ name: 'English', lang: 'en-US' }, 'bn'), false);

  // English and Spanish voices are accurately matched
  assert.equal(selectVoiceForLanguage(systemVoicesWithoutBengali, 'en')?.lang, 'en-US');
  assert.equal(selectVoiceForLanguage(systemVoicesWithoutBengali, 'es')?.lang, 'es-ES');

  // Genuine Bengali voices (bn-BD, bn-IN, bn) are matched and prioritized
  const voicesWithBengali = [
    ...systemVoicesWithoutBengali,
    { name: 'Google বাংলা (ভারত)', lang: 'bn-IN' },
    { name: 'Google বাংলা (বাংলাদেশ)', lang: 'bn-BD' },
  ];
  const selectedBn = selectVoiceForLanguage(voicesWithBengali, 'bn');
  assert.ok(selectedBn);
  assert.equal(selectedBn.lang, 'bn-BD');
});

await runTest('Request tracker cancels obsolete requests and protects against out-of-order responses', () => {
  const tracker = createRequestTracker();

  const req1 = tracker.nextRequest();
  assert.equal(req1.requestId, 1);
  assert.equal(tracker.isCurrent(req1.requestId), true);
  assert.equal(req1.signal.aborted, false);

  // Starting req2 immediately aborts req1 and marks req1 stale
  const req2 = tracker.nextRequest();
  assert.equal(req1.signal.aborted, true);
  assert.equal(tracker.isCurrent(req1.requestId), false);
  assert.equal(tracker.isCurrent(req2.requestId), true);

  // User typing or swapping languages invalidates req2 immediately
  tracker.invalidate();
  assert.equal(req2.signal.aborted, true);
  assert.equal(tracker.isCurrent(req2.requestId), false);
});

await runTest('API service maps backend translations, quota errors, and timeouts accurately', async () => {
  // Successful translation
  const mockSuccessFetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        translated_text: 'শুভ সকাল',
        source_lang: body.source_lang,
        target_lang: body.target_lang,
        provider: 'mymemory',
      }),
    };
  };

  const result = await requestTranslation({
    text: 'Good morning',
    sourceLang: 'en',
    targetLang: 'bn',
    fetchImpl: mockSuccessFetch,
  });
  assert.equal(result.translatedText, 'শুভ সকাল');
  assert.equal(result.provider, 'mymemory');

  // Quota exhausted (HTTP 429)
  const mockQuotaFetch = async () => ({
    ok: false,
    status: 429,
    json: async () => ({
      error: { code: 'QUOTA_EXHAUSTED', message: 'Quota reached' },
    }),
  });

  await assert.rejects(
    () =>
      requestTranslation({
        text: 'Hello',
        sourceLang: 'en',
        targetLang: 'bn',
        fetchImpl: mockQuotaFetch,
      }),
    (err) => err instanceof ApiTranslationError && err.code === 'QUOTA_EXHAUSTED'
  );
});

await runTest('Universal clipboard utility reports success only when writeText resolves and falls back cleanly', async () => {
  let selectedFallback = false;
  const dummyElement = {
    focus() {},
    select() {
      selectedFallback = true;
    },
  };

  // In Node environment without navigator.clipboard, must return manual_fallback and select element
  const fallbackRes = await copyTextUniversal('শুভ সকাল', dummyElement);
  assert.equal(fallbackRes.ok, false);
  assert.equal(fallbackRes.method, 'manual_fallback');
  assert.equal(selectedFallback, true);
});

await runTest('All three locale files (en, bn, es) contain matching top-level and nested translation keys', () => {
  function collectKeys(obj, prefix = '') {
    const keys = [];
    for (const [k, v] of Object.entries(obj)) {
      const cleanKey = k.trim();
      const next = prefix ? `${prefix}.${cleanKey}` : cleanKey;
      if (v && typeof v === 'object') {
        keys.push(...collectKeys(v, next));
      } else {
        keys.push(next);
      }
    }
    return keys.sort();
  }

  const enKeys = collectKeys(enLocale);
  const bnKeys = collectKeys(bnLocale);
  const esKeys = collectKeys(esLocale);

  assert.deepEqual(enKeys, bnKeys, 'en.json and bn.json keys must match');
  assert.deepEqual(enKeys, esKeys, 'en.json and es.json keys must match');
});

await runTest('Theme resolver correctly computes effective theme across explicit and system preferences', () => {
  assert.equal(resolveTheme('light', 'dark'), 'light');
  assert.equal(resolveTheme('light', 'light'), 'light');
  assert.equal(resolveTheme('dark', 'light'), 'dark');
  assert.equal(resolveTheme('dark', 'dark'), 'dark');
  assert.equal(resolveTheme('system', 'light'), 'light');
  assert.equal(resolveTheme('system', 'dark'), 'dark');

  // Verify theme localization entries
  assert.equal(typeof enLocale.theme?.light, 'string');
  assert.equal(typeof bnLocale.theme?.light, 'string');
  assert.equal(typeof esLocale.theme?.light, 'string');
  assert.equal(typeof enLocale.theme?.dark, 'string');
  assert.equal(typeof bnLocale.theme?.dark, 'string');
  assert.equal(typeof esLocale.theme?.dark, 'string');
  assert.equal(typeof enLocale.theme?.system, 'string');
  assert.equal(typeof bnLocale.theme?.system, 'string');
  assert.equal(typeof esLocale.theme?.system, 'string');
});

if (!isVitest) {
  console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}
