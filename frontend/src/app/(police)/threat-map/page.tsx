"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";
function getToken() { if (typeof window === "undefined") return null; return localStorage.getItem("accessToken"); }
async function api<T>(endpoint: string): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${endpoint}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    credentials: "include",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed");
  return json.data as T;
}

const ease = [0.22, 0.03, 0.26, 1] as [number, number, number, number];

// Bounding Box parameters extracted directly from mapsvg:geoViewBox in public/india.svg
const SVG_WIDTH = 611.85999;
const SVG_HEIGHT = 695.70178;
const WEST_LONGITUDE = 68.184010;
const EAST_LONGITUDE = 97.418146;
const NORTH_LATITUDE = 37.084109;
const SOUTH_LATITUDE = 6.753659;

// Geographic Mercator Projection to map coordinates to SVG coordinates
const projectCoords = (lat: number, lon: number) => {
  const x = ((lon - WEST_LONGITUDE) / (EAST_LONGITUDE - WEST_LONGITUDE)) * SVG_WIDTH;
  const y = ((NORTH_LATITUDE - lat) / (NORTH_LATITUDE - SOUTH_LATITUDE)) * SVG_HEIGHT;
  return { x, y };
};

const CITY_COORDINATES: Record<string, { lat: number; lon: number }> = {
  "Mumbai": { lat: 19.0760, lon: 72.8777 },
  "Delhi": { lat: 28.6139, lon: 77.2090 },
  "Pune": { lat: 18.5204, lon: 73.8567 },
  "Bengaluru": { lat: 12.9716, lon: 77.5946 },
  "Kolkata": { lat: 22.5726, lon: 88.3639 },
  "Chennai": { lat: 13.0827, lon: 80.2707 },
  "Hyderabad": { lat: 17.3850, lon: 78.4867 },
  "Ahmedabad": { lat: 23.0225, lon: 72.5714 },
  "Jaipur": { lat: 26.9124, lon: 75.7873 },
  "Srinagar": { lat: 34.0837, lon: 74.7973 },
  "Guwahati": { lat: 26.1158, lon: 91.7086 },
  "Patna": { lat: 25.5941, lon: 85.1376 },
  "Bhubaneswar": { lat: 20.3041, lon: 85.8189 },
  "Bhopal": { lat: 23.2599, lon: 77.4126 },
  "Ranchi": { lat: 23.3441, lon: 85.3096 },
  "Lucknow": { lat: 26.8467, lon: 80.9462 },
  "Raipur": { lat: 21.2514, lon: 81.6296 },
  "Nagpur": { lat: 21.1458, lon: 79.0882 },
  "Kochi": { lat: 9.9312, lon: 76.2673 },
  "Chandigarh": { lat: 30.7333, lon: 76.7794 }
};

const THREAT_COLOR: Record<string, string> = {
  low: "#10b981",       // Emerald Green
  medium: "#f59e0b",    // Amber Yellow
  high: "#f97316",      // Orange
  critical: "#ef4444",  // Red
};

const THREAT_BG: Record<string, string> = {
  low: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  medium: "bg-amber-500/10 border-amber-500/30 text-amber-400",
  high: "bg-orange-500/10 border-orange-500/30 text-orange-400",
  critical: "bg-red-500/10 border-red-500/30 text-red-400",
};

const RELATIONSHIP_COLOR: Record<string, string> = {
  weak: "#10b981",     // Green
  medium: "#f59e0b",   // Yellow
  strong: "#f97316",   // Orange
  critical: "#ef4444"  // Red
};

interface Case {
  id: string;
  title: string;
  crimeType: string;
  status: string;
  threatLevel: string;
  confidence: number;
  occurredAt: string;
}

interface SharedEntity {
  type: string;
  value: string;
}

interface Link {
  id: string;
  source: string;
  target: string;
  strength: number;
  relationshipType: string;
  sharedEntities: SharedEntity[];
  ringIndex: number;
}

interface Node {
  id: string;
  city: string;
  state: string;
  casesCount: number;
  threatLevel: string;
  riskScore: number;
  sharedEntitiesCount: number;
  crimeTypes: string[];
  cases: Case[];
  ringIndex: number;
}

interface TimelineEvent {
  timestamp: string;
  type: string;
  city: string;
  crimeType: string;
  caseId: string;
  title: string;
  description: string;
  createdNode: string | null;
  createdLinks: string[];
}

interface AIInsights {
  relationshipStrength: number;
  fraudRingConfidence: number;
  mostConnectedCity: string;
  highestRiskCluster: string;
  mostReusedPhone: string;
  mostReusedEmail: string;
  mostReusedUpi: string;
  mostActiveNetwork: string;
}

