import React, { useState, useRef, useCallback } from 'react';
import BackgroundTypography from './components/BackgroundTypography';
import Header from './components/Header';
import LanguageBar from './components/LanguageBar';
import SpeechControls from './components/SpeechControls';
import AboutModal from './components/AboutModal';
import Footer from './components/Footer';
import { useSpeech } from './hooks/useSpeech';
import { useTranslation } from './hooks/useTranslation';
import { copyTextUniversal } from './utils/clipboard';
import { t } from './utils/i18n';

const SAMPLE_PHRASES_BY_LANG = {
  en: [
    'Good morning.',
    'Thank you very much.',
    'Where is the nearest bus station?',
  ],
  bn: [
    'আমি ভালো আছি।',
    'আপনার সাথে দেখা করে ভালো লাগলো।',
    'আজ আবহাওয়া খুব সুন্দর।',
  ],
  es: [
    '¿Cuánto cuesta esto?',
    'Muchas gracias por tu ayuda.',
    'No quiero café, quiero té.',
  ],
};

const RETRYABLE_ERROR_CODES = new Set([
  'PROVIDER_UNAVAILABLE',
  'TRANSLATION_TIMEOUT',
  'NETWORK_ERROR',
  'OFFLINE_ERROR',
  'INVALID_PROVIDER_RESPONSE',
  'TRANSLATION_UNAVAILABLE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
]);

