/**
 * FactGuard — Background Service Worker
 *
 * Responsibilities:
 * 1. Listen for the Shift+D keyboard command
 * 2. Capture the visible tab as a screenshot
 * 3. Store the screenshot and open the cropper window
 * 4. Receive the cropped image from the cropper
 * 5. Run the mock detector and store results
 */

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

// ─── Message Listener (from Cropper) ────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "CROP_COMPLETE") {
    handleCropComplete(message.croppedImage);
    sendResponse({ status: "received" });
  }

  if (message.type === "CROP_CANCELLED") {
    // Reset status to idle
    chrome.storage.local.set({ factguard_status: "idle" });
    sendResponse({ status: "cancelled" });
  }

  // Return true to indicate async response handling
  return true;
});

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
 * Mock AI Detector — simulates a backend API call.
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
