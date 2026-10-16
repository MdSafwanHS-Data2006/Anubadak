/**
 * Localization helper for English (en), Bengali (bn), and Spanish (es).
 */

import enLocale from '../locales/en.json';
import bnLocale from '../locales/bn.json';
import esLocale from '../locales/es.json';

export const LOCALES = {
  en: enLocale,
  bn: bnLocale,
  es: esLocale,
};

/**
 * Retrieve a localized string by dot-separated key (e.g. 'controls.translate')
 * with optional `{placeholder}` interpolation.
 *
 * @param {string} uiLang - 'en' | 'bn' | 'es'
 * @param {string} keyPath
 * @param {Record<string, string | number>} [params={}]
 * @returns {string}
 */
export function t(uiLang, keyPath, params = {}) {
  const dict = LOCALES[uiLang] || LOCALES.en;
  const fallbackDict = LOCALES.en;

  const segments = String(keyPath).split('.');
  let value = dict;
  for (const seg of segments) {
    value = value && typeof value === 'object' ? value[seg] : undefined;
  }

  if (typeof value !== 'string') {
    value = fallbackDict;
    for (const seg of segments) {
      value = value && typeof value === 'object' ? value[seg] : undefined;
    }
  }

  if (typeof value !== 'string') {
    return keyPath;
  }

  return value.replace(/\{(\w+)\}/g, (_match, token) =>
    Object.prototype.hasOwnProperty.call(params, token) ? String(params[token]) : `{${token}}`
  );
}
