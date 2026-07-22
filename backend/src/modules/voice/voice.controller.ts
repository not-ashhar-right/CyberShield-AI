/**
 * Voice Analysis Controller
 * Handles all HTTP request/response logic for the voice analysis routes.
 */

import type { Request, Response, NextFunction } from "express";
import {
  transcribeAudio,
  analyzeVoiceTranscript,
  getVoiceHistory,
  getVoiceReport,
} from "./voice.service.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import type { AuthenticatedRequest } from "../../types/index.js";
import { env } from "../../config/env.js";

const SUPPORTED_MIME_TYPES = new Set([
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav",
  "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/ogg",
  "audio/webm", "video/webm", "audio/aac", "audio/x-aac",
]);

export const voiceController = {

  /**
   * POST /voice/transcribe
   * Accepts a multipart audio upload, sends it to Google Gemini,
   * and returns the transcript + metadata. Does NOT persist yet.
   */
  async transcribe(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        return sendError(res, "No audio file uploaded.", 400, "NO_FILE");
      }

      const { mimetype, size, originalname, buffer } = req.file;

      // Validate mime type
      if (!SUPPORTED_MIME_TYPES.has(mimetype)) {
        return sendError(
          res,
          "Unsupported audio format. Please upload MP3, WAV, M4A, OGG, AAC, or WebM.",
          400,
          "UNSUPPORTED_FORMAT"
        );
      }

      // 25 MB limit (multer enforces, this is a secondary guard)
      if (size > 25 * 1024 * 1024) {
        return sendError(res, "File too large. Maximum size is 25 MB.", 400, "FILE_TOO_LARGE");
      }

      const geminiAvailable = !!env.GEMINI_API_KEY;

      if (!geminiAvailable) {
        return sendSuccess(res, {
          whisperAvailable: false,
          error: "Invalid API Key: GEMINI_API_KEY is not configured.",
          message: "Unable to analyze audio. Invalid API Key.",
          filename: originalname,
          mimeType: mimetype,
          fileSize: size,
        });
      }

      console.log(`[Voice] Analyzing Audio with Gemini AI: ${originalname} (${size} bytes, ${mimetype})`);

      const result = await transcribeAudio(buffer, mimetype, originalname);

      if (!result || result.whisperAvailable === false) {
        return sendSuccess(res, {
          whisperAvailable: false,
          error: result?.error || "Gemini API unavailable",
          message: result?.error || "Unable to analyze audio.",
          filename: originalname,
          mimeType: mimetype,
          fileSize: size,
        });
      }

      return sendSuccess(res, {
        whisperAvailable: true,
        transcript:       result.transcript,
        duration:         result.duration,
        language:         result.language,
        segments:         result.segments,
        filename:         originalname,
        mimeType:         mimetype,
        fileSize:         size,
      });
    } catch (err: any) {
      if (err.message?.startsWith("UNSUPPORTED_FORMAT")) {
        return sendError(res, "This audio format is not supported by the transcription engine.", 400, "UNSUPPORTED_FORMAT");
      }
      console.error("[Voice] Transcription error:", err);
      next(err);
    }
  },

  /**
   * POST /voice/analyze
   * Accepts { transcript, duration?, language?, filename?, segments?, whisperAvailable? }
   * Runs Gemini scam classification, persists scan record, returns full intelligence report.
   */
  async analyze(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user!;
      const {
        transcript,
        duration,
        language,
        filename,
        segments,
        whisperAvailable,
      } = req.body;

      if (!transcript || typeof transcript !== "string" || transcript.trim().length < 10) {
        return sendError(res, "Transcript is required and must be at least 10 characters.", 400, "INVALID_TRANSCRIPT");
      }

      console.log(`[Voice] Analyzing transcript for user ${user.id} (${transcript.length} chars)`);

      const result = await analyzeVoiceTranscript(transcript, user.id, {
        duration:         Number(duration) || 0,
        language:         language || "unknown",
        filename:         filename || "audio",
        segments:         Array.isArray(segments) ? segments : [],
        whisperAvailable: !!whisperAvailable,
      });

      return sendSuccess(res, result);
    } catch (err: any) {
      console.error("[Voice] Analysis error:", err);
      next(err);
    }
  },

  /**
   * GET /voice/history
   * Returns the authenticated user's 20 most recent voice analyses.
   */
  async getHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user!;
      const history = await getVoiceHistory(user.id);
      return sendSuccess(res, history);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /voice/report/:id
   * Returns one full scan record for the authenticated user.
   */
  async getReport(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user!;
      const { id } = req.params;

      const report = await getVoiceReport(id, user.id);
      if (!report) {
        return sendError(res, "Voice report not found.", 404, "NOT_FOUND");
      }

      return sendSuccess(res, report);
    } catch (err) {
      next(err);
    }
  },
};
