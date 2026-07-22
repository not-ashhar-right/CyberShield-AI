"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface AudioUploadZoneProps {
  onFileSelected: (file: File) => void;
  onClear: () => void;
  selectedFile: File | null;
  disabled?: boolean;
}

const SUPPORTED = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav",
  "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/ogg", "audio/webm"];
const MAX_SIZE_MB = 25;

export function AudioUploadZone({ onFileSelected, onClear, selectedFile, disabled }: AudioUploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSelect = useCallback((file: File) => {
    setError(null);
    if (!SUPPORTED.includes(file.type)) {
      setError("Unsupported format. Please upload MP3, WAV, M4A, or OGG.");
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File too large. Maximum size is ${MAX_SIZE_MB} MB.`);
      return;
    }
    // Release previous object URL
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(URL.createObjectURL(file));
    onFileSelected(file);
  }, [audioUrl, onFileSelected]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSelect(file);
  }, [validateAndSelect]);

  const handleClear = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
    onClear();
  };

  if (selectedFile && audioUrl) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-3"
      >
        {/* Audio Player */}
        <div className="p-4 rounded-2xl border border-[rgba(236,154,163,0.12)] bg-[#0D0D16] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#EC9AA3]/10 border border-[rgba(236,154,163,0.2)] flex items-center justify-center">
                <svg className="w-4 h-4 text-[#EC9AA3]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#F8F8FA] truncate max-w-[200px]">{selectedFile.name}</p>
                <p className="text-[10px] text-[#B6B8C4]/50">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · {selectedFile.type.split("/")[1].toUpperCase()}
                </p>
              </div>
            </div>
            <button
              onClick={handleClear}
              disabled={disabled}
              className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-colors disabled:opacity-40"
            >
              Remove
            </button>
          </div>

          {/* Native Audio Player */}
          <audio
            controls
            src={audioUrl}
            className="w-full h-8 rounded-lg"
            style={{ accentColor: "#EC9AA3" }}
          />

          {/* Waveform Bars (decorative animated bars) */}
          <div className="flex items-center gap-0.5 h-8 justify-center opacity-60">
            {Array.from({ length: 40 }).map((_, i) => (
              <div
                key={i}
                className="w-1 rounded-full bg-[#EC9AA3]"
                style={{
                  height: `${20 + Math.sin(i * 0.7) * 14 + Math.cos(i * 1.3) * 8}%`,
                  opacity: 0.5 + Math.abs(Math.sin(i * 0.4)) * 0.5,
                }}
              />
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center gap-4 p-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200
          ${dragging
            ? "border-[#EC9AA3] bg-[rgba(236,154,163,0.06)] scale-[1.01]"
            : "border-[rgba(236,154,163,0.15)] bg-[#0D0D16] hover:border-[rgba(236,154,163,0.3)] hover:bg-[rgba(236,154,163,0.03)]"
          }
          ${disabled ? "opacity-40 cursor-not-allowed" : ""}
        `}
      >
        <AnimatePresence>
          {dragging && (
            <motion.div
              className="absolute inset-0 rounded-2xl bg-[rgba(236,154,163,0.04)] pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
          )}
        </AnimatePresence>

        <div className="w-14 h-14 rounded-2xl bg-[rgba(236,154,163,0.08)] border border-[rgba(236,154,163,0.15)] flex items-center justify-center">
          <svg className="w-6 h-6 text-[#EC9AA3]/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>

        <div className="text-center">
          <p className="text-sm font-semibold text-[#F8F8FA]">
            {dragging ? "Drop audio file here" : "Drag & drop audio file"}
          </p>
          <p className="text-[11px] text-[#B6B8C4]/50 mt-1">or click to browse</p>
          <p className="text-[10px] text-[#B6B8C4]/35 mt-2">MP3 · WAV · M4A · OGG · WebM · Max 25 MB</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/m4a,audio/x-m4a,audio/ogg,audio/webm,video/webm"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) validateAndSelect(f); }}
          disabled={disabled}
          aria-label="Upload audio file for voice scam analysis"
        />
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs text-red-400 px-1 flex items-center gap-1.5"
        >
          <span className="w-1 h-1 rounded-full bg-red-400 inline-block" />
          {error}
        </motion.p>
      )}
    </div>
  );
}
