"use client";

import { motion } from "framer-motion";

interface VoiceRiskDashboardProps {
  riskScore: number;
  confidence: number;
  threatLevel: "low" | "medium" | "high" | "critical";
  scamCategory: string;
  duration: number;
  transcriptLength: number;
  processingTime: number;
}

const THREAT_STYLES = {
  low: {
    color: "#10b981",
    bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
    glow: "shadow-[0_0_15px_rgba(16,185,129,0.15)]",
  },
  medium: {
    color: "#f59e0b",
    bg: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    glow: "shadow-[0_0_15px_rgba(245,158,11,0.15)]",
  },
  high: {
    color: "#f97316",
    bg: "bg-orange-500/10 border-orange-500/30 text-orange-400",
    glow: "shadow-[0_0_15px_rgba(249,115,22,0.15)]",
  },
  critical: {
    color: "#ef4444",
    bg: "bg-red-500/10 border-red-500/30 text-red-400",
    glow: "shadow-[0_0_15px_rgba(239,68,68,0.2)]",
  },
};

export function VoiceRiskDashboard({
  riskScore,
  confidence,
  threatLevel,
  scamCategory,
  duration,
  transcriptLength,
  processingTime,
}: VoiceRiskDashboardProps) {
  const currentStyle = THREAT_STYLES[threatLevel] || THREAT_STYLES.low;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Risk Score Circle Gauge Card */}
      <div className="p-5 rounded-2xl border border-[rgba(236,154,163,0.08)] bg-[#0A0A10]/95 flex flex-col items-center justify-center text-center space-y-4">
        <h4 className="text-[10px] font-black uppercase text-[#B6B8C4]/40 tracking-wider font-mono w-full text-left">
          Scam Risk Assessment
        </h4>
        <div className="relative w-28 h-28 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            <path
              className="text-[#1A1A24]"
              strokeWidth="3.5"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <motion.path
              className="transition-all duration-1000"
              strokeWidth="3.5"
              strokeDasharray={`${riskScore}, 100`}
              strokeLinecap="round"
              stroke={currentStyle.color}
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2 }}
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center font-mono">
            <span className="text-2xl font-black text-[#F8F8FA]">{riskScore}</span>
            <span className="text-[9px] text-[#B6B8C4]/40 uppercase tracking-widest font-bold">Risk</span>
          </div>
        </div>

        <div className={`px-3 py-1 rounded-full text-[10px] font-bold font-mono tracking-wider border uppercase ${currentStyle.bg} ${currentStyle.glow}`}>
          {threatLevel} Threat
        </div>
      </div>

      {/* Main Analysis Summary card */}
      <div className="p-5 rounded-2xl border border-[rgba(236,154,163,0.08)] bg-[#0A0A10]/95 flex flex-col justify-between space-y-4 md:col-span-2">
        <div className="space-y-2 font-mono">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-[#B6B8C4]/40 tracking-wider">Scam Verdict</span>
            <span className="text-[10px] font-semibold text-[#B6B8C4]/50">
              Confidence: <strong className="text-[#F8F8FA] font-bold">{(confidence * 100).toFixed(0)}%</strong>
            </span>
          </div>
          <h3 className="text-base font-black text-[#F8F8FA] tracking-wide">
            {scamCategory.toUpperCase()}
          </h3>
          <p className="text-xs text-[#B6B8C4]/80 leading-relaxed font-medium mt-1">
            Scan compiled successfully in {processingTime}ms. Digital markers matched against known vishing / social engineering databases.
          </p>
        </div>

        {/* Mini stats dashboard grid */}
        <div className="grid grid-cols-3 gap-3 border-t border-[rgba(236,154,163,0.06)] pt-3 text-xs font-mono">
          <div>
            <span className="text-[#B6B8C4]/35 text-[9px] uppercase tracking-wider block">Duration</span>
            <span className="text-[#F8F8FA] font-bold block mt-0.5">
              {duration > 0 ? `${Math.floor(duration)}s` : "Manual upload"}
            </span>
          </div>
          <div>
            <span className="text-[#B6B8C4]/35 text-[9px] uppercase tracking-wider block">Transcript size</span>
            <span className="text-[#F8F8FA] font-bold block mt-0.5">
              {transcriptLength} chars
            </span>
          </div>
          <div>
            <span className="text-[#B6B8C4]/35 text-[9px] uppercase tracking-wider block">Scan method</span>
            <span className="text-[#EC9AA3] font-bold block mt-0.5">
              {duration > 0 ? "Voice AI Model" : "Text Scrape"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
