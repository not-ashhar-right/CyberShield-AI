"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface IpMapProps {
  lat: number;
  lon: number;
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  isp?: string;
  confidence?: "high" | "medium" | "low";
  accuracyKm?: number;
}

export default function IpMap({
  lat,
  lon,
  ip,
  city,
  region,
  country,
  isp,
  confidence,
  accuracyKm,
}: IpMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerInstanceRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const position: L.LatLngTuple = [lat, lon];

    // ── Initialize Map Instance ───────────────────────────────────────────
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView(position, 11);

      // ── Light Street Map Tiles (OpenStreetMap Standard) ───────────────
      // Only the tile layer is changed to light — all surrounding UI stays dark.
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      }).addTo(mapInstanceRef.current);

      // Position zoom controls bottom-right
      L.control
        .zoom({ position: "bottomright" })
        .addTo(mapInstanceRef.current);
    } else {
      // Smooth animated fly to new position
      mapInstanceRef.current.flyTo(position, 11, {
        animate: true,
        duration: 1.2,
      });
    }

    // ── Accuracy Radius Circle ────────────────────────────────────────────
    // Remove existing circle first
    if (accuracyCircleRef.current) {
      accuracyCircleRef.current.remove();
      accuracyCircleRef.current = null;
    }
    if (accuracyKm && accuracyKm > 0 && mapInstanceRef.current) {
      const circleColor =
        accuracyKm <= 50 ? "#34d399" : accuracyKm <= 200 ? "#fbbf24" : "#f87171";
      accuracyCircleRef.current = L.circle(position, {
        radius: accuracyKm * 1000, // convert km → metres
        color: circleColor,
        fillColor: circleColor,
        fillOpacity: 0.08,
        weight: 1.5,
        opacity: 0.5,
        dashArray: "4 4",
      }).addTo(mapInstanceRef.current);
    }

    // ── Custom Neon Ping Marker Icon ──────────────────────────────────────
    const customIcon = L.divIcon({
      className: "custom-leaflet-marker",
      html: `
        <div class="relative flex items-center justify-center w-6 h-6">
          <span class="animate-ping absolute inline-flex h-6 w-6 rounded-full bg-[#EC9AA3] opacity-40"></span>
          <span class="relative inline-flex rounded-full h-3.5 w-3.5 bg-[#EC9AA3] border border-[#050508] shadow-[0_0_12px_#EC9AA3]"></span>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -14],
    });

    // ── Update or Create Marker ───────────────────────────────────────────
    if (markerInstanceRef.current) {
      markerInstanceRef.current.setLatLng(position);
    } else if (mapInstanceRef.current) {
      markerInstanceRef.current = L.marker(position, { icon: customIcon }).addTo(
        mapInstanceRef.current
      );
    }

    // ── Rich Popup Content ────────────────────────────────────────────────
    const locationLine = [city, region, country].filter(Boolean).join(", ");
    const confColor =
      confidence === "high"
        ? "#34d399"
        : confidence === "medium"
        ? "#fbbf24"
        : confidence === "low"
        ? "#f87171"
        : "#B6B8C4";
    const confLabel = confidence
      ? confidence.charAt(0).toUpperCase() + confidence.slice(1)
      : "Unknown";

    const popupContent = `
      <div style="font-family: monospace; min-width: 180px; padding: 2px;">
        ${
          ip
            ? `<div style="font-size:11px; font-weight:800; color:#EC9AA3; margin-bottom:5px; letter-spacing:0.04em;">${ip}</div>`
            : ""
        }
        <div style="font-size:10px; color:#F8F8FA; font-weight:700; margin-bottom:3px;">${locationLine || "Unknown Location"}</div>
        ${
          isp
            ? `<div style="font-size:10px; color:#B6B8C4; margin-bottom:3px;">🏢 ${isp}</div>`
            : ""
        }
        <div style="font-size:9px; color:#B6B8C4; opacity:0.65; margin-bottom:5px;">
          ${lat.toFixed(5)}, ${lon.toFixed(5)}
        </div>
        <div style="display:flex; align-items:center; gap:5px;">
          <span style="font-size:9px; color:#B6B8C4; opacity:0.5;">Confidence:</span>
          <span style="font-size:9px; font-weight:800; color:${confColor};">${confLabel}</span>
          ${
            accuracyKm && accuracyKm > 0
              ? `<span style="font-size:9px; color:#B6B8C4; opacity:0.4;">±${accuracyKm} km</span>`
              : ""
          }
        </div>
      </div>
    `;

    if (markerInstanceRef.current) {
      markerInstanceRef.current
        .bindPopup(popupContent, {
          className: "custom-leaflet-popup",
          closeButton: false,
          maxWidth: 240,
        })
        .openPopup();
    }
  }, [lat, lon, ip, city, region, country, isp, confidence, accuracyKm]);

  // ── Cleanup on Unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.remove();
        accuracyCircleRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <div
        ref={mapContainerRef}
        className="w-full h-[340px] rounded-xl overflow-hidden border border-[rgba(236,154,163,0.14)] relative z-10"
      />

      {/* Scoped styles — only target Leaflet popup internals, not the dashboard */}
      <style jsx global>{`
        /* Keep the popup dark so it reads well against the light map */
        .custom-leaflet-popup .leaflet-popup-content-wrapper {
          background: #08080f !important;
          color: #f8f8fa !important;
          border: 1px solid rgba(236, 154, 163, 0.18);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.65);
          border-radius: 10px;
          padding: 0;
        }
        .custom-leaflet-popup .leaflet-popup-content {
          margin: 10px 14px;
        }
        .custom-leaflet-popup .leaflet-popup-tip-container {
          margin-top: -1px;
        }
        .custom-leaflet-popup .leaflet-popup-tip {
          background: #08080f !important;
        }
        /* Attribution stays small and clean */
        .leaflet-control-attribution {
          font-size: 9px !important;
          opacity: 0.55;
          background: rgba(0, 0, 0, 0.35) !important;
          color: #aaa !important;
          border-radius: 4px 0 0 0 !important;
        }
        .leaflet-control-attribution a {
          color: #ccc !important;
        }
        /* Zoom buttons - keep them readable on light map */
        .leaflet-control-zoom a {
          background-color: #08080f !important;
          color: #f8f8fa !important;
          border-color: rgba(236, 154, 163, 0.2) !important;
        }
        .leaflet-control-zoom a:hover {
          background-color: #1a1a2e !important;
        }
      `}</style>
    </>
  );
}
