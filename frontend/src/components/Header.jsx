import React from 'react';
import { t } from '../utils/i18n';

const UI_LOCALES = [
  { code: 'en', label: 'EN', fullName: 'English' },
  { code: 'bn', label: 'বাংলা', fullName: 'বাংলা (Bengali)' },
  { code: 'es', label: 'ES', fullName: 'Español' },
];

export default function Header({ uiLang, onSelectUiLang, onOpenAbout }) {
  return (
    <header className="app-header glass-surface">
      <div className="brand-group">
        <div className="brand-emblem" aria-hidden="true">
          <span className="brand-emblem-glyph" lang="bn">অ</span>
          <span className="brand-emblem-dot" />
        </div>
        <div className="brand-titles">
          <div className="brand-title-row">
            <h1 className="brand-wordmark">{t(uiLang, 'app.title')}</h1>
            <span className="brand-divider" aria-hidden="true">•</span>
            <span className="brand-bengali-title" lang="bn">
              {t(uiLang, 'app.bengaliTitle')}
            </span>
          </div>
          <p className="brand-subtitle">{t(uiLang, 'app.subtitle')}</p>
        </div>
      </div>

      <div className="header-actions">
        <div
          className="ui-lang-switcher"
          role="group"
          aria-label={t(uiLang, 'app.uiLanguageLabel')}
        >
          {UI_LOCALES.map((loc) => {
            const active = uiLang === loc.code;
            return (
              <button
                key={loc.code}
                type="button"
                lang={loc.code}
                className={`ui-lang-btn ${active ? 'ui-lang-btn-active' : ''}`}
                aria-pressed={active}
                title={loc.fullName}
                onClick={() => onSelectUiLang(loc.code)}
                data-testid={`ui-lang-${loc.code}`}
              >
                {loc.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="about-trigger-btn"
          onClick={onOpenAbout}
          data-testid="open-about-btn"
        >
          <span className="about-icon" aria-hidden="true">?</span>
          <span>{t(uiLang, 'app.aboutButton')}</span>
        </button>
      </div>
    </header>
  );
}
