/**
 * FactGuard — Background Service Worker
 *
 * Responsibilities:
 * 1. Listen for the Shift+D keyboard command
 * 2. Capture the visible tab as a screenshot
 * 3. Store the screenshot and open the cropper window
 * 4. Receive the cropped image from the cropper
 * 5. Run the mock detector and store results
 * 6. Handle ANALYZE_TEXT messages from the content script (text detector)
 * 7. Save text analysis history to chrome.storage.local
 */

// ─── Constants ──────────────────────────────────────────────────────────────
const TEXT_HISTORY_KEY = "factguard_text_history";
const MAX_TEXT_HISTORY = 50;

// ─── Keyboard Command Listener ──────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "capture-screenshot") return;

  try {
    // Get the currently active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      console.error("[FactGuard] No active tab found.");
      return;
    }

    // Capture the visible area of the tab as a PNG data URL
    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: "png",
      quality: 100,
    });

    // Store the screenshot so the cropper page can read it
    await chrome.storage.local.set({
      factguard_screenshot: screenshotDataUrl,
      factguard_status: "cropping", // status: idle | cropping | analyzing | done
      factguard_results: null,
    });

    console.log("[FactGuard] Screenshot captured. Opening cropper...");

    // Open the cropper as a popup window (centered, 900×650)
    const screenWidth = tab.width || 1280;
    const screenHeight = tab.height || 720;
    const cropperWidth = Math.min(960, screenWidth);
    const cropperHeight = Math.min(680, screenHeight);

    await chrome.windows.create({
      url: chrome.runtime.getURL("cropper.html"),
      type: "popup",
      width: cropperWidth,
      height: cropperHeight,
      left: Math.round((screenWidth - cropperWidth) / 2),
      top: Math.round((screenHeight - cropperHeight) / 2),
      focused: true,
    });
  } catch (err) {
    console.error("[FactGuard] Screenshot capture failed:", err);
  }
});

// ─── Message Listener ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // ── Cropper: crop complete ──
  if (message.type === "CROP_COMPLETE") {
    handleCropComplete(message.croppedImage);
    sendResponse({ status: "received" });
  }

  // ── Cropper: crop cancelled ──
  if (message.type === "CROP_CANCELLED") {
    chrome.storage.local.set({ factguard_status: "idle" });
    sendResponse({ status: "cancelled" });
  }

  // ── Text Detector: analyze text ──
  if (message.type === "ANALYZE_TEXT") {
    handleAnalyzeText(message.text)
      .then((result) => sendResponse(result))
      .catch((err) => {
        console.error("[FactGuard] Text analysis failed:", err);
        sendResponse({ error: err.message || "Analysis failed" });
      });
    // Return true to keep the message channel open for async sendResponse
    return true;
  }

  // Return true to indicate async response handling for other message types
  return true;
});

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE ANALYSIS (Cropper Workflow)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Process the cropped image:
 * 1. Store it
 * 2. Run mock analysis
 * 3. Store results
 */
async function handleCropComplete(croppedImageDataUrl) {
  try {
    // Update status to analyzing
    await chrome.storage.local.set({
      factguard_cropped: croppedImageDataUrl,
      factguard_status: "analyzing",
    });

    console.log("[FactGuard] Running analysis on cropped image...");

    // Run the mock detector (inline version for service worker context)
    const results = await mockAnalyzeImage(croppedImageDataUrl);

    // Store results and update status
    await chrome.storage.local.set({
      factguard_results: results,
      factguard_status: "done",
    });

    console.log("[FactGuard] Analysis complete:", results);
  } catch (err) {
    console.error("[FactGuard] Analysis failed:", err);
    await chrome.storage.local.set({
      factguard_status: "done",
      factguard_results: {
        isAIGenerated: false,
        confidence: "0",
        label: "Error",
        details: {
          model: "Error",
          analysisTime: "0s",
          timestamp: new Date().toISOString(),
          error: err.message,
        },
      },
    });
  }
}

