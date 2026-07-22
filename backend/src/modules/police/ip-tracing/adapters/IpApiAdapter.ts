import { BaseAdapter } from "./BaseAdapter.js";
import { IPEntity } from "../types/IPEntity.js";

/**
 * IpApiAdapter — Free secondary geolocation provider.
 *
 * Uses http://ip-api.com/json (no API key required).
 * Rate limit: 45 requests/minute for the free tier.
 * Returns city, region (subdivision), country, lat/lon, ISP and ASN org.
 *
 * We use this as a cross-reference with MaxMind. The service layer picks
 * whichever provider returns the tighter accuracy_radius.
 */
export class IpApiAdapter extends BaseAdapter {
  private readonly endpoint = "http://ip-api.com/json";
  // ip-api returns accuracy_radius in km. We estimate based on their docs:
  // city-level match → ~25 km, region-level → ~150 km, country-level → 500 km
  private readonly FIELDS =
    "status,message,country,countryCode,region,regionName,city,zip,lat,lon,isp,org,as,query";

  constructor() {
    super("IpApi");
  }

  protected async enrichImpl(ip: string): Promise<Partial<IPEntity>> {
    const url = `${this.endpoint}/${encodeURIComponent(ip)}?fields=${this.FIELDS}&lang=en`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    let data: any;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`ip-api responded with HTTP ${response.status}`);
      }

      data = await response.json();
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw err;
    }

    if (!data || data.status !== "success") {
      throw new Error(`ip-api lookup failed: ${data?.message || "unknown error"}`);
    }

    // Estimate accuracy_km based on how specific the result is.
    // ip-api doesn't return an accuracy radius directly, so we infer:
    //   • city resolved  → ~25 km  (city centroid)
    //   • region only    → ~150 km
    //   • country only   → ~500 km
    const accuracy_km =
      data.city && data.city !== "" ? 25 : data.regionName && data.regionName !== "" ? 150 : 500;

    const result: Partial<IPEntity> = {
      geo: {
        country: data.countryCode || data.country || "Unknown",
        city: data.city || "Unknown",
        region: data.regionName || undefined,
        lat: typeof data.lat === "number" ? data.lat : 0,
        lon: typeof data.lon === "number" ? data.lon : 0,
        accuracy_km,
        geo_source: "IpApi",
      },
    };

    // Supplement ASN/ISP if available
    if (data.isp || data.org) {
      result.asn = {
        number: 0, // ip-api returns ASN as string like "AS15169 Google LLC"
        org: data.isp || data.org || "Unknown",
        type: "unknown",
      };

      // Parse ASN number from the "as" field ("AS15169 Google LLC")
      if (data.as && typeof data.as === "string") {
        const match = data.as.match(/^AS(\d+)/i);
        if (match) {
          result.asn.number = parseInt(match[1], 10);
        }
      }
    }

    return result;
  }
}
