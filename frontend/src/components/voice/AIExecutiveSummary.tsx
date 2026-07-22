"use client";

interface AIExecutiveSummaryProps {
  summary: string;
}

export function AIExecutiveSummary({ summary }: AIExecutiveSummaryProps) {
  return (
    <div className="p-5 rounded-2xl border border-[rgba(236,154,163,0.08)] bg-[#0A0A10]/95 space-y-3 font-mono">
      <div className="flex items-center gap-2 border-b border-[rgba(236,154,163,0.06)] pb-3">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#EC9AA3] opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#EC9AA3]" />
        </span>
        <h4 className="text-[10px] font-black uppercase text-[#B6B8C4]/40 tracking-wider">
          AI Intel Executive Summary
        </h4>
      </div>
      <p className="text-xs text-[#B6B8C4]/85 leading-relaxed font-medium">
        {summary}
      </p>
    </div>
  );
}
