/**
 * Voice Scam Analysis Service
 *
 * Handles:
 * 1. Audio transcription and analysis via Google Gemini API
 * 2. Scam classification via Gemini AI
 * 3. Entity extraction and Graph AI integration
 * 4. Persistence via the existing ThreatScan / ThreatAnalysis models
 * 5. History retrieval
 */

import { env } from "../../config/env.js";
import { getAIProvider } from "../ai/ai.provider.js";
import { graphService } from "../graph/index.js";
import { prisma } from "../../config/database.js";
import { buildVoiceScamAnalysisPrompt } from "./voice.prompts.js";
import type { RiskLevel } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeminiTranscriptResult {
  transcript: string;
  duration: number;       // seconds
  language: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  whisperAvailable?: boolean; // kept for backwards compatibility of response schema
  error?: string;
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

export interface VoiceScamAnalysisResult {
  scanId: string;
  analysisId: string;
  riskScore: number;
  confidence: number;
  threatLevel: string;
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
  whisperAvailable: boolean; // kept for response schema compatibility
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

// ─── Constants & Caching ──────────────────────────────────────────────────────

const SUPPORTED_MIME_TYPES: Record<string, string> = {
  "audio/mpeg":  "mp3",
  "audio/mp3":   "mp3",
  "audio/wav":   "wav",
  "audio/wave":  "wav",
  "audio/x-wav": "wav",
  "audio/mp4":   "mp4",
  "audio/m4a":   "m4a",
  "audio/x-m4a": "m4a",
  "audio/ogg":   "ogg",
  "audio/webm":  "webm",
  "video/webm":  "webm",
  "audio/aac":   "aac",
  "audio/x-aac": "aac",
};

// In-memory cache to store full Gemini analysis from transcription step
const analysisCache = new Map<string, any>();

// ─── Gemini Audio Transcription & Analysis ───────────────────────────────────

/**
 * Send audio buffer to Google Gemini API for transcript + scam classification.
 * Returns transcript + metadata. Cache analysis result for next pipeline stage.
 */
export async function transcribeAudio(
  buffer: Buffer,
  mimeType: string,
  originalName: string
): Promise<GeminiTranscriptResult | null> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[Voice] GEMINI_API_KEY not set — skipping Gemini transcription.");
    return {
      transcript: "",
      duration: 0,
      language: "unknown",
      segments: [],
      whisperAvailable: false,
      error: "Invalid API Key: GEMINI_API_KEY is not configured.",
    };
  }

  try {
    console.log(`[Voice] upload received: ${originalName} (${buffer.length} bytes, MIME: ${mimeType})`);
    console.log(`[Voice] transcription started for ${originalName} using Gemini AI`);

    const base64Audio = buffer.toString("base64");
    const provider = getAIProvider();

    const prompt = `You are an expert cybercrime investigation AI.
Analyze this phone conversation.
Return ONLY JSON.
{
 transcript:"",
 language:"",
 confidence:0,
 summary:"",
 risk_score:0,
 scam_type:"",
 entities:{
 phone_numbers:[],
 upi_ids:[],
 urls:[],
 emails:[],
 bank_accounts:[],
 names:[],
 locations:[],
 devices:[]
 },
 scam_indicators:[],
 social_engineering_techniques:[],
 recommended_action:"",
 graph_nodes:[]
}`;

    const response = await provider.analyzeAudio(base64Audio, mimeType, prompt);

    const cleaned = response
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let resultJson: any;
    try {
      resultJson = JSON.parse(cleaned);
    } catch {
      throw new Error("Unable to parse Gemini analysis response. No speech detected or invalid response.");
    }

    console.log(`[Voice] transcription completed for ${originalName}`);
    console.log(`[Voice] language detected: ${resultJson.language || "unknown"}`);
    
    // Store full result in memory cache to bypass Gemini analyze call later
    const cacheKey = (resultJson.transcript || "").trim();
    if (cacheKey) {
      analysisCache.set(cacheKey, resultJson);
    }

    return {
      transcript: resultJson.transcript || "",
      duration: 0, // Duration computed on frontend or defaulted
      language: resultJson.language || "unknown",
      segments: [],
      whisperAvailable: true,
    };
  } catch (err: any) {
    console.error("[Voice] Gemini errors in transcription:", err);
    return {
      transcript: "",
      duration: 0,
      language: "unknown",
      segments: [],
      whisperAvailable: false,
      error: err.message || "Gemini API unavailable",
    };
  }
}