export default function App() {
  const [uiLang, setUiLang] = useState('en');
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState(null); // 'copied' | 'manual_fallback' | null
  const outputRef = useRef(null);
  const copyTimerRef = useRef(null);

  const {
    supported: speechSupported,
    speechRate,
    setSpeechRate,
    speakingPanel,
    getVoiceForLanguage,
    speak,
    stopSpeech,
  } = useSpeech();

  const clearCopyNotice = useCallback(() => {
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
    setCopyStatus(null);
  }, []);

  const handleInvalidateAux = useCallback(() => {
    stopSpeech();
    clearCopyNotice();
  }, [clearCopyNotice, stopSpeech]);

  const {
    sourceLang,
    targetLang,
    sourceText,
    translatedText,
    isLoading,
    errorCode,
    byteCount,
    charCount,
    maxBytes,
    isOverByteLimit,
    setSourceText,
    changeSourceLanguage,
    changeTargetLanguage,
    swapLanguages,
    clearText,
    translate,
  } = useTranslation({ onInvalidateSpeech: handleInvalidateAux });

  const sourceVoice = getVoiceForLanguage(sourceLang);
  const targetVoice = getVoiceForLanguage(targetLang);

  const handleSourceKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && sourceText.trim() && !isOverByteLimit) {
        translate();
      }
    }
  };

  const handleCopy = async () => {
    if (!translatedText.trim()) return;
    clearCopyNotice();
    const res = await copyTextUniversal(translatedText, outputRef.current);
    if (res.ok) {
      setCopyStatus('copied');
      copyTimerRef.current = setTimeout(() => {
        setCopyStatus(null);
      }, 3000);
    } else {
      setCopyStatus('manual_fallback');
    }
  };

  const showBengaliSpeechNotice =
    (sourceLang === 'bn' && !sourceVoice) || (targetLang === 'bn' && !targetVoice);

  const samplePhrases = SAMPLE_PHRASES_BY_LANG[sourceLang] || SAMPLE_PHRASES_BY_LANG.en;
  const canRetry = Boolean(errorCode && RETRYABLE_ERROR_CODES.has(errorCode));

  return (
    <div className="app-shell" lang={uiLang}>
      <BackgroundTypography />

      <div className="workspace-wrapper">
        <Header
          uiLang={uiLang}
          onSelectUiLang={setUiLang}
          onOpenAbout={() => setIsAboutOpen(true)}
        />

        <main className="main-workspace">
          <LanguageBar
            uiLang={uiLang}
            sourceLang={sourceLang}
            targetLang={targetLang}
            onChangeSourceLang={changeSourceLanguage}
            onChangeTargetLang={changeTargetLanguage}
            onSwapLanguages={swapLanguages}
            speechRate={speechRate}
            onChangeSpeechRate={setSpeechRate}
          />

          <div className="translation-grid">
            {/* Source Text Panel */}
            <section
              className="translation-panel glass-surface"
              aria-labelledby="source-panel-heading"
            >
              <div className="panel-header">
                <div className="panel-title-group">
                  <h2 id="source-panel-heading" className="panel-heading">
                    {t(uiLang, 'panels.sourceHeader')}
                  </h2>
                  <span className="lang-pill" lang={sourceLang}>
                    {t(uiLang, `languages.${sourceLang}`)}
                  </span>
                </div>

                <SpeechControls
                  uiLang={uiLang}
                  panelId="source"
                  langCode={sourceLang}
                  text={sourceText}
                  voice={sourceVoice}
                  speechSupported={speechSupported}
                  isSpeakingThisPanel={speakingPanel === 'source'}
                  onSpeak={speak}
                  onStop={stopSpeech}
                />
              </div>

              <div className="sample-bar" aria-label={t(uiLang, 'controls.samplePhrases')}>
                <span className="sample-bar-label">{t(uiLang, 'controls.samplePhrases')}</span>
                <div className="sample-chips">
                  {samplePhrases.map((phrase) => (
                    <button
                      key={phrase}
                      type="button"
                      lang={sourceLang}
                      className="sample-chip"
                      onClick={() => setSourceText(phrase)}
                    >
                      {phrase}
                    </button>
                  ))}
                </div>
              </div>

              <div className="panel-body">
                <label htmlFor="source-textarea" className="sr-only">
                  {t(uiLang, 'panels.sourceHeader')}
                </label>
                <textarea
                  id="source-textarea"
                  className={`source-textarea ${isOverByteLimit ? 'textarea-over-limit' : ''}`}
                  lang={sourceLang}
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  onKeyDown={handleSourceKeyDown}
                  placeholder={t(uiLang, 'panels.sourcePlaceholder')}
                  rows={6}
                  aria-invalid={isOverByteLimit}
                  aria-describedby="utf8-byte-counter"
                  data-testid="source-textarea"
                />
              </div>

              <div className="panel-footer">
                <div
                  id="utf8-byte-counter"
                  className={`byte-counter ${isOverByteLimit ? 'byte-counter-error' : ''}`}
                  aria-live="polite"
                  data-testid="utf8-byte-counter"
                >
                  <span>{t(uiLang, 'panels.charCount', { chars: charCount })}</span>
                  <span className="counter-sep" aria-hidden="true">•</span>
                  <span>
                    {t(uiLang, 'panels.byteCount', {
                      bytes: byteCount,
                      maxBytes,
                    })}
                  </span>
                </div>

                <div className="panel-action-row">
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={clearText}
                    disabled={!sourceText && !translatedText && !errorCode}
                    aria-label={t(uiLang, 'controls.clearAria')}
                    data-testid="clear-btn"
                  >
                    {t(uiLang, 'controls.clear')}
                  </button>

                  <button
                    type="button"
                    className="translate-cta-btn"
                    onClick={translate}
                    disabled={isLoading || !sourceText.trim() || isOverByteLimit}
                    data-testid="translate-btn"
                  >
                    {isLoading ? (
                      <>
                        <span className="spinner-dot" aria-hidden="true" />
                        <span>{t(uiLang, 'controls.translating')}</span>
                      </>
                    ) : (
                      <span>{t(uiLang, 'controls.translate')}</span>
                    )}
                  </button>
                </div>
              </div>
            </section>

            {/* Translated Output Panel */}
            <section
              className="translation-panel glass-surface"
              aria-labelledby="target-panel-heading"
            >
              <div className="panel-header">
                <div className="panel-title-group">
                  <h2 id="target-panel-heading" className="panel-heading">
                    {t(uiLang, 'panels.targetHeader')}
                  </h2>
                  <span className="lang-pill lang-pill-target" lang={targetLang}>
                    {t(uiLang, `languages.${targetLang}`)}
                  </span>
                </div>

                <SpeechControls
                  uiLang={uiLang}
                  panelId="target"
                  langCode={targetLang}
                  text={translatedText}
                  voice={targetVoice}
                  speechSupported={speechSupported}
                  isSpeakingThisPanel={speakingPanel === 'target'}
                  onSpeak={speak}
                  onStop={stopSpeech}
                />
              </div>

              <div className="panel-body target-panel-body" aria-live="polite">
                {isLoading && (
                  <div className="loading-state" role="status" data-testid="loading-indicator">
                    <div className="loading-shimmer-line loading-line-1" />
                    <div className="loading-shimmer-line loading-line-2" />
                    <p className="loading-status-text">{t(uiLang, 'controls.translating')}</p>
                  </div>
                )}

                {!isLoading && errorCode && (
                  <div className="error-banner" role="alert" data-testid="error-banner">
                    <div className="error-banner-header">
                      <span className="error-icon" aria-hidden="true">!</span>
                      <p className="error-message-text">
                        {t(uiLang, `errors.${errorCode}`)}
                      </p>
                    </div>
                    {canRetry && (
                      <button
                        type="button"
                        className="retry-btn"
                        onClick={translate}
                        data-testid="retry-btn"
                      >
                        {t(uiLang, 'controls.retry')}
                      </button>
                    )}
                  </div>
                )}

                {!isLoading && !errorCode && translatedText && (
                  <div
                    ref={outputRef}
                    className="translated-output-box"
                    lang={targetLang}
                    tabIndex={0}
                    data-testid="translated-output"
                  >
                    {translatedText}
                  </div>
                )}

                {!isLoading && !errorCode && !translatedText && (
                  <div className="empty-output-placeholder" data-testid="empty-output">
                    <p>{t(uiLang, 'panels.emptyOutputHint')}</p>
                  </div>
                )}
              </div>

              <div className="panel-footer target-panel-footer">
                <div className="copy-feedback-area" aria-live="polite">
                  {copyStatus === 'copied' && (
                    <span className="copy-notice copy-notice-success" data-testid="copy-success-msg">
                      ✓ {t(uiLang, 'clipboard.copiedSuccess')}
                    </span>
                  )}
                  {copyStatus === 'manual_fallback' && (
                    <span className="copy-notice copy-notice-fallback" data-testid="copy-fallback-msg">
                      {t(uiLang, 'clipboard.manualFallback')}
                    </span>
                  )}
                </div>

                <div className="panel-action-row">
                  <button
                    type="button"
                    className="secondary-btn copy-btn"
                    onClick={handleCopy}
                    disabled={!translatedText.trim() || isLoading}
                    aria-label={t(uiLang, 'controls.copyAria')}
                    data-testid="copy-btn"
                  >
                    <span>
                      {copyStatus === 'copied'
                        ? t(uiLang, 'controls.copied')
                        : t(uiLang, 'controls.copy')}
                    </span>
                  </button>
                </div>
              </div>
            </section>
          </div>

          {showBengaliSpeechNotice && (
            <aside
              className="speech-honest-notice glass-surface"
              aria-live="polite"
              data-testid="bengali-speech-notice"
            >
              <span className="notice-indicator" aria-hidden="true">ℹ</span>
              <p className="notice-text">
                {t(uiLang, 'speech.bengaliUnavailableDetail')}
              </p>
            </aside>
          )}
        </main>

        <Footer uiLang={uiLang} />
      </div>

      <AboutModal
        uiLang={uiLang}
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />
    </div>
  );
}
