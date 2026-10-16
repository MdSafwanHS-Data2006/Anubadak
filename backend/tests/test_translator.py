"""Deterministic unit and regression tests for Anubadak's translator module."""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

# Ensure backend directory is importable when running from repository root or backend/
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from config import MAX_UTF8_BYTES, Settings
from translator import (
    InvalidInputError,
    InvalidProviderResponseError,
    MyMemoryProvider,
    ProviderUnavailableError,
    QuotaExhaustedError,
    TranslationTimeoutError,
    contains_bengali_script,
    decode_and_clean_text,
    is_junk_translation,
    utf8_byte_length,
    validate_translation_Input,
)


def make_mock_client(
    payload: Optional[Dict[str, Any]] = None,
    status_code: int = 200,
    raw_body: Optional[bytes] = None,
    raise_exc: Optional[Exception] = None,
    captured_requests: Optional[List[httpx.Request]] = None,
) -> httpx.AsyncClient:
    """Create an httpx.AsyncClient backed by an in-memory MockTransport."""

    async def handler(request: httpx.Request) -> httpx.Response:
        if captured_requests is not None:
            captured_requests.append(request)
        if raise_exc is not None:
            raise raise_exc
        if raw_body is not None:
            return httpx.Response(status_code=status_code, content=raw_body)
        return httpx.Response(status_code=status_code, json=payload or {})

    transport = httpx.MockTransport(handler)
    return httpx.AsyncClient(transport=transport)


# 18 required regression cases from Section 9
REGRESSION_CASES_18 = [
    # (case_id, source_lang, target_lang, input_text, mock_translated, expected_substrings)
    (
        1,
        "en",
        "bn",
        "Good morning.",
        "সুপ্রভাত।",
        ("সুপ্রভাত", "শুভ সকাল"),
    ),
    (
        2,
        "en",
        "bn",
        "Thank you very much.",
        "আপনাকে অনেক ধন্যবাদ।",
        ("ধন্যবাদ",),
    ),
    (
        3,
        "bn",
        "en",
        "আমি ভালো আছি।",
        "I am fine.",
        ("I am fine", "I am doing well"),
    ),
    (
        4,
        "bn",
        "en",
        "আপনার সাথে দেখা করে ভালো লাগলো।",
        "Nice to meet you.",
        ("Nice to meet you", "pleased to meet you"),
    ),
    (
        5,
        "en",
        "es",
        "Where is the nearest bus station?",
        "¿Dónde está la estación de autobuses más cercana?",
        ("estación de autobuses",),
    ),
    (
        6,
        "es",
        "en",
        "¿Cuánto cuesta esto?",
        "How much does this cost?",
        ("How much", "cost"),
    ),
    (
        7,
        "bn",
        "es",
        "আমি বাংলাদেশ থেকে এসেছি।",
        "Vengo de Bangladesh.",
        ("Bangladesh",),
    ),
    (
        8,
        "es",
        "bn",
        "Muchas gracias por tu ayuda.",
        "তোমার সাহায্যের জন্য অনেক ধন্যবাদ।",
        ("ধন্যবাদ", "সাহায্য"),
    ),
    (
        9,
        "en",
        "bn",
        "I'm looking forward to seeing you.",
        "আপনার সাথে দেখা করার অপেক্ষায় রইলাম।",
        ("দেখা", "অপেক্ষা"),
    ),
    (
        10,
        "en",
        "es",
        "It's raining cats and dogs.",
        "Está lloviendo a cántaros.",
        ("lloviendo",),
    ),
    (
        11,
        "es",
        "en",
        "No hay mal que por bien no venga.",
        "Every cloud has a silver lining.",
        ("silver lining", "good"),
    ),
    (
        12,
        "bn",
        "en",
        "মাথা খারাপ করো না।",
        "Don't stress yourself out.",
        ("Don't", "lose your mind", "stress"),
    ),
    (
        13,
        "en",
        "bn",
        "Please don't share my personal information.",
        "অনুগ্রহ করে আমার ব্যক্তিগত তথ্য শেয়ার করবেন না।",
        ("না", "তথ্য"),
    ),
    (
        14,
        "en",
        "es",
        "I didn't say he stole the money.",
        "No dije que él robara el dinero.",
        ("No", "dinero"),
    ),
    (
        15,
        "es",
        "bn",
        "No quiero café, quiero té.",
        "আমি কফি চাই না, আমি চা চাই।",
        ("কফি", "চা", "না"),
    ),
    (
        16,
        "bn",
        "es",
        "আজ আবহাওয়া খুব সুন্দর।",
        "Hoy hace muy buen tiempo.",
        ("Hoy", "tiempo"),
    ),
    (
        17,
        "en",
        "bn",
        "The meeting has been postponed until tomorrow.",
        "আগামীকাল পর্যন্ত সভাটি স্থগিত করা হয়েছে।",
        ("আগামীকাল", "স্থগিত"),
    ),
    (
        18,
        "es",
        "en",
        "Aunque estaba cansada, terminó el trabajo.",
        "Although she was tired, she finished the work.",
        ("Although", "tired", "work"),
    ),
]

