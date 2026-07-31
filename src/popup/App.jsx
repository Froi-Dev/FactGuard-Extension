import { useState, useEffect, useCallback } from "react";
import { getResults, getStatus, getCroppedImage, clearAll } from "../utils/storage.js";

/**
 * FactGuard Popup — Main UI Component
 *
 * Displays three states:
 *   1. IDLE — instructions with Shift+D shortcut
 *   2. ANALYZING — loading spinner while mock detector runs
 *   3. DONE — results card with label, confidence bar, and details
 */
export default function App() {
  const [status, setStatus] = useState("idle");
  const [results, setResults] = useState(null);
  const [croppedImage, setCroppedImage] = useState(null);

  // ─── Load state from storage on mount ───────────────────────────────────
  const loadState = useCallback(async () => {
    try {
      const currentStatus = await getStatus();
      const currentResults = await getResults();
      const currentCropped = await getCroppedImage();

      setStatus(currentStatus || "idle");
      setResults(currentResults);
      setCroppedImage(currentCropped);
    } catch (err) {
      console.error("[FactGuard Popup] Failed to load state:", err);
    }
  }, []);

  useEffect(() => {
    loadState();

    // Poll storage every 500ms to catch updates from background
    const interval = setInterval(loadState, 500);
    return () => clearInterval(interval);
  }, [loadState]);

  // ─── Reset to idle state ────────────────────────────────────────────────
  const handleNewAnalysis = async () => {
    await clearAll();
    setStatus("idle");
    setResults(null);
    setCroppedImage(null);
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="popup-container">
      {/* Header */}
      <header className="popup-header">
        <div className="logo">
          <svg className="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span className="logo-text">FactGuard</span>
        </div>
        <span className="version-badge">v1.0</span>
      </header>

      {/* Content */}
      <main className="popup-content">
        {status === "idle" && <IdleView />}
        {status === "cropping" && <CroppingView />}
        {status === "analyzing" && <AnalyzingView croppedImage={croppedImage} />}
        {status === "done" && results && (
          <ResultsView results={results} croppedImage={croppedImage} onNewAnalysis={handleNewAnalysis} />
        )}
        {status === "done" && !results && <IdleView />}
      </main>

      {/* Footer */}
      <footer className="popup-footer">
        <span>AI Content Detection Tool</span>
      </footer>
    </div>
  );
}

// ─── Idle View ────────────────────────────────────────────────────────────────
function IdleView() {
  return (
    <div className="state-card idle-card">
      <div className="idle-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </div>
      <h2 className="state-title">Ready to Analyze</h2>
      <p className="state-desc">
        Press <kbd className="kbd">Shift</kbd> + <kbd className="kbd">D</kbd> on any webpage to capture a screenshot and detect AI-generated content.
      </p>
      <div className="steps-list">
        <div className="step">
          <span className="step-num">1</span>
          <span>Press Shift+D to capture</span>
        </div>
        <div className="step">
          <span className="step-num">2</span>
          <span>Select a region to crop</span>
        </div>
        <div className="step">
          <span className="step-num">3</span>
          <span>View detection results</span>
        </div>
      </div>
    </div>
  );
}

// ─── Cropping View ────────────────────────────────────────────────────────────
function CroppingView() {
  return (
    <div className="state-card">
      <div className="pulse-container">
        <div className="pulse-ring" />
        <svg className="crop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15" />
          <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15" />
        </svg>
      </div>
      <h2 className="state-title">Cropping…</h2>
      <p className="state-desc">
        A cropper window has opened. Drag to select a region, then click <strong>Confirm Crop</strong>.
      </p>
    </div>
  );
}

// ─── Analyzing View ───────────────────────────────────────────────────────────
function AnalyzingView({ croppedImage }) {
  return (
    <div className="state-card">
      {croppedImage && (
        <div className="preview-thumbnail">
          <img src={croppedImage} alt="Cropped region" />
        </div>
      )}
      <div className="spinner-container">
        <div className="spinner" />
      </div>
      <h2 className="state-title">Analyzing…</h2>
      <p className="state-desc">Running AI detection on the selected region. This may take a moment.</p>
    </div>
  );
}

// ─── Results View ─────────────────────────────────────────────────────────────
function ResultsView({ results, croppedImage, onNewAnalysis }) {
  const isAI = results.isAIGenerated;
  const confidence = parseFloat(results.confidence);
  const labelClass = isAI ? "label-ai" : "label-human";

  return (
    <div className="state-card results-card">
      {/* Cropped image thumbnail */}
      {croppedImage && (
        <div className="preview-thumbnail">
          <img src={croppedImage} alt="Analyzed region" />
        </div>
      )}

      {/* Verdict Badge */}
      <div className={`verdict-badge ${labelClass}`}>
        <span className="verdict-dot" />
        <span className="verdict-label">{results.label}</span>
      </div>

      {/* Confidence Bar */}
      <div className="confidence-section">
        <div className="confidence-header">
          <span className="confidence-text">Confidence</span>
          <span className={`confidence-value ${labelClass}`}>{results.confidence}%</span>
        </div>
        <div className="confidence-track">
          <div
            className={`confidence-fill ${labelClass}`}
            style={{ width: `${confidence}%` }}
          />
        </div>
      </div>

      {/* Details */}
      <div className="details-grid">
        <div className="detail-item">
          <span className="detail-label">Model</span>
          <span className="detail-value">{results.details.model}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Analysis Time</span>
          <span className="detail-value">{results.details.analysisTime}</span>
        </div>
        <div className="detail-item detail-full">
          <span className="detail-label">Timestamp</span>
          <span className="detail-value">{new Date(results.details.timestamp).toLocaleString()}</span>
        </div>
      </div>

      {/* Action Button */}
      <button className="btn-primary" onClick={onNewAnalysis}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
        New Analysis
      </button>
    </div>
  );
}
