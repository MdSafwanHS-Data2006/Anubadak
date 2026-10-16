/**
 * Monotonically increasing request tracker with AbortController management
 * to prevent stale or out-of-order translation responses from overwriting newer UI state.
 */

export function createRequestTracker() {
  let currentId = 0;
  let activeController = null;

  return {
    /**
     * Begin a new request, aborting any previous in-flight request.
     *
     * @returns {{ requestId: number, signal: AbortSignal | undefined }}
     */
    nextRequest() {
      currentId += 1;
      if (activeController && typeof activeController.abort === 'function') {
        try {
          activeController.abort();
        } catch (_err) {
          // Ignore abort exceptions
        }
      }
      activeController =
        typeof AbortController !== 'undefined' ? new AbortController() : null;

      return {
        requestId: currentId,
        signal: activeController ? activeController.signal : undefined,
      };
    },

    /**
     * Invalidate any in-flight request immediately (e.g. when input text or language changes).
     *
     * @returns {number} The incremented sequence ID
     */
    invalidate() {
      currentId += 1;
      if (activeController && typeof activeController.abort === 'function') {
        try {
          activeController.abort();
        } catch (_err) {
          // Ignore abort exceptions
        }
      }
      activeController = null;
      return currentId;
    },

    /**
     * Return true only if `requestId` is still the latest active request.
     *
     * @param {number} requestId
     * @returns {boolean}
     */
    isCurrent(requestId) {
      return requestId === currentId;
    },

    /**
     * Return the current sequence number for inspection in tests.
     *
     * @returns {number}
     */
    getCurrentId() {
      return currentId;
    },
  };
}
