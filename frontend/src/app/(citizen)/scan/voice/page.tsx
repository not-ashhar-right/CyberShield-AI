"use client";

import { useState, useEffect } from "react";
import { ScannerLayout } from "@/components/scanner";
import { AudioUploadZone } from "@/components/voice/AudioUploadZone";
import { MicrophoneRecorder } from "@/components/voice/MicrophoneRecorder";
import { TranscriptViewer } from "@/components/voice/TranscriptViewer";
import { VoiceRiskDashboard } from "@/components/voice/VoiceRiskDashboard";
import { AIExecutiveSummary } from "@/components/voice/AIExecutiveSummary";
import { SuspiciousSentences } from "@/components/voice/SuspiciousSentences";
import { EntityGrid } from "@/components/voice/EntityGrid";
import { RecommendationPanel } from "@/components/voice/RecommendationPanel";
import { EvidenceExporter } from "@/components/voice/EvidenceExporter";
import {
  uploadAndTranscribe,
  uploadBlobAndTranscribe,
  analyzeTranscript,
  getVoiceHistory,
  type VoiceAnalysisResult,
  type VoiceHistoryItem
} from "@/services/api/voice";

type TabType = "upload" | "record" | "manual";

export default function VoiceScannerPage() {
  const [activeTab, setActiveTab] = useState<TabType>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [manualTranscript, setManualTranscript] = useState("");
  const [duration, setDuration] = useState(0);

  // Flow states
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<"idle" | "transcribing" | "analyzing">("idle");
  const [error, setError] = useState<string | null>(null);
  
  // Results
  const [result, setResult] = useState<VoiceAnalysisResult | null>(null);
  const [history, setHistory] = useState<VoiceHistoryItem[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  // Fetch history list at mount
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const data = await getVoiceHistory();
      setHistory(data || []);
    } catch (err) {
      console.warn("Failed to load history list:", err);
    }
  };

  const handleFileSelected = (file: File) => {
    setSelectedFile(file);
    setRecordedBlob(null);
    setError(null);
  };

  const handleFileCleared = () => {
    setSelectedFile(null);
    setError(null);
  };

  const handleRecordingComplete = (blob: Blob, recDuration: number) => {
    setRecordedBlob(blob);
    setSelectedFile(null);
    setDuration(recDuration);
    setError(null);
  };

  const handleRecordingCleared = () => {
    setRecordedBlob(null);
    setDuration(0);
    setError(null);
  };

  const executePipeline = async () => {
    setLoading(true);
    setError(null);

    try {
      let transcriptText = "";
      let mediaDuration = duration;
      let filename = "audio";
      let isWhisper = false;

      // ── Step 1: Handle Audio File or Recorded Blob ──
      if (activeTab === "upload" && selectedFile) {
        setStage("transcribing");
        filename = selectedFile.name;
        const transcribeRes = await uploadAndTranscribe(selectedFile);
        
        if (transcribeRes.whisperAvailable) {
          transcriptText = transcribeRes.transcript || "";
          mediaDuration = transcribeRes.duration || 0;
          isWhisper = true;
        } else {
          // Gemini failed or not configured, alert user to paste transcript manually
          setActiveTab("manual");
          throw new Error(`Unable to analyze audio. ${transcribeRes.error || "Gemini API unavailable"}`);
        }
      } else if (activeTab === "record" && recordedBlob) {
        setStage("transcribing");
        const transcribeRes = await uploadBlobAndTranscribe(recordedBlob);

        if (transcribeRes.whisperAvailable) {
          transcriptText = transcribeRes.transcript || "";
          mediaDuration = transcribeRes.duration || 0;
          isWhisper = true;
        } else {
          setActiveTab("manual");
          throw new Error(`Unable to analyze audio. ${transcribeRes.error || "Gemini API unavailable"}`);
        }
      } else if (activeTab === "manual") {
        if (manualTranscript.trim().length < 10) {
          throw new Error("Please enter a transcript of at least 10 characters.");
        }
        transcriptText = manualTranscript;
        mediaDuration = 0;
      } else {
        throw new Error("Please select an audio file or record a conversation first.");
      }

      // ── Step 2: Handle Scam Analysis ──
      setStage("analyzing");
      const analysisResult = await analyzeTranscript({
        transcript: transcriptText,
        duration: mediaDuration,
        filename,
        whisperAvailable: isWhisper,
      });

      setResult(analysisResult);
      setStage("idle");
      loadHistory(); // Refresh history log
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Scam analysis failed.");
      setStage("idle");
    } finally {
      setLoading(false);
    }
  };

  const resetScanner = () => {
    setResult(null);
    setSelectedFile(null);
    setRecordedBlob(null);
    setManualTranscript("");
    setDuration(0);
    setError(null);
    setStage("idle");
  };

  const showHistoryReport = async (scanId: string) => {
    setLoading(true);
    setError(null);
    try {
      // Create request payload to fetch/parse the previous report
      const res = await fetch(`http://localhost:4000/api/v1/voice/report/${scanId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("accessToken")}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load past report.");

      const scan = data.data;
      // Re-map the threat analysis to standard model result
      const mockResult: VoiceAnalysisResult = {
        scanId: scan.id,
        analysisId: scan.analysis?.id || "",
        riskScore: scan.analysis?.riskScore || 0,
        confidence: scan.analysis?.confidence || 1.0,
        threatLevel: (scan.analysis?.riskLevel || "LOW").toLowerCase() as any,
        scamCategory: scan.analysis?.summary || "Report",
        reasoning: "Retrieved from historic record logs.",
        recommendedAction: scan.analysis?.recommendation || "Contact support.",
        executiveSummary: scan.analysis?.summary || "",
        suspiciousSentences: [],
        recommendations: [scan.analysis?.recommendation || "Contact authorities."],
        extractedEntities: {
          phones: [], emails: [], upiIds: [], bankAccounts: [],
          urls: [], domains: [], ipAddresses: [], moneyAmounts: [],
          personNames: [], cities: [], governmentAgencies: [], merchantNames: [],
        },
        transcript: scan.content,
        duration: (scan.metadata as any)?.duration || 0,
        language: (scan.metadata as any)?.language || "unknown",
        segments: [],
        processingTime: scan.analysis?.processingTime || 0,
        createdAt: scan.createdAt,
        caseId: (scan.metadata as any)?.caseId || "N/A",
        whisperAvailable: (scan.metadata as any)?.whisperAvailable || false,
      };

      setResult(mockResult);
    } catch (err: any) {
      setError(err.message || "Failed to load historic scan details.");
    } finally {
      setLoading(false);
    }
  };

  // If a result is available, render the full detailed analysis dashboard
  if (result) {
    return (
      <ScannerLayout title="Voice Analysis Report" description={`Case ID: ${result.caseId}`} helpTips={[]}>
        <div className="space-y-6">
          {/* Main Risk scores and categorization gauges */}
          <VoiceRiskDashboard
            riskScore={result.riskScore}
            confidence={result.confidence}
            threatLevel={result.threatLevel}
            scamCategory={result.scamCategory}
            duration={result.duration}
            transcriptLength={result.transcript.length}
            processingTime={result.processingTime}
          />

          {/* AI Intel executive summary */}
          <AIExecutiveSummary summary={result.executiveSummary} />

          {/* Details splits */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SuspiciousSentences sentences={result.suspiciousSentences} />
            <EntityGrid entities={result.extractedEntities} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <TranscriptViewer
                transcript={result.transcript}
                language={result.language}
                duration={result.duration}
                segments={result.segments}
              />
            </div>
            <div className="space-y-6">
              <RecommendationPanel recommendations={result.recommendations} />
              <EvidenceExporter result={result} />
            </div>
          </div>

          <button
            onClick={resetScanner}
            className="px-5 py-2.5 rounded-xl font-mono text-xs font-bold text-[#EC9AA3] border border-[rgba(236,154,163,0.3)] bg-[#EC9AA3]/5 hover:bg-[#EC9AA3]/10 transition-colors"
          >
            Start New Scan
          </button>
        </div>
      </ScannerLayout>
    );
  }

  return (
    <ScannerLayout
      title="Voice Scam & Vishing Scanner"
      description="Record or upload phone calls to trace digital footprints, extract UPI/Phone identifiers, and run Graph AI ring mapping."
      helpTips={[
        "Max file size is 25 MB for MP3, WAV, M4A, OGG formats.",
        "Voice signals are secure and processed on private servers.",
        "Ensure calls do not share critical personal passwords/PINs."
      ]}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* SCANNER CORE PANEL (LEFT 2 COLUMNS) */}
        <div className="lg:col-span-2 space-y-5">
          {/* Action selection tabs */}
          <div className="flex border-b border-white/[0.06] font-mono text-xs">
            <button
              onClick={() => { setActiveTab("upload"); setError(null); }}
              className={`pb-3 px-4 font-bold border-b-2 transition-all ${
                activeTab === "upload"
                  ? "border-[#EC9AA3] text-[#EC9AA3]"
                  : "border-transparent text-[#B6B8C4]/50 hover:text-[#B6B8C4]"
              }`}
            >
              Upload File
            </button>
            <button
              onClick={() => { setActiveTab("record"); setError(null); }}
              className={`pb-3 px-4 font-bold border-b-2 transition-all ${
                activeTab === "record"
                  ? "border-[#EC9AA3] text-[#EC9AA3]"
                  : "border-transparent text-[#B6B8C4]/50 hover:text-[#B6B8C4]"
              }`}
            >
              Microphone Record
            </button>
            <button
              onClick={() => { setActiveTab("manual"); setError(null); }}
              className={`pb-3 px-4 font-bold border-b-2 transition-all ${
                activeTab === "manual"
                  ? "border-[#EC9AA3] text-[#EC9AA3]"
                  : "border-transparent text-[#B6B8C4]/50 hover:text-[#B6B8C4]"
              }`}
            >
              Manual Transcript
            </button>
          </div>

          <div className="p-5 rounded-2xl border border-[rgba(236,154,163,0.06)] bg-[#0A0A10]/60 backdrop-blur-md">
            {activeTab === "upload" && (
              <AudioUploadZone
                onFileSelected={handleFileSelected}
                onClear={handleFileCleared}
                selectedFile={selectedFile}
                disabled={loading}
              />
            )}

            {activeTab === "record" && (
              <MicrophoneRecorder
                onRecordingComplete={handleRecordingComplete}
                onClear={handleRecordingCleared}
                hasRecording={!!recordedBlob}
                disabled={loading}
              />
            )}

            {activeTab === "manual" && (
              <div className="space-y-2">
                <label htmlFor="manual-transcript-input" className="block text-xs font-mono font-medium text-[#B6B8C4]/60">
                  Call transcript content
                </label>
                <textarea
                  id="manual-transcript-input"
                  value={manualTranscript}
                  onChange={(e) => setManualTranscript(e.target.value.slice(0, 10000))}
                  placeholder="Paste vishing message transcript or caller conversation statements manually..."
                  className="w-full h-40 px-4 py-3 rounded-xl text-xs text-[#F8F8FA] bg-[#0D0D12] border border-[rgba(236,154,163,0.12)] placeholder:text-[#B6B8C4]/40 focus:outline-none focus:border-[rgba(236,154,163,0.4)] focus:shadow-[0_0_0_3px_rgba(236,154,163,0.08)] transition-all duration-200 resize-none font-mono"
                  disabled={loading}
                />
                <span className="text-[10px] text-[#B6B8C4]/45 font-mono tabular-nums block text-right">
                  {manualTranscript.length}/10000 chars
                </span>
              </div>
            )}
          </div>

          {error && (
            <div className="p-3.5 rounded-xl border border-red-500/20 bg-red-500/5 text-xs text-red-400 font-mono">
              {error}
            </div>
          )}

          {/* Trigger button */}
          <button
            onClick={executePipeline}
            disabled={
              loading ||
              (activeTab === "upload" && !selectedFile) ||
              (activeTab === "record" && !recordedBlob) ||
              (activeTab === "manual" && manualTranscript.trim().length < 10)
            }
            className="w-full py-3.5 rounded-xl font-mono font-black text-xs text-[#050508] bg-[#EC9AA3] hover:bg-[#f3b3ba] disabled:opacity-45 disabled:cursor-not-allowed hover:shadow-[0_0_24px_rgba(236,154,163,0.3)] transition-all uppercase tracking-wider flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-[#050508]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {stage === "transcribing" ? "Analyzing Audio with Gemini AI..." : "Analyzing Scam Signals..."}
              </>
            ) : (
              "Perform Intelligence Scan"
            )}
          </button>
        </div>

        {/* VOICE SCAN HISTORY LOGGER (RIGHT COLUMN) */}
        <div className="p-5 rounded-2xl border border-[rgba(236,154,163,0.06)] bg-[#0A0A10]/90 flex flex-col space-y-4">
          <div className="border-b border-white/[0.04] pb-3">
            <h4 className="text-[10px] font-black uppercase text-[#B6B8C4]/40 tracking-wider font-mono">
              Scam Intel History Log
            </h4>
            <p className="text-[10px] text-[#B6B8C4]/60 font-mono mt-1">
              Double-click any entry log to load previous investigation dossiers.
            </p>
          </div>

          <div className="space-y-3.5 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin flex-1">
            {history.length > 0 ? (
              history.map((h) => (
                <div
                  key={h.scanId}
                  onClick={() => showHistoryReport(h.scanId)}
                  className="p-3 rounded-xl border border-white/[0.02] bg-[#07070D] hover:bg-white/[0.02] transition-colors cursor-pointer font-mono space-y-2"
                >
                  <div className="flex items-center justify-between text-[11px] font-bold text-[#F8F8FA]">
                    <span className="truncate pr-1 uppercase text-[#EC9AA3]">
                      {h.scamCategory || "Scam Scan Log"}
                    </span>
                    <span className={`text-[9px] font-mono border px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                      h.riskScore >= 75
                        ? "bg-red-500/10 border-red-500/20 text-red-400"
                        : h.riskScore >= 40
                        ? "bg-orange-500/10 border-orange-500/20 text-orange-400"
                        : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    }`}>
                      {h.riskScore} Risk
                    </span>
                  </div>
                  <p className="text-[10px] text-[#B6B8C4]/60 leading-normal truncate">
                    {h.transcript}
                  </p>
                  <div className="text-[9px] text-[#B6B8C4]/35 flex justify-between">
                    <span>{new Date(h.createdAt).toLocaleDateString()}</span>
                    <span>ID: {h.scanId.substring(0, 8).toUpperCase()}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-[#B6B8C4]/30 font-mono italic text-center py-8">
                No past voice threat scans found.
              </p>
            )}
          </div>
        </div>

      </div>
    </ScannerLayout>
  );
}
