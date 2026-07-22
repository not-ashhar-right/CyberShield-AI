"use client";

import { useState, useCallback, useRef, DragEvent, ChangeEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ScannerLayout } from "@/components/scanner";
import { currencyApi, type CurrencyResult } from "@/services/api/scanner";

// ── Constants ───────────────────────────────────────────────────────────────
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_MB = 10;

// ── Risk level helpers ───────────────────────────────────────────────────────
const RISK_META: Record<string, { label: string; color: string; bg: string; border: string; glow: string }> = {
  CRITICAL: { label: "Counterfeit Detected",  color: "#FF4D4F", bg: "rgba(255,77,79,0.08)",   border: "rgba(255,77,79,0.3)",   glow: "rgba(255,77,79,0.2)"   },
  HIGH:     { label: "Likely Counterfeit",    color: "#FF8C00", bg: "rgba(255,140,0,0.08)",   border: "rgba(255,140,0,0.3)",   glow: "rgba(255,140,0,0.2)"   },
  LOW:      { label: "Possibly Genuine",      color: "#FADB14", bg: "rgba(250,219,20,0.08)",  border: "rgba(250,219,20,0.3)",  glow: "rgba(250,219,20,0.2)"  },
  SAFE:     { label: "Genuine Note",          color: "#52C41A", bg: "rgba(82,196,26,0.08)",   border: "rgba(82,196,26,0.3)",   glow: "rgba(82,196,26,0.2)"   },
};

// ── Sub-components ───────────────────────────────────────────────────────────

function ConfidenceBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.8, ease: [0.22, 0.03, 0.26, 1] }}
        className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${color}88, ${color})` }}
      />
    </div>
  );
}

function ResultCard({ result, onReset }: { result: CurrencyResult; onReset: () => void }) {
  const meta = RISK_META[result.riskLevel] ?? RISK_META.SAFE;
  const isFake = result.prediction === "fake";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 0.03, 0.26, 1] }}
      className="space-y-4"
    >
      {/* Verdict banner */}
      <div
        className="rounded-2xl p-5 border"
        style={{
          background: meta.bg,
          borderColor: meta.border,
          boxShadow: `0 0 24px ${meta.glow}`,
        }}
      >
        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl"
            style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
          >
            {isFake ? "⚠️" : "✅"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: meta.color }}>
              {meta.label}
            </p>
            <p className="text-sm text-[#F8F8FA] leading-relaxed">{result.summary}</p>
          </div>
        </div>

        {/* Confidence bar */}
        <div className="mt-4 space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-[#B6B8C4]">AI Confidence</span>
            <span style={{ color: meta.color }} className="font-semibold tabular-nums">
              {result.confidence.toFixed(1)}%
            </span>
          </div>
          <ConfidenceBar value={result.confidence} color={meta.color} />
        </div>
      </div>

      {/* Advice */}
      <div className="rounded-xl p-4 bg-[#0D0D12] border border-[rgba(236,154,163,0.08)]">
        <p className="text-xs font-semibold text-[#EC9AA3] uppercase tracking-wider mb-2">
          What to do
        </p>
        <pre className="text-[12px] text-[#B6B8C4] leading-relaxed whitespace-pre-wrap font-sans">
          {result.advice}
        </pre>
      </div>

      {/* Meta */}
      <p className="text-[10px] text-[#B6B8C4]/50 text-center">
        Analysed at {new Date(result.processedAt).toLocaleString()}
      </p>

      {/* Reset */}
      <button
        onClick={onReset}
        className="w-full py-3 rounded-xl text-sm font-semibold text-[#F8F8FA] bg-[rgba(236,154,163,0.1)] border border-[rgba(236,154,163,0.15)] hover:bg-[rgba(236,154,163,0.18)] hover:border-[rgba(236,154,163,0.3)] active:scale-[0.98] transition-all duration-200"
      >
        Scan Another Note
      </button>
    </motion.div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function FakeCurrencyPage() {
  const [file,      setFile]    = useState<File | null>(null);
  const [preview,   setPreview] = useState<string | null>(null);
  const [loading,   setLoading] = useState(false);
  const [result,    setResult]  = useState<CurrencyResult | null>(null);
  const [error,     setError]   = useState<string | null>(null);
  const [dragging,  setDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File | null) => {
    if (!f) return;
    if (!ALLOWED_TYPES.includes(f.type)) {
      setError(`Unsupported format. Please upload a JPEG, PNG, or WEBP image.`);
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`File is too large. Maximum size is ${MAX_MB} MB.`);
      return;
    }
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }, []);

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0] ?? null);
  }, [handleFile]);

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0] ?? null);
  };

  const onScan = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const data = await currencyApi.scan(file);
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Scan failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const onReset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  // ── Result view ────────────────────────────────────────────────────────────
  if (result) {
    return (
      <ScannerLayout title="Fake Currency Detector" description="Analysis complete.">
        <ResultCard result={result} onReset={onReset} />
      </ScannerLayout>
    );
  }

  // ── Upload view ────────────────────────────────────────────────────────────
  return (
    <ScannerLayout
      title="Fake Currency Detector"
      description="Upload a photo of a currency note to check if it is genuine or counterfeit."
      helpTips={[
        "Photograph the note under good lighting with no shadows.",
        "Capture both sides of the note for best results.",
        "Supported formats: JPEG, PNG, WEBP (max 10 MB).",
        "The AI model checks visual patterns, printing quality, and security features.",
        "Always verify with an official UV / magnetic ink detector when in doubt.",
      ]}
    >
      <div className="space-y-4">
        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload currency note image"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className="relative w-full min-h-[220px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 cursor-pointer select-none transition-all duration-200 overflow-hidden focus:outline-none focus:ring-2 focus:ring-[rgba(236,154,163,0.4)]"
          style={{
            borderColor: dragging
              ? "rgba(236,154,163,0.55)"
              : preview ? "rgba(236,154,163,0.25)" : "rgba(236,154,163,0.15)",
            background:  dragging
              ? "rgba(236,154,163,0.07)"
              : "rgba(13,13,18,0.6)",
          }}
        >
          <AnimatePresence mode="wait">
            {preview ? (
              <motion.img
                key="preview"
                src={preview}
                alt="Currency note preview"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 w-full h-full object-contain p-2"
              />
            ) : (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-2 pointer-events-none"
              >
                <BanknoteUploadIcon dragging={dragging} />
                <p className="text-sm font-medium text-[#F8F8FA]">
                  {dragging ? "Drop your image here" : "Drag & drop a currency note photo"}
                </p>
                <p className="text-[11px] text-[#B6B8C4]/60">
                  or <span className="text-[#EC9AA3]">click to browse</span> · JPEG / PNG / WEBP · max 10 MB
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Overlay label when image loaded */}
          {preview && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 backdrop-blur-sm text-[10px] text-[#B6B8C4] border border-white/10"
            >
              Click to change image
            </motion.div>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={inputRef}
          id="currency-upload"
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          onChange={onInputChange}
          className="hidden"
        />

        {/* File info */}
        <AnimatePresence>
          {file && !error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center justify-between px-4 py-2 rounded-xl bg-[rgba(236,154,163,0.06)] border border-[rgba(236,154,163,0.12)] text-[11px]"
            >
              <span className="text-[#B6B8C4] truncate max-w-[200px]">{file.name}</span>
              <span className="text-[#EC9AA3] font-medium ml-2 flex-shrink-0">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs text-red-400 px-1"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Scan button */}
        <button
          id="currency-scan-btn"
          onClick={onScan}
          disabled={!file || loading}
          className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{
            background: !file || loading
              ? "rgba(236,154,163,0.1)"
              : "linear-gradient(135deg, rgba(236,154,163,0.25), rgba(236,154,163,0.15))",
            border: "1px solid rgba(236,154,163,0.25)",
            color: "#F8F8FA",
            boxShadow: file && !loading ? "0 0 16px rgba(236,154,163,0.1)" : "none",
          }}
        >
          {loading ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-[#EC9AA3] border-t-transparent animate-spin" />
              Analysing note…
            </>
          ) : (
            <>
              <BanknoteCheckIcon />
              Detect Fake Currency
            </>
          )}
        </button>
      </div>
    </ScannerLayout>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function BanknoteUploadIcon({ dragging }: { dragging: boolean }) {
  return (
    <motion.div
      animate={{ scale: dragging ? 1.15 : 1, rotate: dragging ? -4 : 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="w-14 h-14 rounded-2xl flex items-center justify-center"
      style={{
        background: "rgba(236,154,163,0.07)",
        border: "1px solid rgba(236,154,163,0.15)",
        color: "rgba(236,154,163,0.7)",
      }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <circle cx="12" cy="12" r="2" />
        <path d="M6 12h.01M18 12h.01" />
        <path d="M12 3v3M10 4l2-1 2 1" />
      </svg>
    </motion.div>
  );
}

function BanknoteCheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  );
}
