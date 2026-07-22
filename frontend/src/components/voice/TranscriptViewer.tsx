"use client";

import { useState } from "react";
import { motion } from "framer-motion";

interface TranscriptViewerProps {
  transcript: string;
  language?: string;
  duration?: number;
  segments?: Array<{ start: number; end: number; text: string }>;
}

export function TranscriptViewer({ transcript, language, duration, segments }: TranscriptViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const header = `CYBERSHIELD AI - VOICE SCAM REPORT TRANSCRIPT\nDuration: ${duration ? Math.floor(duration) + "s" : "N/A"}\nLanguage: ${language || "Unknown"}\nDate: ${new Date().toLocaleString()}\n--------------------------------------------------\n\n`;
    let body = "";
    if (segments && segments.length > 0) {
      body = segments
        .map((s) => {
          const min = Math.floor(s.start / 60);
          const sec = Math.floor(s.start % 60);
          const stamp = `[${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}]`;
          return `${stamp} ${s.text}`;
        })
        .join("\n");
    } else {
      body = transcript;
    }

    const blob = new Blob([header + body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cybershield_voice_transcript_${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatTime = (timeSeconds: number) => {
    const min = Math.floor(timeSeconds / 60);
    const sec = Math.floor(timeSeconds % 60);
    return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div className="p-5 rounded-2xl border border-[rgba(236,154,163,0.08)] bg-[#0A0A10]/90 space-y-4">
      <div className="flex items-center justify-between border-b border-[rgba(236,154,163,0.06)] pb-3">
        <div className="space-y-0.5">
          <h4 className="text-xs font-bold text-[#F8F8FA] uppercase tracking-wider font-mono">Transcript Viewer</h4>
          {language && (
            <p className="text-[10px] text-[#B6B8C4]/40 font-mono">
              DETECTED LANGUAGE: <span className="text-[#EC9AA3] font-semibold">{language.toUpperCase()}</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold font-mono tracking-wider text-[#B6B8C4] hover:text-[#F8F8FA] border border-[rgba(236,154,163,0.1)] hover:bg-[#EC9AA3]/5 transition-colors"
          >
            {copied ? "COPIED!" : "COPY TEXT"}
          </button>
          <button
            onClick={handleDownload}
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold font-mono tracking-wider text-[#EC9AA3] hover:text-[#f3b3ba] border border-[rgba(236,154,163,0.18)] hover:bg-[#EC9AA3]/10 transition-colors"
          >
            DOWNLOAD TXT
          </button>
        </div>
      </div>

      <div className="max-h-[300px] overflow-y-auto pr-1 space-y-3 scrollbar-thin">
        {segments && segments.length > 0 ? (
          segments.map((seg, idx) => (
            <div key={idx} className="flex gap-4 text-xs font-mono leading-relaxed">
              <span className="text-[#EC9AA3] font-semibold select-none tabular-nums mt-0.5 shrink-0 opacity-60">
                [{formatTime(seg.start)}]
              </span>
              <p className="text-[#B6B8C4]/90 break-words">{seg.text}</p>
            </div>
          ))
        ) : (
          <p className="text-xs font-mono leading-relaxed text-[#B6B8C4]/80 whitespace-pre-wrap break-words">
            {transcript}
          </p>
        )}
      </div>
    </div>
  );
}