# Short-text regression matrix across all 6 directions
SHORT_TEXT_DIRECTIONS = [
    ("en", "bn", "Hello", "হ্যালো"),
    ("en", "bn", "Good morning", "শুভ সকাল"),
    ("en", "es", "Hello", "Hola"),
    ("en", "es", "Good morning", "Buenos días"),
    ("es", "en", "Hola", "Hello"),
    ("es", "bn", "Hola", "হ্যালো"),
    ("bn", "en", "ধন্যবাদ", "Thank you"),
    ("bn", "en", "আমি ভালো আছি।", "I am fine."),
    ("bn", "es", "ধন্যবাদ", "Gracias"),
    ("bn", "es", "আমি ভালো আছি।", "Estoy bien."),
]


class TestTranslatorValidation(unittest.IsolatedAsyncioTestCase):
    """Tests for input validation, UTF-8 byte boundary, candidate selection, and error handling."""

    def setUp(self) -> None:
        self.settings = Settings(
            mymemory_api_url="https://api.mymemory.translated.net/get",
            mymemory_email="",
            request_timeout_seconds=5.0,
        )

    def test_utf8_byte_length_vs_character_count(self) -> None:
        # "অনুবাদক" has 7 Unicode code points, each 3 UTF-8 bytes -> 21 bytes
        word = "অনুবাদক"
        self.assertEqual(len(word), 7)
        self.assertEqual(utf8_byte_length(word), 21)

    def test_500_byte_boundary_ascii(self) -> None:
        exact_500 = "a" * MAX_UTF8_BYTES
        cleaned, src, tgt = validate_translation_Input(exact_500, "en", "es")
        self.assertEqual(len(cleaned), 500)
        self.assertEqual((src, tgt), ("en", "es"))

        over_501 = "a" * (MAX_UTF8_BYTES + 1)
        with self.assertRaises(InvalidInputError) as ctx:
            validate_translation_Input(over_501, "en", "es")
        self.assertEqual(ctx.exception.code, "TEXT_TOO_LONG")
        self.assertEqual(ctx.exception.status_code, 422)

    def test_500_byte_boundary_multibyte_bengali(self) -> None:
        # 'ক' is 3 bytes in UTF-8. 166 * 3 = 498 bytes (valid). 167 * 3 = 501 bytes (invalid).
        valid_bn = "ক" * 166
        self.assertEqual(utf8_byte_length(valid_bn), 498)
        cleaned, src, tgt = validate_translation_Input(valid_bn, "bn", "en")
        self.assertEqual(cleaned, valid_bn)

        over_bn = "ক" * 167
        self.assertEqual(len(over_bn), 167)  # Only 167 chars, but 501 UTF-8 bytes!
        self.assertEqual(utf8_byte_length(over_bn), 501)
        with self.assertRaises(InvalidInputError) as ctx:
            validate_translation_Input(over_bn, "bn", "en")
        self.assertEqual(ctx.exception.code, "TEXT_TOO_LONG")

    def test_empty_and_whitespace_rejected(self) -> None:
        for invalid in [None, "", "   ", "\n\t  \n"]:
            with self.assertRaises(InvalidInputError) as ctx:
                validate_translation_Input(invalid, "en", "bn")
            self.assertEqual(ctx.exception.code, "EMPTY_TEXT")

    def test_unsupported_and_identical_languages_rejected(self) -> None:
        with self.assertRaises(InvalidInputError) as ctx:
            validate_translation_Input("Hello", "fr", "en")
        self.assertEqual(ctx.exception.code, "UNSUPPORTED_SOURCE_LANG")

        with self.assertRaises(InvalidInputError) as ctx:
            validate_translation_Input("Hello", "en", "hi")
        self.assertEqual(ctx.exception.code, "UNSUPPORTED_TARGET_LANG")

        for lang in ("en", "bn", "es"):
            with self.assertRaises(InvalidInputError) as ctx:
                validate_translation_Input("Hello", lang, lang)
            self.assertEqual(ctx.exception.code, "IDENTICAL_LANGUAGES")

    async def test_18_regression_cases(self) -> None:
        for (
            case_id,
            src,
            tgt,
            input_text,
            mock_translated,
            expected_any,
        ) in REGRESSION_CASES_18:
            with self.subTest(case_id=case_id, pair=f"{src}->{tgt}"):
                payload = {
                    "responseData": {"translatedText": mock_translated, "match": 0.95},
                    "responseStatus": 200,
                    "quotaFinished": False,
                    "matches": [
                        {
                            "segment": input_text,
                            "translation": mock_translated,
                            "match": 0.95,
                            "quality": "85",
                        }
                    ],
                }
                async with make_mock_client(payload=payload) as client:
                    provider = MyMemoryProvider(self.settings, http_client=client)
                    result = await provider.translate(input_text, src, tgt)

                self.assertEqual(result.source_lang, src)
                self.assertEqual(result.target_lang, tgt)
                self.assertEqual(result.provider, "mymemory")
                self.assertTrue(
                    any(exp.lower() in result.translated_text.lower() for exp in expected_any),
                    f"Case {case_id} output '{result.translated_text}' did not match any of {expected_any}",
                )
                if tgt == "bn":
                    self.assertTrue(contains_bengali_script(result.translated_text))

    async def test_short_text_all_six_directions(self) -> None:
        for src, tgt, text, translated in SHORT_TEXT_DIRECTIONS:
            with self.subTest(pair=f"{src}->{tgt}", text=text):
                payload = {
                    "responseData": {"translatedText": translated, "match": 1.0},
                    "responseStatus": 200,
                    "matches": [
                        {
                            "segment": text,
                            "translation": translated,
                            "match": 1.0,
                            "quality": "90",
                        }
                    ],
                }
                async with make_mock_client(payload=payload) as client:
                    provider = MyMemoryProvider(self.settings, http_client=client)
                    res = await provider.translate(text, src, tgt)
                self.assertEqual(res.translated_text, translated)
                if tgt == "bn":
                    self.assertTrue(contains_bengali_script(res.translated_text))

    async def test_rejects_junk_and_selects_valid_candidate_from_matches(self) -> None:
        # Primary translatedText is "testcase", but matches has a valid Bengali translation
        payload = {
            "responseData": {"translatedText": "testcase", "match": 1.0},
            "responseStatus": 200,
            "matches": [
                {
                    "segment": "Hello",
                    "translation": "testcase",
                    "match": 1.0,
                    "quality": "74",
                },
                {
                    "segment": "Hello",
                    "translation": "হ্যালো",
                    "match": 0.92,
                    "quality": "85",
                },
            ],
        }
        async with make_mock_client(payload=payload) as client:
            provider = MyMemoryProvider(self.settings, http_client=client)
            result = await provider.translate("Hello", "en", "bn")
        self.assertEqual(result.translated_text, "হ্যালো")

    async def test_rejects_romanized_bengali_when_bengali_script_required(self) -> None:
        # Primary is romanized "Shuvo shokal", match has proper Bengali Unicode "শুভ সকাল"
        payload = {
            "responseData": {"translatedText": "Shuvo shokal", "match": 0.99},
            "responseStatus": 200,
            "matches": [
                {
                    "segment": "Good morning",
                    "translation": "Shuvo shokal",
                    "match": 0.99,
                    "quality": "80",
                },
                {
                    "segment": "Good morning",
                    "translation": "শুভ সকাল",
                    "match": 0.90,
                    "quality": "85",
                },
            ],
        }
        async with make_mock_client(payload=payload) as client:
            provider = MyMemoryProvider(self.settings, http_client=client)
            result = await provider.translate("Good morning", "en", "bn")
        self.assertEqual(result.translated_text, "শুভ সকাল")

        # If ONLY romanized Bengali is returned, raise InvalidProviderResponseError
        bad_payload = {
            "responseData": {"translatedText": "Shuvo shokal", "match": 0.99},
            "responseStatus": 200,
            "matches": [],
        }
        async with make_mock_client(payload=bad_payload) as client:
            provider = MyMemoryProvider(self.settings, http_client=client)
            with self.assertRaises(InvalidProviderResponseError):
                await provider.translate("Good morning", "en", "bn")

    async def test_unchanged_text_handling(self) -> None:
        # Unchanged "Hello" from en -> es must be rejected if no valid translation exists
        unchanged_hello = {
            "responseData": {"translatedText": "Hello", "match": 1.0},
            "responseStatus": 200,
            "matches": [],
        }
        async with make_mock_client(payload=unchanged_hello) as client:
            provider = MyMemoryProvider(self.settings, http_client=client)
            with self.assertRaises(InvalidProviderResponseError) as ctx:
                await provider.translate("Hello", "en", "es")
            self.assertEqual(ctx.exception.code, "TRANSLATION_UNAVAILABLE")

        # Legitimate single-word cognate "Hotel" between en and es is permitted
        cognate_payload = {
            "responseData": {"translatedText": "Hotel", "match": 1.0},
            "responseStatus": 200,
            "matches": [],
        }
        async with make_mock_client(payload=cognate_payload) as client:
            provider = MyMemoryProvider(self.settings, http_client=client)
            res = await provider.translate("Hotel", "en", "es")
            self.assertEqual(res.translated_text, "Hotel")

    async def test_html_entity_decoding_and_negation_preservation(self) -> None:
        payload = {
            "responseData": {
                "translatedText": "I didn&amp;#39;t say he stole the &quot;money&quot;.",
                "match": 0.95,
            },
            "responseStatus": 200,
            "matches": [],
        }
        async with make_mock_client(payload=payload) as client:
            provider = MyMemoryProvider(self.settings, http_client=client)
            res = await provider.translate("No dije que él robara el dinero.", "es", "en")
        self.assertEqual(res.translated_text, 'I didn\'t say he stole the "money".')

    async def test_quota_exhausted_detection(self) -> None:
        quota_payloads = [
            {
                "responseData": {"translatedText": ""},
                "responseStatus": 429,
                "quotaFinished": True,
                "responseDetails": "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY.",
            },
            {
                "responseData": {
                    "translatedText": "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN 12 HOURS"
                },
                "responseStatus": 200,
                "quotaFinished": False,
            },
        ]
        for q_payload in quota_payloads:
            async with make_mock_client(payload=q_payload, status_code=200) as client:
                provider = MyMemoryProvider(self.settings, http_client=client)
                with self.assertRaises(QuotaExhaustedError) as ctx:
                    await provider.translate("Hello", "en", "bn")
                self.assertEqual(ctx.exception.status_code, 429)
                self.assertEqual(ctx.exception.code, "QUOTA_EXHAUSTED")

    async def test_http_errors_timeouts_and_network_failures(self) -> None:
        # HTTP 500
        async with make_mock_client(payload={}, status_code=500) as client:
            provider = MyMemoryProvider(self.settings, http_client=client)
            with self.assertRaises(ProviderUnavailableError) as ctx:
                await provider.translate("Hello", "en", "es")
            self.assertEqual(ctx.exception.status_code, 502)

        # Malformed JSON
        async with make_mock_client(raw_body=b"<<<not json>>>", status_code=200) as client:
            provider = MyMemoryProvider(self.settings, http_client=client)
            with self.assertRaises(InvalidProviderResponseError):
                await provider.translate("Hello", "en", "es")

        # Timeout
        async with make_mock_client(
            raise_exc=httpx.ReadTimeout("Timed out")
        ) as client:
            provider = MyMemoryProvider(self.settings, http_client=client)
            with self.assertRaises(TranslationTimeoutError) as ctx:
                await provider.translate("Hello", "en", "es")
            self.assertEqual(ctx.exception.status_code, 504)

        # Network ConnectError
        async with make_mock_client(
            raise_exc=httpx.ConnectError("Connection refused")
        ) as client:
            provider = MyMemoryProvider(self.settings, http_client=client)
            with self.assertRaises(ProviderUnavailableError) as ctx:
                await provider.translate("Hello", "en", "es")
            self.assertEqual(ctx.exception.code, "NETWORK_ERROR")
            self.assertEqual(ctx.exception.status_code, 503)

    async def test_email_de_parameter_only_sent_when_valid(self) -> None:
        captured: List[httpx.Request] = []
        payload = {
            "responseData": {"translatedText": "Hola", "match": 1.0},
            "responseStatus": 200,
        }
        # Without email configured
        async with make_mock_client(payload=payload, captured_requests=captured) as client:
            provider = MyMemoryProvider(self.settings, http_client=client)
            await provider.translate("Hello", "en", "es")
        self.assertEqual(len(captured), 1)
        self.assertNotIn("de=", str(captured[0].url))

        # With valid email configured
        captured.clear()
        settings_with_email = Settings(mymemory_email="student@example.edu")
        async with make_mock_client(payload=payload, captured_requests=captured) as client:
            provider = MyMemoryProvider(settings_with_email, http_client=client)
            await provider.translate("Hello", "en", "es")
        self.assertEqual(len(captured), 1)
        self.assertIn("de=student%40example.edu", str(captured[0].url))

    def test_junk_detector_cases(self) -> None:
        for junk in ["testcase", "TestCase!", "placeholder", "lorem ipsum", "   ", "dummy"]:
            self.assertTrue(is_junk_translation(junk), f"Expected '{junk}' to be rejected as junk")
        self.assertFalse(is_junk_translation("শুভ সকাল"))
        self.assertFalse(is_junk_translation("This is not a placeholder sentence."))
        self.assertEqual(decode_and_clean_text("Hola &amp; buenos d&#237;as"), "Hola & buenos días")


@unittest.skipUnless(
    os.getenv("RUN_LIVE_MYMEMORY_TESTS") == "1",
    "Live MyMemory API smoke tests are skipped by default to conserve daily quota.",
)
class TestLiveMyMemorySmoke(unittest.IsolatedAsyncioTestCase):
    """Optional live smoke tests when RUN_LIVE_MYMEMORY_TESTS=1 is set."""

    async def test_live_en_to_bn(self) -> None:
        provider = MyMemoryProvider(Settings())
        res = await provider.translate("Good morning", "en", "bn")
        self.assertTrue(contains_bengali_script(res.translated_text))


if __name__ == "__main__":
    unittest.main()
