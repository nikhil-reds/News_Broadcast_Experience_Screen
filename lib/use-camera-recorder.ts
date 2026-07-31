"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { cameraRecordingFilename, type CameraId } from "@/lib/camera-recordings";

export interface SavedRecording {
  filename: string;
  url: string;
  size: number;
  createdAt: string;
}

export interface CameraRecorder {
  cameraId: CameraId;
  videoRef: RefObject<HTMLVideoElement | null>;
  activeDeviceId: string | null;
  isCameraActive: boolean;
  isRecording: boolean;
  recordingTime: number;
  isSaving: boolean;
  error: string | null;
  lastSaved: SavedRecording | null;
  saved: SavedRecording[];
  setError: (message: string | null) => void;
  /** Opens the camera; resolves to the deviceId actually in use, or null on failure. */
  startCamera: (deviceId?: string) => Promise<string | null>;
  stopCamera: () => void;
  startRecording: () => void;
  endRecording: () => void;
  fetchSaved: () => Promise<void>;
  isRecorderRunning: () => boolean;
}

/**
 * One camera end to end: live preview, MediaRecorder, upload, and the take list
 * for that camera. Every camera gets its own instance so the two run
 * independently — separate streams, separate recorders, separate uploads.
 */
export function useCameraRecorder(
  cameraId: CameraId,
  { captureAudio = false }: { captureAudio?: boolean } = {}
): CameraRecorder {
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<SavedRecording | null>(null);
  const [saved, setSaved] = useState<SavedRecording[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSaved = useCallback(async () => {
    try {
      const res = await fetch(`/api/save-recording?camera=${cameraId}`);
      if (res.ok) {
        const data = await res.json();
        setSaved(data.recordings || []);
      }
    } catch (err) {
      console.error(`Failed to fetch camera ${cameraId} recordings:`, err);
    }
  }, [cameraId]);

  const saveToServer = useCallback(
    async (blob: Blob) => {
      setIsSaving(true);
      try {
        const extension = blob.type.includes("webm") ? "webm" : "mp4";
        const filename = cameraRecordingFilename(cameraId, extension);

        const formData = new FormData();
        formData.append("video", blob, filename);
        // The route names the file itself unless this field is present, and the
        // filename prefix is what sends the take to the right screen.
        formData.append("filename", filename);

        const res = await fetch("/api/save-recording", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (res.ok && data.success) {
          setLastSaved({
            filename: data.filename,
            url: data.filePath,
            size: data.size || blob.size,
            createdAt: data.createdAt || new Date().toISOString(),
          });
          fetchSaved();
        } else {
          setError(data.error || "Failed to save video.");
        }
      } catch (err: any) {
        setError("Video save error: " + err.message);
      } finally {
        setIsSaving(false);
      }
    },
    [cameraId, fetchSaved]
  );

  const startCamera = useCallback(
    async (deviceId?: string) => {
      setError(null);
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              // Pinning the deviceId is what keeps the two cameras off each
              // other's hardware; without it both would open the default device.
              ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            },
            audio: captureAudio,
          });
        } catch (audioErr: any) {
          // If audio capture was requested but failed (e.g. mic busy or blocked),
          // fallback to video-only so camera 1 feed still works.
          if (captureAudio) {
            console.warn("Camera audio capture failed, falling back to video-only:", audioErr);
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
              },
              audio: false,
            });
          } else {
            throw audioErr;
          }
        }

        // Release the previous device only once the new one is open, so a failed
        // switch leaves the operator with the feed they already had.
        const previous = streamRef.current;
        streamRef.current = stream;
        previous?.getTracks().forEach((track) => track.stop());

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setIsCameraActive(true);

        const settledDeviceId =
          stream.getVideoTracks()[0]?.getSettings().deviceId ?? deviceId ?? null;
        setActiveDeviceId(settledDeviceId);
        return settledDeviceId;
      } catch (err: any) {
        setError("Camera access failed: " + err.message);
        setIsCameraActive(false);
        return null;
      }
    },
    [captureAudio]
  );

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setActiveDeviceId(null);
    setIsCameraActive(false);
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) {
      setError("Camera stream is not active.");
      return;
    }

    chunksRef.current = [];
    setRecordingTime(0);
    setError(null);
    setLastSaved(null);

    try {
      let options: MediaRecorderOptions = {};
      if (MediaRecorder.isTypeSupported("video/mp4;codecs=avc1")) {
        options = { mimeType: "video/mp4;codecs=avc1" };
      } else if (MediaRecorder.isTypeSupported("video/mp4")) {
        options = { mimeType: "video/mp4" };
      } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
        options = { mimeType: "video/webm;codecs=vp9" };
      } else if (MediaRecorder.isTypeSupported("video/webm")) {
        options = { mimeType: "video/webm" };
      }

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(streamRef.current, options);
      } catch (mimeErr) {
        console.warn("MediaRecorder with explicit options failed, falling back to default:", mimeErr);
        recorder = new MediaRecorder(streamRef.current);
      }

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "video/mp4",
        });
        await saveToServer(blob);
      };

      recorder.start(1000);
      recorderRef.current = recorder;
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      setError("Video recording failed: " + err.message);
    }
  }, [saveToServer]);

  const endRecording = useCallback(() => {
    // Gate on the recorder itself rather than React state: the hardware panel can
    // fire this from a subscription that never re-renders.
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, []);

  const isRecorderRunning = useCallback(
    () => recorderRef.current?.state === "recording",
    []
  );

  // Never leave the capture light on after the page goes away.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  return {
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
    setError,
    startCamera,
    stopCamera,
    startRecording,
    endRecording,
    fetchSaved,
    isRecorderRunning,
  };
}
