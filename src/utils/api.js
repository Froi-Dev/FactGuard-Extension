/**
 * VeriFai — Extension API Client
 *
 * Connects the extension to the VeriFai Backend (http://localhost:8000/api/v1).
 * Supports unauthenticated guest operations (detect-text, verify-news) and
 * authenticated operations when logged in.
 */

export const BACKEND_URL = "http://localhost:8000";
export const API_BASE = `${BACKEND_URL}/api/v1`;

const AUTH_STORAGE_KEY = "verifai_auth";

/**
 * Get stored auth credentials (token and user info)
 */
export async function getStoredAuth() {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const data = await chrome.storage.local.get(AUTH_STORAGE_KEY);
      return data[AUTH_STORAGE_KEY] || null;
    }
    const val = localStorage.getItem(AUTH_STORAGE_KEY);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

/**
 * Save auth credentials
 */
export async function saveAuth(authData) {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: authData });
    } else {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
    }
  } catch (err) {
    console.error("[VeriFai API] Failed to save auth:", err);
  }
}

/**
 * Clear auth credentials
 */
export async function clearAuth() {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.remove(AUTH_STORAGE_KEY);
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch (err) {
    console.error("[VeriFai API] Failed to clear auth:", err);
  }
}

/**
 * Helper to build auth headers
 */
async function buildHeaders(customHeaders = {}, includeAuth = true) {
  const headers = { ...customHeaders };
  if (includeAuth) {
    const auth = await getStoredAuth();
    if (auth?.access_token) {
      headers["Authorization"] = `Bearer ${auth.access_token}`;
    }
  }
  return headers;
}

/**
 * Check backend liveness and readiness
 */
export async function checkBackendHealth() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${BACKEND_URL}/live`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err.message || "Cannot connect to VeriFai backend" };
  }
}

/**
 * Detect AI-generated text using XLM-RoBERTa
 *
 * @param {string} text
 * @returns {Promise<Object>}
 */
export async function detectText(text) {
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    throw new Error("Please select or paste text to analyze.");
  }

  const auth = await getStoredAuth();
  const endpoint = auth?.access_token ? `${API_BASE}/detector/text` : `${API_BASE}/guest/detect-text`;
  const headers = await buildHeaders({ "Content-Type": "application/json" }, Boolean(auth?.access_token));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: text.trim() }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const msg = errJson.detail || (Array.isArray(errJson.detail) ? errJson.detail.map(d => d.message).join(", ") : "Text detection failed.");
      throw new Error(typeof msg === "string" ? msg : "Text detection failed.");
    }

    const data = await res.json();
    return {
      success: true,
      kind: "text",
      classification: data.classification,
      confidence: Math.round((data.confidence ?? 0) * 100),
      aiProbability: Math.round((data.ai_probability ?? 0) * 100),
      humanProbability: Math.round((data.human_probability ?? 0) * 100),
      signals: data.signals || [],
      scoreInterpretation: data.score_interpretation || "",
      chunksAnalyzed: data.chunks_analyzed || 1,
      inferenceTimeMs: Math.round(data.inference_time_ms || 0),
      cached: data.cached || false,
      modelName: data.model_name || "xlmr-ai-human-v4-enhanced",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verify Philippine news claims using evidence search pipeline
 *
 * @param {string} text
 * @returns {Promise<Object>}
 */
export async function verifyNews(text) {
  if (!text || typeof text !== "string" || text.trim().length < 5) {
    throw new Error("News claim must be at least 5 characters.");
  }

  const auth = await getStoredAuth();
  const endpoint = auth?.access_token ? `${API_BASE}/news/verify` : `${API_BASE}/guest/verify-news`;
  const headers = await buildHeaders({ "Content-Type": "application/json" }, Boolean(auth?.access_token));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: text.trim() }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const msg = errJson.detail || "News verification failed.";
      throw new Error(typeof msg === "string" ? msg : "News verification failed.");
    }

    const data = await res.json();
    return {
      success: true,
      kind: "news",
      verdict: data.verdict,
      status: data.status,
      confidence: data.confidence,
      explanation: data.explanation,
      contextWarnings: data.context_warnings || [],
      closestStory: data.closest_real_story || null,
      evidence: data.evidence || {},
      evidenceAnalysis: data.evidence_analysis || [],
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convert base64 data URL to Blob
 */
export function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(";base64,");
  const contentType = parts[0].split(":")[1] || "image/png";
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uInt8Array], { type: contentType });
}

/**
 * Detect AI image generation signals
 *
 * @param {string|Blob} imageInput - Base64 data URL or Blob
 * @returns {Promise<Object>}
 */
export async function detectImage(imageInput) {
  const blob = typeof imageInput === "string" ? dataUrlToBlob(imageInput) : imageInput;
  const formData = new FormData();
  formData.append("image", blob, "captured_region.png");

  const headers = await buildHeaders({}, true);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);

  try {
    const res = await fetch(`${API_BASE}/detector/image`, {
      method: "POST",
      headers,
      body: formData,
      signal: controller.signal,
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error("Sign in to your VeriFai account to run AI Image Forensics.");
      }
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || "Image analysis failed.");
    }

    const data = await res.json();
    return {
      success: true,
      kind: "media",
      classification: data.classification,
      confidence: data.confidence,
      aiProbability: data.ai_probability,
      authenticProbability: data.authentic_probability,
      summary: data.summary,
      signals: data.signals || [],
      limitations: data.limitations || "",
      model: data.model || "Gemini Vision",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verify Philippine news image graphic via OCR & fact check
 *
 * @param {string|Blob} imageInput - Base64 data URL or Blob
 * @returns {Promise<Object>}
 */
export async function verifyNewsImage(imageInput) {
  const blob = typeof imageInput === "string" ? dataUrlToBlob(imageInput) : imageInput;
  const formData = new FormData();
  formData.append("image", blob, "news_graphic.png");

  const headers = await buildHeaders({}, true);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch(`${API_BASE}/news/verify-image`, {
      method: "POST",
      headers,
      body: formData,
      signal: controller.signal,
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error("Sign in to your VeriFai account to run News Image Fact-Checking.");
      }
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || "Image fact-checking failed.");
    }

    const data = await res.json();
    return {
      success: true,
      kind: "news_image",
      classification: data.classification,
      confidence: data.confidence,
      overallVerdict: data.overall_verdict,
      reasoningSummary: data.reasoning_summary || data.summary,
      extracted: data.extracted || {},
      ocr: data.ocr || {},
      closestStory: data.closest_real_story || null,
      claims: data.claims || [],
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Login user
 */
export async function loginUser(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.detail || "Login failed");
  }

  const data = await res.json();
  const authPayload = {
    user: data.user,
    access_token: data.access_token || null,
    savedAt: new Date().toISOString(),
  };
  await saveAuth(authPayload);
  return authPayload;
}

/**
 * Get current user session
 */
export async function getCurrentUser() {
  const auth = await getStoredAuth();
  if (!auth?.access_token) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${auth.access_token}` },
    });
    if (!res.ok) {
      await clearAuth();
      return null;
    }
    const user = await res.json();
    return user;
  } catch {
    return auth.user || null;
  }
}

/**
 * Logout user
 */
export async function logoutUser() {
  const auth = await getStoredAuth();
  if (auth?.access_token) {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.access_token}` },
      });
    } catch {
      // Ignore network errors on logout
    }
  }
  await clearAuth();
}
