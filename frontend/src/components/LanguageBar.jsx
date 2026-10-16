import React from 'react';
import { SUPPORTED_LANGUAGES } from '../utils/utf8';
import { MIN_SPEECH_RATE, MAX_SPEECH_RATE } from '../utils/speech';
import { t } from '../utils/i18n';

export default function LanguageBar({
  uiLang,
  sourceLang,
  targetLang,
  onChangeSourceLang,
  onChangeTargetLang,
  onSwapLanguages,
  speechRate,
  onChangeSpeechRate,
}) {
  return (
    <section
      className="language-bar glass-surface"
      aria-label="Translation language and speech rate controls"
    >
      <div className="language-selectors-group">
        <div className="lang-field">
          <label htmlFor="source-lang-select" className="lang-label">
            {t(uiLang, 'controls.sourceLanguage')}
          </label>
          <select
            id="source-lang-select"
            className="lang-select"
            value={sourceLang}
            onChange={(e) => onChangeSourceLang(e.target.value)}
            data-testid="source-lang-select"
          >
            {SUPPORTED_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {t(uiLang, `languages.${code}`)}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="swap-lang-btn"
          onClick={onSwapLanguages}
          aria-label={t(uiLang, 'controls.swapLanguages')}
          title={t(uiLang, 'controls.swapLanguages')}
          data-testid="swap-languages-btn"
        >
          <svg
            className="swap-icon"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M7 16V4m0 0L3 8m4-4l4 4" />
            <path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
          </svg>
          <span className="swap-btn-text">{t(uiLang, 'controls.swapLanguages')}</span>
        </button>

        <div className="lang-field">
          <label htmlFor="target-lang-select" className="lang-label">
            {t(uiLang, 'controls.targetLanguage')}
          </label>
          <select
            id="target-lang-select"
            className="lang-select"
            value={targetLang}
            onChange={(e) => onChangeTargetLang(e.target.value)}
            data-testid="target-lang-select"
          >
            {SUPPORTED_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {t(uiLang, `languages.${code}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="speech-rate-control">
        <label htmlFor="speech-rate-slider" className="speech-rate-label">
          <span>{t(uiLang, 'controls.speechSpeed')}</span>
          <output
            htmlFor="speech-rate-slider"
            className="speech-rate-badge"
            data-testid="speech-rate-value"
          >
            {Number(speechRate).toFixed(1)}x
          </output>
        </label>
        <input
          id="speech-rate-slider"
          type="range"
          className="speech-rate-slider"
          min={MIN_SPEECH_RATE}
          max={MAX_SPEECH_RATE}
          step="0.1"
          value={speechRate}
          onChange={(e) => onChangeSpeechRate( parseFloat(e.target.value) )}
          aria-label={t(uiLang, 'controls.speechSpeed')}
          data-testid="speech-rate-slider"
        />
      </div>
    </section>
  );
}
