import React from 'react';
import { t } from '../utils/i18n';

export default function AboutModal({ uiLang, isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-modal-title"
      data-testid="about-modal"
    >
      <div className="modal-card glass-surface">
        <div className="modal-header">
          <h2 id="about-modal-title" className="modal-title">
            {t(uiLang, 'about.title')}
          </h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label={t(uiLang, 'app.closeButton')}
            data-testid="close-about-btn"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <section className="modal-section">
            <h3>{t(uiLang, 'about.overviewTitle')}</h3>
            <p>{t(uiLang, 'about.overviewBody')}</p>
          </section>

          <section className="modal-section">
            <h3>{t(uiLang, 'about.limitsTitle')}</h3>
            <p>{t(uiLang, 'about.limitsBody')}</p>
          </section>

          <section className="modal-section">
            <h3>{t(uiLang, 'about.speechTitle')}</h3>
            <p>{t(uiLang, 'about.speechBody')}</p>
          </section>

          <section className="modal-section">
            <h3>{t(uiLang, 'about.shortcutsTitle')}</h3>
            <ul className="modal-list">
              <li>{t(uiLang, 'about.shortcutEnter')}</li>
              <li>{t(uiLang, 'about.shortcutShiftEnter')}</li>
            </ul>
          </section>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="primary-btn"
            onClick={onClose}
          >
            {t(uiLang, 'app.closeButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
