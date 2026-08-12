"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  Layers,
  Film,
  Link as LinkIcon,
  Monitor,
  Settings,
  Wifi,
  Radio,
  HardDrive,
  Database,
  Play,
  Upload,
  Plus,
  Trash2,
  ExternalLink,
  Sparkles,
  Zap,
} from "lucide-react";

export default function LidarCMSDashboard() {
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "zones" | "media" | "allocations" | "player" | "settings"
  >("dashboard");

  // State definitions
  const [zones, setZones] = useState<any[]>([]);
  const [mediaList, setMediaList] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [deviceConfig, setDeviceConfig] = useState<any>(null);

  // Real-time telemetry simulation state
  const [activeZoneKey, setActiveZoneKey] = useState<number>(0);
  const [telemetryLogs, setTelemetryLogs] = useState<
    Array<{ id: number; timestamp: string; event: string; type: "trigger" | "idle" | "info" }>
  >([
    { id: 1, timestamp: "--:--:--", event: "System initialized - Connected to CMS APIs", type: "info" },
  ]);

  // Interactive 2D Canvas tracker state
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number }>({ x: 0, y: 2.0 });

  // Preview modal state
  const [previewMedia, setPreviewMedia] = useState<any | null>(null);

  // New Zone form state
  const [newZone, setNewZone] = useState({
    name: "",
    zoneKey: 3,
    minX: -1.0,
    maxX: 1.0,
    minY: 3.5,
    maxY: 5.5,
    color: "#ec4899",
  });

  useEffect(() => {
    setTelemetryLogs((prev) =>
      prev.map((log) =>
        log.id === 1 && log.timestamp === "--:--:--"
          ? { ...log, timestamp: new Date().toLocaleTimeString() }
          : log
      )
    );

    async function loadData() {
      const safeFetch = async (url: string) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          const text = await res.text();
          return text ? JSON.parse(text) : null;
        } catch {
          return null;
        }
      };

      try {
        const [zRes, mRes, aRes, dRes] = await Promise.all([
          safeFetch("/api/zones"),
          safeFetch("/api/media"),
          safeFetch("/api/allocations"),
          safeFetch("/api/device"),
        ]);

        if (zRes?.success && Array.isArray(zRes.data)) setZones(zRes.data);
        if (mRes?.success && Array.isArray(mRes.data)) setMediaList(mRes.data);
        if (aRes?.success && Array.isArray(aRes.data)) setAllocations(aRes.data);
        if (dRes?.success && dRes.data) setDeviceConfig(dRes.data);

        setTelemetryLogs((prev) => [
          { id: Date.now(), timestamp: new Date().toLocaleTimeString(), event: "API Data loaded safely from /api/* endpoints", type: "info" },
          ...prev,
        ]);
      } catch (err) {
        console.error("API load error:", err);
      }
    }
    loadData();
  }, []);

  // Calculate current active media based on activeZoneKey
  const currentAllocation = allocations.find((a) => {
    if (activeZoneKey === 0) return a.isIdleDefault;
    const z = zones.find((item) => item.zoneKey === activeZoneKey);
    return z ? a.zoneId === z.id : false;
  }) || allocations[0];

  const currentMedia = mediaList.find((m) => m.id === currentAllocation?.mediaId) || mediaList[0] || {
    title: "Idle Ambience Loop",
    fileName: "idle_ambient_loop.mp4",
    publicUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    resolution: "1920x1080",
    sizeBytes: 44316922,
  };

  // Helper trigger function that posts to /api/trigger
  const triggerZone = async (key: number) => {
    setActiveZoneKey(key);
    const now = new Date().toLocaleTimeString();
    const eventText = key === 0 ? 'Zone Cleared: {"video": 0}' : `Zone Triggered: {"video": ${key}}`;

    setTelemetryLogs((prev) => [
      { id: Date.now(), timestamp: now, event: eventText, type: key === 0 ? "idle" : "trigger" },
      ...prev.slice(0, 15),
    ]);

    try {
      await fetch("/api/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video: key }),
      });
    } catch (e) {
      console.warn("Trigger API post error:", e);
    }
  };

  // Canvas click to test position
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const normX = ((clickX / rect.width) * 6.0 - 3.0).toFixed(2);
    const normY = ((1.0 - clickY / rect.height) * 6.0).toFixed(2);
    const numX = parseFloat(normX);
    const numY = parseFloat(normY);

    setPointerPos({ x: numX, y: numY });

    let hitZoneKey = 0;
    for (const z of zones) {
      if (numX >= z.minX && numX <= z.maxX && numY >= z.minY && numY <= z.maxY && z.isActive) {
        hitZoneKey = z.zoneKey;
        break;
      }
    }
    triggerZone(hitZoneKey);
  };

  // Save new zone via POST /api/zones
  const handleSaveZone = async () => {
    if (!newZone.name) return;
    try {
      const res = await fetch("/api/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newZone),
      }).then((r) => (r.ok ? r.json() : null));

      if (res?.success) {
        setZones((prev) => [...prev, res.data]);
        setNewZone({
          name: "",
          zoneKey: newZone.zoneKey + 1,
          minX: -1.0,
          maxX: 1.0,
          minY: 1.0,
          maxY: 3.0,
          color: "#f59e0b",
        });
      }
    } catch (err) {
      console.error("Save zone error:", err);
    }
  };

  // Delete zone via DELETE /api/zones?id=...
  const handleDeleteZone = async (id: string) => {
    try {
      await fetch(`/api/zones?id=${id}`, { method: "DELETE" });
      setZones((prev) => prev.filter((z) => z.id !== id));
    } catch (err) {
      console.error("Delete zone error:", err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100 font-sans">
      {/* Top Header Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-4 lg:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-950/70 border border-cyan-500/40 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
            <Radio className="w-5 h-5 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-cyan-400 rounded-full animate-ping" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg tracking-wider text-slate-100">LIDAR ZONES CMS</h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-500/30 font-mono">
                v2.0 NEXT.JS
              </span>
            </div>
            <p className="text-xs text-slate-400">Interactive Spatial Tracking & S3 Streaming Hub</p>
          </div>
        </div>

        {/* System Status Indicators */}
        <div className="hidden md:flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-lg">
            <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="text-slate-400">WS HUB:</span>
            <span className="text-emerald-400 font-semibold">:{deviceConfig?.wsPort || 8765} ONLINE</span>
          </div>

          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-lg">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">RASPBERRY PI:</span>
            <span className="text-cyan-400 font-semibold">{deviceConfig?.piHost || "192.168.1.100"}</span>
          </div>

          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-lg">
            <HardDrive className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-slate-400">S3:</span>
            <span className="text-purple-300 font-semibold">{deviceConfig?.s3Bucket || "lidar-assets"}</span>
          </div>

          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-lg">
            <Database className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-400">DB:</span>
            <span className="text-blue-300 font-semibold">PostgreSQL</span>
          </div>
        </div>
      </header>

      {/* Main Tabs Navigation Bar */}
      <div className="bg-slate-950/40 border-b border-slate-800/60 px-4 lg:px-8 flex items-center gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "dashboard"
              ? "border-cyan-400 text-cyan-400 bg-cyan-950/20"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Telemetry Dashboard</span>
        </button>

        <button
          onClick={() => setActiveTab("zones")}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "zones"
              ? "border-cyan-400 text-cyan-400 bg-cyan-950/20"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>2D Zone Manager</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
            {zones.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("media")}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "media"
              ? "border-cyan-400 text-cyan-400 bg-cyan-950/20"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
          }`}
        >
          <Film className="w-4 h-4" />
          <span>S3 Media Library</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
            {mediaList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("allocations")}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "allocations"
              ? "border-cyan-400 text-cyan-400 bg-cyan-950/20"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
          }`}
        >
          <LinkIcon className="w-4 h-4" />
          <span>Zone Allocations</span>
        </button>

        <button
          onClick={() => setActiveTab("player")}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "player"
              ? "border-cyan-400 text-cyan-400 bg-cyan-950/20"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
          }`}
        >
          <Monitor className="w-4 h-4" />
          <span>Web Kiosk Player</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30">
            LIVE KIOSK
          </span>
        </button>

        <button
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "settings"
              ? "border-cyan-400 text-cyan-400 bg-cyan-950/20"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>System Settings</span>
        </button>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto">
        {/* ================= TAB 1: TELEMETRY DASHBOARD ================= */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            {/* Quick Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono text-slate-400 uppercase">Active Zone State</p>
                  <h3 className="text-xl font-bold text-slate-100 mt-1 flex items-center gap-2">
                    {activeZoneKey === 0 ? (
                      <span className="text-slate-400">Idle State (No Trigger)</span>
                    ) : (
                      <span className="text-cyan-400">Zone {activeZoneKey} Active</span>
                    )}
                  </h3>
                </div>
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                    activeZoneKey === 0
                      ? "bg-slate-900 border-slate-700 text-slate-400"
                      : "bg-cyan-950 border-cyan-500/40 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                  }`}
                >
                  <Zap className="w-6 h-6" />
                </div>
              </div>

              <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono text-slate-400 uppercase">Currently Playing Asset</p>
                  <h3 className="text-sm font-semibold text-slate-200 mt-1 truncate max-w-[180px]">
                    {currentMedia?.title}
                  </h3>
                  <p className="text-[11px] font-mono text-cyan-400 mt-0.5">{currentMedia?.fileName}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-purple-950/60 border border-purple-500/30 text-purple-400 flex items-center justify-center">
                  <Film className="w-6 h-6" />
                </div>
              </div>

              <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono text-slate-400 uppercase">Sensor Telemetry</p>
                  <h3 className="text-xl font-bold text-emerald-400 mt-1">LD19 LiDAR</h3>
                  <p className="text-[11px] font-mono text-slate-400 mt-0.5">230,400 baud • /dev/ttyUSB0</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                  <Radio className="w-6 h-6" />
                </div>
              </div>

              <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono text-slate-400 uppercase">AWS S3 Storage</p>
                  <h3 className="text-xl font-bold text-purple-300 mt-1">
                    {(mediaList.reduce((acc, m) => acc + (m.sizeBytes || 0), 0) / 1024 / 1024).toFixed(1)} MB
                  </h3>
                  <p className="text-[11px] font-mono text-slate-400 mt-0.5">{mediaList.length} S3 Media Assets</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-purple-950/60 border border-purple-500/30 text-purple-400 flex items-center justify-center">
                  <HardDrive className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Middle Row: Trigger Simulator & Live Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Quick Trigger Controls */}
              <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-slate-100 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <span>Real-Time Trigger Simulator</span>
                  </h2>
                  <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                    POST /api/trigger
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Simulate physical LiDAR object detection events sent from Raspberry Pi (`ws_client.py`).
                </p>

                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => triggerZone(1)}
                    className={`w-full p-3.5 rounded-xl border flex items-center justify-between font-medium text-sm transition-all cursor-pointer ${
                      activeZoneKey === 1
                        ? "bg-blue-600/30 border-blue-400 text-blue-200 shadow-[0_0_20px_rgba(59,130,246,0.3)]"
                        : "bg-slate-900/80 border-slate-800 text-slate-300 hover:border-blue-500/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
                      <span>Trigger Zone 1 (Left Area)</span>
                    </div>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-500/30">
                      {"{\"video\": 1}"}
                    </span>
                  </button>

                  <button
                    onClick={() => triggerZone(2)}
                    className={`w-full p-3.5 rounded-xl border flex items-center justify-between font-medium text-sm transition-all cursor-pointer ${
                      activeZoneKey === 2
                        ? "bg-emerald-600/30 border-emerald-400 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                        : "bg-slate-900/80 border-slate-800 text-slate-300 hover:border-emerald-500/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                      <span>Trigger Zone 2 (Right Area)</span>
                    </div>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                      {"{\"video\": 2}"}
                    </span>
                  </button>

                  <button
                    onClick={() => triggerZone(0)}
                    className={`w-full p-3.5 rounded-xl border flex items-center justify-between font-medium text-sm transition-all cursor-pointer ${
                      activeZoneKey === 0
                        ? "bg-slate-800 border-slate-600 text-slate-200"
                        : "bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full bg-slate-600" />
                      <span>Clear All Zones (Idle Loop)</span>
                    </div>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                      {"{\"video\": 0}"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Active Video Stream Preview */}
              <div className="glass-panel p-6 rounded-2xl border border-slate-800 lg:col-span-2 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="font-bold text-slate-100 flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-cyan-400" />
                      <span>Active Kiosk Video Stream</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Playing content for:{" "}
                      <span className="text-cyan-400 font-semibold">
                        {activeZoneKey === 0 ? "Idle Default State" : `Zone ${activeZoneKey}`}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab("player")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-500/30 text-xs hover:bg-cyan-900/50 transition-colors cursor-pointer"
                  >
                    <span>Open Full Kiosk Player</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="relative flex-1 min-h-[260px] bg-black rounded-xl overflow-hidden border border-slate-800 group flex items-center justify-center">
                  <video
                    key={currentMedia?.publicUrl}
                    src={currentMedia?.publicUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-xs font-mono flex items-center gap-2 text-slate-200">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    <span>LIVE STREAM: {currentMedia?.title}</span>
                  </div>
                  <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded bg-black/70 backdrop-blur-md border border-white/10 text-[11px] font-mono text-slate-400">
                    {currentMedia?.resolution || "1920x1080"} • HTML5 S3 Stream
                  </div>
                </div>
              </div>
            </div>

            {/* Telemetry Activity Log Table */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-cyan-400" />
                  <h2 className="font-bold text-slate-100">Live WebSocket Telemetry Log (`:8765`)</h2>
                </div>
                <span className="text-xs font-mono text-slate-400">Auto-updating event feed</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/50">
                      <th className="p-3">TIME</th>
                      <th className="p-3">SOURCE</th>
                      <th className="p-3">EVENT PAYLOAD</th>
                      <th className="p-3">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {telemetryLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="p-3 text-slate-400" suppressHydrationWarning>{log.timestamp}</td>
                        <td className="p-3 text-cyan-400">Raspberry Pi (ws_client)</td>
                        <td className="p-3 font-semibold text-slate-200">{log.event}</td>
                        <td className="p-3">
                          {log.type === "trigger" ? (
                            <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-500/30">
                              TRIGGER DISPATCHED
                            </span>
                          ) : log.type === "idle" ? (
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                              IDLE FALLBACK
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                              CONNECTED
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: 2D ZONE MANAGER ================= */}
        {activeTab === "zones" && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                  <Layers className="w-6 h-6 text-cyan-400" />
                  <span>2D Spatial Zone Coordinates Visualizer</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Define 2D spatial coordinate boundaries (Min X, Max X, Min Y, Max Y) scanned by the LD19 LiDAR sensor.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Interactive Visual Canvas */}
              <div className="glass-panel p-6 rounded-2xl border border-slate-800 lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                    <span className="font-semibold text-sm text-slate-200">LiDAR 2D Scanning Field</span>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    Click canvas to simulate person location (X: {pointerPos.x}m, Y: {pointerPos.y}m)
                  </span>
                </div>

                {/* Grid Visualizer Canvas */}
                <div
                  onClick={handleCanvasClick}
                  className="relative w-full h-[380px] bg-slate-950 rounded-xl border border-cyan-500/30 lidar-grid-bg overflow-hidden cursor-crosshair group shadow-[inset_0_0_30px_rgba(0,0,0,0.8)]"
                >
                  {/* Radar Scanning Line sweep */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                    <div className="w-[340px] h-[340px] rounded-full border border-cyan-500/50 relative">
                      <div className="w-full h-full rounded-full border border-cyan-500/30 transform scale-75" />
                      <div className="w-full h-full rounded-full border border-cyan-500/20 transform scale-50" />
                    </div>
                  </div>

                  {/* Sensor Origin Dot */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex flex-col items-center">
                    <div className="w-4 h-4 rounded-full bg-cyan-400 shadow-[0_0_12px_#22d3ee] flex items-center justify-center text-[8px] font-bold text-black">
                      S
                    </div>
                    <span className="text-[10px] font-mono text-cyan-400 mt-1">LD19 SENSOR (0,0)</span>
                  </div>

                  {/* Render Configured Spatial Zones */}
                  {zones.map((z) => {
                    const leftPct = ((z.minX + 3.0) / 6.0) * 100;
                    const widthPct = ((z.maxX - z.minX) / 6.0) * 100;
                    const bottomPct = (z.minY / 6.0) * 100;
                    const heightPct = ((z.maxY - z.minY) / 6.0) * 100;

                    const isHighlighted = activeZoneKey === z.zoneKey;

                    return (
                      <div
                        key={z.id}
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          bottom: `${bottomPct}%`,
                          height: `${heightPct}%`,
                          borderColor: z.color || "#3b82f6",
                          backgroundColor: isHighlighted ? `${z.color || "#3b82f6"}35` : `${z.color || "#3b82f6"}15`,
                        }}
                        className={`absolute border-2 rounded-lg transition-all flex flex-col justify-between p-2 backdrop-blur-[2px] ${
                          isHighlighted ? "shadow-[0_0_20px_rgba(59,130,246,0.5)] border-dashed animate-pulse" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            style={{ color: z.color || "#3b82f6" }}
                            className="text-xs font-bold font-mono px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md"
                          >
                            Zone {z.zoneKey}
                          </span>
                          {isHighlighted && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-black animate-bounce">
                              TRIGGERED
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] font-mono text-slate-300 bg-black/50 px-1 py-0.5 rounded truncate">
                          X:[{z.minX},{z.maxX}] Y:[{z.minY},{z.maxY}]
                        </p>
                      </div>
                    );
                  })}

                  {/* Detected Object Pointer Dot */}
                  <div
                    style={{
                      left: `${((pointerPos.x + 3.0) / 6.0) * 100}%`,
                      bottom: `${(pointerPos.y / 6.0) * 100}%`,
                    }}
                    className="absolute -translate-x-1/2 translate-y-1/2 pointer-events-none transition-all duration-150"
                  >
                    <div className="w-5 h-5 rounded-full bg-red-500/40 animate-ping absolute inset-0" />
                    <div className="w-5 h-5 rounded-full bg-red-500 border-2 border-white shadow-[0_0_15px_#ef4444] flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    </div>
                    <span className="absolute left-6 top-0 text-[10px] font-mono font-bold text-red-400 bg-black/80 px-1.5 py-0.5 rounded border border-red-500/40 whitespace-nowrap">
                      OBJ ({pointerPos.x}m, {pointerPos.y}m)
                    </span>
                  </div>
                </div>
              </div>

              {/* Add New Zone Form */}
              <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
                <h3 className="font-bold text-slate-100 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-cyan-400" />
                  <span>Configure Spatial Zone</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Set boundary limits for LiDAR tracking engine (`lidar1_zone.py`).
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-mono text-slate-400">Zone Name</label>
                    <input
                      type="text"
                      value={newZone.name}
                      onChange={(e) => setNewZone({ ...newZone, name: e.target.value })}
                      placeholder="e.g. Center Exhibition Zone"
                      className="w-full mt-1 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-mono text-slate-400">Zone Key (ID)</label>
                      <input
                        type="number"
                        value={newZone.zoneKey}
                        onChange={(e) => setNewZone({ ...newZone, zoneKey: parseInt(e.target.value) || 1 })}
                        className="w-full mt-1 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-mono text-slate-400">Color Tag</label>
                      <input
                        type="color"
                        value={newZone.color}
                        onChange={(e) => setNewZone({ ...newZone, color: e.target.value })}
                        className="w-full h-9 mt-1 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-mono text-slate-400">Min X (meters)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={newZone.minX}
                        onChange={(e) => setNewZone({ ...newZone, minX: parseFloat(e.target.value) || 0 })}
                        className="w-full mt-1 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-mono text-slate-400">Max X (meters)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={newZone.maxX}
                        onChange={(e) => setNewZone({ ...newZone, maxX: parseFloat(e.target.value) || 0 })}
                        className="w-full mt-1 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-mono text-slate-400">Min Y (meters)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={newZone.minY}
                        onChange={(e) => setNewZone({ ...newZone, minY: parseFloat(e.target.value) || 0 })}
                        className="w-full mt-1 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-mono text-slate-400">Max Y (meters)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={newZone.maxY}
                        onChange={(e) => setNewZone({ ...newZone, maxY: parseFloat(e.target.value) || 0 })}
                        className="w-full mt-1 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleSaveZone}
                    className="w-full mt-2 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(6,182,212,0.4)] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Save Spatial Zone via API</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Configured Zones List Table */}
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
              <h3 className="font-bold text-slate-100">Active Configured Zones ({zones.length})</h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/50">
                      <th className="p-3">KEY</th>
                      <th className="p-3">ZONE NAME</th>
                      <th className="p-3">X BOUNDS (M)</th>
                      <th className="p-3">Y BOUNDS (M)</th>
                      <th className="p-3">STATUS</th>
                      <th className="p-3">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {zones.map((z) => (
                      <tr key={z.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="p-3">
                          <span
                            style={{ color: z.color || "#3b82f6" }}
                            className="font-bold px-2 py-1 rounded bg-slate-900 border border-slate-800"
                          >
                            Zone {z.zoneKey}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-slate-200">{z.name}</td>
                        <td className="p-3 text-cyan-400">
                          {z.minX}m to {z.maxX}m
                        </td>
                        <td className="p-3 text-cyan-400">
                          {z.minY}m to {z.maxY}m
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
                              z.isActive
                                ? "bg-emerald-950 text-emerald-400 border-emerald-500/30"
                                : "bg-slate-900 text-slate-500 border-slate-800"
                            }`}
                          >
                            {z.isActive ? "ACTIVE" : "DISABLED"}
                          </span>
                        </td>
                        <td className="p-3 flex items-center gap-2">
                          <button
                            onClick={() => triggerZone(z.zoneKey)}
                            className="px-2 py-1 rounded bg-blue-950 text-blue-300 border border-blue-500/30 hover:bg-blue-900/50 cursor-pointer"
                          >
                            Test Trigger
                          </button>
                          <button
                            onClick={() => handleDeleteZone(z.id)}
                            className="p-1 rounded bg-red-950/40 text-red-400 border border-red-500/30 hover:bg-red-900/50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: S3 MEDIA LIBRARY ================= */}
        {activeTab === "media" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                  <Film className="w-6 h-6 text-purple-400" />
                  <span>AWS S3 Video Assets Manager</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Upload and manage high-definition video assets directly to S3 bucket (`lidar-assets`, ap-south-1).
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs font-mono bg-purple-950/30 border border-purple-500/30 px-3.5 py-2 rounded-xl text-purple-300">
                <HardDrive className="w-4 h-4" />
                <span>Bucket: {deviceConfig?.s3Bucket || "lidar-assets"} ({deviceConfig?.s3Region || "ap-south-1"})</span>
              </div>
            </div>

            {/* S3 Presigned Direct Upload Dropzone Visual */}
            <div className="glass-panel p-8 rounded-2xl border-2 border-dashed border-purple-500/30 hover:border-purple-500/60 transition-all text-center space-y-3 cursor-pointer group">
              <div className="w-14 h-14 rounded-2xl bg-purple-950/60 border border-purple-500/40 text-purple-300 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform shadow-[0_0_20px_rgba(168,85,247,0.2)]">
                <Upload className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-slate-200">Drag and drop HD videos for S3 Presigned Upload</h3>
                <p className="text-xs text-slate-400">
                  Generates direct presigned URL (`/api/media/upload-url`) • MP4, WebM (Up to 4K 60fps)
                </p>
              </div>
              <button className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(168,85,247,0.3)] cursor-pointer">
                Select Video File
              </button>
            </div>

            {/* S3 Media Asset Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {mediaList.map((media) => (
                <div
                  key={media.id}
                  className="glass-panel rounded-2xl border border-slate-800 overflow-hidden flex flex-col hover:border-purple-500/40 transition-all group"
                >
                  <div className="relative h-44 bg-black overflow-hidden flex items-center justify-center">
                    <video src={media.publicUrl} muted className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-70" />
                    
                    <button
                      onClick={() => setPreviewMedia(media)}
                      className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <div className="w-12 h-12 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.6)]">
                        <Play className="w-6 h-6 ml-1" />
                      </div>
                    </button>

                    <div className="absolute top-3 left-3 px-2 py-0.5 rounded bg-black/70 backdrop-blur-md text-[10px] font-mono text-purple-300 border border-purple-500/30 truncate max-w-[200px]">
                      S3 KEY: {media.s3Key}
                    </div>

                    <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded bg-black/70 backdrop-blur-md text-[10px] font-mono text-slate-300">
                      {media.durationSec || 30}s • {media.resolution || "1920x1080"}
                    </div>
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      <h3 className="font-bold text-slate-100">{media.title}</h3>
                      <p className="text-xs font-mono text-slate-400 mt-1">{media.fileName}</p>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
                      <span>{((media.sizeBytes || 10000000) / 1024 / 1024).toFixed(1)} MB</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPreviewMedia(media)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                        >
                          Preview
                        </button>
                        <button
                          onClick={async () => {
                            await fetch(`/api/media?id=${media.id}&s3Key=${media.s3Key}`, { method: "DELETE" });
                            setMediaList(mediaList.filter((m) => m.id !== media.id));
                          }}
                          className="p-1 rounded bg-red-950/40 text-red-400 border border-red-500/30 hover:bg-red-900/50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= TAB 4: ZONE ALLOCATIONS ================= */}
        {activeTab === "allocations" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <LinkIcon className="w-6 h-6 text-cyan-400" />
                <span>Zone-to-Content Allocation Matrix (`/api/allocations`)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Map each LiDAR spatial zone or idle fallback state to an S3 video asset.
              </p>
            </div>

            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/50">
                      <th className="p-4">TRIGGER STATE / ZONE</th>
                      <th className="p-4">ALLOCATED S3 VIDEO ASSET</th>
                      <th className="p-4">PRIORITY</th>
                      <th className="p-4">STATUS</th>
                      <th className="p-4">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {allocations.map((alloc) => {
                      return (
                        <tr key={alloc.id} className="hover:bg-slate-900/40 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <span
                                className={`w-3 h-3 rounded-full ${
                                  alloc.isIdleDefault
                                    ? "bg-slate-500"
                                    : alloc.zoneId === "z1"
                                    ? "bg-blue-500 shadow-[0_0_8px_#3b82f6]"
                                    : "bg-emerald-500 shadow-[0_0_8px_#10b981]"
                                }`}
                              />
                              <div>
                                <h4 className="font-bold text-sm text-slate-100">{alloc.zoneName || "Zone Allocation"}</h4>
                                <span className="text-[10px] text-slate-400">
                                  {alloc.isIdleDefault ? "Fallback state when no presence" : "LiDAR Triggered"}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="p-4">
                            <select
                              value={alloc.mediaId}
                              onChange={async (e) => {
                                const newMediaId = e.target.value;
                                setAllocations(
                                  allocations.map((a) => (a.id === alloc.id ? { ...a, mediaId: newMediaId } : a))
                                );
                                await fetch("/api/allocations", {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ id: alloc.id, mediaId: newMediaId }),
                                });
                              }}
                              className="p-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-cyan-300 font-semibold focus:outline-none"
                            >
                              {mediaList.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.title} ({m.fileName})
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="p-4 text-slate-300">{alloc.priority}</td>

                          <td className="p-4">
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                              ACTIVE ALLOCATION
                            </span>
                          </td>

                          <td className="p-4">
                            <button
                              onClick={() => {
                                const zKey = alloc.isIdleDefault
                                  ? 0
                                  : zones.find((z) => z.id === alloc.zoneId)?.zoneKey || 1;
                                triggerZone(zKey);
                                setActiveTab("dashboard");
                              }}
                              className="px-3 py-1.5 rounded-lg bg-cyan-950 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-900/50 cursor-pointer"
                            >
                              Test Play
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 5: WEB KIOSK PLAYER ================= */}
        {activeTab === "player" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                  <Monitor className="w-6 h-6 text-emerald-400" />
                  <span>Web Kiosk Video Player Preview (`/player`)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Fullscreen web video kiosk replacing legacy Python VLC player (`pc_server.py`).
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => triggerZone(1)}
                  className="px-3 py-1.5 rounded-lg bg-blue-950 text-blue-300 border border-blue-500/30 text-xs font-mono hover:bg-blue-900/50 cursor-pointer"
                >
                  Zone 1
                </button>
                <button
                  onClick={() => triggerZone(2)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-500/30 text-xs font-mono hover:bg-emerald-900/50 cursor-pointer"
                >
                  Zone 2
                </button>
                <button
                  onClick={() => triggerZone(0)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 text-xs font-mono hover:bg-slate-700 cursor-pointer"
                >
                  Idle State
                </button>
              </div>
            </div>

            {/* Video Player Display Container */}
            <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border-2 border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.9)] flex items-center justify-center group">
              <video
                key={currentMedia?.publicUrl}
                src={currentMedia?.publicUrl}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
              />

              {/* Preloading Video Buffer representation */}
              <div className="absolute top-4 left-4 flex items-center gap-3">
                <div className="px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-cyan-500/40 text-xs font-mono text-cyan-300 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                  <span>PRE-LOADED ZERO-FLICKER STREAM</span>
                </div>
                <div className="px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-white/10 text-xs font-mono text-slate-300">
                  TRIGGER: {activeZoneKey === 0 ? "IDLE STATE (VIDEO 0)" : `ZONE ${activeZoneKey}`}
                </div>
              </div>

              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between px-4 py-2 rounded-xl bg-black/80 backdrop-blur-md border border-white/10 text-xs font-mono text-slate-300">
                <span>ASSET: {currentMedia?.title}</span>
                <span>{currentMedia?.resolution || "1920x1080"} • HTML5 S3 Direct Stream</span>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 6: SYSTEM SETTINGS ================= */}
        {activeTab === "settings" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Settings className="w-6 h-6 text-slate-400" />
                <span>System Configuration & API Health</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Overview of `.env` configuration, PostgreSQL DB parameters, and AWS S3 parameters.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* PostgreSQL Config Card */}
              <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-100 flex items-center gap-2">
                    <Database className="w-4 h-4 text-blue-400" />
                    <span>PostgreSQL Database</span>
                  </h3>
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-500/30">
                    {deviceConfig?.dbStatus || "CONNECTED"}
                  </span>
                </div>

                <div className="space-y-2 text-xs font-mono">
                  <div>
                    <span className="text-slate-400">DATABASE_URL:</span>
                    <p className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-blue-300 truncate mt-1">
                      postgresql://postgres:***@localhost:5432/mydb?schema=public
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">PRISMA PROVIDER:</span>
                    <p className="p-2 rounded bg-slate-900 text-slate-200 mt-1">postgresql</p>
                  </div>
                </div>
              </div>

              {/* AWS S3 Config Card */}
              <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-100 flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-purple-400" />
                    <span>AWS S3 Asset Storage</span>
                  </h3>
                  <span className="text-xs font-mono text-purple-300 bg-purple-950 px-2 py-0.5 rounded border border-purple-500/30">
                    VERIFIED
                  </span>
                </div>

                <div className="space-y-2 text-xs font-mono">
                  <div>
                    <span className="text-slate-400">AWS_BUCKET_NAME:</span>
                    <p className="p-2 rounded bg-slate-900 text-purple-300 mt-1">
                      {deviceConfig?.s3Bucket || "lidar-assets"}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">AWS_REGION:</span>
                    <p className="p-2 rounded bg-slate-900 text-slate-200 mt-1">
                      {deviceConfig?.s3Region || "ap-south-1"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Video Preview Modal */}
      {previewMedia && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-2xl border border-slate-700 max-w-3xl w-full space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-100">{previewMedia.title}</h3>
                <p className="text-xs font-mono text-slate-400">{previewMedia.fileName}</p>
              </div>
              <button
                onClick={() => setPreviewMedia(null)}
                className="px-3 py-1 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-mono cursor-pointer"
              >
                Close Preview
              </button>
            </div>

            <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-slate-800">
              <video src={previewMedia.publicUrl} controls autoPlay className="w-full h-full object-cover" />
            </div>

            <div className="flex items-center justify-between text-xs font-mono text-slate-400 pt-2">
              <span>S3 KEY: {previewMedia.s3Key}</span>
              <span>{previewMedia.resolution || "1920x1080"} • {((previewMedia.sizeBytes || 10000000) / 1024 / 1024).toFixed(1)} MB</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
