"use client";

interface RecommendationPanelProps {
  recommendations: string[];
}

export function RecommendationPanel({ recommendations }: RecommendationPanelProps) {
  const defaultRecs = [
    "Disconnect the call immediately.",
    "Do not transfer money or share OTP/PIN details.",
    "Block the phone number on your device.",
    "Report the number to National Cyber Crime Portal (1930).",
  ];

  const items = recommendations && recommendations.length > 0 ? recommendations : defaultRecs;

  return (
    <div className="p-5 rounded-2xl border border-[rgba(236,154,163,0.08)] bg-[#0A0A10]/95 space-y-4 font-mono">
      <h4 className="text-[10px] font-black uppercase text-[#B6B8C4]/40 tracking-wider border-b border-[rgba(236,154,163,0.06)] pb-3">
        Actionable Safety Guidelines
      </h4>

      <ul className="space-y-3">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-start gap-3 text-xs leading-normal">
            <span className="w-5 h-5 rounded-lg border border-[#EC9AA3]/30 bg-[#EC9AA3]/5 flex items-center justify-center text-[#EC9AA3] font-bold text-[10px] shrink-0 mt-0.5 select-none">
              {idx + 1}
            </span>
            <span className="text-[#B6B8C4]/85 font-medium">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