// ─── Gemini Scam Analysis Fallback ────────────────────────────────────────────

async function classifyTranscriptWithGemini(transcript: string) {
  const provider = getAIProvider();
  const systemPrompt =
    "You are AEGIS, India's cyber crime intelligence AI. " +
    "Respond with valid JSON only. No markdown, no code blocks.";

  const prompt = `You are an expert cybercrime investigation AI.
Analyze this phone conversation transcript.
Return ONLY JSON.
{
 transcript: "",
 language: "",
 confidence: 0,
 summary: "",
 risk_score: 0,
 scam_type: "",
 entities: {
   phone_numbers: [],
   upi_ids: [],
   urls: [],
   emails: [],
   bank_accounts: [],
   names: [],
   locations: [],
   devices: []
 },
 scam_indicators: [],
 social_engineering_techniques: [],
 recommended_action: "",
 graph_nodes: []
}

Transcript:
"${transcript}"`;

  const raw = await provider.analyzeText(prompt, systemPrompt);

  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    console.warn("[Voice] Gemini returned non-JSON, using safe defaults. Raw:", raw.slice(0, 200));
    return {
      risk_score: 0,
      confidence: 0.1,
      summary: "AI analysis could not be completed.",
      scam_type: "Analysis Unavailable",
      recommended_action: "Review manually.",
      entities: {
        phone_numbers: [], upi_ids: [], urls: [], emails: [], bank_accounts: [],
        names: [], locations: [], devices: []
      },
      scam_indicators: [],
      social_engineering_techniques: []
    };
  }
}

// ─── Risk Level Helper ────────────────────────────────────────────────────────

function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

// ─── Case ID Generator ────────────────────────────────────────────────────────

function generateCaseId(): string {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `VA-${y}${m}${d}-${rand}`;
}

// ─── Main Analyze Function ────────────────────────────────────────────────────

