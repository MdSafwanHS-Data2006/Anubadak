# Anubadak (অনুবাদক)

Anubadak is a lightweight, responsive web application for translating text between **English**, **Bengali (বাংলা)**, and **Spanish (Español)** in all six directions.

I built this project to learn full-stack web development with **React 18**, **Vite**, and **Python FastAPI**. It connects to the free MyMemory translation API through a dedicated backend, tracks live UTF-8 byte usage to handle multi-byte Unicode characters accurately, features a Spider-Man-inspired Aero theme with Dark, Light, and System modes, and provides browser-native speech synthesis.

---

## Features

- **Six translation directions**: Supports English ↔ Bengali, English ↔ Spanish, and Bengali ↔ Spanish.
- **Direct language selection & quick swap**: Choose your source and target languages directly from dropdowns, or click the swap button (**⇄**) to instantly switch directions and move your translation into the source input.
- **Accurate UTF-8 byte counter (500-byte limit)**: Bengali Unicode characters take 3 bytes each in UTF-8. The live counter tracks both characters and exact UTF-8 bytes (`chars • bytes / 500 bytes`), so you know exactly when you are approaching the provider's 500-byte boundary.
- **Dark, Light, and System themes**: A custom theme inspired by Spider-Man with blue, cyan, and red glassmorphism surfaces. You can pick Dark, Light, or follow your operating system's theme. Your preference is saved in `localStorage`, and an inline script ensures there is zero flash of the wrong theme when you refresh.
- **Multilingual interface**: The entire application (buttons, headers, error messages, and dialogs) can be viewed in English, Bengali (বাংলা), or Spanish (Español).
- **Text-to-speech audio**: Listen to source and translated text using your browser's Web Speech API, with an adjustable playback speed slider (0.5x to 1.5x). If your browser or operating system doesn't have a genuine Bengali voice installed, the app honestly lets you know instead of substituting an English or Spanish voice.
- **One-click copy with fallback**: Copy translated text to your clipboard with a single click and visual confirmation. If your browser restricts clipboard access, the app automatically selects the text so you can press `Ctrl+C` (or `Cmd+C`).
- **Smooth request handling**: If you edit your text or swap languages while a translation is in progress, older requests are automatically canceled so outdated translations never overwrite your new work.

---

## How It Works

Anubadak uses a decoupled architecture where the React frontend and FastAPI backend have clear, separate responsibilities:

```
[ User in Browser ]
       │
       ▼
[ React 18 + Vite Frontend ]
  • Manages theme (Dark / Light / System) and UI language (EN / BN / ES)
  • Tracks character count and UTF-8 byte usage in real time
  • Inspects local browser speech voices
  • Cancels outdated requests using AbortController
       │
       │  POST /translate (JSON)
       ▼
[ Python FastAPI Backend ]
  • Validates input size (<= 500 UTF-8 bytes) and language pairs
  • Applies a sliding-window rate limiter per client
  • Sends async request to MyMemory API via HTTPX
  • Decodes HTML entities and checks that output script matches target language
       │
       │  GET /get?q=...&langpair=...
       ▼
[ MyMemory Translation API ]
```

### Why route requests through our own backend?

1. **Security & clean code**: Keeps third-party provider configurations and contact emails on the server instead of bundling them into client-side JavaScript.
2. **Accurate validation**: Enforces the 500-byte UTF-8 limit on the server before sending outbound requests to the translation provider.
3. **Response cleanup**: The MyMemory API sometimes returns HTML-escaped entities (like `&#39;` for apostrophes). The backend decodes these and checks that Bengali translations contain genuine Bengali Unicode script rather than transliterated Latin characters.
4. **Rate limiting & CORS**: Protects against rapid spam requests and ensures only allowed frontend domains can call the API.

---

## Tech Stack

