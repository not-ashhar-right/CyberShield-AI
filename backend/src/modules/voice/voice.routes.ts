/**
 * Voice Analysis Routes
 *
 * POST /voice/transcribe  — upload audio → Whisper → transcript
 * POST /voice/analyze     — transcript → Gemini → intelligence report
 * GET  /voice/history     — list user's past voice scans
 * GET  /voice/report/:id  — get one full scan record
 */

import { Router } from "express";
import multer from "multer";
import { authenticate } from "../auth/auth.middleware.js";
import { voiceController } from "./voice.controller.js";

// Memory storage — no disk writes. 25 MB limit for audio files.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav",
      "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/ogg",
      "audio/webm", "video/webm", "audio/aac", "audio/x-aac",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("UNSUPPORTED_FORMAT"));
    }
  },
});

const router = Router();

// All routes require authentication
router.use(authenticate);

// Upload audio and transcribe via Whisper
router.post("/transcribe", upload.single("audio"), voiceController.transcribe);

// Analyze a transcript with Gemini (called after transcription)
router.post("/analyze", voiceController.analyze);

// Get user's voice analysis history
router.get("/history", voiceController.getHistory);

// Get one specific voice report
router.get("/report/:id", voiceController.getReport);

export const voiceRouter = router;
