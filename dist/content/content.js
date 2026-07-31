/**
 * FactGuard — Content Script (Vanilla JS)
 *
 * Injected into every webpage via manifest content_scripts.
 * Detects text selections ≥ 10 characters, shows a floating FactGuard
 * button, and on click sends the text to the background service worker
 * for analysis. Results are displayed in a floating tooltip.
 *
 * NO React, NO frameworks — pure vanilla JS for performance.
 */

(function () {
  "use strict";

  // ─── Guard: prevent double-injection ──────────────────────────────────────
  if (window.__factguardContentInjected) return;
  window.__factguardContentInjected = true;

  // ─── Constants ────────────────────────────────────────────────────────────
  const MIN_SELECTION_LENGTH = 10;
  const DEBOUNCE_MS = 200;
  const BTN_ID = "factguard-trigger-btn";
  const TOOLTIP_ID = "factguard-tooltip";
  const BTN_OFFSET_Y = 10; // px above selection
  const TOOLTIP_GAP = 8; // px gap between tooltip and selection

  // ─── State ────────────────────────────────────────────────────────────────
  let triggerBtn = null;
  let tooltip = null;
  let isAnalyzing = false;
  let currentSelectionText = "";
  let selectionRect = null;
  let debounceTimer = null;

  // ─── SVG Icons & HTML (Premium Design) ────────────────────────────────────
  const SHIELD_SVG = `<svg class="factguard-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
  
  const BTN_HTML = `${SHIELD_SVG} Analyze`;
  const SPINNER_HTML = `<div class="factguard-spinner"></div> Analyzing...`;

  // ═══════════════════════════════════════════════════════════════════════════
  // TRIGGER BUTTON
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create the floating trigger button element (once, reused).
   */
  function ensureTriggerBtn() {
    if (triggerBtn && document.body.contains(triggerBtn)) return triggerBtn;

    triggerBtn = document.createElement("div");
    triggerBtn.id = BTN_ID;
    triggerBtn.setAttribute("role", "button");
    triggerBtn.setAttribute("aria-label", "Analyze selected text with FactGuard");
    triggerBtn.innerHTML = BTN_HTML;
    document.body.appendChild(triggerBtn);

    // Click handler
    triggerBtn.addEventListener("click", handleBtnClick, { capture: true });

    // Prevent click from propagating to page (which could clear the selection)
    triggerBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, { capture: true });

    return triggerBtn;
  }

  /**
   * Show the trigger button near the selection rectangle.
   * Positions it centered above the selection.
   */
  function showTriggerBtn(rect) {
    const btn = ensureTriggerBtn();

    // Reset to icon state
    btn.innerHTML = BTN_HTML;
    btn.classList.remove("factguard-visible");

    // Position: centered above the selection
    // Note: the button size is variable now (it's a pill). We'll approximate width or just center it.
    btn.style.visibility = "hidden";
    btn.style.display = "flex";
    const btnWidth = btn.offsetWidth || 100;
    const btnHeight = 32;
    btn.style.visibility = "";

    let left = rect.left + window.scrollX + rect.width / 2 - btnWidth / 2;
    let top = rect.top + window.scrollY - btnHeight - BTN_OFFSET_Y;

    // If no room above relative to viewport, place below the selection
    if (rect.top < btnHeight + BTN_OFFSET_Y) {
      top = rect.bottom + window.scrollY + BTN_OFFSET_Y;
    }

    // Clamp to page width
    const maxLeft = Math.max(0, document.documentElement.scrollWidth - btnWidth - 4);
    left = Math.max(4, Math.min(left, maxLeft));

    btn.style.left = left + "px";
    btn.style.top = top + "px";

    // Trigger fade-in + bounce via class
    requestAnimationFrame(() => {
      btn.classList.add("factguard-visible");
    });
  }

  /**
   * Hide the trigger button.
   */
  function hideTriggerBtn() {
    if (triggerBtn) {
      triggerBtn.classList.remove("factguard-visible");
      // Remove from DOM after transition
      setTimeout(() => {
        if (triggerBtn && !triggerBtn.classList.contains("factguard-visible")) {
          triggerBtn.remove();
          triggerBtn = null;
        }
      }, 300);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESULTS TOOLTIP
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Build the results tooltip HTML.
   */
  function buildTooltipHTML(result) {
    const isAI = result.isAIGenerated;
    const d = result.details;

    const iconHtml = isAI 
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

    return `
      <button class="factguard-close-btn" aria-label="Close">&times;</button>

      <div class="factguard-verdict">
        ${iconHtml}
        <span>${result.label}</span>
      </div>

      <div class="factguard-confidence-header">
        <span class="factguard-confidence-label">Confidence</span>
        <span class="factguard-confidence-value">${result.confidence}%</span>
      </div>
      <div class="factguard-bar-track">
        <div class="factguard-bar-fill" style="width: 0%;" data-target="${result.confidence}"></div>
      </div>

      <div class="factguard-details">
        <div class="factguard-detail-item">
          <span class="factguard-detail-key">Words</span>
          <span class="factguard-detail-val">${d.wordCount}</span>
        </div>
        <div class="factguard-detail-item">
          <span class="factguard-detail-key">Characters</span>
          <span class="factguard-detail-val">${d.characterCount}</span>
        </div>
      </div>

      <div class="factguard-powered">FactGuard Model Analysis</div>
    `;
  }

  /**
   * Show the results tooltip near the selection.
   * Positions it above or below the selection based on available space.
   */
  function showTooltip(result, rect) {
    hideTooltip(); // Remove any existing tooltip

    tooltip = document.createElement("div");
    tooltip.id = TOOLTIP_ID;
    tooltip.innerHTML = buildTooltipHTML(result);
    document.body.appendChild(tooltip);

    // Close button handler
    const closeBtn = tooltip.querySelector(".factguard-close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        cleanup();
      }, { capture: true });
    }

    // Prevent tooltip clicks from clearing the selection
    tooltip.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    }, { capture: true });

    // Position the tooltip
    positionTooltip(rect);

    // Animate the confidence bar fill after a brief delay
    requestAnimationFrame(() => {
      tooltip.classList.add("factguard-visible");
      setTimeout(() => {
        const fill = tooltip.querySelector(".factguard-bar-fill");
        if (fill) {
          fill.style.width = fill.dataset.target + "%";
        }
      }, 100);
    });
  }

  /**
   * Position the tooltip relative to the selection rect.
   */
  function positionTooltip(rect) {
    if (!tooltip) return;

    const tooltipWidth = 320;
    // Temporarily make visible to measure height
    tooltip.style.visibility = "hidden";
    tooltip.style.display = "block";
    const tooltipHeight = tooltip.offsetHeight || 260;
    tooltip.style.visibility = "";

    let top, left;

    // We want the card to appear near the "Analyze" button, which is typically above the text.
    // Prefer ABOVE the selection.
    if (rect.top >= tooltipHeight + TOOLTIP_GAP) {
      top = rect.top + window.scrollY - tooltipHeight - TOOLTIP_GAP;
    } else {
      // If there's no room above the selection, pin it near the top of the viewport 
      // so it doesn't jump all the way down to the bottom of a massive text block.
      top = window.scrollY + 12;
    }

    // Horizontally center on the selection, but clamp to document width
    left = rect.left + window.scrollX + rect.width / 2 - tooltipWidth / 2;
    const maxLeft = Math.max(0, document.documentElement.scrollWidth - tooltipWidth - 8);
    left = Math.max(8, Math.min(left, maxLeft));

    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
  }

  /**
   * Hide and remove the tooltip.
   */
  function hideTooltip() {
    if (tooltip) {
      tooltip.classList.remove("factguard-visible");
      const ref = tooltip;
      setTimeout(() => {
        ref.remove();
      }, 300);
      tooltip = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE LOGIC
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle the trigger button click — send text for analysis.
   */
  async function handleBtnClick(e) {
    e.preventDefault();
    e.stopPropagation();

    // Prevent double-clicks while loading
    if (isAnalyzing) return;
    if (!currentSelectionText || currentSelectionText.length < MIN_SELECTION_LENGTH) return;

    isAnalyzing = true;

    // Switch button to spinner state
    if (triggerBtn) {
      triggerBtn.innerHTML = SPINNER_HTML;
    }

    try {
      // Send text to background for analysis
      const result = await chrome.runtime.sendMessage({
        type: "ANALYZE_TEXT",
        text: currentSelectionText,
      });

      if (result && result.error) {
        console.error("[FactGuard] Analysis error:", result.error);
        cleanup();
        return;
      }

      if (result && result.label) {
        // Hide the button, show results tooltip
        hideTriggerBtn();
        showTooltip(result, selectionRect);
      } else {
        console.error("[FactGuard] Unexpected response:", result);
        cleanup();
      }
    } catch (err) {
      console.error("[FactGuard] Message send failed:", err);
      cleanup();
    } finally {
      isAnalyzing = false;
    }
  }

  /**
   * Handle text selection changes (debounced).
   */
  function handleSelectionChange() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      processSelection();
    }, DEBOUNCE_MS);
  }

  /**
   * Process the current text selection.
   */
  function processSelection() {
    const selection = window.getSelection();

    // No selection or too short
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      // Only clean up if we're not showing a tooltip
      if (!tooltip) {
        hideTriggerBtn();
        currentSelectionText = "";
        selectionRect = null;
      }
      return;
    }

    const text = selection.toString().trim();

    if (text.length < MIN_SELECTION_LENGTH) {
      if (!tooltip) {
        hideTriggerBtn();
        currentSelectionText = "";
        selectionRect = null;
      }
      return;
    }

    // Don't reshow button if tooltip is already displayed
    if (tooltip) return;

    // Get the bounding rect of the selection
    try {
      const range = selection.getRangeAt(0);
      let rect = range.getBoundingClientRect();

      // Fallback: if getBoundingClientRect returns 0 width/height, check getClientRects
      if ((!rect || (rect.width === 0 && rect.height === 0)) && range.getClientRects().length > 0) {
        const rects = range.getClientRects();
        rect = rects[0];
      }

      // Sanity check — rect must have non-zero dimensions
      if (!rect || (rect.width === 0 && rect.height === 0)) return;

      currentSelectionText = text;
      selectionRect = {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
      };

      console.log("[FactGuard] Text selected (" + text.length + " chars):", text.substring(0, 30) + "...");
      showTriggerBtn(selectionRect);
    } catch (err) {
      // getRangeAt can throw if selection is in an unusual state
      console.warn("[FactGuard] Could not get selection rect:", err);
    }
  }

  /**
   * Clean up all injected elements and reset state.
   */
  function cleanup() {
    hideTriggerBtn();
    hideTooltip();
    isAnalyzing = false;
    currentSelectionText = "";
    selectionRect = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT LISTENERS
  // ═══════════════════════════════════════════════════════════════════════════

  // Detect text selection on mouseup
  document.addEventListener("mouseup", (e) => {
    // Ignore clicks on our own elements
    if (e.target && (e.target.id === BTN_ID || e.target.id === TOOLTIP_ID ||
        e.target.closest("#" + BTN_ID) || e.target.closest("#" + TOOLTIP_ID))) {
      return;
    }

    handleSelectionChange();
  }, true);

  // Also listen for keyboard-based selections (Shift+Arrow, Ctrl+A, etc.)
  document.addEventListener("selectionchange", () => {
    handleSelectionChange();
  });

  // Click elsewhere to dismiss
  document.addEventListener("mousedown", (e) => {
    // Don't dismiss if clicking our own elements
    if (e.target && (e.target.id === BTN_ID || e.target.id === TOOLTIP_ID ||
        e.target.closest("#" + BTN_ID) || e.target.closest("#" + TOOLTIP_ID))) {
      return;
    }

    // If tooltip is visible, clicking elsewhere should dismiss it
    if (tooltip) {
      cleanup();
    }
  }, true);

  // Escape key dismisses everything
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      cleanup();
    }
  }, true);

  // Window resize — cleanup since positions become stale
  window.addEventListener("resize", () => {
    cleanup();
  }, { passive: true });

  // Log that the content script loaded
  console.log("[FactGuard] Content script loaded.");
})();
