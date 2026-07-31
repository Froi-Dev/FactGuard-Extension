import { useState, useEffect, useRef, useCallback } from "react";

/**
 * FactGuard — Canvas-Based Cropper Component
 *
 * Renders the captured screenshot on a canvas and lets the user
 * drag a rectangle to select a region. On confirmation, the cropped
 * region is extracted and sent back to the background service worker.
 */
export default function Cropper() {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);

  const [screenshot, setScreenshot] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selection, setSelection] = useState(null); // { startX, startY, endX, endY }
  const [dragStart, setDragStart] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [imageScale, setImageScale] = useState(1);

  // ─── Load screenshot from storage on mount ──────────────────────────────
  useEffect(() => {
    async function loadScreenshot() {
      try {
        const data = await chrome.storage.local.get("factguard_screenshot");
        const dataUrl = data.factguard_screenshot;

        if (!dataUrl) {
          console.error("[Cropper] No screenshot found in storage.");
          return;
        }

        // Create an Image element to get the natural dimensions
        const img = new Image();
        img.onload = () => {
          imageRef.current = img;

          // Scale the image to fit the window while maintaining aspect ratio
          const maxWidth = window.innerWidth;
          const maxHeight = window.innerHeight;
          const scale = Math.min(maxWidth / img.naturalWidth, maxHeight / img.naturalHeight, 1);

          const displayWidth = Math.floor(img.naturalWidth * scale);
          const displayHeight = Math.floor(img.naturalHeight * scale);

          setCanvasSize({ width: displayWidth, height: displayHeight });
          setImageScale(scale);
          setScreenshot(dataUrl);
        };
        img.src = dataUrl;
      } catch (err) {
        console.error("[Cropper] Failed to load screenshot:", err);
      }
    }

    loadScreenshot();
  }, []);

  // ─── Draw the canvas ────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");

    // Draw the screenshot
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // If there's a selection, draw the overlay and selection rectangle
    if (selection) {
      const { startX, startY, endX, endY } = selection;
      const x = Math.min(startX, endX);
      const y = Math.min(startY, endY);
      const w = Math.abs(endX - startX);
      const h = Math.abs(endY - startY);

      // Semi-transparent dark overlay over the ENTIRE canvas
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Clear the selected region (punch a hole to show the original image)
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      // White dashed border around selection
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);

      // Corner handles
      const handleSize = 8;
      ctx.fillStyle = "#6366f1";
      const corners = [
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h],
      ];
      corners.forEach(([cx, cy]) => {
        ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
      });

      // Selection dimensions label
      if (w > 40 && h > 20) {
        const origW = Math.round(w / imageScale);
        const origH = Math.round(h / imageScale);
        const label = `${origW} × ${origH}`;
        ctx.font = "12px -apple-system, sans-serif";
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        const textWidth = ctx.measureText(label).width;
        ctx.fillRect(x + w / 2 - textWidth / 2 - 6, y + h / 2 - 10, textWidth + 12, 20);
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x + w / 2, y + h / 2);
      }
    }
  }, [selection, imageScale]);

  // Re-draw whenever selection changes
  useEffect(() => {
    draw();
  }, [draw]);

  // Re-draw once the screenshot loads
  useEffect(() => {
    if (screenshot && canvasRef.current && imageRef.current) {
      draw();
    }
  }, [screenshot, canvasSize, draw]);

  // ─── Mouse Handlers ─────────────────────────────────────────────────────
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseDown = (e) => {
    const coords = getCanvasCoords(e);
    setDragStart(coords);
    setIsDragging(true);
    setSelection({ startX: coords.x, startY: coords.y, endX: coords.x, endY: coords.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !dragStart) return;
    const coords = getCanvasCoords(e);
    setSelection((prev) => ({
      ...prev,
      endX: coords.x,
      endY: coords.y,
    }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // ─── Confirm Crop ───────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!selection || !imageRef.current) return;

    const { startX, startY, endX, endY } = selection;
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);

    // Minimum selection size (at least 10px)
    if (w < 10 || h < 10) {
      alert("Please select a larger region.");
      return;
    }

    // Map display coordinates back to original image coordinates
    const origX = Math.round(x / imageScale);
    const origY = Math.round(y / imageScale);
    const origW = Math.round(w / imageScale);
    const origH = Math.round(h / imageScale);

    // Create an off-screen canvas to extract the cropped region
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = origW;
    cropCanvas.height = origH;
    const cropCtx = cropCanvas.getContext("2d");
    cropCtx.drawImage(imageRef.current, origX, origY, origW, origH, 0, 0, origW, origH);

    const croppedDataUrl = cropCanvas.toDataURL("image/png");

    // Send the cropped image to the background service worker
    try {
      await chrome.runtime.sendMessage({
        type: "CROP_COMPLETE",
        croppedImage: croppedDataUrl,
      });
    } catch (err) {
      console.error("[Cropper] Failed to send cropped image:", err);
    }

    // Close this window
    window.close();
  };

  // ─── Cancel ─────────────────────────────────────────────────────────────
  const handleCancel = async () => {
    try {
      await chrome.runtime.sendMessage({ type: "CROP_CANCELLED" });
    } catch (err) {
      console.error("[Cropper] Cancel message failed:", err);
    }
    window.close();
  };

  // ─── Keyboard shortcut: Escape to cancel, Enter to confirm ─────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") handleCancel();
      if (e.key === "Enter" && selection) handleConfirm();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  // ─── Loading State ──────────────────────────────────────────────────────
  if (!screenshot) {
    return (
      <div className="cropper-loading">
        <div className="skeleton-toolbar">
          <div className="skeleton-item" style={{ width: "120px", height: "20px" }}></div>
          <div className="skeleton-item" style={{ width: "160px", height: "32px" }}></div>
        </div>
        <div className="skeleton-canvas"></div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  const hasSelection = selection && Math.abs(selection.endX - selection.startX) > 10 && Math.abs(selection.endY - selection.startY) > 10;

  return (
    <div className="cropper-container">
      {/* Toolbar */}
      <div className="cropper-toolbar">
        <div className="toolbar-left">
          <svg className="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span className="toolbar-title">FactGuard — Select Region to Analyze</span>
        </div>
        <div className="toolbar-right">
          <button className="toolbar-btn btn-cancel" onClick={handleCancel}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Cancel
          </button>
          <button
            className={`toolbar-btn btn-confirm ${hasSelection ? "" : "disabled"}`}
            onClick={handleConfirm}
            disabled={!hasSelection}
          >
            {hasSelection ? "Confirm Crop" : "Select region to confirm"}
          </button>
        </div>
      </div>

      {/* Instruction Hint */}
      {!hasSelection && (
        <div className="cropper-hint">
          Click and drag across the canvas to select a region
        </div>
      )}

      {/* Canvas */}
      <div className="canvas-wrapper">
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="cropper-canvas"
          style={{ cursor: isDragging ? "crosshair" : "crosshair" }}
        />
      </div>
    </div>
  );
}
