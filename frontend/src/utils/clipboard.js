/**
 * Universal clipboard utility with feature detection and manual-selection fallback.
 * Never reports success before the copy operation actually completes.
 */

/**
 * Attempt to copy text to the clipboard using the modern Clipboard API,
 * falling back to selecting the output element for manual copy if unavailable or denied.
 *
 * @param {string} text
 * @param {HTMLElement | null} [fallbackElement=null]
 * @returns {Promise<{ ok: boolean, method: 'clipboard' | 'manual_fallback' }>}
 */
export async function copyTextUniversal(text, fallbackElement = null) {
  if (!text || typeof text !== 'string') {
    return { ok: false, method: 'manual_fallback' };
  }

  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, method: 'clipboard' };
    } catch (_err) {
      // Fall through to manual selection fallback
    }
  }

  if (fallbackElement) {
    try {
      if (typeof fallbackElement.select === 'function') {
        if (typeof fallbackElement.focus === 'function') {
          fallbackElement.focus();
        }
        fallbackElement.select();
      } else if (
        typeof window !== 'undefined' &&
        typeof document !== 'undefined' &&
        typeof window.getSelection === 'function'
      ) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(fallbackElement);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } catch (_selectErr) {
      // Ignore selection error and still instruct user how to copy manually
    }
  }

  return { ok: false, method: 'manual_fallback' };
}
