/**
 * Dual-mode frontend production build script:
 * 1. If `node_modules/.bin/vite` is present (standard developer setup after `npm install`),
 *    executes `vite build`.
 * 2. Otherwise (offline sandbox VM with pre-installed system @babel/core + @babel/preset-react),
 *    transpiles all JSX/JS/JSON modules in `src/` and emits `dist/index.html`,
 *    `dist/assets/app.js`, and `dist/assets/index.css`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(FRONTEND_ROOT, 'src');
const DIST_DIR = path.join(FRONTEND_ROOT, 'dist');
const ASSETS_DIR = path.join(DIST_DIR, 'assets');

const viteBin = path.join(FRONTEND_ROOT, 'node_modules', '.bin', 'vite');
if (fs.existsSync(viteBin)) {
  const res = spawnSync(viteBin, ['build'], { stdio: 'inherit', cwd: FRONTEND_ROOT });
  process.exit(res.status ?? 0);
}

console.log('[anubadak-build] Building React + JSX frontend bundle into dist/...');
const require = createRequire(import.meta.url);
let babel;
try {
  babel = require('@babel/core');
} catch {
  try {
    babel = require('/usr/share/nodejs/@babel/core');
  } catch (err) {
    throw new Error('Neither vite nor @babel/core was found. Please run "npm install".');
  }
}

function resolvePreset(name) {
  try {
    return require.resolve(name);
  } catch {
    try {
      return require.resolve(`/usr/share/nodejs/${name}`);
    } catch {
      return name;
    }
  }
}

fs.mkdirSync(ASSETS_DIR, { recursive: true });

// Module order for clean bundling without external runtime dependencies
const moduleEntries = [
  { id: 'react', file: path.join(__dirname, 'react-offline-shim.js') },
  { id: './locales/en.json', file: path.join(SRC_DIR, 'locales/en.json'), isJson: true },
  { id: './locales/bn.json', file: path.join(SRC_DIR, 'locales/bn.json'), isJson: true },
  { id: './locales/es.json', file: path.join(SRC_DIR, 'locales/es.json'), isJson: true },
  { id: './utils/utf8', file: path.join(SRC_DIR, 'utils/utf8.js') },
  { id: './utils/speech', file: path.join(SRC_DIR, 'utils/speech.js') },
  { id: './utils/clipboard', file: path.join(SRC_DIR, 'utils/clipboard.js') },
  { id: './utils/raceGuard', file: path.join(SRC_DIR, 'utils/raceGuard.js') },
  { id: './utils/i18n', file: path.join(SRC_DIR, 'utils/i18n.js') },
  { id: './services/api', file: path.join(SRC_DIR, 'services/api.js') },
  { id: './hooks/useSpeech', file: path.join(SRC_DIR, 'hooks/useSpeech.js') },
  { id: './hooks/useTranslation', file: path.join(SRC_DIR, 'hooks/useTranslation.js') },
  { id: './components/BackgroundTypography', file: path.join(SRC_DIR, 'components/BackgroundTypography.jsx') },
  { id: './components/Header', file: path.join(SRC_DIR, 'components/Header.jsx') },
  { id: './components/LanguageBar', file: path.join(SRC_DIR, 'components/LanguageBar.jsx') },
  { id: './components/SpeechControls', file: path.join(SRC_DIR, 'components/SpeechControls.jsx') },
  { id: './components/AboutModal', file: path.join(SRC_DIR, 'components/AboutModal.jsx') },
  { id: './components/Footer', file: path.join(SRC_DIR, 'components/Footer.jsx') },
  { id: './App', file: path.join(SRC_DIR, 'App.jsx') },
  { id: './main', file: path.join(SRC_DIR, 'main.jsx') },
];

const compiledDefinitions = [];

for (const mod of moduleEntries) {
  const raw = fs.readFileSync(mod.file, 'utf8');
  if (mod.isJson) {
    compiledDefinitions.push(
      `  ${JSON.stringify(mod.id)}: function(module, exports) { module.exports = ${raw.trim()}; }`
    );
    continue;
  }

  const sanitized = raw
    .replace(/import\s+['"]\.\/index\.css['"];?/g, '')
    .replace(/import\.meta\.env/g, '(window.__ANUBADAK_ENV__ || {})')
    .replace(/typeof\s+import\.meta/g, '"object"');

  const transformed = babel.transformSync(sanitized, {
    filename: mod.file,
    presets: [
      [resolvePreset('@babel/preset-env'), { targets: { chrome: '100' }, modules: 'commonjs' }],
      [resolvePreset('@babel/preset-react'), { runtime: 'classic' }],
    ],
  });

  compiledDefinitions.push(
    `  ${JSON.stringify(mod.id)}: function(module, exports, require) {\n${transformed.code}\n  }`
  );
}

const bundleSource = `(function() {
  "use strict";
  const modules = {
${compiledDefinitions.join(',\n')}
  };
  const cache = {};
  function normalizeReq(req) {
    if (req === 'react' || req === 'react-dom/client' || req === 'react-dom') return 'react';
    const clean = req.replace(/^\\.\\.\\//, './').replace(/\\.(jsx|js)$/, '');
    return clean;
  }
  function requireModule(id) {
    const key = normalizeReq(id);
    if (cache[key]) return cache[key].exports;
    const factory = modules[key];
    if (!factory) {
      throw new Error('Module not found in bundle: ' + id + ' (normalized: ' + key + ')');
    }
    const module = { exports: {} };
    cache[key] = module;
    factory(module, module.exports, requireModule);
    return module.exports;
  }
  requireModule('./main');
})();
`;

const cssContent = fs.readFileSync(path.join(SRC_DIR, 'index.css'), 'utf8');
fs.writeFileSync(path.join(ASSETS_DIR, 'app.js'), bundleSource, 'utf8');
fs.writeFileSync(path.join(ASSETS_DIR, 'index.css'), cssContent, 'utf8');

const htmlContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="Anubadak (অনুবাদক) — Cross-platform multilingual translation studio supporting English, Bengali (বাংলা), and Spanish (Español)."
    />
    <meta name="theme-color" content="#071426" />
    <title>Anubadak (অনুবাদক) — Multilingual Translator</title>
    <link rel="stylesheet" href="./assets/index.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="./assets/app.js"></script>
  </body>
</html>
`;

fs.writeFileSync(path.join(DIST_DIR, 'index.html'), htmlContent, 'utf8');
console.log('[anubadak-build] Build succeeded: dist/index.html, dist/assets/app.js, dist/assets/index.css');
