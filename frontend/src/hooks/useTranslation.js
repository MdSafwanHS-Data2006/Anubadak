/**
 * React hook managing translation state, language swapping, input validation,
 * and race-condition protection via AbortController + request sequence IDs.
 */

import { useState, useRef, useCallback } from 'react';
import {
  MAX_UTF8_BYTES,
  getCharacterCount,
  getUtf8ByteLength,
  resolveSourceLanguageChange,
  resolveTargetLanguageChange,
  validateTranslationRequest,
} from '../utils/utf8';
import { createRequestTracker } from '../utils/raceGuard';
import { ApiTranslationError, requestTranslation } from '../services/api';

export function useTranslation({ onInvalidateSpeech } = {}) {
  const [sourceLang, setSourceLangState] = useState('en');
  const [targetLang, setTargetLangState] = useState('bn');
  const [sourceText, setSourceTextState] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorCode, setErrorCode] = useState(null);

  const trackerRef = useRef(null);
  if (!trackerRef.current) {
    trackerRef.current = createRequestTracker();
  }

  const invalidateInFlightAndOutput = useCallback(() => {
    trackerRef.current.invalidate();
    setIsLoading(false);
    setTranslatedText('');
    setErrorCode(null);
    if (typeof onInvalidateSpeech === 'function') {
      onInvalidateSpeech();
    }
  }, [onInvalidateSpeech]);

  const setSourceText = useCallback(
    (nextText) => {
      const value = typeof nextText === 'string' ? nextText : '';
      setSourceTextState(value);
      // Invalidate any pending request or stale translation immediately when input changes
      trackerRef.current.invalidate();
      setIsLoading(false);
      setTranslatedText('');
      if (getUtf8ByteLength(value) > MAX_UTF8_BYTES) {
        setErrorCode('TEXT_TOO_LONG');
      } else {
        setErrorCode(null);
      }
      if (typeof onInvalidateSpeech === 'function') {
        onInvalidateSpeech();
      }
    },
    [onInvalidateSpeech]
  );

  const changeSourceLanguage = useCallback(
    (newSource) => {
      if (newSource === sourceLang) return;
      const next = resolveSourceLanguageChange(newSource, sourceLang, targetLang);
      setSourceLangState(next.sourceLang);
      setTargetLangState(next.targetLang);
      invalidateInFlightAndOutput();
    },
    [invalidateInFlightAndOutput, sourceLang, targetLang]
  );

  const changeTargetLanguage = useCallback(
    (newTarget) => {
      if (newTarget === targetLang) return;
      const next = resolveTargetLanguageChange(newTarget, sourceLang, targetLang);
      setSourceLangState(next.sourceLang);
      setTargetLangState(next.targetLang);
      invalidateInFlightAndOutput();
    },
    [invalidateInFlightAndOutput, sourceLang, targetLang]
  );

  const swapLanguages = useCallback(() => {
    const nextSourceLang = targetLang;
    const nextTargetLang = sourceLang;
    const currentOutput = translatedText.trim();

    trackerRef.current.invalidate();
    setIsLoading(false);
    setErrorCode(null);
    if (typeof onInvalidateSpeech === 'function') {
      onInvalidateSpeech();
    }

    setSourceLangState(nextSourceLang);
    setTargetLangState(nextTargetLang);

    // Move current valid translated output into source field when appropriate and within byte limit
    if (currentOutput && getUtf8ByteLength(currentOutput) <= MAX_UTF8_BYTES) {
      setSourceTextState(currentOutput);
    }
    // Always invalidate stale translation output after swapping
    setTranslatedText('');
  }, [onInvalidateSpeech, sourceLang, targetLang, translatedText]);

  const clearText = useCallback(() => {
    trackerRef.current.invalidate();
    setIsLoading(false);
    setSourceTextState('');
    setTranslatedText('');
    setErrorCode(null);
    if (typeof onInvalidateSpeech === 'function') {
      onInvalidateSpeech();
    }
  }, [onInvalidateSpeech]);

  const translate = useCallback(async () => {
    if (isLoading) {
      return false;
    }

    const validation = validateTranslationRequest(sourceText, sourceLang, targetLang);
    if (!validation.valid) {
      setErrorCode(validation.errorCode);
      setTranslatedText('');
      return false;
    }

    const { requestId, signal } = trackerRef.current.nextRequest();
    setIsLoading(true);
    setErrorCode(null);
    if (typeof onInvalidateSpeech === 'function') {
      onInvalidateSpeech();
    }

    try {
      const result = await requestTranslation({
        text: sourceText.trim(),
        sourceLang,
        targetLang,
        signal,
      });

      // Only apply result if this request is still the latest active request
      if (!trackerRef.current.isCurrent(requestId)) {
        return false;
      }

      setTranslatedText(result.translatedText);
      setIsLoading(false);
      setErrorCode(null);
      return true;
    } catch (err) {
      if (!trackerRef.current.isCurrent(requestId)) {
        return false;
      }
      if (err && err.name === 'AbortError') {
        return false;
      }
      setIsLoading(false);
      setTranslatedText('');
      if (err instanceof ApiTranslationError && err.code) {
        setErrorCode(err.code);
      } else {
        setErrorCode('NETWORK_ERROR');
      }
      return false;
    }
  }, [isLoading, onInvalidateSpeech, sourceLang, sourceText, targetLang]);

  const byteCount = getUtf8ByteLength(sourceText);
  const charCount = getCharacterCount(sourceText);
  const isOverByteLimit = byteCount > MAX_UTF8_BYTES;

  return {
    sourceLang,
    targetLang,
    sourceText,
    translatedText,
    isLoading,
    errorCode,
    byteCount,
    charCount,
    maxBytes: MAX_UTF8_BYTES,
    isOverByteLimit,
    setSourceText,
    changeSourceLanguage,
    changeTargetLanguage,
    swapLanguages,
    clearText,
    translate,
  };
}
