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
};

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

// ─── Clear All ──────────────────────────────────────────────────────────────

/** Reset all FactGuard storage to initial state. */
export async function clearAll() {
  await chrome.storage.local.remove([
    KEYS.SCREENSHOT,
    KEYS.CROPPED,
    KEYS.STATUS,
    KEYS.RESULTS,
  ]);
}
