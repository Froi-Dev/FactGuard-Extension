import { useState, useEffect, useCallback } from "react";
import { getResults, getStatus, getCroppedImage, clearAll, getTextHistory } from "../utils/storage.js";

/**
 * FactGuard Popup — Main UI Component
 * (Redesigned: Apple-level Minimal / Modern SaaS)
 */
export default function App() {
  const [status, setStatus] = useState("idle");
  const [results, setResults] = useState(null);
  const [croppedImage, setCroppedImage] = useState(null);
  const [textHistory, setTextHistory] = useState([]);

  // ─── Load state from storage on mount ───────────────────────────────────
  const loadState = useCallback(async () => {
    try {
      const currentStatus = await getStatus();
      const currentResults = await getResults();
      const currentCropped = await getCroppedImage();
      const currentTextHistory = await getTextHistory();

      setStatus(currentStatus || "idle");
      setResults(currentResults);
      setCroppedImage(currentCropped);
      setTextHistory(currentTextHistory || []);
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

  // ─── SVG Icons (Minimal & Semantic) ─────────────────────────────────────
  const ShieldIcon = () => (
    <svg className="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );

  const CheckIcon = () => (
    <svg className="verdict-icon" style={{ color: "#34C759" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );

  const WarningIcon = () => (
    <svg className="verdict-icon" style={{ color: "#FF3B30" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );

  return (
    <div className="popup-container">
      {/* Header */}
      <header className="popup-header">
        <div className="logo">
          <ShieldIcon />
          <span className="logo-text">FactGuard</span>
        </div>
        <span className="version-badge">v1.0</span>
      </header>

      {/* Main Content Area */}
      <main className="popup-content">

        {/* State 1: IDLE / DASHBOARD */}
        {status === "idle" && (
          <div className="dashboard-view">
            <div className="state-card">
              <div className="state-header">
                <h2 className="state-title">Image Analysis</h2>
                <p className="state-desc">Capture an image to verify its authenticity.</p>
              </div>

              <div className="steps-list">
                <div className="step">
                  <span className="step-num">1</span>
                  <span>Press <span className="kbd">Shift + Alt + F</span> to activate the cropper on any webpage.</span>
                </div>
              </div>
            </div>

            {/* Text Analysis History */}
            {textHistory.length > 0 && (
              <div className="history-section">
                <h3 className="section-title">Recent Text Checks</h3>
                <div className="history-list">
                  {textHistory.slice(0, 5).map((entry, idx) => {
                    const isFake = entry.result.isAIGenerated || entry.result.isFake;
                    return (
                      <div key={idx} className="history-item">
                        <div className="history-item-header">
                          <span className="history-snippet">"{entry.snippet}..."</span>
                          {isFake ? <WarningIcon /> : <CheckIcon />}
                        </div>
                        <div className="history-item-meta">
                          <span className="history-confidence">{entry.result.confidence}% Confidence</span>
                          <span className="history-time">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* State 2: CROPPING or ANALYZING (Skeleton Loading) */}
        {(status === "cropping" || status === "analyzing") && (
          <div className="state-card">
            <div className="state-header">
              <h2 className="state-title">
                {status === "cropping" ? "Waiting for Crop..." : "Analyzing Image..."}
              </h2>
              <p className="state-desc">
                {status === "cropping" ? "Select a region on the page." : "Running machine learning models."}
              </p>
            </div>

            {/* Skeleton Layout imitating the final results view */}
            <div className="skeleton-container">
              <div className="skeleton-img"></div>
              <div className="skeleton-text"></div>
              <div className="skeleton-text short"></div>
              <div className="skeleton-text"></div>
            </div>
          </div>
        )}

        {/* State 3: DONE (Results View) */}
        {status === "done" && results && (
          <div className="state-card results-card">

            {/* Cropped Image Thumbnail */}
            {croppedImage && (
              <div className="preview-thumbnail">
                <img src={croppedImage} alt="Cropped area" />
              </div>
            )}

            {/* Semantic Verdict Section */}
            <div className="verdict-section">
              {results.isFake ? <WarningIcon /> : <CheckIcon />}
              <div className="verdict-info">
                <span className="verdict-label">{results.label}</span>
                <span className="verdict-status">
                  {results.isFake ? "Requires attention" : "No manipulation detected"}
                </span>
              </div>
            </div>

            {/* Monochromatic Confidence Bar */}
            <div className="confidence-section">
              <div className="confidence-header">
                <span className="confidence-text">Model Confidence</span>
                <span className="confidence-value">{results.confidence}%</span>
              </div>
              <div className="confidence-track">
                <div
                  className="confidence-fill"
                  style={{ width: `${results.confidence}%` }}
                ></div>
              </div>
            </div>

            {/* Structured Details Grid */}
            <div className="details-grid">
              <div className="detail-item">
                <span className="detail-label">Model</span>
                <span className="detail-value">{results.details.model}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Time</span>
                <span className="detail-value">{results.details.analysisTime}</span>
              </div>
              <div className="detail-item detail-full">
                <span className="detail-label">Noise Signature</span>
                <span className="detail-value">{results.details.noiseAnalysis}</span>
              </div>
            </div>

            {/* Primary Action Button */}
            <button className="btn-primary" onClick={handleNewAnalysis}>
              Analyze Another Image
            </button>
          </div>
        )}
      </main>

      <footer className="popup-footer">
        Strict privacy. Images are processed securely.
      </footer>
    </div>
  );
}
