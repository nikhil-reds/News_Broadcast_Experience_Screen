"use client";

import React, { useState, useEffect } from "react";

interface NexmosphereFrame {
  raw: string;
  address: string;
  command: string;
  value: string;
  at: string;
}

interface NexmosphereStatus {
  connected: boolean;
  path: string;
  baudRate: number;
  lastError: string | null;
  lastEventAt: string | null;
  lastEventRaw: string | null;
  subscribers: number;
}

export default function SensorPage() {
  const [nexStatus, setNexStatus] = useState<NexmosphereStatus | null>(null);
  const [eventsList, setEventsList] = useState<NexmosphereFrame[]>([]);
  const [customFrame, setCustomFrame] = useState("");
  const [simulating, setSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  // Keep track of button states locally based on recent frames
  const [button1Pressed, setButton1Pressed] = useState(false);
  const [button2Pressed, setButton2Pressed] = useState(false);

  useEffect(() => {
    const source = new EventSource("/api/nexmosphere/events");

    source.addEventListener("status", (e) => {
      try {
        setNexStatus(JSON.parse((e as MessageEvent).data));
      } catch (err) {
        console.error("Bad status payload:", err);
      }
    });

    source.addEventListener("frame", (e) => {
      try {
        const frame: NexmosphereFrame = JSON.parse((e as MessageEvent).data);
        setEventsList((prev) => [frame, ...prev.slice(0, 19)]);
        
        // Update local status fields
        setNexStatus((prev) =>
          prev
            ? {
                ...prev,
                connected: true,
                lastEventAt: frame.at,
                lastEventRaw: frame.raw,
              }
            : null
        );

        // Flash button indicators on trigger frames
        if (frame.raw === "X001A[17]") {
          setButton1Pressed(true);
          setTimeout(() => setButton1Pressed(false), 800);
        } else if (frame.raw === "X001A[3]") {
          setButton2Pressed(true);
          setTimeout(() => setButton2Pressed(false), 800);
        }
      } catch (err) {
        console.error("Bad frame payload:", err);
      }
    });

    source.onerror = () => {
      setNexStatus((prev) => (prev ? { ...prev, connected: false } : null));
    };

    return () => source.close();
  }, []);

  const simulateFrame = async (rawFrame: string) => {
    setSimulating(true);
    setSimError(null);
    try {
      const res = await fetch("/api/nexmosphere/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: rawFrame }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSimError(data.error || "Simulation failed");
      }
    } catch (err: any) {
      setSimError(err.message);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Page Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-amber-500 flex items-center justify-center shadow-lg shadow-cyan-950">
            📡
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Hardware Telemetry & Sensor Control
            </h1>
            <p className="text-xs text-slate-400">
              Monitor serial port telemetry and active Nexmosphere sensor nodes
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              nexStatus?.connected ? "bg-cyan-400 animate-pulse" : "bg-rose-500"
            }`}
          />
          <span className="text-xs font-mono font-medium">
            Controller: {nexStatus?.connected ? "CONNECTED" : "OFFLINE"}
          </span>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Connection & Controller Status */}
        <div className="space-y-6 lg:col-span-1">
          <section className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80 backdrop-blur-md shadow-2xl space-y-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-3">
              Serial Controller Telemetry
            </h2>

            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Port Path</span>
                <span className="font-mono text-slate-200">{nexStatus?.path || "COM3"}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Baud Rate</span>
                <span className="font-mono text-slate-200">{nexStatus?.baudRate || "115200"} bps</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Active Subscribers</span>
                <span className="font-mono text-cyan-400 font-bold">{nexStatus?.subscribers ?? 0}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Last Error</span>
                <span className={`font-mono text-xs ${nexStatus?.lastError ? "text-rose-400" : "text-slate-500"}`}>
                  {nexStatus?.lastError || "None"}
                </span>
              </div>
            </div>
          </section>

          {/* Controller Event Injector (Simulator) */}
          <section className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80 backdrop-blur-md shadow-2xl space-y-6">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                Hardware Simulator
              </h2>
              <p className="text-[11px] text-slate-500 mt-1">
                Simulate serial interface X-talk commands during dev or testing.
              </p>
            </div>

            {simError && (
              <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-300 text-xs font-mono">
                Error: {simError}
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={() => simulateFrame("X001A[17]")}
                disabled={simulating}
                className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-semibold text-xs transition shadow-lg shadow-emerald-950 flex items-center justify-center gap-2"
              >
                <span>🔘</span> Simulate Button 1 (Start Recording)
              </button>

              <button
                onClick={() => simulateFrame("X001A[3]")}
                disabled={simulating}
                className="w-full py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 font-semibold text-xs transition shadow-lg shadow-rose-950 flex items-center justify-center gap-2"
              >
                <span>🔘</span> Simulate Button 2 (Stop Recording)
              </button>
            </div>

            <div className="relative flex items-center pt-2">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-3 text-[10px] text-slate-500 uppercase tracking-widest font-mono">
                Raw Input
              </span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (customFrame.trim()) simulateFrame(customFrame.trim());
              }}
              className="space-y-3"
            >
              <input
                type="text"
                placeholder="e.g. X002A[1]"
                value={customFrame}
                onChange={(e) => setCustomFrame(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
              />
              <button
                type="submit"
                disabled={simulating || !customFrame.trim()}
                className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition disabled:opacity-50"
              >
                Send Raw Frame
              </button>
            </form>
          </section>
        </div>

        {/* Center/Right Columns: Active Sensor Status & Live Logs */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Active Sensor Nodes Grid */}
          <section className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80 backdrop-blur-md shadow-2xl space-y-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-3">
              Active Sensor Nodes
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Sensor Node 01: Buttons */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🔘</span>
                    <div>
                      <h3 className="text-xs font-bold text-slate-200">Address 001: Buttons</h3>
                      <p className="text-[10px] text-slate-500 font-mono">X-talk Interface</p>
                    </div>
                  </div>
                  <span className="text-[9px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded">
                    ACTIVE
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className={`p-3 rounded-lg border transition ${
                    button1Pressed ? "bg-emerald-500/10 border-emerald-500/50" : "bg-slate-900/40 border-slate-800/50"
                  }`}>
                    <p className="text-[10px] text-slate-400">Button 1 (Arm)</p>
                    <p className="text-xs font-bold font-mono mt-1 text-slate-200">
                      {button1Pressed ? "PRESSED" : "IDLE"}
                    </p>
                  </div>

                  <div className={`p-3 rounded-lg border transition ${
                    button2Pressed ? "bg-rose-500/10 border-rose-500/50" : "bg-slate-900/40 border-slate-800/50"
                  }`}>
                    <p className="text-[10px] text-slate-400">Button 2 (Stop)</p>
                    <p className="text-xs font-bold font-mono mt-1 text-slate-200">
                      {button2Pressed ? "PRESSED" : "IDLE"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Sensor Node 02: Presence Sensor (Mock / Sim ready) */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🚶</span>
                    <div>
                      <h3 className="text-xs font-bold text-slate-200">Address 002: Presence</h3>
                      <p className="text-[10px] text-slate-500 font-mono">X-eye Motion</p>
                    </div>
                  </div>
                  <span className="text-[9px] font-mono bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded">
                    STANDBY
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800/50">
                  <p className="text-[10px] text-slate-400">Status</p>
                  <p className="text-xs font-bold font-mono mt-1 text-slate-400">
                    NO MOTION DETECTED
                  </p>
                </div>
              </div>

            </div>
          </section>

          {/* Live Controller Event Log */}
          <section className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80 backdrop-blur-md shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                  Live Event Stream
                </h2>
                <p className="text-[11px] text-slate-500 mt-1">
                  Real-time log of raw serial ASCII frames transmitted by the hardware
                </p>
              </div>
              <button
                onClick={() => setEventsList([])}
                className="text-[11px] text-cyan-400 hover:underline font-mono"
              >
                Clear Log
              </button>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs overflow-hidden">
              <div className="grid grid-cols-4 bg-slate-900 p-2.5 border-b border-slate-800 text-slate-400 font-bold">
                <div>Timestamp</div>
                <div>Address</div>
                <div>Command</div>
                <div className="text-right">Raw Frame</div>
              </div>
              
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-900/60 min-h-[150px]">
                {eventsList.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 italic">
                    Waiting for events... (Press simulate buttons above or trigger physical hardware)
                  </div>
                ) : (
                  eventsList.map((evt, idx) => (
                    <div key={idx} className="grid grid-cols-4 p-2.5 hover:bg-slate-900/30 transition text-slate-300">
                      <div className="text-slate-500">
                        {new Date(evt.at).toLocaleTimeString()}
                      </div>
                      <div className="text-cyan-400">{evt.address}</div>
                      <div className="text-amber-400">{evt.command}</div>
                      <div className="text-right text-slate-100 font-bold">{evt.raw}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