export async function analyzeVoiceTranscript(
  transcript: string,
  userId: string,
  metadata: {
    duration?: number;
    language?: string;
    filename?: string;
    segments?: Array<{ start: number; end: number; text: string }>;
    whisperAvailable?: boolean;
  } = {}
): Promise<VoiceScamAnalysisResult> {
  const startTime = Date.now();

  if (!transcript || transcript.trim().length < 10) {
    throw new Error("Transcript is too short to analyze. Minimum 10 characters required.");
  }

  const cacheKey = transcript.trim();
  let geminiResult: any;

  if (analysisCache.has(cacheKey)) {
    console.log("[Voice] Cache hit: utilizing pre-computed Gemini audio understanding analysis");
    geminiResult = analysisCache.get(cacheKey);
    analysisCache.delete(cacheKey); // clear cache
  } else {
    console.log("[Voice] Cache miss: invoking text-based transcript analysis");
    geminiResult = await classifyTranscriptWithGemini(transcript);
  }

  const riskScore = Math.max(0, Math.min(100, Number(geminiResult.risk_score !== undefined ? geminiResult.risk_score : geminiResult.riskScore) || 0));
  const confidence = Math.max(0, Math.min(1, Number(geminiResult.confidence) || 0.5));
  const threatLevel = scoreToRiskLevel(riskScore).toLowerCase();
  const riskLevel = scoreToRiskLevel(riskScore);

  const processingTime = Date.now() - startTime;
  const caseId = generateCaseId();

  // Persist to ThreatScan + ThreatAnalysis (voice type)
  const scan = await prisma.threatScan.create({
    data: {
      userId,
      scanType: "VOICE",
      content: transcript.slice(0, 10000), // Cap to avoid DB limits
      status: "COMPLETED",
      metadata: {
        duration:          metadata.duration ?? 0,
        language:          geminiResult.language || metadata.language || "unknown",
        filename:          metadata.filename ?? "audio",
        scamCategory:      geminiResult.scam_type || geminiResult.scamCategory || "General Phishing",
        whisperAvailable:  false, // Whisper removed
        caseId,
      },
    },
  });

  const analysis = await prisma.threatAnalysis.create({
    data: {
      scanId:         scan.id,
      riskScore,
      riskLevel,
      summary:        geminiResult.scam_type || geminiResult.scamCategory || "General Phishing",
      recommendation: geminiResult.recommended_action || geminiResult.recommendedAction || "Exercise caution.",
      confidence,
      processingTime,
    },
  });

  // Feed Graph AI integration
  graphService.processScan(scan.id, transcript, riskLevel).catch((err) => {
    console.warn("[Voice] Graph indexing failed (non-critical):", err.message);
  });

  const ents = geminiResult.entities || {};
  const extractedEntities: ExtractedVoiceEntities = {
    phones: Array.isArray(ents.phone_numbers) ? ents.phone_numbers : (Array.isArray(ents.phones) ? ents.phones : []),
    emails: Array.isArray(ents.emails) ? ents.emails : [],
    upiIds: Array.isArray(ents.upi_ids) ? ents.upi_ids : (Array.isArray(ents.upiIds) ? ents.upiIds : []),
    bankAccounts: Array.isArray(ents.bank_accounts) ? ents.bank_accounts : (Array.isArray(ents.bankAccounts) ? ents.bankAccounts : []),
    urls: Array.isArray(ents.urls) ? ents.urls : [],
    domains: (Array.isArray(ents.urls) ? ents.urls : []).map((u: string) => {
      try { return new URL(u).hostname; } catch { return u; }
    }),
    ipAddresses: [],
    moneyAmounts: [],
    personNames: Array.isArray(ents.names) ? ents.names : (Array.isArray(ents.personNames) ? ents.personNames : []),
    cities: Array.isArray(ents.locations) ? ents.locations : (Array.isArray(ents.cities) ? ents.cities : []),
    governmentAgencies: [],
    merchantNames: [],
  };

  const suspiciousSentences = (geminiResult.scam_indicators || geminiResult.suspiciousSentences || []).map((indicator: any) => {
    if (typeof indicator === "object" && indicator !== null) return indicator;
    return {
      text: String(indicator),
      reason: "Detected engineering pattern / indicator of threat.",
      severity: "high" as const,
    };
  });

  const recommendations = Array.isArray(geminiResult.social_engineering_techniques)
    ? [geminiResult.recommended_action || geminiResult.recommendedAction, ...geminiResult.social_engineering_techniques]
    : (Array.isArray(geminiResult.recommendations) ? geminiResult.recommendations : [geminiResult.recommended_action || geminiResult.recommendedAction || "Disconnect immediately."]);

  return {
    scanId:              scan.id,
    analysisId:          analysis.id,
    riskScore,
    confidence,
    threatLevel,
    scamCategory:        geminiResult.scam_type || geminiResult.scamCategory || "General Phishing",
    reasoning:           geminiResult.summary || geminiResult.reasoning || "Conversation analyzed.",
    recommendedAction:   geminiResult.recommended_action || geminiResult.recommendedAction || "Disconnect immediately.",
    executiveSummary:    geminiResult.summary || geminiResult.executiveSummary || "Conversation analyzed.",
    suspiciousSentences,
    recommendations,
    extractedEntities,
    transcript,
    duration:            metadata.duration  ?? 0,
    language:            geminiResult.language || metadata.language || "unknown",
    segments:            [],
    processingTime,
    createdAt:           scan.createdAt.toISOString(),
    caseId,
    whisperAvailable:    false,
  };
}

// ─── History ──────────────────────────────────────────────────────────────────

/** Return the user's 20 most recent VOICE scans */
export async function getVoiceHistory(userId: string): Promise<VoiceHistoryItem[]> {
  const scans = await prisma.threatScan.findMany({
    where:   { userId, scanType: "VOICE" },
    orderBy: { createdAt: "desc" },
    take:    20,
    include: { analysis: true },
  });

  return scans.map((s) => ({
    scanId:       s.id,
    transcript:   s.content.slice(0, 200) + (s.content.length > 200 ? "…" : ""),
    riskScore:    s.analysis?.riskScore ?? 0,
    riskLevel:    (s.analysis?.riskLevel ?? "LOW").toLowerCase(),
    summary:      s.analysis?.summary ?? "",
    createdAt:    s.createdAt.toISOString(),
    scamCategory: (s.metadata as any)?.scamCategory ?? undefined,
  }));
}

/** Return one full scan + metadata (for report view) */
export async function getVoiceReport(scanId: string, userId: string) {
  const scan = await prisma.threatScan.findFirst({
    where:   { id: scanId, userId, scanType: "VOICE" },
    include: { analysis: { include: { indicators: true } } },
  });
  return scan;
}
