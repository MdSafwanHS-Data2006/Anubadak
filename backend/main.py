"""FastAPI application entry point for Anubadak (অনুবাদক)."""

from __future__ import annotations

import logging
import time
from collections import deque
from typing import Any, Deque, Dict, List, Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config import MAX_UTF8_BYTES, SUPPORTED_LANGUAGES, Settings, load_settings
from translator import (
    MyMemoryProvider,
    TranslationError,
    TranslationProvider,
    utf8_byte_length,
)

# Configure safe application logging (never log translation text or secrets)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("anubadak.api")


class TranslateRequest(BaseModel):
    """Request schema for POST /translate."""

    text: Optional[str] = None
    source_lang: Optional[str] = None
    target_lang: Optional[str] = None


class TranslateResponse(BaseModel):
    """Response schema for POST /translate."""

    translated_text: str
    source_lang: str
    target_lang: str
    provider: str


class HealthResponse(BaseModel):
    """Response schema for GET /health."""

    status: str
    provider: str
    supported_languages: List[str]
    email_configured: bool
    max_utf8_bytes: int


class SlidingWindowRateLimiter:
    """In-memory per-client sliding-window rate limiter.

    Note: Because state is stored in process memory, each Uvicorn worker or
    container instance maintains its own counter. This is designed for a
    beginner single-instance educational deployment.
    """

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: Dict[str, Deque[float]] = {}

    def is_allowed(self, client_key: str, now: Optional[float] = None) -> bool:
        current = time.monotonic() if now is None else now
        cutoff = current - self.window_seconds
        bucket = self._hits.get(client_key)
        if bucket is None:
            bucket = deque()
            self._hits[client_key] = bucket

        while bucket and bucket[0] <= cutoff:
            bucket.popleft()

        if len(bucket) >= self.max_requests:
            return False

        bucket.append(current)
        return True

    def clear(self) -> None:
        self._hits.clear()


def resolve_client_ip(request: Request, trusted_proxies: frozenset[str]) -> str:
    """Resolve client IP safely without blindly trusting X-Forwarded-For.

    X-Forwarded-For is only inspected when the immediate peer IP
    (request.client.host) is explicitly listed in trusted_proxies.
    """
    peer_ip = request.client.host if request.client and request.client.host else "unknown"
    if peer_ip in trusted_proxies:
        forwarded_for = request.headers.get("x-forwarded-for", "")
        if forwarded_for:
            # Take the right-most untrusted IP or first hop forwarded by the trusted proxy
            hops = [ip.strip() for ip in forwarded_for.split(",") if ip.strip()]
            for hop in reversed(hops):
                if hop not in trusted_proxies:
                    return hop
            if hops:
                return hops[0]
    return peer_ip


def format_error_response(status_code: int, code: str, message: str) -> JSONResponse:
    """Return a consistent JSON error payload understood by the frontend."""
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
            },
            "detail": message,
        },
    )


def create_app(
    settings: Optional[Settings] = None,
    provider: Optional[TranslationProvider] = None,
) -> FastAPI:
    """Create and configure the Anubadak FastAPI application."""
    active_settings = settings or load_settings()
    active_provider = provider or MyMemoryProvider(settings=active_settings)
    rate_limiter = SlidingWindowRateLimiter(
        max_requests=active_settings.rate_limit_requests,
        window_seconds=active_settings.rate_limit_window_seconds,
    )

    app = FastAPI(
        title="Anubadak (অনুবাদক) Translation API",
        description="Multilingual translation backend supporting English (en), Bengali (bn), and Spanish (es).",
        version="1.0.0",
    )

    app.state.settings = active_settings
    app.state.provider = active_provider
    app.state.rate_limiter = rate_limiter

    # Configure strict CORS for explicitly allowed frontend origins only
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(active_settings.allowed_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Accept"],
    )

    @app.exception_handler(TranslationError)
    async def handle_translation_error(
        _request: Request, exc: TranslationError
    ) -> JSONResponse:
        return format_error_response(
            status_code=exc.status_code,
            code=exc.code,
            message=exc.message,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _request: Request, _exc: RequestValidationError
    ) -> JSONResponse:
        return format_error_response(
            status_code=422,
            code="INVALID_REQUEST",
            message="Invalid translation request payload. Provide 'text', 'source_lang', and 'target_lang'.",
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(
        _request: Request, exc: Exception
    ) -> JSONResponse:
        logger.error("Unhandled error during request: %s", type(exc).__name__)
        return format_error_response(
            status_code=500,
            code="INTERNAL_ERROR",
            message="An unexpected server error occurred while processing the request.",
        )

    @app.get("/health", response_model=HealthResponse)
    async def health_check() -> Dict[str, Any]:
        """Return service status and safe configuration metadata without external calls."""
        current_settings: Settings = app.state.settings
        current_provider: TranslationProvider = app.state.provider
        return {
            "status": "ok",
            "provider": current_provider.provider_name,
            "supported_languages": ["en", "bn", "es"],
            "email_configured": current_settings.email_configured,
            "max_utf8_bytes": MAX_UTF8_BYTES,
        }

    @app.post("/translate", response_model=TranslateResponse)
    async def translate_text(
        payload: TranslateRequest,
        request: Request,
    ) -> Dict[str, str]:
        """Validate request, enforce rate limit, and translate via configured provider."""
        current_settings: Settings = app.state.settings
        current_limiter: SlidingWindowRateLimiter = app.state.rate_limiter
        current_provider: TranslationProvider = app.state.provider

        client_ip = resolve_client_ip(request, current_settings.trusted_proxies)
        if not current_limiter.is_allowed(client_ip):
            return format_error_response(
                status_code=429,
                code="RATE_LIMITED",
                message="Too many translation requests from your client. Please wait a moment before trying again.",
            )

        # Log metadata only — never log full user text or credentials
        byte_len = utf8_byte_length(payload.text or "")
        logger.info(
            "Translation request received: pair=%s->%s bytes=%d",
            payload.source_lang,
            payload.target_lang,
            byte_len,
        )

        result = await current_provider.translate(
            text=payload.text or "",
            source_lang=payload.source_lang or "",
            target_lang=payload.target_lang or "",
        )

        return {
            "translated_text": result.translated_text,
            "source_lang": result.source_lang,
            "target_lang": result.target_lang,
            "provider": result.provider,
        }

    return app


app = create_app()

if __name__ == "__main__":
    import os
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
