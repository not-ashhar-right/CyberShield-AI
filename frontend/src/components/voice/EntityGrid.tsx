"use client";

import { type ExtractedVoiceEntities } from "../../services/api/voice";

interface EntityGridProps {
  entities: ExtractedVoiceEntities;
}

interface EntityItem {
  label: string;
  values: string[];
  color: string;
}

export function EntityGrid({ entities }: EntityGridProps) {
  const categories: EntityItem[] = [
    { label: "Phone Numbers", values: entities.phones, color: "text-rose-400 border-rose-500/20 bg-rose-500/5" },
    { label: "UPI Handles", values: entities.upiIds, color: "text-[#EC9AA3] border-[#EC9AA3]/20 bg-[#EC9AA3]/5" },
    { label: "Bank Accounts", values: entities.bankAccounts, color: "text-amber-400 border-amber-500/20 bg-amber-500/5" },
    { label: "Email Addresses", values: entities.emails, color: "text-cyan-400 border-cyan-500/20 bg-cyan-500/5" },
    { label: "IP Addresses", values: entities.ipAddresses, color: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" },
    { label: "URLs / Domains", values: [...entities.urls, ...entities.domains], color: "text-indigo-400 border-indigo-500/20 bg-indigo-500/5" },
    { label: "Money Amounts", values: entities.moneyAmounts, color: "text-yellow-400 border-yellow-500/20 bg-yellow-500/5" },
    { label: "Caller / Persons", values: entities.personNames, color: "text-purple-400 border-purple-500/20 bg-purple-500/5" },
    { label: "Government Agencies", values: entities.governmentAgencies, color: "text-red-400 border-red-500/20 bg-red-500/5" },
    { label: "Cities Mentioned", values: entities.cities, color: "text-orange-400 border-orange-500/20 bg-orange-500/5" },
    { label: "Merchants / Stores", values: entities.merchantNames, color: "text-sky-400 border-sky-500/20 bg-sky-500/5" },
  ];

  const activeCategories = categories.filter((c) => c.values && c.values.length > 0);

  if (activeCategories.length === 0) {
    return (
      <div className="p-5 rounded-2xl border border-[rgba(236,154,163,0.08)] bg-[#0A0A10]/90 text-center font-mono">
        <h4 className="text-[10px] font-black uppercase text-[#B6B8C4]/40 tracking-wider text-left border-b border-[rgba(236,154,163,0.06)] pb-3 mb-4">
          Extracted Digital Footprints
        </h4>
        <p className="text-xs text-[#B6B8C4]/40 italic py-4">No structured entities extracted from this call transcript.</p>
      </div>
    );
  }

  return (
    <div className="p-5 rounded-2xl border border-[rgba(236,154,163,0.08)] bg-[#0A0A10]/90 space-y-4">
      <h4 className="text-[10px] font-black uppercase text-[#B6B8C4]/40 tracking-wider font-mono border-b border-[rgba(236,154,163,0.06)] pb-3">
        Extracted Digital Footprints (Threat Graph Targets)
      </h4>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[350px] overflow-y-auto pr-1 scrollbar-thin">
        {activeCategories.map((c, idx) => (
          <div key={idx} className="p-3.5 rounded-xl border border-white/[0.02] bg-[#07070D] space-y-2 font-mono">
            <span className="text-[10px] font-black text-[#B6B8C4]/45 uppercase tracking-wide">
              {c.label} ({c.values.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {c.values.map((val, valIdx) => (
                <span
                  key={valIdx}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors hover:bg-white/[0.02] truncate max-w-full ${c.color}`}
                  title={val}
                >
                  {val}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
