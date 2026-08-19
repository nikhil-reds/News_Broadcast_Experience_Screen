# Screen 07 Integration Guide - Background Status Poller

## Overview

This guide shows how to update Screen 07 (background selector) to display real-time status of background composition jobs and eliminate the 2-3 minute wait.

---

## Step 1: Import the Status Poller

```typescript
import { 
  createBackgroundStatusPoller,
  formatStatusText,
  getStatusBadgeClass,
  isBackgroundReady,
  getOverallProgress,
} from "@/lib/background-status-poller";
```

---

## Step 2: Add State for Background Status

```typescript
"use client";

import { useState, useEffect } from "react";
import { GREEN_SCREEN_BACKGROUNDS } from "@/lib/green-screen";
import type { BackgroundStatus } from "@/lib/background-status-poller";

export default function Screen07() {
  // Source video filename (from Screen 11/12 export or session state)
  const [sourceFilename, setSourceFilename] = useState<string | null>(null);

  // Track status of each background
  const [backgroundStatuses, setBackgroundStatuses] = useState<BackgroundStatus[]>([]);

  // Show overall progress
  const [isProcessing, setIsProcessing] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ... rest of component
}
```

---

## Step 3: Set Up Status Polling

```typescript
useEffect(() => {
  if (!sourceFilename) return;

  // Create poller instance
  const poller = createBackgroundStatusPoller({
    sourceFilename,
    onStatusUpdate: (response) => {
      // Update UI with latest status
      setBackgroundStatuses(response.backgroundsStatus);
      setIsProcessing(!response.allReady);
      
      // Calculate overall progress
      const progress = response.backgroundsStatus
        .filter(s => s.status !== "not-queued")
        .length === 0 
        ? 0 
        : Math.round(
            (response.backgroundsStatus.filter(s => s.status === "completed").length /
              response.backgroundsStatus.filter(s => s.status !== "not-queued").length) *
            100
          );
      setOverallProgress(progress);

      // Clear error if all backgrounds ready
      if (response.allReady) {
        setErrorMessage(null);
      }
    },
    onError: (error) => {
      console.error("[Screen 07] Background status error:", error);
      setErrorMessage(`Error checking background status: ${error.message}`);
    },
    pollInterval: 2000, // Check every 2 seconds
    enabled: !!sourceFilename,
  });

  // Start polling
  poller.startPolling();

  // Cleanup on unmount
  return () => {
    poller.stopPolling();
  };
}, [sourceFilename]);
```

---

## Step 4: Render Background Swatches with Status

### Simple Version