/**
 * Mock AI Image Detector — simulates a backend API call.
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  SWAP POINT: Replace this function body with a real        ║
 * ║  fetch() call to your backend when ready.                  ║
 * ║                                                            ║
 * ║  Example:                                                  ║
 * ║    const res = await fetch('https://api.example.com/', {   ║
 * ║      method: 'POST',                                      ║
 * ║      headers: { 'Content-Type': 'application/json' },     ║
 * ║      body: JSON.stringify({ image: imageDataUrl })         ║
 * ║    });                                                     ║
 * ║    return await res.json();                                ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
async function mockAnalyzeImage(_imageDataUrl) {
  // Simulate network delay (1.5 seconds)
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Generate randomized mock results
  const isAI = Math.random() > 0.5;
  return {
    isAIGenerated: isAI,
    confidence: (Math.random() * 40 + 60).toFixed(1), // 60–100%
    label: isAI ? "AI-Generated" : "Human-Made",
    details: {
      model: "Mock Detector v1.0",
      analysisTime: "1.5s",
      timestamp: new Date().toISOString(),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEXT ANALYSIS (Content Script Workflow)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handle an ANALYZE_TEXT request from the content script.
 * 1. Run the mock text detector
 * 2. Save the result to history
 * 3. Return the result
 *
 * @param {string} text - The selected text to analyze
 * @returns {Promise<Object>} The analysis result
 */
async function handleAnalyzeText(text) {
  console.log("[FactGuard] Analyzing text:", text.substring(0, 60) + "...");

  // Run the mock text detector
  const result = await mockAnalyzeText(text);

  // Save to history
  await saveToTextHistory(text, result);

  console.log("[FactGuard] Text analysis complete:", result.label, result.confidence + "%");

  return result;
}

/**
 * Mock AI Text Detector — simulates a backend API call.
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  SWAP POINT: Replace this function body with a real        ║
 * ║  fetch() call to your backend when ready.                  ║
 * ║                                                            ║
 * ║  Example:                                                  ║
 * ║    const res = await fetch('https://api.example.com/', {   ║
 * ║      method: 'POST',                                      ║
 * ║      headers: { 'Content-Type': 'application/json' },     ║
 * ║      body: JSON.stringify({ text })                        ║
 * ║    });                                                     ║
 * ║    return await res.json();                                ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
async function mockAnalyzeText(text) {
  // Simulate network delay (1.2 seconds)
  await new Promise((resolve) => setTimeout(resolve, 1200));

  // Validate input
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    throw new Error("Invalid or empty text provided");
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const aiScore = Math.random() * 100;

  return {
    isAIGenerated: aiScore > 50,
    confidence: aiScore.toFixed(1),
    label: aiScore > 50 ? "Likely AI-Generated" : "Likely Human-Written",
    details: {
      wordCount: wordCount,
      characterCount: text.length,
      model: "Mock Text Detector v1.0",
      analysisTime: "1.2s",
      timestamp: new Date().toISOString(),
      perplexityScore: (Math.random() * 50 + 20).toFixed(2),
      burstinessScore: (Math.random() * 100).toFixed(2),
    },
  };
}

/**
 * Save a text analysis result to the history in chrome.storage.local.
 * Prepends the new entry and keeps at most MAX_TEXT_HISTORY items.
 */
async function saveToTextHistory(text, result) {
  try {
    const data = await chrome.storage.local.get(TEXT_HISTORY_KEY);
    const history = data[TEXT_HISTORY_KEY] || [];

    const entry = {
      snippet: text.substring(0, 50),
      result: result,
      timestamp: new Date().toISOString(),
    };

    history.unshift(entry);
    if (history.length > MAX_TEXT_HISTORY) {
      history.length = MAX_TEXT_HISTORY;
    }

    await chrome.storage.local.set({ [TEXT_HISTORY_KEY]: history });
  } catch (err) {
    console.error("[FactGuard] Failed to save text history:", err);
  }
}
