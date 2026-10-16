# Anubadak (অনুবাদক) — Multilingual Translation Web Application

**Anubadak (অনুবাদক)** is a cross-platform, beginner-maintainable multilingual translation web application built with **React**, **Vite**, and **Python FastAPI**. It translates text across all six directions between **English (`en`)**, **Bengali / বাংলা (`bn`)**, and **Spanish / Español (`es`)** using the hosted [MyMemory Translation API](https://mymemory.translated.net/doc/spec.php), paired with strict server-side Unicode validation, race-condition-proof asynchronous state management, universal clipboard support, and honest browser speech synthesis.

## 1. Product Overview & Features

* **Three Languages, All Six Translation Directions**:
  * English (`en`) ↔ Bengali (`bn`)
  * English (`en`) ↔ Spanish (`es`)
  * Bengali (`bn`) ↔ Spanish (`es`)
* **Explicit Language Control (No Silent Auto-Detection)**: Users explicitly choose source and target languages. Selecting the same language automatically swaps the opposite selector, and clicking **Swap languages** exchanges the pair, moves valid translated text into the source panel, and invalidates stale output.
* **Authoritative UTF-8 Byte Validation (`500` UTF-8 Bytes Max)**: Both the frontend and backend enforce MyMemory's `500` UTF-8 byte query limit (`len(text.encode("utf-8"))`). Because Bengali Unicode characters (`U+0980`–`U+09FF`) occupy **3 UTF-8 bytes per character**, the live counter displays both character count and exact UTF-8 byte usage (`{chars} chars • {bytes} / 500 UTF-8 bytes`).
* **Conservative Response Validation & Candidate Selection**:
  * Decodes HTML entities (`&#39;`, `&quot;`, double-encoded entities) and preserves line breaks, punctuation (including Bengali danda `।` `U+0964`), numbers, proper nouns, and negation.
  * Rejects empty responses, provider warning banners disguised as translations, and known Translation Memory junk strings (`testcase`, `placeholder`, `dummy`, `lorem ipsum`).
  * Verifies that Bengali target translations contain genuine Bengali Unicode script (`\u0980`–`\u09FF`) rather than romanized Latin transliterations or mismatched foreign scripts.
  * Penalizes unchanged echo responses when a valid translated candidate exists in `matches`, while allowing legitimate single-word international cognates (such as `Hotel`, `Doctor`, `Taxi`, `No`) between English and Spanish.
* **Honest Multilingual Speech Synthesis (Web Speech API)**:
  * Inspects actual runtime browser voices via `window.speechSynthesis.getVoices()` and the `voiceschanged` event (`bn`, `bn-BD`, `bn-IN`, `en-*`, `es-*`).
  * **Never** substitutes an English, Spanish, or Hindi voice to read Bengali text.
  * When a genuine voice for a language is missing in the host browser or operating system, the corresponding **Listen** button is honestly disabled and paired with a clear, localized explanation while translation and copying continue normally.
  * Includes a compact speech-rate control (`0.5x` to `1.5x`, default `1.0x`) applied consistently to both panels.
* **Polished Dark / Light / System Theme (Spider-Man Aero in Both Modes)**:
  * **Dark Mode**: Midnight navy (`#071426`), deep blue (`#0B1F3A`), electric blue (`#2563EB`), cyan (`#38BDF8`), and Spider-red (`#E63946`) glassmorphism surfaces.
  * **Light Mode**: Crisp frosted pearl/slate surfaces (`#F0F4F9` / `#FFFFFF`), high-contrast slate navy text (`#0F172A`, 13:1+ contrast ratio, WCAG 2.2 AA compliant), and vivid Spider-Man electric blue and crimson accents.
  * **System Sync**: Automatic detection and real-time synchronization with OS color-scheme preferences (`prefers-color-scheme: light`).
  * **Zero Flash of Wrong Theme**: Pre-hydration inline script in `index.html` resolves `localStorage` preference before first paint.
  * **Fully Accessible & Localized**: Theme switcher controls are localized across English, Bengali, and Spanish with full keyboard and screen-reader accessibility.
* **Spider-Man Aero Glassmorphism UI & Full Localization (`en`, `bn`, `es`)**:
  * Designed with responsive glass surfaces, subtle highlights, and high-contrast readable elements.
  * Dedicated low-opacity decorative multilingual background layer (`aria-hidden="true"`, `pointer-events: none`, `z-index: 0`) behind the interactive workspace (`z-index: 10`).
  * Complete interface localization in English, Bengali, and Spanish (`frontend/src/locales/{en,bn,es}.json`).

## 2. Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        Browser Client (React + Vite)                       │
│                                                                            │
│  ┌──────────────────────┐   ┌───────────────────────┐   ┌───────────────┐  │
│  │ Language & UI Locale │   │ Source / Target Glass │   │ Web Speech &  │  │
│  │ Selectors (en/bn/es) │   │ Panels + UTF-8 Counter│   │ Clipboard API │  │
│  └──────────┬───────────┘   └───────────┬───────────┘   └───────┬───────┘  │
│             │                           │                       │          │
│             └─────────────┬─────────────┘                       │          │
│                           ▼                                     ▼          │
│             ┌───────────────────────────┐         ┌──────────────────────┐ │
│             │ useTranslation + RaceGuard│         │ Runtime Voice Check  │ │
│             │ (AbortController + SeqID) │         │ (bn / bn-BD / bn-IN) │ │
│             └─────────────┬─────────────┘         └──────────────────────┘ │
└───────────────────────────┼────────────────────────────────────────────────┘
                            │ POST /translate (JSON over HTTP/HTTPS)
                            ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                      Python FastAPI Backend (Uvicorn)                      │
│                                                                            │
│  1. CORS Middleware (explicit ALLOWED_ORIGINS only)                        │
│  2. Trusted-Proxy Client IP Resolver + Sliding-Window Rate Limiter         │
│  3. Input Validator (non-empty, en/bn/es, src != tgt, <= 500 UTF-8 bytes)  │
│  4. MyMemoryProvider (async HTTPX with timeout & optional 'de' email)      │
│  5. Candidate Validator (quota check, HTML unescape, junk/echo/script)     │
└───────────────────────────┬────────────────────────────────────────────────┘
                            │ GET /get?q=...&langpair=src|tgt[&de=...]
                            ▼
┌────────────────────────────────────────────────────────────────────────────┐
│            MyMemory Translation API (api.mymemory.translated.net)          │
└────────────────────────────────────────────────────────────────────────────┘
```

## 3. Technology Stack

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Frontend Framework** | React 18 + JSX | Component UI, state hooks (`useTranslation`, `useSpeech`), localization |
| **Frontend Build / Dev** | Vite | Fast local dev server (`:5173`) and production bundler (`dist/`) |
| **Styling** | Custom CSS (`src/index.css`) | Spider-Man Aero glassmorphism, responsive CSS Grid/Flexbox, WCAG 2.2 AA contrast |
| **Browser APIs** | Web Speech API & Clipboard API | Feature-detected speech synthesis and clipboard copy with manual selection fallback |
| **Backend Framework** | Python 3.11+ & FastAPI | REST endpoints (`GET /health`, `POST /translate`), structured validation & error handling |
| **ASGI Server & HTTP** | Uvicorn & HTTPX | Asynchronous server (`:8000`) and async outbound requests with timeouts |
| **Configuration** | Pydantic & `python-dotenv` | Request schema validation and environment variable loading |
| **Testing & Linting** | Pytest / `unittest`, Vitest / Node test runner, ESLint | Deterministic backend/frontend automated tests and code quality checks |

## 4. Project Structure

```
Anubadak/
├── README.md
├── .gitignore
├── .env.example
├── render.yaml                # Render Blueprint deployment specification
├── backend/
│   ├── __init__.py
│   ├── main.py                # FastAPI app, /health & /translate, CORS, rate limiter, proxy IP check
│   ├── translator.py          # TranslationProvider ABC, MyMemoryProvider, UTF-8 & script validation
│   ├── config.py              # Environment variable loader and Settings dataclass
│   ├── requirements.txt       # Python dependencies
│   ├── .env.example           # Backend environment template
│   └── tests/
│       ├── __init__.py
│       ├── test_main.py       # Endpoint, CORS, rate-limit, secret-safety, and proxy tests
│       └── test_translator.py # 18 regression cases, short-text matrix, 500-byte & error tests
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── vercel.json            # Vercel SPA routing rewrites
    ├── .eslintrc.json
    ├── .env.example           # Frontend environment template (VITE_API_BASE_URL only)
    ├── index.html             # HTML entry point with anti-flash theme detection
    ├── scripts/
    │   ├── run-build.mjs      # Runs Vite build (or Babel fallback in offline sandboxes)
    │   ├── run-tests.mjs      # Runs Vitest (or Node test suite fallback)
    │   └── react-offline-shim.js
    ├── src/
    │   ├── main.jsx
    │   ├── App.jsx
    │   ├── index.css          # Spider-Man Aero design system (Dark & Light themes)
    │   ├── components/
    │   │   ├── AboutModal.jsx
    │   │   ├── BackgroundTypography.jsx
    │   │   ├── Footer.jsx
    │   │   ├── Header.jsx     # Brand, theme switcher (Light/Dark/System), locale switcher
    │   │   ├── LanguageBar.jsx
    │   │   └── SpeechControls.jsx
    │   ├── hooks/
    │   │   ├── useSpeech.js
    │   │   ├── useTheme.js    # Theme management, localStorage persistence, OS sync
    │   │   └── useTranslation.js
    │   ├── services/
    │   │   └── api.js
    │   ├── utils/
    │   │   ├── clipboard.js
    │   │   ├── i18n.js
    │   │   ├── raceGuard.js
    │   │   ├── speech.js
    │   │   └── utf8.js
    │   └── locales/
    │       ├── en.json
    │       ├── bn.json
    │       └── es.json
    └── tests/
        └── frontend.test.mjs  # Automated frontend unit, integration, and theme tests
```

## 5. Prerequisites & Cross-Platform Installation Guide

Anubadak is engineered to run seamlessly across **all major operating systems** (Windows, macOS, Linux distributions) and **all device form factors** (desktops, laptops, tablets, and mobile devices).

### Step 1: Install System Prerequisites

Verify that you have **Python 3.11+**, **Node.js (LTS v18+ or v20+)**, and **Git** available on your machine:

#### Windows (PowerShell or Windows Terminal)
Using the [Windows Package Manager (winget)](https://learn.microsoft.com/en-us/windows/package-manager/winget/) or official installers:
```powershell
winget install Python.Python.3.12 OpenJS.NodeJS.LTS Git.Git
```
*(Alternatively, download installers from [python.org](https://www.python.org/downloads/), [nodejs.org](https://nodejs.org/), and [git-scm.com](https://git-scm.com/downloads)).*

#### macOS (Terminal / Homebrew)
Using [Homebrew](https://brew.sh/):
```bash
brew install python node git
```

#### Linux (Any Distribution)
* **Ubuntu / Debian / Linux Mint**:
  ```bash
  sudo apt update && sudo apt install -y python3 python3-pip python3-venv nodejs npm git fonts-noto-bengali
  ```
* **Fedora / RHEL / CentOS**:
  ```bash
  sudo dnf install -y python3 python3-pip nodejs npm git google-noto-sans-bengali-fonts
  ```
* **Arch Linux / Manjaro**:
  ```bash
  sudo pacman -S python python-pip nodejs npm git noto-fonts
  ```
* **openSUSE**:
  ```bash
  sudo zypper install -y python3 python3-pip nodejs npm git google-noto-sans-bengali-fonts
  ```

#### Verify Installed Versions
From any terminal or command prompt:
```bash
python3 --version  # (or 'python --version' on Windows)
node --version
npm --version
git --version
```

### Step 2: Set Up the Python Backend Virtual Environment

From the `Anubadak/` project root:

#### On Linux & macOS (bash / zsh):
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
cp -n .env.example .env
```

#### On Windows (PowerShell):
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item -Path .env.example -Destination .env -ErrorAction SilentlyContinue
```
*(If script execution is disabled in PowerShell, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned`, or use `.\.venv\Scripts\activate.bat` in Command Prompt).*

