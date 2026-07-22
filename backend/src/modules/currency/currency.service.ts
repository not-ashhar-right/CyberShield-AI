/**
 * currency.service.ts
 * ──────────────────────────────────────────────────────────────────────────
 * Bridges Express → Python FastAPI ML microservice.
 *
 * Sends the image as base64-encoded JSON to POST /predict.
 * This is the most reliable approach: no multipart, no boundary parsing,
 * no binary corruption — just a clean JSON string over HTTP.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface CurrencyResult {
  prediction:  "fake" | "real";
  confidence:  number;           // 0–100
  riskLevel:   "CRITICAL" | "HIGH" | "LOW" | "SAFE";
  summary:     string;
  advice:      string;
  processedAt: string;
}

// ── Internal helpers ───────────────────────────────────────────────────────

const ML_URL = (process.env.CURRENCY_ML_URL ?? "http://localhost:8000") + "/predict";

function mapToRiskLevel(prediction: string, confidence: number): CurrencyResult["riskLevel"] {
  if (prediction === "fake") {
    return confidence >= 80 ? "CRITICAL" : "HIGH";
  }
  return confidence >= 80 ? "SAFE" : "LOW";
}

function buildSummary(prediction: string, confidence: number): string {
  const pct = confidence.toFixed(1);
  return prediction === "fake"
    ? `This currency note appears to be COUNTERFEIT (${pct}% confidence). Do not accept it.`
    : `This currency note appears to be GENUINE (${pct}% confidence).`;
}

function buildAdvice(prediction: string): string {
  return prediction === "fake"
    ? "• Do NOT accept or circulate this note.\n" +
      "• Surrender it to the nearest police station or RBI office.\n" +
      "• Note the source and report it to authorities.\n" +
      "• You can file a report using the Report Scam feature."
    : "• This note passed the AI authenticity check.\n" +
      "• Always verify security features (watermark, security thread, micro-print).\n" +
      "• When in doubt, use an official UV / magnetic ink tester.";
}

// ── Public service ─────────────────────────────────────────────────────────

export const currencyService = {
  /**
   * Base64-encode the image buffer and POST it as JSON to the ML service.
   *
   * @param imageBuffer  Raw image bytes from multer
   * @param mimeType     MIME type  (e.g. "image/jpeg")
   * @param _filename    Not used — kept for API compatibility
   */
  async detect(
    imageBuffer: Buffer,
    mimeType:    string,
    _filename:   string,
  ): Promise<CurrencyResult> {

    const image_b64 = imageBuffer.toString("base64");

    const payload = JSON.stringify({ image_b64, mime_type: mimeType });

    let mlRes: Response;
    try {
      mlRes = await fetch(ML_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    payload,
        signal:  AbortSignal.timeout(30_000),
      });
    } catch (err: any) {
      const isOffline =
        err?.cause?.code === "ECONNREFUSED" ||
        err?.code        === "UND_ERR_CONNECT_RESET";
      throw new Error(
        isOffline
          ? "ML microservice is offline. Run: python -m uvicorn main:app --port 8000 inside backend/ml-service"
          : `ML service unreachable: ${err?.message ?? String(err)}`,
      );
    }

    if (!mlRes.ok) {
      const errorBody = await mlRes.text().catch(() => "(no body)");
      throw new Error(`ML service returned HTTP ${mlRes.status}: ${errorBody}`);
    }

    const { prediction, confidence } = (await mlRes.json()) as {
      prediction: string;
      confidence: number;
    };

    return {
      prediction:  prediction as "fake" | "real",
      confidence,
      riskLevel:   mapToRiskLevel(prediction, confidence),
      summary:     buildSummary(prediction, confidence),
      advice:      buildAdvice(prediction),
      processedAt: new Date().toISOString(),
    };
  },
};
