/**
 * FactGuard — Chrome Storage Helpers
 *
 * Thin wrappers around chrome.storage.local for type-safe,
 * promise-based access to extension state.
 */

// ─── Keys ───────────────────────────────────────────────────────────────────
const KEYS = {
  SCREENSHOT: "factguard_screenshot",
  CROPPED: "factguard_cropped",
  STATUS: "factguard_status",
  RESULTS: "factguard_results",
  TEXT_HISTORY: "factguard_text_history",
};

// Maximum number of text analysis history entries to keep
const MAX_TEXT_HISTORY = 50;

// ─── Screenshot ─────────────────────────────────────────────────────────────

/** Save the full-tab screenshot data URL. */
export async function saveScreenshot(dataUrl) {
  await chrome.storage.local.set({ [KEYS.SCREENSHOT]: dataUrl });
}

/** Retrieve the stored screenshot data URL. */
export async function getScreenshot() {
  const data = await chrome.storage.local.get(KEYS.SCREENSHOT);
  return data[KEYS.SCREENSHOT] || null;
}

// ─── Cropped Image ──────────────────────────────────────────────────────────

/** Save the cropped image data URL. */
export async function saveCroppedImage(dataUrl) {
  await chrome.storage.local.set({ [KEYS.CROPPED]: dataUrl });
}

/** Retrieve the cropped image data URL. */
export async function getCroppedImage() {
  const data = await chrome.storage.local.get(KEYS.CROPPED);
  return data[KEYS.CROPPED] || null;
}

// ─── Status ─────────────────────────────────────────────────────────────────
// Possible statuses: "idle" | "cropping" | "analyzing" | "done"

/** Set the current extension status. */
export async function setStatus(status) {
  await chrome.storage.local.set({ [KEYS.STATUS]: status });
}

/** Get the current extension status. */
export async function getStatus() {
  const data = await chrome.storage.local.get(KEYS.STATUS);
  return data[KEYS.STATUS] || "idle";
}

// ─── Results ────────────────────────────────────────────────────────────────

/** Save analysis results. */
export async function saveResults(results) {
  await chrome.storage.local.set({ [KEYS.RESULTS]: results });
}

/** Retrieve analysis results. */
export async function getResults() {
  const data = await chrome.storage.local.get(KEYS.RESULTS);
  return data[KEYS.RESULTS] || null;
}

// ─── Text Analysis History ──────────────────────────────────────────────────

/**
 * Retrieve the text analysis history array.
 * Each entry: { snippet: string, result: Object, timestamp: string }
 * @returns {Promise<Array>} History entries, newest first.
 */
export async function getTextHistory() {
  const data = await chrome.storage.local.get(KEYS.TEXT_HISTORY);
  return data[KEYS.TEXT_HISTORY] || [];
}

/**
 * Save a new text analysis to history.
 * Prepends the entry and trims the array to MAX_TEXT_HISTORY entries.
 * @param {string} snippet - First 50 characters of the analyzed text
 * @param {Object} result  - The analysis result object
 */
export async function saveTextAnalysis(snippet, result) {
  const history = await getTextHistory();

  const entry = {
    snippet: snippet.substring(0, 50),
    result: result,
    timestamp: new Date().toISOString(),
  };

  // Prepend new entry, trim to max size
  history.unshift(entry);
  if (history.length > MAX_TEXT_HISTORY) {
    history.length = MAX_TEXT_HISTORY;
  }

  await chrome.storage.local.set({ [KEYS.TEXT_HISTORY]: history });
}

/**
 * Clear all text analysis history.
 */
export async function clearTextHistory() {
  await chrome.storage.local.remove(KEYS.TEXT_HISTORY);
}

/** Clear only the image workflow while preserving text-check history. */
export async function clearImageAnalysis() {
  await chrome.storage.local.remove([
    KEYS.SCREENSHOT,
    KEYS.CROPPED,
    KEYS.STATUS,
    KEYS.RESULTS,
  ]);
}

// ─── Clear All ──────────────────────────────────────────────────────────────

/** Reset all FactGuard storage to initial state. */
export async function clearAll() {
  await chrome.storage.local.remove([
    KEYS.SCREENSHOT,
    KEYS.CROPPED,
    KEYS.STATUS,
    KEYS.RESULTS,
    KEYS.TEXT_HISTORY,
  ]);
}