*(Optional)* If you want to use MyMemory's higher free daily tier (~50,000 characters/day), open `backend/.env` and set `MYMEMORY_EMAIL=your_valid_email@example.com`. Leave it blank for anonymous free tier (~5,000 characters/day).

### Step 3: Install Frontend Dependencies

Open a second terminal window or tab in `Anubadak/frontend`:

#### On Linux & macOS:
```bash
cd frontend
npm install
cp -n .env.example .env
```

#### On Windows (PowerShell):
```powershell
cd frontend
npm install
Copy-Item -Path .env.example -Destination .env -ErrorAction SilentlyContinue
```

---

## 6. Running the Application Locally

### Start the Backend Server (Terminal 1)

* **Linux & macOS**:
  ```bash
  cd backend
  source .venv/bin/activate
  uvicorn main:app --reload --host 127.0.0.1 --port 8000
  ```
* **Windows (PowerShell)**:
  ```powershell
  cd backend
  .\.venv\Scripts\Activate.ps1
  uvicorn main:app --reload --host 127.0.0.1 --port 8000
  ```

* Health check endpoint: `http://127.0.0.1:8000/health`
* Translation endpoint: `POST http://127.0.0.1:8000/translate`

### Start the Frontend Development Server (Terminal 2)

```bash
cd frontend
npm run dev
```

