"use client";

import React, { useState } from "react";
import styles from "./studio-controls.module.css";
import { CAMERA_LABEL, CAMERA_SCREEN_PATH } from "@/lib/camera-recordings";
import { formatSize, formatTime } from "@/lib/format";
import type { CameraRecorder } from "@/lib/use-camera-recorder";

interface CameraStudioCardProps {
  studioStyle?: boolean;
  recorder: CameraRecorder;
  /** Every video input on the machine, so an operator can re-point a card. */
  devices: MediaDeviceInfo[];
  onSelectDevice: (deviceId: string) => void;
  showRecordingControls?: boolean;
  showSavedRecordings?: boolean;
}

export default function CameraStudioCard({
  studioStyle = false,
  recorder,
  devices,
  onSelectDevice,
  showRecordingControls = false,
  showSavedRecordings = true,
}: CameraStudioCardProps) {
  const {
    cameraId,
    videoRef,
    activeDeviceId,
    isCameraActive,
    isRecording,
    recordingTime,
    isSaving,
    error,
    lastSaved,
    saved,
  } = recorder;

  const [chosenDevice, setChosenDevice] = useState("");
  const [isEnabling, setIsEnabling] = useState(false);
  const enable = async () => {
    setIsEnabling(true);
    try { await recorder.startCamera(chosenDevice || activeDeviceId || devices[0]?.deviceId); }
    finally { setIsEnabling(false); }
  };

  if (studioStyle) return (
    <section className={styles.card} aria-label={`Camera ${cameraId}`}>
      <div className={styles.cardHeading}>
        <div><h2>Camera {cameraId}</h2><p>Loops on <a href={CAMERA_SCREEN_PATH[cameraId]}>{CAMERA_SCREEN_PATH[cameraId]}</a></p></div>
        <span className={styles.badge}><i className={styles.dot} />{isRecording ? `REC ${formatTime(recordingTime)}` : isCameraActive ? "On" : "Off"}</span>
      </div>
      <div className={styles.cameraPreview}>
        <video ref={videoRef} autoPlay playsInline muted className={isCameraActive ? styles.video : styles.hiddenVideo} />
        {!isCameraActive && <div className={styles.placeholder}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/></svg>
          <span>Camera off</span>
        </div>}
      </div>
      <div className={styles.controls}>
        <select aria-label={`Camera ${cameraId} input`} className={styles.select} value={chosenDevice || activeDeviceId || devices[0]?.deviceId || ""} disabled={isRecording || isEnabling || devices.length === 0}
          onChange={(event) => { setChosenDevice(event.target.value); if (isCameraActive) onSelectDevice(event.target.value); }}>
          {devices.length === 0 && <option value="">Camera 1</option>}
          {devices.map((device, i) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${i + 1}`}</option>)}
        </select>
        <button type="button" className={styles.button} disabled={isRecording || isSaving || isEnabling} onClick={isCameraActive ? recorder.stopCamera : enable}>{isEnabling ? "Starting…" : isCameraActive ? "Turn off" : "Turn on"}</button>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {isSaving && <p className={styles.note} role="status">Saving recording…</p>}
      {lastSaved && <p className={styles.note} role="status">Recording saved · {formatSize(lastSaved.size)}</p>}
    </section>
  );

  return (
    <section className="space-y-6 bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80 backdrop-blur-md shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <span>📹</span> {CAMERA_LABEL[cameraId]} Capture
          </h2>
          <p className="text-xs text-slate-400">
            Loops on{" "}
            <a
              href={CAMERA_SCREEN_PATH[cameraId]}
              className="text-rose-300 hover:underline font-mono"
            >
              {CAMERA_SCREEN_PATH[cameraId]}
            </a>
          </p>
        </div>
        {isRecording && (
          <span className="px-3 py-1 rounded-full bg-rose-950 border border-rose-500/40 text-rose-300 text-xs font-mono font-bold animate-pulse">
            REC {formatTime(recordingTime)}
          </span>
        )}
      </div>

      {error && (
        <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* Camera Canvas */}
      <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 aspect-video flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${
            isCameraActive ? "opacity-100" : "opacity-0"
          }`}
        />

        {!isCameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-4 text-center">
            <p className="text-sm font-medium text-slate-300 mb-2">Camera Feed Inactive</p>
            <button
              onClick={() => recorder.startCamera(activeDeviceId ?? undefined)}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
            >
              Enable Camera
            </button>
          </div>
        )}
      </div>

      {/* Device picker — the auto-assignment can land on the wrong physical unit
          when Windows reorders devices, so let the operator correct it. */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Video Input Device
        </label>
        <select
          value={activeDeviceId ?? ""}
          onChange={(e) => onSelectDevice(e.target.value)}
          disabled={isRecording || devices.length === 0}
          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {devices.length === 0 && <option value="">No video inputs detected</option>}
          {activeDeviceId === null && devices.length > 0 && (
            <option value="">Select a camera…</option>
          )}
          {devices.map((device, i) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Camera ${i + 1}`}
            </option>
          ))}
        </select>
      </div>

      {/* Video Controls */}
      {showRecordingControls && (
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={recorder.startRecording}
            disabled={isRecording || !isCameraActive || isSaving}
            className={`flex-1 py-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition ${
              isRecording || !isCameraActive || isSaving
                ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-800"
                : "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-white" />
            Start Recording
          </button>

          <button
            onClick={recorder.endRecording}
            disabled={!isRecording || isSaving}
            className={`flex-1 py-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition ${
              !isRecording || isSaving
                ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-800"
                : "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
            }`}
          >
            <span className="w-3 h-3 rounded-sm bg-rose-400" />
            End Recording
          </button>
        </div>
      )}

      {isSaving && (
        <p className="text-xs font-mono text-amber-400 animate-pulse text-center">
          Saving video to MinIO...
        </p>
      )}

      {/* Last Saved Video Info */}
      {lastSaved && (
        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-xs space-y-2">
          <div className="flex items-center justify-between text-emerald-400 font-semibold">
            <span>✓ {CAMERA_LABEL[cameraId]} take saved</span>
            <span>{formatSize(lastSaved.size)}</span>
          </div>
          <p className="font-mono text-slate-300 truncate bg-slate-950 p-2 rounded">
            {lastSaved.filename}
          </p>
        </div>
      )}

      {/* Saved Videos List */}
      {showSavedRecordings && <div className="space-y-3 pt-2">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Recent {CAMERA_LABEL[cameraId]} Recordings ({saved.length})
        </h3>
        {saved.length === 0 ? (
          <p className="text-xs text-slate-500 italic">No video files recorded yet.</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {saved.slice(0, 3).map((v) => (
              <div
                key={v.filename}
                className="p-2.5 rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-between text-xs"
              >
                <span className="font-mono text-slate-300 truncate max-w-[200px]">
                  {v.filename}
                </span>
                <a
                  href={v.url}
                  download={v.filename}
                  className="text-rose-400 hover:underline font-mono"
                >
                  Download
                </a>
              </div>
            ))}
          </div>
        )}
      </div>}
    </section>
  );
}
