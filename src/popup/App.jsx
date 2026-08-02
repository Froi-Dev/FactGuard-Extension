import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Crop,
  Image as ImageIcon,
  Keyboard,
  LockKeyhole,
  MousePointer2,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  TextQuote,
} from "lucide-react";
import {
  clearImageAnalysis,
  getCroppedImage,
  getResults,
  getStatus,
  getTextHistory,
} from "../utils/storage.js";

const RESTRICTED_PROTOCOLS = ["chrome:", "edge:", "about:", "brave:", "view-source:"];

function isRestrictedPage(url = "") {
  try {
    const parsed = new URL(url);
    return RESTRICTED_PROTOCOLS.includes(parsed.protocol) ||
      parsed.hostname === "chrome.google.com" ||
      parsed.hostname === "chromewebstore.google.com";
  } catch {
    return true;
  }
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function App() {
  const [status, setStatus] = useState("idle");
  const [results, setResults] = useState(null);
  const [croppedImage, setCroppedImage] = useState(null);
  const [textHistory, setTextHistory] = useState([]);
  const [guide, setGuide] = useState(null);
  const [notice, setNotice] = useState(null);
  const [isStarting, setIsStarting] = useState(false);

  const loadState = useCallback(async () => {
    try {
      const [nextStatus, nextResults, nextCropped, nextHistory] = await Promise.all([
        getStatus(),
        getResults(),
        getCroppedImage(),
        getTextHistory(),
      ]);
      setStatus(nextStatus || "idle");
      setResults(nextResults);
      setCroppedImage(nextCropped);
      setTextHistory(nextHistory || []);
    } catch (error) {
      console.error("[FactGuard Popup] Failed to load state:", error);
      setNotice({ type: "error", text: "FactGuard could not read its saved results. Reopen the extension and try again." });
    }
  }, []);

  useEffect(() => {
    loadState();
    const interval = window.setInterval(loadState, 700);
    return () => window.clearInterval(interval);
  }, [loadState]);

  const startImageCheck = async () => {
    setIsStarting(true);
    setNotice(null);
    try {
      const response = await chrome.runtime.sendMessage({ type: "START_IMAGE_CAPTURE" });
      if (!response?.ok) {
        throw new Error(response?.error || "The screenshot tool could not start.");
      }
      window.close();
    } catch (error) {
      setGuide("image");
      setNotice({
        type: "error",
        text: error.message || "Open a normal webpage, then try the image check again.",
      });
    } finally {
      setIsStarting(false);
    }
  };

  const prepareTextCheck = async () => {
    setIsStarting(true);
    setNotice(null);
    setGuide("text");

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || isRestrictedPage(tab.url)) {
        throw new Error("Chrome blocks extensions on this page. Open an article or another regular website first.");
      }

      try {
        await chrome.tabs.sendMessage(tab.id, { type: "FACTGUARD_PING" });
      } catch {
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ["content/content.css"],
        });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content/content.js"],
        });
      }

      setNotice({
        type: "success",
        text: "Text checker is ready on this page. Close this popup, then highlight at least 10 characters.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: error.message || "Refresh the webpage and open FactGuard again.",
      });
    } finally {
      setIsStarting(false);
    }
  };

  const resetImage = async () => {
    await clearImageAnalysis();
    setStatus("idle");
    setResults(null);
    setCroppedImage(null);
    setGuide(null);
    setNotice(null);
  };

  const isImageFake = Boolean(results?.isAIGenerated ?? results?.isFake);
  const hasResultError = Boolean(results?.details?.error || results?.label === "Error");
  const needsAttention = isImageFake || hasResultError;
  const isDemoResult = results?.details?.model?.toLowerCase().includes("mock");
  const confidence = Math.min(100, Math.max(0, Number(results?.confidence) || 0));

  return (
    <div className="popup-shell">
      <div className="ambient-orb" aria-hidden="true" />

      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            setGuide(null);
            setNotice(null);
          }}
          aria-label="FactGuard home"
        >
          <span className="brand-mark"><ShieldCheck size={20} strokeWidth={2.2} /></span>
          <span>
            <strong>FactGuard</strong>
            <small>Content authenticity</small>
          </span>
        </button>
        <span className="privacy-chip"><LockKeyhole size={12} /> Local history</span>
      </header>

      <main className="popup-main">
        {status === "idle" && !guide && (
          <section className="home-view view-enter">
            <div className="intro">
              <p className="eyebrow">A second look, in seconds</p>
              <h1>What would you like to inspect?</h1>
              <p>Check a visible image or selected writing without leaving the page.</p>
            </div>

            <div className="tool-list">
              <button className="tool-row image-tool" onClick={startImageCheck} disabled={isStarting}>
                <span className="tool-icon"><ScanSearch size={25} /></span>
                <span className="tool-copy">
                  <strong>Check an image</strong>
                  <small>Capture and crop anything visible</small>
                </span>
                <ArrowRight className="row-arrow" size={19} />
              </button>

              <button className="tool-row text-tool" onClick={prepareTextCheck} disabled={isStarting}>
                <span className="tool-icon"><TextQuote size={25} /></span>
                <span className="tool-copy">
                  <strong>Check selected text</strong>
                  <small>Highlight writing on the current page</small>
                </span>
                <ArrowRight className="row-arrow" size={19} />
              </button>
            </div>

            <div className="shortcut-strip">
              <Keyboard size={17} />
              <span>Quick image capture</span>
              <kbd>Alt</kbd><span className="plus">+</span><kbd>Shift</kbd><span className="plus">+</span><kbd>F</kbd>
            </div>

            {textHistory.length > 0 && (
              <section className="recent-section">
                <div className="section-heading">
                  <h2>Recent text checks</h2>
                  <span>{textHistory.length} saved</span>
                </div>
                <div className="history-list">
                  {textHistory.slice(0, 3).map((entry, index) => {
                    const isAI = Boolean(entry.result?.isAIGenerated ?? entry.result?.isFake);
                    return (
                      <div className="history-row" key={`${entry.timestamp}-${index}`}>
                        <span className={`history-verdict ${isAI ? "caution" : "clear"}`}>
                          {isAI ? <AlertTriangle size={15} /> : <Check size={15} />}
                        </span>
                        <span className="history-copy">
                          <strong>{entry.snippet}{entry.snippet?.length >= 50 ? "…" : ""}</strong>
                          <small>{entry.result?.confidence}% confidence · {formatTime(entry.timestamp)}</small>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </section>
        )}

        {status === "idle" && guide === "image" && (
          <GuideView
            title="Check a visible image"
            subtitle="FactGuard captures only the tab you are viewing, then lets you choose the exact region."
            icon={<ImageIcon size={28} />}
            notice={notice}
            onBack={() => { setGuide(null); setNotice(null); }}
            steps={[
              { icon: <Keyboard size={18} />, title: "Start the capture", text: "Click below or press Alt + Shift + F on any regular webpage." },
              { icon: <Crop size={18} />, title: "Drag over the image", text: "A crop window opens. Select the area you want to inspect." },
              { icon: <CheckCircle2 size={18} />, title: "Confirm and review", text: "Choose Confirm Crop and reopen FactGuard to see the result." },
            ]}
            action={
              <button className="primary-action" onClick={startImageCheck} disabled={isStarting}>
                <ScanSearch size={18} />
                {isStarting ? "Starting capture…" : "Start image check"}
              </button>
            }
          />
        )}

        {status === "idle" && guide === "text" && (
          <GuideView
            title="Check selected text"
            subtitle="Works on articles, posts, documents, and most regular webpages."
            icon={<TextQuote size={28} />}
            notice={notice}
            onBack={() => { setGuide(null); setNotice(null); }}
            steps={[
              { icon: <MousePointer2 size={18} />, title: "Highlight the writing", text: "Select at least 10 characters on the current webpage." },
              { icon: <ShieldCheck size={18} />, title: "Choose Analyze", text: "A small FactGuard button appears beside your selection." },
              { icon: <CheckCircle2 size={18} />, title: "Read the result", text: "The verdict and confidence appear next to the selected text." },
            ]}
            action={
              <button className="primary-action" onClick={() => window.close()}>
                <MousePointer2 size={18} />
                {notice?.type === "error" ? "Close and open a webpage" : "Close and select text"}
              </button>
            }
          />
        )}

        {(status === "cropping" || status === "analyzing") && (
          <section className="progress-view view-enter" aria-live="polite">
            <div className="scan-visual">
              {croppedImage ? <img src={croppedImage} alt="Selected crop" /> : <ScanSearch size={40} />}
              <span className="scan-line" />
            </div>
            <p className="eyebrow">{status === "cropping" ? "Crop window active" : "Inspection in progress"}</p>
            <h1>{status === "cropping" ? "Select the region to check" : "Looking for visual signals…"}</h1>
            <p>{status === "cropping" ? "Drag over the image, then choose Confirm Crop." : "This usually takes only a moment."}</p>
            <div className="loading-line"><span /></div>
          </section>
        )}

        {status === "done" && results && (
          <section className="result-view view-enter">
            <div className="result-topline">
              <p className="eyebrow">Image check complete</p>
              <button className="icon-button" onClick={resetImage} aria-label="Start over"><RotateCcw size={17} /></button>
            </div>

            {croppedImage && <img className="result-image" src={croppedImage} alt="Analyzed selection" />}

            <div className={`verdict-block ${needsAttention ? "caution" : "clear"}`}>
              <span className="verdict-mark">
                {needsAttention ? <AlertTriangle size={25} /> : <CheckCircle2 size={25} />}
              </span>
              <span>
                <small>Assessment</small>
                <strong>{results.label || (isImageFake ? "Likely AI-generated" : "Likely authentic")}</strong>
              </span>
            </div>

            <div className="confidence-block">
              <div>
                <span>Model confidence</span>
                <strong>{confidence.toFixed(confidence % 1 ? 1 : 0)}%</strong>
              </div>
              <div className="confidence-track" aria-label={`${confidence}% model confidence`}>
                <span style={{ width: `${confidence}%` }} />
              </div>
            </div>

            <dl className="result-meta">
              <div><dt>Model</dt><dd>{results.details?.model || "FactGuard detector"}</dd></div>
              <div><dt>Analysis time</dt><dd>{results.details?.analysisTime || "—"}</dd></div>
            </dl>

            {isDemoResult && (
              <div className="notice demo"><AlertTriangle size={17} /><span>This build uses simulated detection results. Connect a real detector API before relying on verdicts.</span></div>
            )}

            {results.details?.error && (
              <div className="notice error"><AlertTriangle size={17} /><span>{results.details.error}</span></div>
            )}

            <button className="primary-action" onClick={resetImage}>
              <RotateCcw size={18} /> Check another image
            </button>
            <p className="disclaimer">AI detection is an estimate. Verify important decisions with additional sources.</p>
          </section>
        )}
      </main>

      <footer className="popup-footer">
        <span className="status-dot" /> Ready to inspect this page
        <span>v1.0</span>
      </footer>
    </div>
  );
}

function GuideView({ title, subtitle, icon, notice, onBack, steps, action }) {
  return (
    <section className="guide-view view-enter">
      <button className="back-button" onClick={onBack}><ArrowLeft size={17} /> All tools</button>
      <div className="guide-heading">
        <span className="guide-icon">{icon}</span>
        <div><h1>{title}</h1><p>{subtitle}</p></div>
      </div>

      {notice && (
        <div className={`notice ${notice.type}`} role="status">
          {notice.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{notice.text}</span>
        </div>
      )}

      <ol className="instruction-list">
        {steps.map((step, index) => (
          <li key={step.title}>
            <span className="step-icon">{step.icon}</span>
            <div><small>Step {index + 1}</small><strong>{step.title}</strong><p>{step.text}</p></div>
          </li>
        ))}
      </ol>
      {action}
      <p className="restricted-note"><LockKeyhole size={13} /> Browser settings and Web Store pages do not allow extension tools.</p>
    </section>
  );
}
