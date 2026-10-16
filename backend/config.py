"""Configuration module for the Anubadak backend."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import FrozenSet, Tuple

from dotenv import load_dotenv

# Load backend/.env if present without overriding explicitly passed environment variables
_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=_ENV_PATH, override=False)

SUPPORTED_LANGUAGES: FrozenSet[str] = frozenset({"en", "bn", "es"})
LANGUAGE_NAMES = {
    "en": "English",
    "bn": "Bengali",
    "es": "Spanish",
}
MAX_UTF8_BYTES: int = 500

_EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _parse_csv_list(raw: str) -> Tuple[str, ...]:
    """Parse a comma-separated string into a tuple of non-empty trimmed items."""
    if not raw:
        return ()
    items = []
    for item in raw.split(","):
        cleaned = item.strip()
        if cleaned and cleaned != "*":
            items.append(cleaned)
    return tuple(items)


def is_valid_email(value: str) -> bool:
    """Return True if value looks like a syntactically valid email address."""
    if not value or len(value) > 254:
        return False
    return bool(_EMAIL_REGEX.match(value.strip()))


@dataclass(frozen=True)
class Settings:
    """Immutable application settings loaded from environment variables."""

    mymemory_api_url: str = "https://api.mymemory.translated.net/get"
    mymemory_email: str = ""
    request_timeout_seconds: float = 10.0
    allowed_origins: Tuple[str, ...] = field(
        default=(
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:4173",
            "http://127.0.0.1:4173",
        )
    )
    rate_limit_requests: int = 30
    rate_limit_window_seconds: int = 60
    trusted_proxies: FrozenSet[str] = field(default_factory=frozenset)

    @property
    def email_configured(self) -> bool:
        """Return True only when a valid contact email is configured for MyMemory."""
        return is_valid_email(self.mymemory_email)


def load_settings() -> Settings:
    """Load and validate application settings from environment variables."""
    api_url = os.getenv(
        "MYMEMORY_API_URL", "https://api.mymemory.translated.net/get"
    ).strip()
    if not api_url:
        api_url = "https://api.mymemory.translated.net/get"

    raw_email = os.getenv("MYMEMORY_EMAIL", "").strip()
    email = raw_email if is_valid_email(raw_email) else ""

    raw_timeout = os.getenv("REQUEST_TIMEOUT_SECONDS", "10.0").strip()
    try:
        timeout = float(raw_timeout)
        if timeout <= 0 or timeout > 60:
            timeout = 10.0
    except ValueError:
        timeout = 10.0

    raw_origins = os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
    )
    origins = _parse_csv_list(raw_origins)
    if not origins:
        origins = (
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:4173",
            "http://127.0.0.1:4173",
        )

    raw_rl_requests = os.getenv("RATE_LIMIT_REQUESTS", "30").strip()
    try:
        rl_requests = max(1, int(raw_rl_requests))
    except ValueError:
        rl_requests = 30

    raw_rl_window = os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60").strip()
    try:
        rl_window = max(1, int(raw_rl_window))
    except ValueError:
        rl_window = 60

    raw_proxies = os.getenv("TRUSTED_PROXIES", "")
    trusted_proxies = frozenset(_parse_csv_list(raw_proxies))

    return Settings(
        mymemory_api_url=api_url,
        mymemory_email=email,
        request_timeout_seconds=timeout,
        allowed_origins=origins,
        rate_limit_requests=rl_requests,
        rate_limit_window_seconds=rl_window,
        trusted_proxies=trusted_proxies,
    )