- **Frontend**: React 18, Vite, Vanilla CSS (CSS variables, glassmorphism, responsive layout), Web Speech API.
- **Backend**: Python 3.11+, FastAPI, Uvicorn (ASGI server), HTTPX (async HTTP client), Pydantic.
- **Translation Provider**: [MyMemory Translation API](https://mymemory.translated.net/).
- **Testing**: Vitest / Node test runner, Pytest, ESLint.

---

## Project Structure

```
Anubadak/
├── README.md
├── LICENSE                    # MIT License
├── render.yaml                # Render Blueprint configuration for backend deployment
├── backend/
│   ├── main.py                # FastAPI app, /health and /translate endpoints, CORS, rate limiter
│   ├── translator.py          # MyMemory provider integration, UTF-8 and script validation
│   ├── config.py              # Environment variables and Settings dataclass
│   ├── requirements.txt       # Python dependencies
│   ├── .env.example           # Backend environment template
│   └── tests/                 # Pytest test suite
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── vercel.json            # Vercel SPA routing rewrites
    ├── index.html             # HTML entry point with anti-flash theme detection
    ├── src/
    │   ├── App.jsx            # Main workspace component
    │   ├── index.css          # Spider-Man Aero design system (Dark & Light themes)
    │   ├── components/        # Header, LanguageBar, SpeechControls, AboutModal, Footer
    │   ├── hooks/             # useTheme, useTranslation, useSpeech
    │   ├── services/api.js    # Backend API client with timeout and error mapping
    │   ├── utils/             # UTF-8 counter, speech detection, clipboard helper, i18n
    │   └── locales/           # Translation files (en.json, bn.json, es.json)
    └── tests/                 # Frontend automated test suite
```

---

## Running Locally

### Prerequisites

Ensure you have **Python 3.11+**, **Node.js 18+**, and **Git** installed on your system.

On **Fedora Linux**:
```bash
sudo dnf install -y python3 python3-pip nodejs npm git google-noto-sans-bengali-fonts
```

On **Ubuntu / Debian**:
```bash
sudo apt update && sudo apt install -y python3 python3-venv python3-pip nodejs npm git fonts-noto-bengali
```

### 1. Set Up and Start the Backend

In your first terminal:

```bash
cd backend

# Create and activate a Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create your local .env configuration from the example template
cp .env.example .env

# Start the development server
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Verify the backend is running:
- Health check: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

### 2. Set Up and Start the Frontend

In a second terminal:

```bash
cd frontend

# Install Node dependencies
npm install

# Create your local .env configuration from the example template
cp .env.example .env

# Start the Vite development server
npm run dev
```

Open **`http://localhost:5173`** in your browser.

---

## Configuration & Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `ALLOWED_ORIGINS` | `https://anubadak.vercel.app,http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173` | Comma-separated list of allowed frontend URLs for CORS. |
| `MYMEMORY_EMAIL` | *(empty)* | Optional contact email for MyMemory to increase the free daily limit (~50,000 characters). |
| `REQUEST_TIMEOUT_SECONDS` | `15.0` | Timeout for outbound translation requests. |
| `RATE_LIMIT_REQUESTS` | `30` | Maximum requests allowed per IP address within the rate-limit window. |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Duration of the rate-limit sliding window in seconds. |

### Frontend (`frontend/.env`)

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `http://localhost:8000` | URL of the running FastAPI backend (use your production backend URL when deploying). |

---

## Running Tests

### Frontend Tests & Linter
```bash
cd frontend
npm test        # Runs unit and integration tests (UTF-8, languages, theme, locale keys)
npm run lint    # Runs ESLint code style checks
npm run build   # Verifies the production bundle builds without errors
```

### Backend Tests
```bash
cd backend
source .venv/bin/activate
pytest -v       # Runs FastAPI endpoint tests, CORS checks, and validation suites
```

---

## Deployment Guide

Anubadak is designed to be deployed with the backend on **Render** (free web service) and the frontend on **Vercel** (free hobby plan).

### Step 1: Push Code to GitHub

Make sure your project is committed and pushed to your personal GitHub repository:
```bash
git add .
git commit -m "Configure project for deployment"
git remote add origin https://github.com/<your-username>/Anubadak.git
git branch -M main
git push -u origin main
```
*(Your `.gitignore` automatically prevents local `.env` files and virtual environments from being committed).*

### Step 2: Deploy the Backend on Render

1. Sign in to [Render](https://dashboard.render.com/) with GitHub.
2. Click **New +** → **Blueprint** and connect your `Anubadak` repository (Render will automatically read [`render.yaml`](render.yaml)).
   - Alternatively, choose **Web Service**:
     - **Root Directory**: `backend`
     - **Runtime**: `Python 3`
     - **Build Command**: `pip install -r requirements.txt`
     - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
     - **Plan**: `Free`
3. Click **Create Web Service**.
4. Once deployed, copy your backend URL (e.g., `https://anubadak-backend.onrender.com`).
5. Test it by opening `https://anubadak-backend.onrender.com/health` in your browser.

### Step 3: Deploy the Frontend on Vercel

1. Sign in to [Vercel](https://vercel.com/new) with GitHub.
2. Click **Import** next to your `Anubadak` repository.
3. Configure the project:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click *Edit* and select **`frontend`**
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Under **Environment Variables**, add:
   - Name: `VITE_API_BASE_URL`
   - Value: `https://anubadak-backend.onrender.com` *(your actual Render backend URL without trailing slash)*
5. Click **Deploy**. Vercel will build and assign you a live URL (e.g., `https://anubadak.vercel.app`).

### Step 4: Link CORS on Render

1. Copy your live Vercel frontend URL.
2. Go to your **Render Dashboard** → click your backend service → **Environment**.
3. Update `ALLOWED_ORIGINS` to include your Vercel URL:
   ```
   https://anubadak.vercel.app,http://localhost:5173
   ```
4. Save changes. Render will redeploy in seconds, and your live web app is ready.

---

## Known Limitations

- **Free-Tier Cold Starts**: On Render's free tier, the backend spins down after 15 minutes of inactivity. When visiting the app after it has been sleeping, the first translation request can take 30 to 60 seconds to wake up the service. Subsequent translations respond promptly.
- **MyMemory Free Quota**: Without an email configured, MyMemory allows roughly 5,000 characters per day per IP. You can increase this allowance to roughly 50,000 characters per day by setting `MYMEMORY_EMAIL` in the backend environment.
- **Bengali Speech Voices in Browsers**: Text-to-speech depends on whether your operating system and browser expose a voice for the requested language. Many desktop Linux distributions do not ship with a native Bengali speech voice by default. Instead of faking Bengali pronunciation with an English voice, Anubadak honestly disables the button and displays a helpful message. Translation and copying always continue to work.
- **500 UTF-8 Byte Limit**: The translation provider limits queries to 500 UTF-8 bytes. Because Bengali characters take 3 bytes each in UTF-8, long Bengali passages must be translated in chunks of approximately 160 characters.

---

## License

This project is licensed under the [MIT License](LICENSE).