interface ThreatMapData {
  states: any[];
  nodes: Node[];
  links: Link[];
  timeline: TimelineEvent[];
  aiInsights: AIInsights;
  summary: {
    totalScans: number;
    totalReports: number;
    totalEvidence: number;
    totalInvestigations: number;
    highRiskScans: number;
  };
}

interface SvgPathData {
  id: string;
  title: string;
  d: string;
}

export default function ThreatMapPage() {
  const [data, setData] = useState<ThreatMapData | null>(null);
  const [svgPaths, setSvgPaths] = useState<SvgPathData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Selection & Highlight states
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [hoveredCityId, setHoveredCityId] = useState<string | null>(null);

  // Timeline States
  const [timelineIndex, setTimelineIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1500); // ms per step
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Filter States
  const [filterCrimeType, setFilterCrimeType] = useState<string>("all");
  const [filterThreatLevel, setFilterThreatLevel] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterRingSize, setFilterRingSize] = useState<string>("all");

  // Fetch threat map data from backend API
  useEffect(() => {
    api<ThreatMapData>("/analytics/threat-map")
      .then((res) => {
        setData(res);
        // Default timeline index to the end (show full graph)
        if (res.timeline && res.timeline.length > 0) {
          setTimelineIndex(res.timeline.length - 1);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Fetch India Map SVG vector path data dynamically at client mount
  useEffect(() => {
    fetch("/india.svg")
      .then((res) => res.text())
      .then((text) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "image/svg+xml");
        const paths = doc.querySelectorAll("path");
        const parsedPaths = Array.from(paths).map((p) => ({
          id: p.getAttribute("id") || "",
          title: p.getAttribute("title") || "",
          d: p.getAttribute("d") || "",
        }));
        setSvgPaths(parsedPaths);
      })
      .catch((err) => console.error("Failed to load India SVG paths:", err));
  }, []);

  // Timeline play loop
  useEffect(() => {
    if (isPlaying && data?.timeline) {
      playbackIntervalRef.current = setInterval(() => {
        setTimelineIndex((prev) => {
          if (prev >= data.timeline.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, playbackSpeed);
    } else {
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
    }

    return () => {
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
    };
  }, [isPlaying, data, playbackSpeed]);

  if (error) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-sm text-red-400">{error}</p>
    </div>
  );
  if (loading || !data) return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 w-72 rounded-xl bg-[rgba(236,154,163,0.07)]" />
      <div className="grid grid-cols-5 gap-2.5">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[72px] rounded-2xl bg-[rgba(236,154,163,0.04)]" />)}
      </div>
      <div className="h-[560px] rounded-2xl bg-[rgba(236,154,163,0.03)]" />
    </div>
  );

  // ─── FILTER & TIMELINE PROJECTION ──────────────────────────────────────────
  
  // 1. Get elements active up to the current timeline step
  const activeCities = new Set<string>();
  const activeLinkIds = new Set<string>();

  if (data.timeline && data.timeline.length > 0 && timelineIndex >= 0) {
    for (let i = 0; i <= timelineIndex; i++) {
      const step = data.timeline[i];
      if (step.createdNode) activeCities.add(step.createdNode);
      step.createdLinks.forEach(id => activeLinkIds.add(id));
      
      // Also ensure the city of the incident is active
      activeCities.add(step.city);
    }
  }

  // 2. Filter nodes & links based on criteria AND timeline active state
  const filteredNodes = data.nodes.filter(node => {
    // Timeline check
    if (!activeCities.has(node.id)) return false;

    // Crime Type filter (any case matches)
    if (filterCrimeType !== "all" && !node.crimeTypes.includes(filterCrimeType)) return false;

    // Threat level filter
    if (filterThreatLevel !== "all" && node.threatLevel !== filterThreatLevel) return false;

    // Status filter
    if (filterStatus !== "all" && !node.cases.some(c => c.status === filterStatus)) return false;

    // Ring size filter (large component count)
    if (filterRingSize !== "all") {
      const casesInRing = data.nodes.filter(n => n.ringIndex === node.ringIndex).reduce((acc, curr) => acc + curr.casesCount, 0);
      if (filterRingSize === "large" && casesInRing < 4) return false;
      if (filterRingSize === "medium" && (casesInRing < 2 || casesInRing >= 4)) return false;
      if (filterRingSize === "small" && casesInRing > 1) return false;
    }

    return true;
  });

  const filteredNodeIds = new Set(filteredNodes.map(n => n.id));

  const filteredLinks = data.links.filter(link => {
    // Timeline check
    if (!activeLinkIds.has(link.id)) return false;

    // Node connection check (both connected nodes must be active and match filters)
    if (!filteredNodeIds.has(link.source) || !filteredNodeIds.has(link.target)) return false;

    // Crime type filter check
    if (filterCrimeType !== "all") {
      const sourceNode = data.nodes.find(n => n.id === link.source);
      const targetNode = data.nodes.find(n => n.id === link.target);
      if (!sourceNode?.crimeTypes.includes(filterCrimeType) || !targetNode?.crimeTypes.includes(filterCrimeType)) {
        return false;
      }
    }

    return true;
  });

  // ─── HELPER MATHS ──────────────────────────────────────────────────────────
  
  // Calculate curved path (quadratic Bezier) between two nodes inside SVG coordinate system
  const getCurvedPath = (x1: number, y1: number, x2: number, y2: number, index: number) => {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    
    // Perpendicular vector calculation
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    
    // Curvature strength (alternate curve directions or offset)
    const curveOffset = len * 0.08 + (index % 2 === 0 ? 8 : -8);
    const cx = mx + px * curveOffset;
    const cy = my + py * curveOffset;
    
    return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
  };

  // Node highlight checker
  const isCityHighlighted = (cityId: string) => {
    if (!selectedCityId) return true; // nothing selected, all highlighted
    if (selectedCityId === cityId) return true;
    
    // Check if there is an active link between selectedCityId and cityId
    return filteredLinks.some(
      (l) => (l.source === selectedCityId && l.target === cityId) || (l.target === selectedCityId && l.source === cityId)
    );
  };

  // Node click handler
  const handleNodeClick = (cityId: string) => {
    setSelectedCityId((prev) => (prev === cityId ? null : cityId));
  };

  const selectedNode = selectedCityId ? data.nodes.find((n) => n.id === selectedCityId) : null;

  // Extract shared entities breakdown for selected node panel
  const getSharedEntitiesBreakdown = () => {
    if (!selectedCityId) return { list: [], count: 0 };
    const list: { city: string; entities: SharedEntity[] }[] = [];
    let totalCount = 0;

    filteredLinks.forEach((l) => {
      if (l.source === selectedCityId || l.target === selectedCityId) {
        const otherCity = l.source === selectedCityId ? l.target : l.source;
        list.push({
          city: otherCity,
          entities: l.sharedEntities
        });
        totalCount += l.sharedEntities.length;
      }
    });

    return { list, count: totalCount };
  };

  const sharedInfo = getSharedEntitiesBreakdown();

  return (
    <div className="space-y-6 pb-12">
      {/* ─── HEADER ──────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }}>
        <h1 className="text-2xl font-black text-[#F8F8FA] tracking-tight flex items-center gap-2">
          <span className="text-[#EC9AA3]">AI-Powered</span> Fraud Ring Map
        </h1>
        <p className="mt-1.5 text-xs text-[#B6B8C4]/55 font-medium">
          Multi-city cybercrime syndicates mapped dynamically via shared digital footprints (Phone, UPI, IP, Devices).
        </p>
      </motion.div>

      {/* ─── FILTERS PANEL ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 rounded-2xl border border-[rgba(236,154,163,0.08)] bg-[#08080F]/60 backdrop-blur-xl">
        <div>
          <label className="text-[9px] text-[#B6B8C4]/40 uppercase tracking-wider block mb-1">Crime Type</label>
          <select
            value={filterCrimeType}
            onChange={(e) => setFilterCrimeType(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-[#F8F8FA] bg-[#050508]/60 border border-[rgba(236,154,163,0.1)] focus:outline-none"
          >
            <option value="all">All Crimes</option>
            <option value="Phishing Campaign">Phishing Campaign</option>
            <option value="UPI Fraud">UPI Fraud</option>
            <option value="Digital Arrest">Digital Arrest</option>
            <option value="Identity Theft">Identity Theft</option>
            <option value="Ransomware">Ransomware</option>
            <option value="Counterfeit Currency">Counterfeit Currency</option>
          </select>
        </div>
        <div>
          <label className="text-[9px] text-[#B6B8C4]/40 uppercase tracking-wider block mb-1">Threat Severity</label>
          <select
            value={filterThreatLevel}
            onChange={(e) => setFilterThreatLevel(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-[#F8F8FA] bg-[#050508]/60 border border-[rgba(236,154,163,0.1)] focus:outline-none"
          >
            <option value="all">All Levels</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label className="text-[9px] text-[#B6B8C4]/40 uppercase tracking-wider block mb-1">Investigation Status</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-[#F8F8FA] bg-[#050508]/60 border border-[rgba(236,154,163,0.1)] focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="MONITORING">Monitoring</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>
        <div>
          <label className="text-[9px] text-[#B6B8C4]/40 uppercase tracking-wider block mb-1">Fraud Ring Size</label>
          <select
            value={filterRingSize}
            onChange={(e) => setFilterRingSize(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-[#F8F8FA] bg-[#050508]/60 border border-[rgba(236,154,163,0.1)] focus:outline-none"
          >
            <option value="all">All Sizes</option>
            <option value="large">Large Syndicates (4+ Cases)</option>
            <option value="medium">Medium Groups (2-3 Cases)</option>
            <option value="small">Isolated Incidents (1 Case)</option>
          </select>
        </div>
        <div className="col-span-2 md:col-span-1 flex items-end">
          <button
            onClick={() => {
              setFilterCrimeType("all");
              setFilterThreatLevel("all");
              setFilterStatus("all");
              setFilterRingSize("all");
              setSelectedCityId(null);
              if (data.timeline && data.timeline.length > 0) {
                setTimelineIndex(data.timeline.length - 1);
              }
            }}
            className="w-full py-2.5 rounded-lg text-xs font-bold text-[#EC9AA3] border border-[rgba(236,154,163,0.25)] bg-[#EC9AA3]/5 hover:bg-[#EC9AA3]/10 transition-all"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* ─── GRAPH MAP & INFO LAYOUT ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* MAP CONTAINER (LEFT 2 COLUMNS) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative rounded-2xl bg-[#090D1A] border border-[rgba(236,154,163,0.07)] overflow-hidden shadow-2xl h-[560px] w-full flex items-center justify-center">
            
            {/* Soft Depth shadow vignette */}
            <div className="absolute inset-0 pointer-events-none z-20 shadow-[inset_0_0_80px_rgba(0,0,0,0.85)]" />

            {/* High-quality Vector Inline SVG map container */}
            <div className="w-[95%] h-[95%] relative flex items-center justify-center">
              <svg
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                className="w-full h-full relative z-10 transition-transform duration-300"
                style={{
                  filter: "drop-shadow(0 0 24px rgba(0, 0, 0, 0.9))"
                }}
              >
                <defs>
                  {/* Glowing filters for different nodes */}
                  <filter id="glow-low" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="glow-medium" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="5.5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="glow-high" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="7" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="glow-critical" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="9" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  
                  {/* Subtle drop shadow for labels */}
                  <filter id="shadow-label" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#000" floodOpacity="0.4"/>
                  </filter>
                </defs>

                {/* Cyber Intelligence Bounding Grid overlay (Military style) */}
                <g stroke="rgba(34, 211, 238, 0.02)" strokeWidth="0.5" pointerEvents="none">
                  {Array.from({ length: 20 }).map((_, idx) => {
                    const x = (SVG_WIDTH / 20) * idx;
                    return <line key={`gx-${idx}`} x1={x} y1={0} x2={x} y2={SVG_HEIGHT} />;
                  })}
                  {Array.from({ length: 22 }).map((_, idx) => {
                    const y = (SVG_HEIGHT / 22) * idx;
                    return <line key={`gy-${idx}`} x1={0} y1={y} x2={SVG_WIDTH} y2={y} />;
                  })}
                </g>

                {/* Scan line sweeping across coordinates */}
                <line x1="0" y1="0" x2={SVG_WIDTH} y2="0" stroke="rgba(34, 211, 238, 0.16)" strokeWidth="1.5" pointerEvents="none">
                  <animate attributeName="y1" from="0" to={SVG_HEIGHT} dur="9s" repeatCount="indefinite" />
                  <animate attributeName="y2" from="0" to={SVG_HEIGHT} dur="9s" repeatCount="indefinite" />
                </line>

                {/* Background stars / floating particles */}
                {Array.from({ length: 20 }).map((_, i) => (
                  <circle
                    key={`star-${i}`}
                    cx={15 + Math.random() * (SVG_WIDTH - 30)}
                    cy={15 + Math.random() * (SVG_HEIGHT - 30)}
                    r={0.8 + Math.random() * 0.9}
                    fill="rgba(34, 211, 238, 0.25)"
                    pointerEvents="none"
                  >
                    <animate attributeName="opacity" values="0.15;0.75;0.15" dur={`${3.5 + Math.random() * 3}s`} repeatCount="indefinite" />
                  </circle>
                ))}

                {/* State Vector Land Paths */}
                {svgPaths.map((path) => (
                  <path
                    key={path.id}
                    d={path.d}
                    title={path.title}
                    className="transition-colors duration-300"
                    fill="#1F2937"
                    stroke="#374151"
                    strokeWidth="0.8"
                    style={{
                      transition: "fill 0.3s ease, stroke 0.3s ease"
                    }}
                  />
                ))}

                {/* Draw Outer Coastline Border Layer */}
                {svgPaths.map((path) => (
                  <path
                    key={`outer-${path.id}`}
                    d={path.d}
                    fill="none"
                    stroke="#475569"
                    strokeWidth="0.25"
                    opacity="0.4"
                    pointerEvents="none"
                  />
                ))}

                {/* Dynamic curved connection paths between coordinates */}
                {filteredLinks.map((link, idx) => {
                  const sourceCoords = CITY_COORDINATES[link.source];
                  const targetCoords = CITY_COORDINATES[link.target];
                  if (!sourceCoords || !targetCoords) return null;

                  const posA = projectCoords(sourceCoords.lat, sourceCoords.lon);
                  const posB = projectCoords(targetCoords.lat, targetCoords.lon);

                  const color = RELATIONSHIP_COLOR[link.relationshipType] || RELATIONSHIP_COLOR.weak;
                  const pathData = getCurvedPath(posA.x, posA.y, posB.x, posB.y, idx);

                  // Highlight logic
                  const isLinkHighlighted = selectedCityId 
                    ? (link.source === selectedCityId || link.target === selectedCityId) 
                    : true;

                  const strokeWidth = Math.max(1, Math.min(4, link.strength * 0.8));

                  return (
                    <g key={link.id} className="transition-opacity duration-300" opacity={isLinkHighlighted ? 0.85 : 0.08}>
                      {/* Glow backdrop link path */}
                      <path
                        d={pathData}
                        fill="none"
                        stroke={color}
                        strokeWidth={strokeWidth + 1.5}
                        opacity={0.18}
                      />
                      
                      {/* Core link line */}
                      <path
                        d={pathData}
                        fill="none"
                        stroke={color}
                        strokeWidth={strokeWidth}
                        opacity={0.8}
                      />

                      {/* Floating intelligence particle */}
                      <circle r={Math.max(1.8, strokeWidth - 0.2)} fill="#ffffff" style={{ filter: "drop-shadow(0 0 2.5px #ffffff)" }}>
                        <animateMotion
                          path={pathData}
                          dur={link.strength > 2 ? "1.8s" : "3s"}
                          repeatCount="indefinite"
                        />
                      </circle>
                    </g>
                  );
                })}

                {/* City Nodes */}
                {filteredNodes.map((node) => {
                  const coords = CITY_COORDINATES[node.id];
                  if (!coords) return null;

                  const pos = projectCoords(coords.lat, coords.lon);
                  const isHighlighted = isCityHighlighted(node.id);
                  const color = THREAT_COLOR[node.threatLevel] || THREAT_COLOR.low;
                  
                  // Scale nodes dynamically based on crime metrics
                  const size = Math.max(6, Math.min(18, 5 + node.casesCount * 1.5 + node.sharedEntitiesCount * 0.4));
                  
                  const isSelected = selectedCityId === node.id;
                  const isHovered = hoveredCityId === node.id;

                  // Label placement helpers (Prevent label clippings at the edge bounds)
                  const isLeftHalf = pos.x < (SVG_WIDTH / 2);
                  const labelAnchor = isLeftHalf ? "start" : "end";
                  const labelDx = isLeftHalf ? size + 6 : -(size + 6);

                  return (
                    <g
                      key={node.id}
                      className="cursor-pointer transition-opacity duration-300"
                      opacity={isHighlighted ? 1 : 0.12}
                      onClick={() => handleNodeClick(node.id)}
                      onMouseEnter={() => setHoveredCityId(node.id)}
                      onMouseLeave={() => setHoveredCityId(null)}
                    >
                      {/* Animated Pulse circle rings */}
                      {node.casesCount > 0 && (
                        <circle
                          cx={pos.x}
                          cy={pos.y}
                          r={size + 6}
                          fill="none"
                          stroke={color}
                          strokeWidth="0.8"
                          opacity="0.3"
                        >
                          <animate attributeName="r" values={`${size};${size + 14}`} dur="2s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.45;0" dur="2s" repeatCount="indefinite" />
                        </circle>
                      )}

                      {/* soft node glow filter layer */}
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={size}
                        fill={color}
                        opacity={isSelected || isHovered ? 0.35 : 0.18}
                        filter={`url(#glow-${node.threatLevel})`}
                      />

                      {/* Core node solid circle */}
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={isSelected || isHovered ? size + 1.2 : size}
                        fill={color}
                        stroke={isSelected ? "#ffffff" : "rgba(0,0,0,0.4)"}
                        strokeWidth={isSelected ? 1.5 : 0.8}
                        className="transition-all duration-300"
                      />

                      {/* Translucent background badge for labels */}
                      <g className="transition-opacity duration-200">
                        {/* City text label with intelligence-style rounded badge */}
                        <text
                          x={pos.x}
                          y={pos.y + 3}
                          dx={labelDx}
                          textAnchor={labelAnchor}
                          fill="#F8F8FA"
                          fontSize="7.5"
                          fontFamily="monospace"
                          fontWeight="700"
                          letterSpacing="0.04em"
                          className="pointer-events-none select-none"
                          style={{
                            textShadow: "0 1px 3px rgba(0,0,0,0.9)",
                            filter: "url(#shadow-label)"
                          }}
                        >
                          {node.city.toUpperCase()}
                        </text>
                      </g>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Live Telemetry sweep overlay label */}
            <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0D0D14]/90 border border-[rgba(236,154,163,0.08)] backdrop-blur-md z-30">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-50" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-400" />
              </span>
              <span className="text-[9px] text-[#B6B8C4]/70 font-semibold tracking-wider font-mono">INTEL AGENT SCAN ACTIVE</span>
            </div>

            <div className="absolute top-4 left-4 px-3 py-1.5 rounded-xl bg-[#0D0D14]/90 border border-[rgba(236,154,163,0.08)] backdrop-blur-md z-30">
              <span className="text-[9px] text-[#EC9AA3]/70 font-bold uppercase tracking-widest font-mono">
                CRIME Topo Graph (GIS Projected)
              </span>
            </div>

            {/* Curvature connection guide legend */}
            <div className="absolute bottom-4 left-4 flex items-center gap-3 px-3 py-2 rounded-xl bg-[#0D0D14]/95 border border-[rgba(236,154,163,0.08)] backdrop-blur-md z-30">
              <span className="text-[8px] text-[#B6B8C4]/40 uppercase tracking-widest mr-1 font-mono">Severity Scale</span>
              {Object.entries(THREAT_COLOR).map(([level, color]) => (
                <div key={level} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-[8px] text-[#B6B8C4]/70 capitalize font-mono">{level}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ─── PLAYBACK TIMELINE EVOLUTION CONTROLLER ────────────────────── */}
          {data.timeline && data.timeline.length > 0 && (
            <div className="p-4 rounded-2xl border border-[rgba(236,154,163,0.07)] bg-[#0D0D14]/85 backdrop-blur-md space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#EC9AA3] hover:bg-[#f3b3ba] text-[#050508] transition-colors"
                    aria-label={isPlaying ? "Pause playback" : "Play timeline"}
                  >
                    {isPlaying ? (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setIsPlaying(false);
                      setTimelineIndex(0);
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-[9px] font-bold tracking-wider text-[#B6B8C4] hover:text-[#F8F8FA] border border-[rgba(236,154,163,0.1)] transition-colors font-mono"
                  >
                    Reset
                  </button>
                  <span className="text-[10px] font-mono text-[#F8F8FA]/90">
                    Step {timelineIndex + 1} of {data.timeline.length}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[8px] text-[#B6B8C4]/40 uppercase font-mono">Speed:</span>
                  <select
                    value={playbackSpeed}
                    onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                    className="px-2 py-1 rounded text-[9px] font-semibold text-[#F8F8FA] bg-[#050508]/60 border border-[rgba(236,154,163,0.1)] focus:outline-none font-mono"
                  >
                    <option value={2000}>Slow (2s)</option>
                    <option value={1500}>Normal (1.5s)</option>
                    <option value={800}>Fast (0.8s)</option>
                  </select>
                </div>
              </div>

              {/* Slider timeline track */}
              <div className="relative pt-1">
                <input
                  type="range"
                  min="0"
                  max={data.timeline.length - 1}
                  value={timelineIndex}
                  onChange={(e) => {
                    setIsPlaying(false);
                    setTimelineIndex(Number(e.target.value));
                  }}
                  className="w-full accent-[#EC9AA3] cursor-pointer"
                />
                <div className="flex justify-between text-[8px] text-[#B6B8C4]/30 font-mono mt-1.5">
                  <span>Start (Jul 01)</span>
                  <span>Timeline Growth Evolution (Real-time network compilation)</span>
                  <span>End (Current)</span>
                </div>
              </div>

              {/* Display current active timeline event summary description */}
              {timelineIndex >= 0 && data.timeline[timelineIndex] && (
                <div className="p-3 rounded-lg border border-[rgba(236,154,163,0.04)] bg-white/[0.015] text-[10.5px] font-mono leading-relaxed text-[#B6B8C4]/80">
                  <span className="text-[#EC9AA3] font-bold block mb-1">
                    📅 {new Date(data.timeline[timelineIndex].timestamp).toLocaleDateString("en-IN", {
                      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                    })}
                  </span>
                  {data.timeline[timelineIndex].description}
                </div>
              )}
            </div>
          )}
        </div>

        {/* SIDE BAR / DETAIL PANEL (RIGHT COLUMN) */}
        <div className="space-y-6">
          <AnimatePresence mode="wait">
            
            {/* ─── CASE / INVESTIGATION DETAILED PROFILE PANEL ─────────────── */}
            {selectedNode ? (
              <motion.div
                key="city-detail"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.35, ease }}
                className="rounded-2xl bg-[#0D0D14]/85 border border-[rgba(236,154,163,0.09)] p-5 space-y-5 shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-[rgba(236,154,163,0.06)] pb-3">
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#B6B8C4]/40 font-mono">Node Detail Profile</span>
                    <h3 className="text-base font-black text-[#F8F8FA] flex items-center gap-1.5 font-mono">
                      📍 {selectedNode.city.toUpperCase()}
                    </h3>
                  </div>
                  <button
                    onClick={() => setSelectedCityId(null)}
                    className="w-6 h-6 rounded flex items-center justify-center text-xs text-[#B6B8C4]/40 hover:text-[#F8F8FA] hover:bg-[#EC9AA3]/10 border border-transparent hover:border-[rgba(236,154,163,0.1)] transition-all font-mono"
                  >
                    ×
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                  <div className="p-3 rounded-xl bg-white/[0.015] border border-[rgba(236,154,163,0.03)]">
                    <span className="text-[#B6B8C4]/40 text-[9px] uppercase tracking-wider block">State Region</span>
                    <span className="text-[#F8F8FA] font-bold block mt-1">{selectedNode.state}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.015] border border-[rgba(236,154,163,0.03)]">
                    <span className="text-[#B6B8C4]/40 text-[9px] uppercase tracking-wider block">Risk score</span>
                    <span className={`font-black block mt-1 text-sm ${
                      selectedNode.riskScore >= 75 ? "text-red-400" : selectedNode.riskScore >= 50 ? "text-orange-400" : "text-emerald-400"
                    }`}>
                      {selectedNode.riskScore} / 100
                    </span>
                  </div>
                </div>

                {/* Case counts in this city */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black uppercase text-[#B6B8C4]/40 tracking-wider font-mono">
                    Linked Cases ({selectedNode.casesCount})
                  </h4>
                  <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                    {selectedNode.cases.map((c) => (
                      <div key={c.id} className="p-2.5 rounded-xl bg-[#060610] border border-[rgba(236,154,163,0.05)] space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-bold text-[#F8F8FA] font-mono">
                          <span className="truncate pr-1">{c.title}</span>
                          <span className={`text-[8px] font-mono border px-1.5 py-0.5 rounded-full uppercase tracking-wider ${THREAT_BG[c.threatLevel]}`}>
                            {c.threatLevel}
                          </span>
                        </div>
                        <div className="flex justify-between text-[9px] text-[#B6B8C4]/40 font-mono">
                          <span>{c.crimeType}</span>
                          <span>{new Date(c.occurredAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Shared entity connections breakdown */}
                <div className="space-y-3.5 pt-3 border-t border-[rgba(236,154,163,0.05)]">
                  <div className="flex justify-between items-center">
                    <h4 className="text-[10px] font-black uppercase text-[#B6B8C4]/40 tracking-wider font-mono">
                      Shared Entity Network
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#EC9AA3]/10 border border-[rgba(236,154,163,0.2)] text-[#EC9AA3] font-mono">
                      Conf: {data.aiInsights.fraudRingConfidence}%
                    </span>
                  </div>

                  {sharedInfo.list.length > 0 ? (
                    <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                      {sharedInfo.list.map((sh, idx) => (
                        <div key={idx} className="p-2.5 rounded-xl border border-[rgba(236,154,163,0.03)] bg-white/[0.01] space-y-2">
                          <div className="text-[10px] font-bold text-[#EC9AA3] font-mono">
                            Connected to: {sh.city}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {sh.entities.map((ent, eIdx) => (
                              <span key={eIdx} className="px-2 py-1 rounded bg-[#060610] text-[9px] text-[#B6B8C4] border border-[rgba(236,154,163,0.04)] font-mono truncate max-w-full">
                                <strong className="text-[#F8F8FA]/60 uppercase tracking-wider text-[8px] mr-1">{ent.type}:</strong>
                                {ent.value}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl text-center border border-dashed border-[rgba(236,154,163,0.1)] text-[#B6B8C4]/30 text-xs italic font-mono">
                      No multi-city shared entity links detected in this filtered topology view.
                    </div>
                  )}
                </div>

              </motion.div>
            ) : (
              
              // ─── AI NETWORK INTEL / GRAPH ANALYSIS PANEL ───────────────────
              <motion.div
                key="ai-intel"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.35, ease }}
                className="rounded-2xl bg-[#0D0D14]/85 border border-[rgba(236,154,163,0.07)] p-5 space-y-4.5 shadow-xl"
              >
                <div className="border-b border-[rgba(236,154,163,0.06)] pb-3 font-mono">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#B6B8C4]/40">Active AI Intelligence</span>
                  <h3 className="text-sm font-black text-[#F8F8FA] uppercase tracking-wider mt-0.5">
                    🤖 Dynamic Graph Analysis
                  </h3>
                </div>

                <div className="space-y-4">
                  {/* Top Highlight Metric cards */}
                  <div className="grid grid-cols-2 gap-3 font-mono">
                    <div className="p-3.5 rounded-2xl bg-white/[0.015] border border-[rgba(236,154,163,0.04)]">
                      <span className="text-[#B6B8C4]/40 text-[9px] uppercase tracking-wider block">Ring Confidence</span>
                      <span className="text-emerald-400 text-lg font-black block mt-1">
                        {data.aiInsights.fraudRingConfidence}%
                      </span>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-white/[0.015] border border-[rgba(236,154,163,0.04)]">
                      <span className="text-[#B6B8C4]/40 text-[9px] uppercase tracking-wider block">Link Density</span>
                      <span className="text-[#EC9AA3] text-lg font-black block mt-1">
                        {data.aiInsights.relationshipStrength}x
                      </span>
                    </div>
                  </div>

                  {/* Shared ID highlight tables */}
                  <div className="space-y-3 pt-2">
                    <h4 className="text-[10px] font-black uppercase text-[#B6B8C4]/40 tracking-wider font-mono">
                      Most Reused Digital Identities
                    </h4>

                    <div className="space-y-2.5 font-mono text-[10.5px]">
                      <div className="flex justify-between items-center py-2 px-3 rounded-lg border border-[rgba(236,154,163,0.03)] bg-[#050508]/50">
                        <span className="text-[#B6B8C4]/50 text-[9px] uppercase font-bold">Reused Phone</span>
                        <span className="text-[#F8F8FA] font-bold truncate max-w-[200px]" title={data.aiInsights.mostReusedPhone}>
                          {data.aiInsights.mostReusedPhone}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 px-3 rounded-lg border border-[rgba(236,154,163,0.03)] bg-[#050508]/50">
                        <span className="text-[#B6B8C4]/50 text-[9px] uppercase font-bold">Reused Email</span>
                        <span className="text-[#F8F8FA] font-bold truncate max-w-[200px]" title={data.aiInsights.mostReusedEmail}>
                          {data.aiInsights.mostReusedEmail}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 px-3 rounded-lg border border-[rgba(236,154,163,0.03)] bg-[#050508]/50">
                        <span className="text-[#B6B8C4]/50 text-[9px] uppercase font-bold">Reused UPI ID</span>
                        <span className="text-[#F8F8FA] font-bold truncate max-w-[200px]" title={data.aiInsights.mostReusedUpi}>
                          {data.aiInsights.mostReusedUpi}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Network cluster analytics */}
                  <div className="space-y-3 pt-3 border-t border-[rgba(236,154,163,0.05)]">
                    <h4 className="text-[10px] font-black uppercase text-[#B6B8C4]/40 tracking-wider font-mono">
                      Graph AI Cluster Summary
                    </h4>

                    <div className="space-y-2.5 text-xs font-mono">
                      <div className="space-y-0.5">
                        <span className="text-[#B6B8C4]/40 text-[9px] uppercase font-mono tracking-wider block">Most Connected City Node</span>
                        <span className="text-[#F8F8FA] font-bold">📍 {data.aiInsights.mostConnectedCity.toUpperCase()}</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[#B6B8C4]/40 text-[9px] uppercase font-mono tracking-wider block">Highest Risk Cluster</span>
                        <span className="text-red-400 font-bold block">{data.aiInsights.highestRiskCluster}</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[#B6B8C4]/40 text-[9px] uppercase font-mono tracking-wider block">Active Network Target</span>
                        <span className="text-[#EC9AA3] font-bold block">{data.aiInsights.mostActiveNetwork}</span>
                      </div>
                    </div>
                  </div>
                </div>

              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
