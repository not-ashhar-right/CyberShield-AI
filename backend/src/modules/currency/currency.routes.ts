import { Router } from "express";
import multer from "multer";
import { authenticate } from "../auth/auth.middleware.js";
import { currencyController } from "./currency.controller.js";

// 10 MB file limit — currency photos are rarely larger
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

// All currency routes require a valid JWT
router.use(authenticate);

/**
 * POST /api/v1/currency/scan
 *
 * Body: multipart/form-data
 *   image  — image file (JPEG / PNG / WEBP, max 10 MB)
 *
 * Response 200:
 *   {
 *     success: true,
 *     data: {
 *       prediction:  "fake" | "real",
 *       confidence:  number,      // 0–100
 *       riskLevel:   string,      // "CRITICAL" | "HIGH" | "LOW" | "SAFE"
 *       summary:     string,
 *       advice:      string,
 *       processedAt: string,      // ISO-8601
 *     }
 *   }
 */
router.post("/scan", upload.single("image"), currencyController.scanCurrency);

export { router as currencyRouter };
