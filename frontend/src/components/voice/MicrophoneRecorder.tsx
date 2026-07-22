"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface MicrophoneRecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => void;
  onClear: () => void;
  hasRecording: boolean;
  disabled?: boolean;
}

type RecordingState = "idle" | "recording" | "paused" | "stopped";

export function MicrophoneRecorder({ onRecordingComplete, onClear, hasRecording, disabled }: MicrophoneRecorderProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<number[]>(Array(32).fill(4));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Animate waveform bars using Web Audio API analyser
  const startVisualization = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    src.connect(analyser);
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      setLevels(Array.from(data.slice(0, 32)).map((v) => Math.max(4, v / 2.55)));
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const stopVisualization = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setLevels(Array(32).fill(4));
  }, []);

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const recorded = new Blob(chunksRef.current, { type: mimeType });
        setBlob(recorded);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        const url = URL.createObjectURL(recorded);
        setAudioUrl(url);
        onRecordingComplete(recorded, duration);
      };

      recorder.start(100); // collect chunks every 100ms
      setState("recording");
      startVisualization(stream);

      // Timer
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setError("Microphone access denied. Please allow microphone permission and try again.");
      } else {
        setError("Could not access microphone. Please check your device settings.");
      }
    }
  };

  const pauseRecording = () => {
    mediaRecorderRef.current?.pause();
    if (timerRef.current) clearInterval(timerRef.current);
    stopVisualization();
    setState("paused");
  };

  const resumeRecording = () => {
    mediaRecorderRef.current?.resume();
    setState("recording");
    if (streamRef.current) startVisualization(streamRef.current);
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    stopVisualization();
    setState("stopped");
  };

  const clearRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setBlob(null);
    setDuration(0);
    setError(null);
    setState("idle");
    onClear();
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopVisualization();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, []);

  const formatDuration = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      {/* Waveform visualizer */}
      <div className="flex items-end gap-0.5 h-12 justify-center px-2 py-1 rounded-xl bg-[#0D0D16] border border-[rgba(236,154,163,0.08)]">
        {levels.map((lvl, i) => (
          <div
            key={i}
            className="flex-1 rounded-full transition-all duration-75"
            style={{
              height: `${state === "recording" ? lvl : 12}%`,
              backgroundColor: state === "recording"
                ? `hsl(${350 + i * 2}, 70%, ${55 + lvl * 0.2}%)`
                : "rgba(236,154,163,0.15)",
              minHeight: "4%",
            }}
          />
        ))}
      </div>

      {/* Duration + status */}
      <div className="flex items-center justify-between text-xs font-mono px-1">
        <span className="text-[#B6B8C4]/50">
          {state === "recording" && <span className="text-[#EC9AA3] font-bold">● REC </span>}
          {state === "paused"    && <span className="text-amber-400 font-bold">⏸ PAUSED </span>}
          {state === "stopped"   && <span className="text-emerald-400 font-bold">✓ RECORDED </span>}
          {state === "idle"      && <span className="text-[#B6B8C4]/40">Ready to record </span>}
        </span>
        <span className={`font-bold tabular-nums ${state === "recording" ? "text-[#EC9AA3]" : "text-[#B6B8C4]/60"}`}>
          {formatDuration(duration)}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {state === "idle" && (
          <button
            onClick={startRecording}
            disabled={disabled}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white bg-[#EC9AA3] hover:bg-[#f3b3ba] disabled:opacity-40 transition-all active:scale-95"
            aria-label="Start microphone recording"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
            </svg>
            Start Recording
          </button>
        )}

        {state === "recording" && (
          <>
            <button
              onClick={pauseRecording}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-[#F8F8FA] bg-amber-500/20 border border-amber-500/30 hover:bg-amber-500/30 transition-all"
              aria-label="Pause recording"
            >
              <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
              Pause
            </button>
            <button
              onClick={stopRecording}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-[#F8F8FA] bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 transition-all"
              aria-label="Stop recording"
            >
              <svg className="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12"/>
              </svg>
              Stop
            </button>
          </>
        )}

        {state === "paused" && (
          <>
            <button
              onClick={resumeRecording}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-[#F8F8FA] bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 transition-all"
              aria-label="Resume recording"
            >
              <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Resume
            </button>
            <button
              onClick={stopRecording}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-[#F8F8FA] bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 transition-all"
              aria-label="Stop recording"
            >
              <svg className="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12"/>
              </svg>
              Stop
            </button>
          </>
        )}

        {state === "stopped" && audioUrl && (
          <button
            onClick={clearRecording}
            className="px-4 py-3 rounded-xl font-bold text-xs text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-colors"
            aria-label="Clear recording"
          >
            Clear
          </button>
        )}
      </div>

      {/* Playback */}
      <AnimatePresence>
        {state === "stopped" && audioUrl && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-2"
          >
            <p className="text-[10px] text-[#B6B8C4]/40 font-mono uppercase tracking-wider">Playback</p>
            <audio controls src={audioUrl} className="w-full h-8 rounded-lg" style={{ accentColor: "#EC9AA3" }} />
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-red-400 flex items-center gap-1.5 px-1"
        >
          <span className="w-1 h-1 rounded-full bg-red-400 inline-block" />
          {error}
        </motion.p>
      )}
    </div>
  );
}
