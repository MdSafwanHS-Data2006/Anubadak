/**
 * React hook for browser Web Speech API synthesis with strict Bengali voice validation,
 * adjustable speech rate, and automatic utterance cancellation.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DEFAULT_SPEECH_RATE,
  clampSpeechRate,
  isSpeechSynthesisSupported,
  selectVoiceForLanguage,
} from '../utils/speech';

export function useSpeech() {
  const [supported, setSupported] = useState(() => isSpeechSynthesisSupported());
  const [voices, setVoices] = useState([]);
  const [speechRate, setSpeechRateState] = useState(DEFAULT_SPEECH_RATE);
  const [speakingPanel, setSpeakingPanel] = useState(null); // 'source' | 'target' | null
  const [speechError, setSpeechError] = useState(null);
  const utteranceRef = useRef(null);

  const refreshVoices = useCallback(() => {
    if (!isSpeechSynthesisSupported()) {
      setSupported(false);
      setVoices([]);
      return;
    }
    setSupported(true);
    try {
      const available = window.speechSynthesis.getVoices() || [];
      setVoices(Array.isArray(available) ? available : []);
    } catch (_err) {
      setVoices([]);
    }
  }, []);

  useEffect(() => {
    refreshVoices();
    if (!isSpeechSynthesisSupported()) {
      return undefined;
    }

    const synth = window.speechSynthesis;
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', refreshVoices);
      return () => {
        synth.removeEventListener('voiceschanged', refreshVoices);
      };
    }
    const prevHandler = synth.onvoiceschanged;
    synth.onvoiceschanged = refreshVoices;
    return () => {
      if (synth.onvoiceschanged === refreshVoices) {
        synth.onvoiceschanged = prevHandler;
      }
    };
  }, [refreshVoices]);

  const stopSpeech = useCallback(() => {
    if (isSpeechSynthesisSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch (_err) {
        // Ignore cancel errors
      }
    }
    utteranceRef.current = null;
    setSpeakingPanel(null);
  }, []);

  // Cancel active speech on unmount
  useEffect(() => () => stopSpeech(), [stopSpeech]);

  const setSpeechRate = useCallback((nextRate) => {
    setSpeechRateState(clampSpeechRate(nextRate));
  }, []);

  const getVoiceForLanguage = useCallback(
    (langCode) => {
      if (!supported) return null;
      return selectVoiceForLanguage(voices, langCode);
    },
    [supported, voices]
  );

  const speak = useCallback(
    (text, langCode, panelId = 'source') => {
      setSpeechError(null);
      const trimmed = typeof text === 'string' ? text.trim() : '';
      if (!trimmed) return false;

      if (!isSpeechSynthesisSupported()) {
        setSpeechError('speechUnsupported');
        return false;
      }

      // Re-inspect voices at invocation time in case browser populated them lazily
      const currentVoices =
        voices.length > 0 ? voices : window.speechSynthesis.getVoices() || [];
      const matchingVoice = selectVoiceForLanguage(currentVoices, langCode);

      // CRITICAL: Never substitute an English or Spanish voice when Bengali or another voice is missing
      if (!matchingVoice) {
        setSpeechError('voiceUnavailable');
        return false;
      }

      // Stop any existing speech before starting a new utterance
      stopSpeech();

      try {
        const utterance = new window.SpeechSynthesisUtterance(trimmed);
        utterance.voice = matchingVoice;
        utterance.lang = matchingVoice.lang || langCode;
        utterance.rate = clampSpeechRate(speechRate);

        utterance.onend = () => {
          if (utteranceRef.current === utterance) {
            utteranceRef.current = null;
            setSpeakingPanel(null);
          }
        };

        utterance.onerror = () => {
          if (utteranceRef.current === utterance) {
            utteranceRef.current = null;
            setSpeakingPanel(null);
          }
        };

        utteranceRef.current = utterance;
        setSpeakingPanel(panelId);
        window.speechSynthesis.speak(utterance);
        return true;
      } catch (_err) {
        setSpeakingPanel(null);
        setSpeechError('playbackError');
        return false;
      }
    },
    [speechRate, stopSpeech, voices]
  );

  return {
    supported,
    voices,
    speechRate,
    setSpeechRate,
    speakingPanel,
    speechError,
    getVoiceForLanguage,
    speak,
    stopSpeech,
  };
}