```typescript
return (
  <div className="screen-07 p-6">
    <h1 className="text-2xl font-bold mb-6">Select Background</h1>

    {/* Overall Progress */}
    {isProcessing && (
      <div className="mb-6 p-4 bg-blue-50 rounded-lg">
        <p className="text-sm text-gray-600 mb-2">
          Rendering backgrounds... {overallProgress}%
        </p>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>
    )}

    {/* Error Message */}
    {errorMessage && (
      <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">
        {errorMessage}
      </div>
    )}

    {/* Background Grid */}
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
      {GREEN_SCREEN_BACKGROUNDS.map((background) => {
        const status = backgroundStatuses.find(
          (s) => s.backgroundId === background.id
        );

        if (!status) return null;

        const isReady = isBackgroundReady(status);
        const isLoading =
          status.status === "processing" || status.status === "queued";

        return (
          <div key={background.id} className="bg-swatch-container">
            {/* Thumbnail */}
            <div className="relative overflow-hidden rounded-lg mb-2 bg-gray-100 aspect-video">
              <img
                src={background.thumb}
                alt={background.label}
                className="w-full h-full object-cover"
              />

              {/* Status Badge */}
              <div className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-semibold ${getStatusBadgeClass(status)}`}>
                {status.status === "completed" && "✓"}
                {status.status === "processing" && `${status.progress}%`}
                {status.status === "queued" && "⏳"}
                {status.status === "failed" && "✗"}
                {status.status === "not-queued" && "..."}
              </div>

              {/* Loading Spinner (if processing) */}
              {isLoading && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent" />
                </div>
              )}

              {/* Failed Overlay */}
              {status.status === "failed" && (
                <div className="absolute inset-0 bg-red-500/20" />
              )}
            </div>

            {/* Label */}
            <p className="text-sm font-medium text-gray-900 mb-2">
              {background.label}
            </p>

            {/* Status Text */}
            <p className="text-xs text-gray-600 mb-3">
              {formatStatusText(status)}
            </p>

            {/* Apply Button */}
            <button
              onClick={() => applyBackground(background.id)}
              disabled={!isReady}
              className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                isReady
                  ? "bg-blue-500 text-white hover:bg-blue-600"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              {isReady ? "Apply" : "Rendering..."}
            </button>
          </div>
        );
      })}
    </div>
  </div>
);
```

### Enhanced Version with Tooltips

```typescript
return (
  <div className="screen-07 p-6">
    <h1 className="text-2xl font-bold mb-6">Select Background</h1>

    {/* Progress Section */}
    {isProcessing && (
      <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700">
            Rendering all backgrounds
          </p>
          <span className="text-sm font-bold text-blue-600">
            {overallProgress}% complete
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-blue-500 to-indigo-500 h-3 rounded-full transition-all duration-300"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        <p className="text-xs text-gray-600 mt-2">
          {backgroundStatuses.filter(s => s.status === "completed").length} of{" "}
          {backgroundStatuses.length} backgrounds ready
        </p>
      </div>
    )}

    {/* Error Section */}
    {errorMessage && (
      <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm text-red-700">
          <span className="font-semibold">Error:</span> {errorMessage}
        </p>
      </div>
    )}

    {/* Background Grid */}
    <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-5">
      {GREEN_SCREEN_BACKGROUNDS.map((background) => {
        const status = backgroundStatuses.find(
          (s) => s.backgroundId === background.id
        );

        if (!status) return null;

        const isReady = isBackgroundReady(status);
        const isProcessing = status.status === "processing";
        const isFailed = status.status === "failed";

        return (
          <div
            key={background.id}
            className={`group cursor-pointer transition-transform hover:scale-105 ${
              isFailed ? "opacity-75" : ""
            }`}
          >
            {/* Thumbnail Container */}
            <div className="relative overflow-hidden rounded-lg mb-3 bg-gray-100 aspect-video shadow-lg group-hover:shadow-xl transition-shadow">
              <img
                src={background.thumb}
                alt={background.label}
                className="w-full h-full object-cover"
              />

              {/* Status Badge */}
              <div
                className={`absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-semibold text-white shadow-md ${
                  isReady
                    ? "bg-green-500"
                    : isProcessing
                    ? "bg-blue-500"
                    : isFailed
                    ? "bg-red-500"
                    : "bg-gray-400"
                }`}
              >
                {isReady && "✓ Ready"}
                {isProcessing && `⏳ ${status.progress}%`}
                {isFailed && "✗ Error"}
                {status.status === "queued" && "⏱️ Queued"}
                {status.status === "not-queued" && "⏱️ Pending"}
              </div>

              {/* Overlay Effects */}
              {isProcessing && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <div className="flex flex-col items-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-3 border-white border-t-transparent mb-2" />
                    <span className="text-white text-xs font-medium">
                      {status.progress}%
                    </span>
                  </div>
                </div>
              )}

              {isFailed && (
                <div className="absolute inset-0 bg-red-500/30 flex items-center justify-center">
                  <span className="text-white text-lg font-bold">✗</span>
                </div>
              )}
            </div>

            {/* Text Content */}
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              {background.label}
            </h3>

            <p className="text-xs text-gray-600 mb-3">
              {formatStatusText(status)}
            </p>

            {/* Action Button */}
            <button
              onClick={() => applyBackground(background.id)}
              disabled={!isReady}
              title={
                isReady
                  ? "Apply this background"
                  : isProcessing
                  ? "Still rendering..."
                  : isFailed
                  ? "Rendering failed"
                  : "Background not queued yet"
              }
              className={`w-full py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                isReady
                  ? "bg-blue-500 text-white hover:bg-blue-600 hover:shadow-md active:scale-95"
                  : isFailed
                  ? "bg-red-100 text-red-700 hover:bg-red-200 cursor-not-allowed"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              {isReady && "Apply"}
              {isProcessing && "Rendering..."}
              {isFailed && "Retry"}
              {status.status === "not-queued" && "Pending..."}
              {status.status === "queued" && "Queued..."}
            </button>

            {/* Retry Button (if failed) */}
            {isFailed && (
              <button
                onClick={() => {
                  // Manually retry
                  enqueueGreenScreenCompose(background.id, sourceFilename!);
                }}
                className="w-full mt-2 py-1 px-3 bg-orange-100 text-orange-700 rounded text-xs font-medium hover:bg-orange-200"
              >
                Retry
              </button>
            )}
          </div>
        );
      })}
    </div>
  </div>
);
```

---

## Step 5: Implement Apply Background Function

```typescript
async function applyBackground(backgroundId: string) {
  if (!sourceFilename) return;

  try {
    // Call existing green-screen API
    const res = await fetch("/api/green-screen/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        backgroundId,
        sourceFilename,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to apply background: ${res.statusText}`);
    }

    const { job } = await res.json();

    // Update preview with the new background
    // (existing code to update video player)
    updateVideoPreview(job.outputUrl);

    // Show success toast
    showToast(`✓ Applied background: ${backgroundId}`, "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    showToast(`✗ Error: ${message}`, "error");
  }
}
```

---

## Step 6: Tie Everything Together

```typescript
"use client";

import { useState, useEffect } from "react";
import { GREEN_SCREEN_BACKGROUNDS } from "@/lib/green-screen";
import type { BackgroundStatus } from "@/lib/background-status-poller";
import {
  createBackgroundStatusPoller,
  formatStatusText,
  getStatusBadgeClass,
  isBackgroundReady,
} from "@/lib/background-status-poller";

interface Screen07Props {
  sourceFilename: string; // From Screen 11/12 export
  onBackgroundApplied?: (url: string) => void;
}

export default function Screen07({ sourceFilename, onBackgroundApplied }: Screen07Props) {
  const [backgroundStatuses, setBackgroundStatuses] = useState<BackgroundStatus[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);

  // Set up status polling
  useEffect(() => {
    if (!sourceFilename) return;

    const poller = createBackgroundStatusPoller({
      sourceFilename,
      onStatusUpdate: (response) => {
        setBackgroundStatuses(response.backgroundsStatus);
        setIsProcessing(!response.allReady);
        
        const readyCount = response.backgroundsStatus.filter(
          s => s.status === "completed"
        ).length;
        const totalCount = response.backgroundsStatus.filter(
          s => s.status !== "not-queued"
        ).length;
        
        setOverallProgress(
          totalCount === 0 ? 0 : Math.round((readyCount / totalCount) * 100)
        );
        
        if (response.allReady) {
          setErrorMessage(null);
        }
      },
      onError: (error) => {
        console.error("[Screen 07] Status error:", error);
        setErrorMessage(`Status check failed: ${error.message}`);
      },
      pollInterval: 2000,
      enabled: !!sourceFilename,
    });

    poller.startPolling();
    return () => poller.stopPolling();
  }, [sourceFilename]);

  const applyBackground = async (backgroundId: string) => {
    if (!sourceFilename) return;

    setApplying(backgroundId);
    try {
      const res = await fetch("/api/green-screen/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backgroundId, sourceFilename }),
      });

      if (!res.ok) {
        throw new Error("Failed to apply background");
      }

      const { job } = await res.json();
      onBackgroundApplied?.(job.outputUrl);
    } catch (error) {
      setErrorMessage(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="screen-07 p-6">
      <h1 className="text-2xl font-bold mb-6">Select Background</h1>

      {isProcessing && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-gray-600 mb-2">
            Rendering backgrounds... {overallProgress}%
          </p>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {GREEN_SCREEN_BACKGROUNDS.map((background) => {
          const status = backgroundStatuses.find(
            (s) => s.backgroundId === background.id
          );

          if (!status) return null;

          const isReady = isBackgroundReady(status);

          return (
            <div key={background.id}>
              <div className="relative overflow-hidden rounded-lg mb-2 bg-gray-100 aspect-video">
                <img
                  src={background.thumb}
                  alt={background.label}
                  className="w-full h-full object-cover"
                />
                <div
                  className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-semibold text-white ${
                    status.status === "completed"
                      ? "bg-green-500"
                      : status.status === "processing"
                      ? "bg-blue-500"
                      : "bg-gray-400"
                  }`}
                >
                  {status.status === "completed" && "✓"}
                  {status.status === "processing" && `${status.progress}%`}
                  {status.status !== "completed" && status.status !== "processing" && "⏳"}
                </div>
              </div>

              <p className="text-sm font-medium mb-1">{background.label}</p>
              <p className="text-xs text-gray-600 mb-2">
                {formatStatusText(status)}
              </p>

              <button
                onClick={() => applyBackground(background.id)}
                disabled={!isReady || applying === background.id}
                className={`w-full py-2 rounded-lg text-sm font-medium ${
                  isReady
                    ? "bg-blue-500 text-white hover:bg-blue-600"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                {applying === background.id ? "Applying..." : "Apply"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

---

## CSS Styling (if not using Tailwind)

```css
.bg-swatch-container {
  position: relative;
  aspect-ratio: 16 / 9;
}

.badge-success {
  background-color: #10b981;
  color: white;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.badge-info {
  background-color: #3b82f6;
  color: white;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.badge-warning {
  background-color: #f59e0b;
  color: white;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.badge-error {
  background-color: #ef4444;
  color: white;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
}
```

---

## Result

Screen 07 now shows:
- ✅ **Ready backgrounds** - Green checkmark, instant apply
- ⏳ **Processing backgrounds** - Progress percentage
- ⏱️ **Queued backgrounds** - "Rendering..." status
- ❌ **Failed backgrounds** - Red X with retry option
- 📊 **Overall progress** - Shows % of backgrounds ready

**User experience:** Click a background → Instant result (or see progress bar if still rendering)

---

## Next Steps

1. Add these components to your Screen 07 component
2. Test with real video exports
3. Monitor background rendering in worker logs
4. Adjust `pollInterval` if needed (2000ms is good default)
5. Add animations/transitions for smoother UX

Done! 🎉
