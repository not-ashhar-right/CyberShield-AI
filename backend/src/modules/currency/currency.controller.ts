import type { Request, Response, NextFunction } from "express";
import { currencyService } from "./currency.service.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import type { AuthenticatedRequest } from "../../types/index.js";

export const currencyController = {
  /**
   * POST /api/v1/currency/scan
   *
   * Accepts a multipart image upload (field name: "image") and returns a
   * fake / real prediction from the ML microservice.
   */
  async scanCurrency(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        sendError(res, "No image file uploaded. Use field name 'image'.", 400, "NO_FILE");
        return;
      }

      const { buffer, mimetype, originalname } = req.file;

      const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
      if (!ALLOWED.includes(mimetype)) {
        sendError(
          res,
          `Unsupported format '${mimetype}'. Allowed: ${ALLOWED.join(", ")}`,
          415,
          "UNSUPPORTED_FORMAT",
        );
        return;
      }

      const result = await currencyService.detect(buffer, mimetype, originalname);
      sendSuccess(res, result);
    } catch (err: any) {
      // Surface ML-service-offline errors with a clear 503
      if (err?.message?.includes("ML microservice is offline")) {
        sendError(res, err.message, 503, "ML_SERVICE_UNAVAILABLE");
        return;
      }
      next(err);
    }
  },
};
