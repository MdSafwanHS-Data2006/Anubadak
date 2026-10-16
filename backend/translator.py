"""Translation provider abstraction and MyMemory implementation for Anubadak."""

from __future__ import annotations

import abc
import html
import logging
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

import httpx

from config import MAX_UTF8_BYTES, SUPPORTED_LANGUAGES, Settings

logger = logging.getLogger("anubadak.translator")

# Unicode character range patterns
# Note: U+0964 (।) and U+0965 (॥) are standard danda punctuation marks shared by Bengali.
_BENGALI_CHAR_RE = re.compile(r"[\u0980-\u09FF]")
_LATIN_CHAR_RE = re.compile(r"[A-Za-z\u00C0-\u024F]")
_DISALLOWED_FOREIGN_SCRIPT_RE = re.compile(
    r"[\u0400-\u04FF\u0600-\u06FF\u0900-\u0963\u0966-\u097F\u3040-\u30FF\u4E00-\u9FFF]"
)
_WORD_STRIP_RE = re.compile(r"^[\s\W_]+|[\s\W_]+$", re.UNICODE)
_WHITESPACE_RE = re.compile(r"[ \t]+")

# Known junk / placeholder outputs occasionally returned by public translation memories
_JUNK_ENTIRE_OUTPUTS = frozenset(
    {
        "testcase",
        "test case",
        "test",
        "dummy",
        "dummy text",
        "placeholder",
        "lorem ipsum",
        "lorem",
        "ipsum",
        "sample",
        "sample text",
        "null",
        "undefined",
        "none",
        "n/a",
        "todo",
        "tbd",
        "asdf",
        "qwerty",
        "xxx",
        "translation",
        "untranslated",
        "no translation",
    }
)

# Common greetings / words that must never remain unchanged between English and Spanish
_MUST_TRANSLATE_EN_ES = frozenset(
    {
        "hello",
        "hi",
        "hey",
        "hola",
        "good morning",
        "good afternoon",
        "good evening",
        "good night",
        "buenos dias",
        "buenos días",
        "buenas tardes",
        "buenas noches",
        "thank you",
        "thanks",
        "gracias",
        "please",
        "por favor",
        "yes",
        "si",
        "sí",
        "goodbye",
        "bye",
        "adios",
        "adiós",
        "how are you",
        "como estas",
        "cómo estás",
    }
)

# Allowed single-word international cognates / proper nouns between English and Spanish
_ALLOWED_COGNATES_EN_ES = frozenset(
    {
        "no",
        "ok",
        "okay",
        "hotel",
        "hospital",
        "doctor",
        "taxi",
        "internet",
        "wifi",
        "wi-fi",
        "café",
        "cafe",
        "menu",
        "menú",
        "bar",
        "club",
        "radio",
        "video",
        "audio",
        "piano",
        "guitar",
        "banana",
        "chocolate",
        "tomato",
        "bangladesh",
        "dhaka",
        "madrid",
        "london",
    }
)

_PROVIDER_WARNING_PREFIXES = (
    "mymemory warning",
    "warning:",
    "invalid language pair",
    "no query specified",
    "please select two distinct languages",
    "query length limit exceeded",
    "you used all available free translations",
)

_QUOTA_KEYWORDS = (
    "you used all available free translations",
    "quota finished",
    "quota exceeded",
    "next available in",
    "too many requests",
)

_NEGATION_PATTERNS = {
    "en": re.compile(
        r"\b(not|no|never|neither|nor|none|nobody|nothing|nowhere|don't|doesn't|didn't|won't|wouldn't|can't|cannot|couldn't|shouldn't|isn't|aren't|wasn't|weren't|haven't|hasn't|hadn't)\b",
        re.IGNORECASE,
    ),
    "es": re.compile(
        r"\b(no|nunca|jamás|jamas|nada|nadie|ningún|ningun|ninguno|ninguna|ni|tampoco)\b",
        re.IGNORECASE,
    ),
    "bn": re.compile(r"(?:^|[\s।,!?])(না|নি|নয়|নয়|নেই|নাই|কখনোই না)(?:$|[\s।,!?])"),
}


