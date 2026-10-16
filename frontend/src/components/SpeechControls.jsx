import React from 'react';
import { t } from '../utils/i18n';

export default function SpeechControls({
  uiLang,
  panelId,
  langCode,
  text,
  voice,
  speechSupported,
  isSpeakingThisPanel,
  onSpeak,
  onStop,
}) {
  const hasText = Boolean(text && text.trim());
  const voiceAvailable = Boolean(speechSupported && voice);
  const langLabel = t(uiLang, `languages.${langCode}`);

  const unavailableMessage = !speechSupported
    ? t(uiLang, 'speech.speechUnsupported')
    : t(uiLang, 'speech.voiceUnavailable', { lang: langLabel });

  const availableMessage = voiceAvailable
    ? t(uiLang, 'speech.voiceAvailable', { voiceName: voice.name || voice.lang || langCode })
    : unavailableMessage;

  const listenLabel =
    panelId === 'source'
      ? t(uiLang, 'controls.listenSource')
      : t(uiLang, 'controls.listenTarget');

  const listenAriaLabel =
    panelId === 'source'
      ? t(uiLang, 'controls.listenSourceAria')
      : t(uiLang, 'controls.listenTargetAria');

  return (
    <div className="speech-controls-wrap">
      {isSpeakingThisPanel ? (
        <button
          type="button"
          className="panel-action-btn speech-stop-btn"
          onClick={onStop}
          aria-label={t(uiLang, 'controls.stopSpeechAria')}
          title={t(uiLang, 'controls.stopSpeechAria')}
          data-testid={`stop-speech-${panelId}`}
        >
          <span className="btn-icon" aria-hidden="true">■</span>
          <span>{t(uiLang, 'controls.stopSpeech')}</span>
        </button>
      ) : (
        <button
          type="button"
          className="panel-action-btn speech-listen-btn"
          onClick={() => onSpeak(text, langCode, panelId)}
          disabled={!voiceAvailable || !hasText}
          aria-label={
            voiceAvailable ? listenAriaLabel : `${listenAriaLabel} (${unavailableMessage})`
          }
          title={availableMessage}
          data-testid={`listen-${panelId}-btn`}
        >
          <svg
            className="btn-icon-svg"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
          <span>{listenLabel}</span>
        </button>
      )}

      {!voiceAvailable && (
        <span
          className="voice-unavailable-pill"
          role="status"
          title={
            langCode === 'bn'
              ? t(uiLang, 'speech.bengaliUnavailableDetail')
              : t(uiLang, 'speech.generalUnavailableDetail', { lang: langLabel })
          }
          data-testid={`voice-unavailable-${panelId}`}
        >
          {unavailableMessage}
        </span>
      )}
    </div>
  );
}
