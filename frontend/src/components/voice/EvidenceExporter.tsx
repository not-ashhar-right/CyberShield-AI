"use client";

import { useState } from "react";
import { type VoiceAnalysisResult } from "../../services/api/voice";

interface EvidenceExporterProps {
  result: VoiceAnalysisResult;
}

export function EvidenceExporter({ result }: EvidenceExporterProps) {
  const [downloading, setDownloading] = useState(false);

  const generateReportText = () => {
    const divider = "================================================================================\n";
    const subDivider = "--------------------------------------------------------------------------------\n";

    let text = "";
    text += divider;
    text += "                     NATIONAL CYBER CRIME INTELLIGENCE PLATFORM\n";
    text += "                           OFFICIAL INVESTIGATION REPORT\n";
    text += divider;
    text += `CASE ID:             ${result.caseId}\n`;
    text += `DATE COMPILED:       ${new Date(result.createdAt).toLocaleString()}\n`;
    text += `THREAT CATEGORY:     ${result.scamCategory.toUpperCase()}\n`;
    text += `RISK ASSESSMENT:     ${result.riskScore}/100 (${result.threatLevel.toUpperCase()} THREAT)\n`;
    text += `VERDICT CONFIDENCE:  ${(result.confidence * 100).toFixed(0)}%\n`;
    text += `AUDIO FILE INFO:     ${result.duration > 0 ? `${Math.floor(result.duration)}s duration` : "Manual transcript input"}\n`;
    text += `EVIDENCE HASH:       ${result.scanId.toUpperCase()}\n`;
    text += divider;
    text += "\n";

    text += "1. EXECUTIVE SUMMARY\n";
    text += subDivider;
    text += `${result.executiveSummary}\n\n`;

    text += "2. DETECTED DIGITAL FOOTPRINTS (IDENTITY SHARING)\n";
    text += subDivider;
    const ents = result.extractedEntities;
    let foundEnt = false;
    
    const writeEntity = (label: string, list: string[]) => {
      if (list && list.length > 0) {
        text += `${label.padEnd(20)}: ${list.join(", ")}\n`;
        foundEnt = true;
      }
    };

    writeEntity("Phones", ents.phones);
    writeEntity("UPI Handles", ents.upiIds);
    writeEntity("Bank Accounts", ents.bankAccounts);
    writeEntity("Emails", ents.emails);
    writeEntity("IP Addresses", ents.ipAddresses);
    writeEntity("URLs/Domains", [...ents.urls, ...ents.domains]);
    writeEntity("Money Amounts", ents.moneyAmounts);
    writeEntity("Caller Names", ents.personNames);
    writeEntity("Agencies", ents.governmentAgencies);
    writeEntity("Cities", ents.cities);
    
    if (!foundEnt) {
      text += "No structured digital entities extracted from this call transcript.\n";
    }
    text += "\n";

    text += "3. SUSPICIOUS STATEMENTS / THREAT PATTERNS\n";
    text += subDivider;
    if (result.suspiciousSentences && result.suspiciousSentences.length > 0) {
      result.suspiciousSentences.forEach((s, idx) => {
        text += `${idx + 1}. [SEVERITY: ${s.severity.toUpperCase()}]\n`;
        text += `   Quote:  "${s.text}"\n`;
        text += `   Reason: ${s.reason}\n\n`;
      });
    } else {
      text += "No highly suspicious speech patterns detected in this transcript.\n\n";
    }

    text += "4. ACTIONABLE SAFETY RECOMMENDATIONS\n";
    text += subDivider;
    if (result.recommendations && result.recommendations.length > 0) {
      result.recommendations.forEach((rec, idx) => {
        text += `[ ] ${idx + 1}. ${rec}\n`;
      });
    } else {
      text += "- Disconnect the call immediately.\n- Do not transfer any funds.\n- Block the number.\n";
    }
    text += "\n";

    text += "5. COMPLETE CALL TRANSCRIPT\n";
    text += subDivider;
    if (result.segments && result.segments.length > 0) {
      result.segments.forEach((s) => {
        const min = Math.floor(s.start / 60);
        const sec = Math.floor(s.start % 60);
        const stamp = `[${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}]`;
        text += `${stamp} ${s.text}\n`;
      });
    } else {
      text += result.transcript;
    }
    text += "\n";
    text += divider;
    text += "               END OF REPORT — CONFIDENTIAL LAW ENFORCEMENT RECORD\n";
    text += divider;

    return text;
  };

  const handleExport = () => {
    setDownloading(true);
    try {
      const content = generateReportText();
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `CyberShield_ScamReport_${result.caseId}.txt`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="p-5 rounded-2xl border border-[rgba(236,154,163,0.08)] bg-[#0A0A10]/90 space-y-4">
      <div className="space-y-1 font-mono">
        <h4 className="text-[10px] font-black uppercase text-[#B6B8C4]/40 tracking-wider">
          Evidence Package Exporter
        </h4>
        <h3 className="text-sm font-bold text-[#F8F8FA]">
          Generate Case Dossier
        </h3>
        <p className="text-xs text-[#B6B8C4]/60 leading-normal">
          Export an official cyber threat investigation dossier containing transcription timelines, extracted digital footprints, and security tags.
        </p>
      </div>

      <button
        onClick={handleExport}
        disabled={downloading}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs text-[#050508] bg-[#EC9AA3] hover:bg-[#f3b3ba] transition-all duration-200 uppercase tracking-wider font-mono disabled:opacity-50"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/>
        </svg>
        {downloading ? "Compiling Report..." : "Export Evidence Report"}
      </button>
    </div>
  );
}