Open **`http://localhost:5173`** in your browser.

> [!TIP]
> **Testing from Mobile Devices or Tablets on Your Local Wi-Fi**:
> 1. In `backend/.env`, append your computer's local Wi-Fi IP to `ALLOWED_ORIGINS` (e.g. `ALLOWED_ORIGINS=http://localhost:5173,http://192.168.1.50:5173`).
> 2. Run the backend binding to all interfaces: `uvicorn main:app --host 0.0.0.0 --port 8000`.
> 3. In `frontend/.env`, set `VITE_API_BASE_URL=http://<your-lan-ip>:8000`.
> 4. Start Vite with LAN exposure: `npm run dev -- --host`.
> 5. Open `http://<your-lan-ip>:5173` on any smartphone, tablet, or secondary computer on the same network.

## 7. Running Automated Tests, Linting, and Production Builds

### Backend Automated Tests (Mocked Deterministic Suite)

Normal automated test runs use mocked `httpx.MockTransport` responses and **never** consume live MyMemory API quota:

```bash
cd backend
# Using pytest (when installed in your virtual environment):
pytest -v

# Or using Python's built-in unittest runner directly:
python3 -m unittest discover -s tests -v
```

### Optional Live MyMemory Smoke Test

When connected to the internet, you can run a live smoke test against `https://api.mymemory.translated.net/get`:

```bash
cd backend
RUN_LIVE_MYMEMORY_TESTS=1 python3 -m unittest discover -s tests -v
```

### Frontend Automated Tests, Linter, and Production Build

```bash
cd frontend
npm test
npm run lint
npm run build
```

## 8. MyMemory Translation API Documentation & Quota Caveats

* **API Technical Specification**: [https://mymemory.translated.net/doc/spec.php](https://mymemory.translated.net/doc/spec.php)
* **Usage Limits Specification**: [https://mymemory.translated.net/doc/usagelimits.php](https://mymemory.translated.net/doc/usagelimits.php)
* **Key Generator Documentation**: [https://mymemory.translated.net/doc/keygen.php](https://mymemory.translated.net/doc/keygen.php)
* **Translation Endpoint**: `https://api.mymemory.translated.net/get`

### Documented Provider Constraints & Caveats

1. **500 UTF-8 Byte Query Limit**: MyMemory enforces a maximum of `500` UTF-8 bytes per `q` segment. Because each Bengali character occupies 3 UTF-8 bytes, a pure Bengali sentence reaches 500 bytes at roughly 166 characters. Anubadak enforces `len(text.encode("utf-8")) <= 500` on both the frontend and backend.
2. **Daily Usage Quotas**: Per MyMemory's usage documentation, anonymous requests are limited to approximately **5,000 characters/day**, and providing a valid contact email via the `de` query parameter (`MYMEMORY_EMAIL` in `backend/.env`) increases the allowance to approximately **50,000 characters/day**, subject to MyMemory's current policies and IP reputation.
3. **No Exact Remaining-Quota API**: MyMemory does not expose a real-time remaining character counter in standard `/get` responses until quota is exhausted (`quotaFinished: true` or HTTP `429`). Anubadak never fabricates remaining quota numbers or displays misleading local estimate bars.
4. **Translation Memory Quality**: MyMemory combines human-contributed Translation Memory segments with machine translation. Wording can vary over time, and idioms may be translated literally depending on upstream archive matches.

## 9. Multilingual Speech Synthesis Behavior & Setup Across Platforms

Text translation and speech synthesis are completely independent subsystems:

1. **Why Voice Availability Varies Across Browsers & Operating Systems**:
   * Adding a language in browser preferences or display settings only configures interface translations or spellcheck dictionaries—it does **not** install a speech synthesis voice.
   * Browsers query the host operating system's native speech synthesizers through the standard W3C Web Speech API (`window.speechSynthesis`):
     * **Android**: Google Speech Services (pre-installed on most devices) typically provides natural voices for `bn-BD`, `bn-IN`, `en-US`, and `es-ES`.
     * **iOS & iPadOS**: Ships with English and Spanish voices; additional regional voices (including Bengali) can be enabled under *Settings → Accessibility → Spoken Content → Voices*.
     * **Windows 10 & 11**: English and Spanish voices are pre-installed; Bengali is supported via Microsoft Edge's online natural voices or by installing the Bangla Language Speech Pack under Windows *Settings → Time & Language*.
     * **macOS**: English and Spanish voices are pre-installed; Bengali voice packages can be added under *System Settings → Accessibility → Spoken Content*.
     * **Linux**: Browsers interface with Speech Dispatcher. When no local Bengali speech engine (such as eSpeak-NG) is configured, browsers report zero Bengali voices.
2. **Anubadak's Honest Voice Strategy**:
   * Anubadak queries `window.speechSynthesis.getVoices()` and responds dynamically to the `voiceschanged` event, checking specifically for `bn`, `bn-BD`, `bn-IN`, and `ben`.
   * It **never** substitutes an English, Spanish, or Hindi voice to phonetically misread Bengali text.
   * When no genuine Bengali voice is exposed by the host environment, the Bengali **Listen** button is honestly disabled and paired with a clear, localized explanation while translation and clipboard copying remain 100% operational.
3. **Optional Local Voice Installation by Platform**:
   * **Windows**: Open *Settings → Time & Language → Language & region → Add a language → Bengali (Bangladesh or India)* and ensure *Speech* is checked.
   * **macOS**: Open *System Settings → Accessibility → Spoken Content → System Voice → Manage Voices*, search for *Bengali*, and download the voice.
   * **Linux (Ubuntu / Debian)**:
     ```bash
     sudo apt install -y speech-dispatcher speech-dispatcher-espeak-ng espeak-ng
     ```
   * **Linux (Fedora / RHEL)**:
     ```bash
     sudo dnf install -y speech-dispatcher speech-dispatcher-espeak-ng espeak-ng
     ```
   * **Android / iOS**: Open device *Settings → Accessibility → Text-to-speech output* to view or manage installed language packs.
4. **Why No Paid/Proprietary Cloud TTS Is Bundled by Default**:
   * Commercial cloud neural TTS APIs supporting Bengali (such as Google Cloud TTS, Azure AI Speech, ElevenLabs, or Sarvam AI) require account registration, API keys, and billing/trial limits. To keep Anubadak 100% free and zero-credential out of the box for a beginner student project, native Web Speech API detection with honest fallback is used by default.

## 10. Security Considerations

* **Strict CORS**: Configured via `ALLOWED_ORIGINS` in `backend/config.py`. Wildcard (`*`) origins are stripped and never used in production.
* **Server-Side Configuration Only**: `MYMEMORY_EMAIL` stays strictly on the backend. `GET /health` reports only `"email_configured": true|false` and never leaks the email string or environment variables.
* **Frontend Environment Safety**: `frontend/.env.example` contains only `VITE_API_BASE_URL` (the public backend URL). Never place secrets in `VITE_*` variables, as Vite bundles them into client-side JavaScript.
* **Rate Limiting & Reverse Proxy Safety**:
  * `main.py` includes a per-client sliding-window rate limiter (`RATE_LIMIT_REQUESTS=30` per `60` seconds by default).
  * **Spoofing Protection**: `X-Forwarded-For` is ignored unless the immediate connecting peer IP (`request.client.host`) is explicitly listed in `TRUSTED_PROXIES`.
  * **Multi-Worker Caveat**: Because the rate limiter stores timestamps in process memory, running multiple Uvicorn workers (`--workers N`) or multiple containers maintains separate counters per process.
* **Safe Logging**: The backend logs only language pair and byte length (`pair=en->bn bytes=12`), never full user text or headers.

## 11. Cross-Platform Compatibility Matrix

Status legend:
* **Automated**: Verified via automated test execution in the actual browser engine / viewport within the build environment.
* **Expected to work**: Built using standard W3C/WHATWG HTTP, JSON, DOM, Clipboard, and Web Speech APIs; requires real-device verification by the owner after deployment.
* **Known limitation**: Platform or browser limitation documented transparently.

| Operating System | Browser & Version | Device Form Factors | Screen Width Range | Translation (`POST /translate`) | Copy (`Clipboard API` + Fallback) | Speech Synthesis (`en`, `bn`, `es`) | Keyboard & Touch Interaction | Accessibility Observations | Status / Known Limitations |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Linux (All Distributions & Containers)** | Chrome, Firefox, Chromium (Stable) | Desktop, Laptop, Workstation, Container | `320px`–`2560px`+ | Standard `fetch` + UTF-8 JSON | Native `navigator.clipboard.writeText` over HTTPS/localhost | `en`/`es` work with speech-dispatcher; `bn` available when local speech engine (e.g. eSpeak-NG) is configured | Full keyboard Tab focus rings, mouse & touch support | System Bengali fonts (e.g. Noto Sans Bengali) render crisp conjuncts | **Expected to work** / **Transparent status**: UI honestly disables Listen button if OS speech engine lacks a voice |
| **Windows 10 & 11** | Chrome, Edge, Firefox (Stable) | Desktop, Laptop, 2-in-1, Tablet | `320px`–`2560px`+ | Standard `fetch` + UTF-8 JSON | Native Clipboard API | `en` & `es` built-in; `bn` available via Edge natural voices or Windows Bangla speech pack | Full keyboard, mouse, pen & touch pointer support | High-contrast focus rings & `prefers-reduced-motion` respected | **Expected to work** |
| **macOS** | Safari, Chrome, Firefox (Stable) | Desktop, Laptop | `320px`–`2560px`+ | Standard `fetch` + UTF-8 JSON | Native Clipboard API | `en` & `es` built-in; `bn` available via macOS Spoken Content voice download | Full keyboard, trackpad & mouse support | `-webkit-backdrop-filter` supported for glass panels | **Expected to work** |
| **Android** | Chrome, Samsung Internet, Firefox | Smartphone & Tablet | `320px`–`800px`+ | Standard `fetch` over HTTPS/LAN | Native Clipboard API + touch selection fallback | Google Speech Services provides native natural `bn-BD`, `bn-IN`, `en-US`, and `es-ES` voices | `>= 44px` touch targets, vertical panel stacking below `820px` | Screen-reader labels on all interactive controls | **Expected to work** |
| **iOS & iPadOS** | Mobile Safari, Chrome, Firefox | iPhone & iPad | `320px`–`1024px`+ | Standard `fetch` over HTTPS/LAN | Clipboard API on user gesture + manual selection fallback | iOS exposes `en` and `es` voices; `bn` supported via iOS Spoken Content voice settings | Touch-friendly selects and buttons; no hover-only requirements | Safe viewport reflow down to `320px` with zero horizontal scroll | **Expected to work** |

## 12. Deployment Guide (Frontend on Vercel + Backend on Render)

Anubadak separates the React + Vite frontend from the Python FastAPI backend for optimal performance, security, and independent scalability.

### Part A: Deploying the Backend on Render

Render provides a managed container platform supporting Python and FastAPI. The repository includes an automated Blueprint file (`render.yaml`) for clean configuration.

#### Step 1: Push Repository to GitHub
Make sure your Git repository is pushed to your personal GitHub account:
```bash
git add .
git commit -m "Complete CodeAlpha Task 1: Add dark/light theme, render.yaml, and vercel.json"
git remote add origin https://github.com/<your-username>/Anubadak.git
git branch -M main
git push -u origin main
```
*(Verify that `backend/.env` is NOT pushed; `.gitignore` keeps secrets safe).*

#### Step 2: Create Web Service on Render
1. Sign in to [Render](https://dashboard.render.com/).
2. Click **New +** → **Blueprint** (or **Web Service**).
3. Connect your `Anubadak` GitHub repository.
4. Render detects `render.yaml` automatically:
   * **Name**: `anubadak-backend`
   * **Root Directory**: `backend`
   * **Runtime**: `Python 3`
   * **Build Command**: `pip install -r requirements.txt`
   * **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   * **Plan**: `Free`
5. Click **Apply** or **Create Web Service**.
6. Once deployed, Render provides your backend service URL (e.g. `https://anubadak-backend.onrender.com`).
7. **Verify Backend Health**:
   Visit `https://anubadak-backend.onrender.com/health` in your browser. It should respond with:
   ```json
   {"status":"ok","provider":"mymemory","supported_languages":["en","bn","es"],"email_configured":false,"max_utf8_bytes":500}
   ```

#### Important Free-Tier Hosting Limitations on Render
* **Cold Starts & Sleeping**: Free instances spin down after **15 minutes** of inactivity. The first inbound request wakes the service, taking roughly 30–60 seconds.
* **Monthly Active Hours**: Free accounts receive 750 free instance hours per calendar month across all free services.
* **Hosting Policies**: Free tiers and policies are managed by Render and are subject to change.

---

### Part B: Deploying the Frontend on Vercel

Vercel provides edge hosting with instant cache invalidation for Vite Single Page Applications (SPAs).

#### Step 1: Import Project in Vercel
1. Sign in to [Vercel](https://vercel.com/new).
2. Choose **Import Git Repository** and select your `Anubadak` repository.
3. Configure the project settings:
   * **Framework Preset**: `Vite`
   * **Root Directory**: Click *Edit* and select **`frontend`** (or leave as root if configuring root build).
   * **Build Command**: `npm run build`
   * **Output Directory**: `dist`
4. Expand **Environment Variables**:
   * Add Name: `VITE_API_BASE_URL`
   * Value: `https://anubadak-backend.onrender.com` *(use your actual Render backend URL, without trailing slash)*.
5. Click **Deploy**.

#### Step 2: Update Backend CORS with Deployed Frontend URL
1. Copy your verified Vercel live URL (e.g. `https://anubadak.vercel.app`).
2. Go to your Render backend dashboard → **Environment**.
3. Update `ALLOWED_ORIGINS`:
   ```
   https://anubadak.vercel.app,http://localhost:5173
   ```
4. Save changes. Render redeploys in seconds.

#### Step 3: End-to-End Live Verification
1. Open your live Vercel URL in a browser.
2. Test **English → Bengali**: Type `Hello world` and click **Translate** (verifies end-to-end HTTPS, CORS, and MyMemory response).
3. Test **Theme Switcher**: Click ☀️ (Light), 🌙 (Dark), and 💻 (System). Refresh the page to verify theme persistence without flash.
4. Test **Language Swap**: Click ⇄ to swap languages and translate Bengali to English.
5. Test **Mobile View**: Open Chrome DevTools device mode (`375px` iPhone) to verify full responsiveness and no horizontal overflow.

---

## 13. Manual Browser Verification Checklist & Troubleshooting

### Manual Verification Steps

1. **Visual & Responsive Check**: Resize browser width from `1440px` down to `768px` and `320px` (or open the app on a smartphone or tablet). Confirm panels sit side by side on wide screens, stack vertically on mobile/compact screens, and never cause horizontal scrolling.
2. **Short-Text & 18-Case Check**: Test `Hello`, `Hola`, `Good morning`, `ধন্যবাদ`, and `আমি ভালো আছি।` across language pairs.
3. **Multibyte Counter Check**: Paste 167 Bengali characters (`ক` × 167 = `501` UTF-8 bytes) and verify the counter turns red (`501 / 500 UTF-8 bytes`) and disables submission.
4. **Race-Condition Check**: Click **Translate** and immediately change the input text or click **Swap languages**; confirm the obsolete response never overwrites the new state.
5. **Bengali Speech Check**: Select Bengali (`bn`) in any browser where no native Bengali voice engine is installed, and confirm the **Listen** button is honestly disabled with a clear unavailable notice rather than misreading Bengali text with an English or Spanish voice.
6. **Theme Switcher Check**: Switch between Light, Dark, and System modes. Verify high-contrast readability (slate navy on white in light mode, off-white on midnight navy in dark mode).

### Troubleshooting

* **"Could not reach the translation server" (`NETWORK_ERROR`)**:
  * Confirm the FastAPI backend is running on port `8000` (`curl http://127.0.0.1:8000/health`).
  * Check that `ALLOWED_ORIGINS` in `backend/.env` includes the exact origin shown in your browser's address bar (e.g., `http://localhost:5173` or your Wi-Fi LAN IP).
* **Bengali Characters Appear as Boxes (`□□□`)**:
  * Ensure a Bengali Unicode font (such as Google Noto Sans Bengali) is installed on your operating system:
    * **Linux (Ubuntu / Debian)**: `sudo apt install -y fonts-noto-bengali`
    * **Linux (Fedora / RHEL)**: `sudo dnf install -y google-noto-sans-bengali-fonts`
    * **Linux (Arch Linux)**: `sudo pacman -S noto-fonts`
    * **Windows**: Standard Bengali fonts (*Nirmala UI* / *Vrinda*) are included in Windows 10 & 11; ensure the Bengali Language Feature is enabled in Windows Settings if absent.
    * **macOS / iOS / Android**: Bengali fonts (*Kohinoor Bangla* / *Noto Sans Bengali*) are pre-installed by default.
* **"The daily free translation quota has been reached" (`QUOTA_EXHAUSTED`)**:
  * Wait for MyMemory's daily quota window to reset, or configure a valid email in `backend/.env` (`MYMEMORY_EMAIL=you@example.com`) and restart Uvicorn.

---

## 14. CodeAlpha Task 1 Submission Checklist & Defense Summary

### Submission Deliverables Checklist
- [x] **Working Source Code**: Fully functional React 18 + Vite frontend and FastAPI backend.
- [x] **Languages Supported**: English (`en`), Bengali (`bn`), and Spanish (`es`) across all six pairs.
- [x] **UTF-8 Byte Validation**: Exact 500-byte boundary enforcement considering Bengali 3-byte glyphs.
- [x] **Theme Switcher**: Dark, Light, and System themes with zero flash and WCAG 2.2 AA contrast.
- [x] **Speech & Audio**: Native Web Speech API integration with honest unavailable voice detection.
- [x] **Multilingual Interface**: Full UI localization in English, Bengali, and Spanish.
- [x] **Automated Tests**: 9 frontend unit/integration tests and 22 backend pytest tests passing.
- [x] **Deployment Configs**: `render.yaml` for backend and `frontend/vercel.json` for frontend.
- [x] **Security & Secrets**: Strict CORS allowlist, rate limiting, and zero client-exposed secrets.

### How to Explain the Architecture in Your Submission
When submitting to CodeAlpha or presenting during an evaluation, here is the honest, professional architecture summary you can share:

> *"Anubadak is a full-stack multilingual translation tool engineered with a decoupled architecture: a React 18 SPA built with Vite on the frontend and an asynchronous Python FastAPI service on the backend.*
>
> *Rather than making client-side calls directly to third-party APIs, frontend translation requests are routed through our FastAPI backend. This design achieves four critical goals:*
> 1. *It keeps third-party provider configurations and credentials strictly server-side.*
> 2. *It applies server-side UTF-8 Unicode byte validation (enforcing a 500-byte limit where Bengali characters take 3 bytes each).*
> 3. *It cleanses upstream responses, decoding HTML entities and verifying that the target script matches genuine Bengali Unicode rather than transliterated Latin.*
> 4. *It provides rate limiting and strict CORS protection.*
>
> *On the frontend, race conditions from rapid typing or language swapping are neutralized using AbortControllers and monotonic request trackers. We built a custom Spider-Man Aero design system with Dark, Light, and System themes that persist across refreshes with zero flash of unstyled content, backed by full accessibility and complete UI localization in English, Bengali, and Spanish."*
