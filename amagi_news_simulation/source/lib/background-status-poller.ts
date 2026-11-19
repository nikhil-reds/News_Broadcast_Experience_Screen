/**
 * Background Status Poller for Screen 07
 *
 * Utility to poll background composition job status and track progress.
 * Use this in your Screen 07 component to show real-time rendering status.
 */

export interface BackgroundStatus {
  backgroundId: string;
  label: string;
  status: "queued" | "processing" | "completed" | "failed" | "not-queued";
  progress: number; // 0-100
}

export interface BackgroundStatusResponse {
  sourceFilename: string;
  backgroundsStatus: BackgroundStatus[];
  allReady: boolean;
  readyCount: number;
}

/**
 * Fetch current status of all background compositions for a video.
 * Returns which backgrounds are ready, which are processing, and their progress.
 */
export async function fetchBackgroundStatus(
  sourceFilename: string
): Promise<BackgroundStatusResponse> {
  const res = await fetch(
    `/api/green-screen/status?sourceFilename=${encodeURIComponent(sourceFilename)}`
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch background status: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Hook wrapper for polling background status with automatic cleanup.
 *
 * Usage in React component:
 * ```
 * const [statuses, setStatuses] = useState<BackgroundStatus[]>([]);
 * const [isProcessing, setIsProcessing] = useState(false);
 *
 * useBackgroundStatusPoller({
 *   sourceFilename: "reel-xxx.mp4",
 *   onStatusUpdate: (response) => {
 *     setStatuses(response.backgroundsStatus);
 *     setIsProcessing(!response.allReady);
 *   },
 *   pollInterval: 2000, // ms between checks
 *   enabled: true,
 * });
 * ```
 */
export function createBackgroundStatusPoller(options: {
  sourceFilename: string;
  onStatusUpdate: (response: BackgroundStatusResponse) => void;
  onError?: (error: Error) => void;
  pollInterval?: number;
  enabled?: boolean;
}) {
  const {
    sourceFilename,
    onStatusUpdate,
    onError,
    pollInterval = 2000,
    enabled = true,
  } = options;

  let intervalId: NodeJS.Timeout | null = null;
  let isPolling = false;

  const startPolling = async () => {
    if (!enabled || isPolling) return;

    const poll = async () => {
      try {
        const response = await fetchBackgroundStatus(sourceFilename);
        onStatusUpdate(response);

        // Stop polling once all backgrounds are ready
        if (response.allReady) {
          stopPolling();
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
      }
    };

    // Initial poll
    await poll();

    // Set up interval for subsequent polls
    intervalId = setInterval(poll, pollInterval);
    isPolling = true;
  };

  const stopPolling = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    isPolling = false;
  };

  return {
    startPolling,
    stopPolling,
    isPolling: () => isPolling,
  };
}

/**
 * Check if a single background is ready for use.
 * Useful for enabling/disabling buttons or showing visual states.
 */
export function isBackgroundReady(status: BackgroundStatus): boolean {
  return status.status === "completed";
}

/**
 * Check if all backgrounds have finished processing (successfully or failed).
 */
export function areAllBackgroundsProcessed(statuses: BackgroundStatus[]): boolean {
  return statuses.every((s) => s.status === "completed" || s.status === "failed");
}

/**
 * Get percentage of backgrounds that have completed.
 * Useful for an overall progress bar.
 */
export function getOverallProgress(statuses: BackgroundStatus[]): number {
  if (statuses.length === 0) return 0;

  const completedCount = statuses.filter((s) => s.status === "completed").length;
  return Math.round((completedCount / statuses.length) * 100);
}

/**
 * Format status for display.
 * Returns user-friendly text for UI.
 */
export function formatStatusText(status: BackgroundStatus): string {
  switch (status.status) {
    case "completed":
      return "Ready";
    case "processing":
      return `Processing (${status.progress}%)`;
    case "queued":
      return "Queued";
    case "failed":
      return "Failed";
    case "not-queued":
      return "Pending";
    default:
      return "Unknown";
  }
}

/**
 * Get CSS class name for status badge styling.
 */
export function getStatusBadgeClass(status: BackgroundStatus): string {
  switch (status.status) {
    case "completed":
      return "badge-success";
    case "processing":
      return "badge-info";
    case "queued":
      return "badge-warning";
    case "failed":
      return "badge-error";
    case "not-queued":
      return "badge-neutral";
    default:
      return "badge-neutral";
  }
}
