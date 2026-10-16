import React from 'react';
import { t } from '../utils/i18n';

export default function Footer({ uiLang }) {
  return (
    <footer className="app-footer">
      <p className="footer-tagline">{t(uiLang, 'footer.tagline')}</p>
      <p className="footer-langs">{t(uiLang, 'footer.languagesSupported')}</p>
    </footer>
  );
}
