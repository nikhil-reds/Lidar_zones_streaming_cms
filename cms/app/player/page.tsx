"use client";

import React, { useState, useEffect } from "react";
import { Radio, Zap, Monitor, ArrowLeft, Volume2, VolumeX, Maximize } from "lucide-react";
import Link from "next/link";

const MEDIA_STREAMS = {
  0: {
    title: "Idle Ambient Loop",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    zone: "IDLE (NO PRESENCE)",
  },
  1: {
    title: "Exhibit 1 - Interactive LiDAR Showcase",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    zone: "ZONE 1 (LEFT AREA)",
  },
  2: {
    title: "Exhibit 2 - Deep Sea LiDAR Mapping",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    zone: "ZONE 2 (RIGHT AREA)",
  },
};

export default function StandaloneKioskPlayer() {
  const [activeZone, setActiveZone] = useState<0 | 1 | 2>(0);
  const [isMuted, setIsMuted] = useState(true);
  const [showControls, setShowControls] = useState(true);

  const currentStream = MEDIA_STREAMS[activeZone];

  // Auto hide simulator bar after 5s unless hovered
  useEffect(() => {
    const timer = setTimeout(() => setShowControls(false), 5000);
    return () => clearTimeout(timer);
  }, [showControls]);

  return (
    <div
      onMouseMove={() => setShowControls(true)}
      className="relative w-screen h-screen bg-black overflow-hidden select-none flex items-center justify-center cursor-none"
    >
      {/* Primary HTML5 Video Element */}
      <video
        key={currentStream.url}
        src={currentStream.url}
        autoPlay
        loop
        muted={isMuted}
        playsInline
        className="w-full h-full object-cover"
      />

      {/* Top Floating Telemetry Overlay (Web Kiosk Display Overlay) */}
      <div
        className={`absolute top-6 left-6 right-6 flex items-center justify-between transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/80 backdrop-blur-md border border-white/20 text-xs font-mono text-slate-200 hover:border-cyan-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>CMS DASHBOARD</span>
          </Link>

          <div className="px-3.5 py-1.5 rounded-xl bg-black/80 backdrop-blur-md border border-cyan-500/40 text-xs font-mono text-cyan-400 flex items-center gap-2">
            <Radio className="w-4 h-4 animate-pulse" />
            <span>KIOSK DISPLAY READY • WS :8765</span>
          </div>
        </div>

        <div className="px-4 py-1.5 rounded-xl bg-black/80 backdrop-blur-md border border-white/20 text-xs font-mono text-slate-200 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>CURRENT STREAM: {currentStream.zone}</span>
        </div>
      </div>

      {/* Bottom Simulation Control Bar for Kiosk Demonstration */}
      <div
        className={`absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 p-3 rounded-2xl bg-black/85 backdrop-blur-xl border border-cyan-500/30 shadow-[0_0_30px_rgba(0,0,0,0.9)] transition-all duration-300 ${
          showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-2 px-3 py-1 border-r border-slate-800 text-xs font-mono text-slate-400">
          <Zap className="w-4 h-4 text-cyan-400" />
          <span>TRIGGER SIMULATOR:</span>
        </div>

        <button
          onClick={() => setActiveZone(1)}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all border cursor-pointer ${
            activeZone === 1
              ? "bg-blue-600 border-blue-400 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]"
              : "bg-slate-900 border-slate-800 text-slate-300 hover:border-blue-500/40"
          }`}
        >
          Zone 1 Trigger
        </button>

        <button
          onClick={() => setActiveZone(2)}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all border cursor-pointer ${
            activeZone === 2
              ? "bg-emerald-600 border-emerald-400 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)]"
              : "bg-slate-900 border-slate-800 text-slate-300 hover:border-emerald-500/40"
          }`}
        >
          Zone 2 Trigger
        </button>

        <button
          onClick={() => setActiveZone(0)}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all border cursor-pointer ${
            activeZone === 0
              ? "bg-slate-700 border-slate-500 text-white"
              : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
          }`}
        >
          Return to Idle
        </button>

        <button
          onClick={() => setIsMuted(!isMuted)}
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white cursor-pointer"
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
        </button>
      </div>
    </div>
  );
}