class TranslationError(Exception):
    """Base structured error for translation failures."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class InvalidInputError(TranslationError):
    """Raised when user input or language selection is invalid."""

    def __init__(self, code: str, message: str, status_code: int = 422) -> None:
        super().__init__(code=code, message=message, status_code=status_code)


class QuotaExhaustedError(TranslationError):
    """Raised when the translation provider reports exhausted daily quota."""

    def __init__(
        self,
        message: str = "Daily translation quota has been reached for the translation provider. Please try again later.",
    ) -> None:
        super().__init__(code="QUOTA_EXHAUSTED", message=message, status_code=429)


class ProviderUnavailableError(TranslationError):
    """Raised when the upstream translation provider is unreachable or returns an HTTP error."""

    def __init__(
        self,
        message: str = "The translation service is temporarily unavailable. Please try again in a moment.",
        code: str = "PROVIDER_UNAVAILABLE",
        status_code: int = 503,
    ) -> None:
        super().__init__(code=code, message=message, status_code=status_code)


class TranslationTimeoutError(TranslationError):
    """Raised when the upstream translation request times out."""

    def __init__(
        self,
        message: str = "The translation request timed out. Please check your connection and try again.",
    ) -> None:
        super().__init__(code="TRANSLATION_TIMEOUT", message=message, status_code=504)


class InvalidProviderResponseError(TranslationError):
    """Raised when the provider returns malformed, empty, or unusable translation data."""

    def __init__(
        self,
        message: str = "The translation provider returned an unusable or invalid translation response.",
        code: str = "INVALID_PROVIDER_RESPONSE",
    ) -> None:
        super().__init__(code=code, message=message, status_code=502)


@dataclass(frozen=True)
class TranslationResult:
    """Validated translation output returned by a provider."""

    translated_text: str
    source_lang: str
    target_lang: str
    provider: str


def utf8_byte_length(text: str) -> int:
    """Return the exact UTF-8 byte length of a string."""
    return len(text.encode("utf-8"))


def decode_and_clean_text(raw_text: str) -> str:
    """Decode HTML entities (up to two passes) and normalize horizontal whitespace."""
    text = raw_text
    for _ in range(2):
        unescaped = html.unescape(text)
        if unescaped == text:
            break
        text = unescaped
    # Preserve line breaks while normalizing stray horizontal tabs/spaces per line
    lines = [_WHITESPACE_RE.sub(" ", line).strip() for line in text.splitlines()]
    cleaned = "\n".join(lines).strip()
    return cleaned


def contains_bengali_script(text: str) -> bool:
    """Return True if text contains at least one Bengali Unicode character (U+0980..U+09FF)."""
    return bool(_BENGALI_CHAR_RE.search(text))


def contains_latin_script(text: str) -> bool:
    """Return True if text contains at least one Latin character."""
    return bool(_LATIN_CHAR_RE.search(text))


def has_letters(text: str) -> bool:
    """Return True if text contains any alphabetic character in any script."""
    return any(ch.isalpha() for ch in text)


def _normalize_for_comparison(text: str) -> str:
    """Normalize text for case-insensitive, punctuation-insensitive comparison."""
    stripped = _WORD_STRIP_RE.sub("", text.strip())
    return _WHITESPACE_RE.sub(" ", stripped).lower()


def is_junk_translation(candidate: str) -> bool:
    """Return True if the candidate is empty, a provider warning, or a known junk string."""
    cleaned = candidate.strip()
    if not cleaned:
        return True

    lower = cleaned.lower()
    for prefix in _PROVIDER_WARNING_PREFIXES:
        if lower.startswith(prefix):
            return True

    normalized = _normalize_for_comparison(cleaned)
    if not normalized and has_letters(cleaned):
        return True
    if normalized in _JUNK_ENTIRE_OUTPUTS:
        return True

    return False


def has_negation(text: str, lang: str) -> bool:
    """Return True if text contains common negation words in the specified language."""
    pattern = _NEGATION_PATTERNS.get(lang)
    if not pattern:
        return False
    return bool(pattern.search(text))


def is_valid_script_for_target(
    source_text: str,
    candidate_text: str,
    source_lang: str,
    target_lang: str,
) -> bool:
    """Validate that candidate_text uses the expected script for target_lang."""
    # If the source text has no letters at all (e.g., numbers/punctuation only), allow it
    if not has_letters(source_text):
        return bool(candidate_text.strip())

    # Reject unexpected foreign scripts (Cyrillic, Arabic, Devanagari/Hindi excluding ।/॥, CJK)
    # unless those exact characters were already present in the source text.
    foreign_in_candidate = set(_DISALLOWED_FOREIGN_SCRIPT_RE.findall(candidate_text))
    if foreign_in_candidate:
        foreign_in_source = set(_DISALLOWED_FOREIGN_SCRIPT_RE.findall(source_text))
        if not foreign_in_candidate.issubset(foreign_in_source):
            return False

    if target_lang == "bn":
        # Target is Bengali: must contain genuine Bengali script (U+0980..U+09FF)
        if not contains_bengali_script(candidate_text):
            return False
        # Guard against predominantly romanized output with a single stray character
        bn_count = len(_BENGALI_CHAR_RE.findall(candidate_text))
        latin_count = len(_LATIN_CHAR_RE.findall(candidate_text))
        if bn_count == 0 or (latin_count > bn_count * 2 and latin_count > 6):
            return False
        return True

    if target_lang in ("en", "es"):
        # Target is English or Spanish: must contain Latin script
        if not contains_latin_script(candidate_text):
            return False
        # When translating from Bengali to English/Spanish, reject output that still has Bengali script
        if source_lang == "bn" and contains_bengali_script(candidate_text):
            return False
        return True

    return False


def is_acceptable_unchanged_text(
    source_text: str,
    candidate_text: str,
    source_lang: str,
    target_lang: str,
) -> bool:
    """Determine whether an unchanged translation is legitimate or an untranslated echo."""
    source_norm = _normalize_for_comparison(source_text)
    cand_norm = _normalize_for_comparison(candidate_text)
    if source_norm != cand_norm:
        return True

    # If there are no letters (only numbers/symbols), identical output is acceptable
    if not has_letters(source_text):
        return True

    # Between Bengali and Latin-script languages (en/es), identical alphabetic text is impossible
    if source_lang == "bn" or target_lang == "bn":
        return False

    # Between English and Spanish:
    # Reject known basic greetings / phrases that must always be translated
    if source_norm in _MUST_TRANSLATE_EN_ES:
        return False

    # Allow known single-word international cognates or proper names
    words = source_norm.split()
    if len(words) == 1:
        word = words[0]
        if word in _ALLOWED_COGNATES_EN_ES:
            return True
        # Allow a single capitalized proper noun (e.g. "Rahim", "Carlos") if not a must-translate word
        stripped_raw = source_text.strip().strip(".,!?¡¿")
        if (
            stripped_raw
            and stripped_raw[0].isupper()
            and stripped_raw.isalpha()
            and len(stripped_raw) >= 2
        ):
            return True

    # Multi-word sentences or non-cognate words that remain 100% identical are untranslated echoes
    return False


def validate_translation_Input(
    text: Optional[str],
    source_lang: Optional[str],
    target_lang: Optional[str],
) -> Tuple[str, str, str]:
    """Validate and normalize request fields before calling any translation provider."""
    if text is None or not isinstance(text, str):
        raise InvalidInputError(
            code="EMPTY_TEXT",
            message="Please enter text to translate.",
            status_code=422,
        )

    # Check raw UTF-8 byte length first, and also trimmed text
    raw_bytes = utf8_byte_length(text)
    trimmed = text.strip()
    if not trimmed:
        raise InvalidInputError(
            code="EMPTY_TEXT",
            message="Please enter non-empty text to translate.",
            status_code=422,
        )

    trimmed_bytes = utf8_byte_length(trimmed)
    if raw_bytes > MAX_UTF8_BYTES or trimmed_bytes > MAX_UTF8_BYTES:
        actual_bytes = max(raw_bytes, trimmed_bytes)
        raise InvalidInputError(
            code="TEXT_TOO_LONG",
            message=(
                f"Input text exceeds the maximum limit of {MAX_UTF8_BYTES} UTF-8 bytes "
                f"(current size: {actual_bytes} bytes)."
            ),
            status_code=422,
        )

    src = (source_lang or "").strip().lower()
    tgt = (target_lang or "").strip().lower()

    if src not in SUPPORTED_LANGUAGES:
        raise InvalidInputError(
            code="UNSUPPORTED_SOURCE_LANG",
            message=f"Unsupported source language '{source_lang}'. Supported languages: en, bn, es.",
            status_code=422,
        )

    if tgt not in SUPPORTED_LANGUAGES:
        raise InvalidInputError(
            code="UNSUPPORTED_TARGET_LANG",
            message=f"Unsupported target language '{target_lang}'. Supported languages: en, bn, es.",
            status_code=422,
        )

    if src == tgt:
        raise InvalidInputError(
            code="IDENTICAL_LANGUAGES",
            message="Source language and target language must be different.",
            status_code=422,
        )

    return trimmed, src, tgt


class TranslationProvider(abc.ABC):
    """Abstract base interface for hosted translation providers."""

    provider_name: str = "unknown"

    @abc.abstractmethod
    async def translate(
        self, text: str, source_lang: str, target_lang: str
    ) -> TranslationResult:
        """Translate text from source_lang to target_lang."""


class MyMemoryProvider(TranslationProvider):
    """MyMemory REST API translation provider with response validation and candidate selection."""

    provider_name = "mymemory"

    def __init__(
        self,
        settings: Settings,
        http_client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        self._settings = settings
        self._http_client = http_client

    def _build_params(self, text: str, source_lang: str, target_lang: str) -> Dict[str, str]:
        params: Dict[str, str] = {
            "q": text,
            "langpair": f"{source_lang}|{target_lang}",
        }
        if self._settings.email_configured:
            params["de"] = self._settings.mymemory_email
        return params

    async def _fetch_payload(self, params: Dict[str, str]) -> Dict[str, Any]:
        """Execute asynchronous GET request to MyMemory and parse JSON response."""
        try:
            if self._http_client is not None:
                response = await self._http_client.get(
                    self._settings.mymemory_api_url,
                    params=params,
                    timeout=self._settings.request_timeout_seconds,
                )
            else:
                async with httpx.AsyncClient(
                    timeout=self._settings.request_timeout_seconds
                ) as client:
                    response = await client.get(
                        self._settings.mymemory_api_url,
                        params=params,
                    )
        except httpx.TimeoutException as exc:
            logger.warning("MyMemory request timed out")
            raise TranslationTimeoutError() from exc
        except httpx.RequestError as exc:
            logger.warning("MyMemory network request error: %s", type(exc).__name__)
            raise ProviderUnavailableError(
                message="Unable to reach the translation service. Please check your network connection and try again.",
                code="NETWORK_ERROR",
                status_code=503,
            ) from exc

        if response.status_code == 429:
            raise QuotaExhaustedError()

        if response.status_code >= 500:
            raise ProviderUnavailableError(
                message="The translation provider encountered a server error. Please try again shortly.",
                code="PROVIDER_UNAVAILABLE",
                status_code=502,
            )

        if response.status_code != 200:
            try:
                err_data = response.json()
            except ValueError:
                err_data = None
            if isinstance(err_data, dict):
                self._check_provider_status_and_quota(err_data)
            raise ProviderUnavailableError(
                message=f"The translation provider rejected the request (HTTP {response.status_code}).",
                code="PROVIDER_UNAVAILABLE",
                status_code=502,
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise InvalidProviderResponseError(
                message="The translation provider returned malformed JSON."
            ) from exc

        if not isinstance(payload, dict):
            raise InvalidProviderResponseError(
                message="The translation provider returned an unexpected response structure."
            )

        return payload

    def _check_provider_status_and_quota(self, payload: Dict[str, Any]) -> None:
        """Inspect MyMemory responseStatus, quotaFinished, and responseDetails for errors."""
        quota_finished = payload.get("quotaFinished")
        if quota_finished is True or str(quota_finished).lower() == "true":
            raise QuotaExhaustedError()

        raw_status = payload.get("responseStatus", 200)
        try:
            status_int = int(raw_status) if raw_status is not None else 200
        except (TypeError, ValueError):
            status_int = 500

        details = str(payload.get("responseDetails") or "").strip()
        response_data = payload.get("responseData")
        translated_raw = ""
        if isinstance(response_data, dict):
            translated_raw = str(response_data.get("translatedText") or "").strip()

        combined_notice = f"{details} {translated_raw}".lower()
        for keyword in _QUOTA_KEYWORDS:
            if keyword in combined_notice:
                raise QuotaExhaustedError()

        if status_int == 429:
            raise QuotaExhaustedError()

        if status_int == 403 and "quota" in combined_notice:
            raise QuotaExhaustedError()

        if status_int != 200:
            raise ProviderUnavailableError(
                message="The translation provider could not process this request right now.",
                code="PROVIDER_UNAVAILABLE",
                status_code=502,
            )

    def _collect_candidates(
        self,
        source_text: str,
        payload: Dict[str, Any],
    ) -> List[Tuple[str, float, bool]]:
        """Extract candidate translations with their relevance score and whether they match the full segment."""
        candidates: List[Tuple[str, float, bool]] = []
        source_norm = _normalize_for_comparison(source_text)

        matches = payload.get("matches")
        if isinstance(matches, Sequence) and not isinstance(matches, (str, bytes)):
            for item in matches:
                if not isinstance(item, dict):
                    continue
                raw_translation = item.get("translation")
                if not isinstance(raw_translation, str):
                    continue
                cleaned = decode_and_clean_text(raw_translation)
                if not cleaned:
                    continue

                try:
                    match_score = float(item.get("match", 0.0) or 0.0)
                except (TypeError, ValueError):
                    match_score = 0.0

                try:
                    quality_score = float(item.get("quality", 0.0) or 0.0)
                except (TypeError, ValueError):
                    quality_score = 0.0

                if 0 < quality_score < 30 and match_score < 0.85:
                    continue

                segment_raw = str(item.get("segment") or "")
                segment_norm = _normalize_for_comparison(decode_and_clean_text(segment_raw))
                is_exact_segment = (not segment_norm) or (segment_norm == source_norm)

                normalized_quality = (
                    max(0.0, min(1.0, quality_score / 100.0)) if quality_score > 0 else 0.7
                )
                combined_score = (match_score * 0.75) + (normalized_quality * 0.25)
                candidates.append((cleaned, combined_score, is_exact_segment))

        response_data = payload.get("responseData")
        if isinstance(response_data, dict):
            primary_raw = response_data.get("translatedText")
            if isinstance(primary_raw, str):
                primary_cleaned = decode_and_clean_text(primary_raw)
                if primary_cleaned:
                    try:
                        primary_match = float(response_data.get("match", 0.85) or 0.85)
                    except (TypeError, ValueError):
                        primary_match = 0.85
                    candidates.insert(0, (primary_cleaned, primary_match + 0.05, True))

        return candidates

    def _select_best_candidate(
        self,
        source_text: str,
        source_lang: str,
        target_lang: str,
        candidates: List[Tuple[str, float, bool]],
    ) -> str:
        """Select the highest-scoring candidate that passes script, junk, and echo validation."""
        if not candidates:
            raise InvalidProviderResponseError(
                message="The translation provider returned an empty translation."
            )

        source_has_neg = has_negation(source_text, source_lang)
        source_norm = _normalize_for_comparison(source_text)

        scored_valid: List[Tuple[float, int, str]] = []
        saw_unchanged_only = False

        for idx, (text, base_score, is_exact_segment) in enumerate(candidates):
            if is_junk_translation(text):
                continue

            if not is_valid_script_for_target(source_text, text, source_lang, target_lang):
                continue

            cand_norm = _normalize_for_comparison(text)
            is_unchanged = cand_norm == source_norm

            if is_unchanged and not is_acceptable_unchanged_text(
                source_text, text, source_lang, target_lang
            ):
                saw_unchanged_only = True
                continue

            score = base_score
            if is_exact_segment:
                score += 0.35
            else:
                score -= 0.40

            if is_unchanged:
                score -= 0.60

            if source_has_neg and has_negation(text, target_lang):
                score += 0.12

            scored_valid.append((score, -idx, text))

        if not scored_valid:
            if saw_unchanged_only:
                raise InvalidProviderResponseError(
                    message="The translation provider returned the original text without translating it.",
                    code="TRANSLATION_UNAVAILABLE",
                )
            raise InvalidProviderResponseError(
                message="The translation provider did not return a valid translation in the target language.",
                code="TRANSLATION_UNAVAILABLE",
            )

        scored_valid.sort(reverse=True)
        return scored_valid[0][2]

    async def translate(
        self, text: str, source_lang: str, target_lang: str
    ) -> TranslationResult:
        """Validate input, query MyMemory, validate candidates, and return TranslationResult."""
        cleaned_text, src, tgt = validate_translation_Input(text, source_lang, target_lang)
        params = self._build_params(cleaned_text, src, tgt)
        payload = await self._fetch_payload(params)

        self._check_provider_status_and_quota(payload)

        if "responseData" not in payload or not isinstance(payload.get("responseData"), dict):
            raise InvalidProviderResponseError(
                message="The translation provider response was missing translation data."
            )

        candidates = self._collect_candidates(cleaned_text, payload)
        best_translation = self._select_best_candidate(
            source_text=cleaned_text,
            source_lang=src,
            target_lang=tgt,
            candidates=candidates,
        )

        return TranslationResult(
            translated_text=best_translation,
            source_lang=src,
            target_lang=tgt,
            provider=self.provider_name,
        )
