"use client";

import { motion } from "framer-motion";
import { type SuspiciousSentence } from "../../services/api/voice";

interface SuspiciousSentencesProps {
  sentences: SuspiciousSentence[];
}

const SEVERITY_BG = {
  low: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  medium: "bg-amber-500/10 border-amber-500/20 text-amber-400",
  high: "bg-red-500/10 border-red-500/20 text-red-400",
};

export function SuspiciousSentences({ sentences }: SuspiciousSentencesProps) {
  if (!sentences || sentences.length === 0) {
    return (
      <div className="p-5 rounded-2xl border border-[rgba(236,154,163,0.08)] bg-[#0A0A10]/90 text-center font-mono">
        <h4 className="text-[10px] font-black uppercase text-[#B6B8C4]/40 tracking-wider text-left border-b border-[rgba(236,154,163,0.06)] pb-3 mb-4">
          Suspicious Sentence Highlights
        </h4>
        <p className="text-xs text-[#B6B8C4]/40 italic py-4">No highly suspicious speech patterns detected in this transcript.</p>
      </div>
    );
  }

  return (
    <div className="p-5 rounded-2xl border border-[rgba(236,154,163,0.08)] bg-[#0A0A10]/90 space-y-4">
      <h4 className="text-[10px] font-black uppercase text-[#B6B8C4]/40 tracking-wider font-mono border-b border-[rgba(236,154,163,0.06)] pb-3">
        Flagged Speech Patterns ({sentences.length})
      </h4>

      <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
        {sentences.map((s, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="p-3.5 rounded-xl border border-[rgba(236,154,163,0.04)] bg-[#07070D]/80 hover:bg-[#0C0C14]/40 transition-colors space-y-2.5 font-mono"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold text-[#F8F8FA] italic leading-relaxed">
                &ldquo;{s.text}&rdquo;
              </p>
              <span className={`text-[8px] font-black tracking-widest px-2 py-0.5 rounded border uppercase shrink-0 ${SEVERITY_BG[s.severity] || SEVERITY_BG.low}`}>
                {s.severity}
              </span>
            </div>
            
            <div className="flex gap-2 text-[10px] text-[#B6B8C4]/60 bg-white/[0.01] p-2 rounded border border-white/[0.02]">
              <span className="text-[#EC9AA3] font-bold">REASON:</span>
              <span className="font-medium text-[#B6B8C4]/85 leading-normal">{s.reason}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
