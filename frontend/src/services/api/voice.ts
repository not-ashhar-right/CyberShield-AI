/**
 * Voice Analysis API Client
 * Handles all communication with the backend voice analysis endpoints.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken");
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handleUnauthorized() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user");
    window.location.href = "/login?role=citizen";
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TranscribeResult {
  whisperAvailable: boolean;
  message?: string;
  transcript?: string;
  duration?: number;
  language?: string;
  segments?: Array<{ start: number; end: number; text: string }>;
  filename: string;
  mimeType: string;
  fileSize: number;
}

export interface SuspiciousSentence {
  text: string;
  reason: string;
  severity: "low" | "medium" | "high";
}

export interface ExtractedVoiceEntities {
  phones: string[];
  emails: string[];
  upiIds: string[];
  bankAccounts: string[];
  urls: string[];
  domains: string[];
  ipAddresses: string[];
  moneyAmounts: string[];
  personNames: string[];
  cities: string[];
  governmentAgencies: string[];
  merchantNames: string[];
}

export interface VoiceAnalysisResult {
  scanId: string;
  analysisId: string;
  riskScore: number;
  confidence: number;
  threatLevel: "low" | "medium" | "high" | "critical";
  scamCategory: string;
  reasoning: string;
  recommendedAction: string;
  executiveSummary: string;
  suspiciousSentences: SuspiciousSentence[];
  recommendations: string[];
  extractedEntities: ExtractedVoiceEntities;
  transcript: string;
  duration: number;
  language: string;
  segments: Array<{ start: number; end: number; text: string }>;
  processingTime: number;
  createdAt: string;
  caseId: string;
  whisperAvailable: boolean;
}

export interface VoiceHistoryItem {
  scanId: string;
  transcript: string;
  riskScore: number;
  riskLevel: string;
  summary: string;
  createdAt: string;
  scamCategory?: string;
}

// ─── API Functions ─────────────────────────────────────────────────────────────

/**
 * Upload an audio file and analyze/transcribe it via Google Gemini.
 * Returns whether Gemini is available + transcript if available.
 */
export async function uploadAndTranscribe(file: File): Promise<TranscribeResult> {
  const formData = new FormData();
  formData.append("audio", file, file.name);

  const res = await fetch(`${BASE}/voice/transcribe`, {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
    body: formData,
  });

  if (res.status === 401) { handleUnauthorized(); throw new Error("Session expired."); }

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Transcription failed.");
  return json.data as TranscribeResult;
}

/**
 * Send a transcript to the backend for Gemini scam analysis.
 */
export async function analyzeTranscript(params: {
  transcript: string;
  duration?: number;
  language?: string;
  filename?: string;
  segments?: Array<{ start: number; end: number; text: string }>;
  whisperAvailable?: boolean;
}): Promise<VoiceAnalysisResult> {
  const res = await fetch(`${BASE}/voice/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    credentials: "include",
    body: JSON.stringify(params),
  });

  if (res.status === 401) { handleUnauthorized(); throw new Error("Session expired."); }

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Analysis failed.");
  return json.data as VoiceAnalysisResult;
}

/**
 * Upload a Blob (from microphone recording) as a file.
 */
export async function uploadBlobAndTranscribe(
  blob: Blob,
  filename = "recording.webm"
): Promise<TranscribeResult> {
  const file = new File([blob], filename, { type: blob.type || "audio/webm" });
  return uploadAndTranscribe(file);
}

/**
 * Get the authenticated user's voice analysis history.
 */
export async function getVoiceHistory(): Promise<VoiceHistoryItem[]> {
  const res = await fetch(`${BASE}/voice/history`, {
    headers: authHeaders(),
    credentials: "include",
  });

  if (res.status === 401) { handleUnauthorized(); throw new Error("Session expired."); }

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to load history.");
  return json.data as VoiceHistoryItem[];
}

/**
 * Get a single voice analysis report by scan ID.
 */
export async function getVoiceReport(scanId: string): Promise<any> {
  const res = await fetch(`${BASE}/voice/report/${scanId}`, {
    headers: authHeaders(),
    credentials: "include",
  });

  if (res.status === 401) { handleUnauthorized(); throw new Error("Session expired."); }

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to load report.");
  return json.data;
}
