"""API integration tests for Anubadak's FastAPI routes, security, rate limiting, and CORS."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Dict

from fastapi.testclient import TestClient

_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from config import Settings
from main import create_app, resolve_client_ip
from translator import (
    ProviderUnavailableError,
    QuotaExhaustedError,
    TranslationProvider,
    TranslationResult,
    TranslationTimeoutError,
    validate_translation_Input,
)


class StubTranslationProvider(TranslationProvider):
    """Deterministic stub provider for testing FastAPI endpoints without external HTTP calls."""

    provider_name = "mymemory"

    def __init__(self) -> None:
        self.call_count = 0
        self.raise_error: Exception | None = None
        self.canned_responses: Dict[str, str] = {
            "en|bn|Good morning": "শুভ সকাল",
            "bn|en|আমি ভালো আছি।": "I am fine.",
            "en|es|Hello": "Hola",
            "es|en|Hola": "Hello",
            "bn|es|ধন্যবাদ": "Gracias",
            "es|bn|Gracias": "ধন্যবাদ",
        }

    async def translate(
        self, text: str, source_lang: str, target_lang: str
    ) -> TranslationResult:
        self.call_count += 1
        cleaned, src, tgt = validate_translation_Input(text, source_lang, target_lang)
        if self.raise_error is not None:
            raise self.raise_error
        key = f"{src}|{tgt}|{cleaned}"
        translated = self.canned_responses.get(key)
        if translated is None:
            translated = "অনুবাদ সফল" if tgt == "bn" else "Translated output"
        return TranslationResult(
            translated_text=translated,
            source_lang=src,
            target_lang=tgt,
            provider=self.provider_name,
        )


class TestFastAPIEndpoints(unittest.TestCase):
    """Integration tests for /health, /translate, CORS, rate limiting, and proxy trust."""

    def setUp(self) -> None:
        self.stub_provider = StubTranslationProvider()
        self.settings = Settings(
            mymemory_email="secret-maintainer@example.com",
            allowed_origins=("http://localhost:5173", "https://anubadak.vercel.app"),
            rate_limit_requests=5,
            rate_limit_window_seconds=60,
            trusted_proxies=frozenset({"10.0.0.1"}),
        )
        self.app = create_app(settings=self.settings, provider=self.stub_provider)
        self.client = TestClient(self.app)

    def test_health_endpoint_does_not_leak_secrets_or_call_provider(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["provider"], "mymemory")
        self.assertEqual(data["supported_languages"], ["en", "bn", "es"])
        self.assertTrue(data["email_configured"])
        self.assertEqual(data["max_utf8_bytes"], 500)
        # Ensure actual email address is never leaked in response
        self.assertNotIn("secret-maintainer@example.com", response.text)
        self.assertEqual(self.stub_provider.call_count, 0)

    def test_translate_all_six_directions(self) -> None:
        pairs = [
            ("en", "bn", "Good morning", "শুভ সকাল"),
            ("bn", "en", "আমি ভালো আছি।", "I am fine."),
            ("en", "es", "Hello", "Hola"),
            ("es", "en", "Hola", "Hello"),
            ("bn", "es", "ধন্যবাদ", "Gracias"),
            ("es", "bn", "Gracias", "ধন্যবাদ"),
        ]
        for idx, (src, tgt, text, expected) in enumerate(pairs):
            # Reset rate limiter between pairs
            self.app.state.rate_limiter.clear()
            res = self.client.post(
                "/translate",
                json={"text": text, "source_lang": src, "target_lang": tgt},
            )
            self.assertEqual(res.status_code, 200, f"Failed on pair {idx}: {res.text}")
            body = res.json()
            self.assertEqual(body["translated_text"], expected)
            self.assertEqual(body["source_lang"], src)
            self.assertEqual(body["target_lang"], tgt)
            self.assertEqual(body["provider"], "mymemory")

    def test_translate_validation_errors_return_structured_json(self) -> None:
        # Empty text
        res_empty = self.client.post(
            "/translate",
            json={"text": "   ", "source_lang": "en", "target_lang": "bn"},
        )
        self.assertEqual(res_empty.status_code, 422)
        self.assertEqual(res_empty.json()["error"]["code"], "EMPTY_TEXT")

        # Identical languages
        res_same = self.client.post(
            "/translate",
            json={"text": "Hello", "source_lang": "bn", "target_lang": "bn"},
        )
        self.assertEqual(res_same.status_code, 422)
        self.assertEqual(res_same.json()["error"]["code"], "IDENTICAL_LANGUAGES")

        # Over 500 UTF-8 bytes
        res_long = self.client.post(
            "/translate",
            json={"text": "ক" * 167, "source_lang": "bn", "target_lang": "en"},
        )
        self.assertEqual(res_long.status_code, 422)
        self.assertEqual(res_long.json()["error"]["code"], "TEXT_TOO_LONG")

    def test_translate_upstream_error_mapping(self) -> None:
        self.stub_provider.raise_error = QuotaExhaustedError()
        res_quota = self.client.post(
            "/translate",
            json={"text": "Hello", "source_lang": "en", "target_lang": "bn"},
        )
        self.assertEqual(res_quota.status_code, 429)
        self.assertEqual(res_quota.json()["error"]["code"], "QUOTA_EXHAUSTED")

        self.stub_provider.raise_error = TranslationTimeoutError()
        res_timeout = self.client.post(
            "/translate",
            json={"text": "Hello", "source_lang": "en", "target_lang": "bn"},
        )
        self.assertEqual(res_timeout.status_code, 504)
        self.assertEqual(res_timeout.json()["error"]["code"], "TRANSLATION_TIMEOUT")

        self.stub_provider.raise_error = ProviderUnavailableError()
        res_unavail = self.client.post(
            "/translate",
            json={"text": "Hello", "source_lang": "en", "target_lang": "bn"},
        )
        self.assertEqual(res_unavail.status_code, 503)
        self.assertEqual(res_unavail.json()["error"]["code"], "PROVIDER_UNAVAILABLE")

    def test_rate_limiting_enforced_and_ignores_spoofed_xff_from_untrusted_peer(self) -> None:
        # TestClient peer host is "testclient" (not in trusted_proxies={"10.0.0.1"}).
        # Even if the client spoofs a different X-Forwarded-For on every request,
        # the rate limiter must key by "testclient" and block the 6th request.
        for i in range(5):
            res = self.client.post(
                "/translate",
                json={"text": "Hello", "source_lang": "en", "target_lang": "es"},
                headers={"X-Forwarded-For": f"203.0.113.{i + 1}"},
            )
            self.assertEqual(res.status_code, 200)

        res_blocked = self.client.post(
            "/translate",
            json={"text": "Hello", "source_lang": "en", "target_lang": "es"},
            headers={"X-Forwarded-For": "203.0.113.99"},
        )
        self.assertEqual(res_blocked.status_code, 429)
        self.assertEqual(res_blocked.json()["error"]["code"], "RATE_LIMITED")

    def test_trusted_proxy_ip_extraction(self) -> None:
        class DummyClient:
            def __init__(self, host: str) -> None:
                self.host = host

        class DummyRequest:
            def __init__(self, peer_host: str, xff: str) -> None:
                self.client = DummyClient(peer_host)
                self.headers = {"x-forwarded-for": xff} if xff else {}

        trusted = frozenset({"10.0.0.1", "10.0.0.2"})
        # Untrusted peer attempting to spoof X-Forwarded-For
        req_untrusted = DummyRequest("192.168.1.50", "1.2.3.4")
        self.assertEqual(resolve_client_ip(req_untrusted, trusted), "192.168.1.50")

        # Trusted proxy forwarding real client IP
        req_trusted = DummyRequest("10.0.0.1", "198.51.100.42, 10.0.0.2")
        self.assertEqual(resolve_client_ip(req_trusted, trusted), "198.51.100.42")

    def test_cors_allows_configured_origin_and_blocks_unlisted_origin(self) -> None:
        allowed_res = self.client.options(
            "/translate",
            headers={
                "Origin": "https://anubadak.vercel.app",
                "Access-Control-Request-Method": "POST",
            },
        )
        self.assertEqual(
            allowed_res.headers.get("access-control-allow-origin"),
            "https://anubadak.vercel.app",
        )

        disallowed_res = self.client.options(
            "/translate",
            headers={
                "Origin": "https://malicious-site.example.org",
                "Access-Control-Request-Method": "POST",
            },
        )
        self.assertIsNone(disallowed_res.headers.get("access-control-allow-origin"))


if __name__ == "__main__":
    unittest.main()
