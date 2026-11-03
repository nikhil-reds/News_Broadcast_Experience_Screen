export interface ScreenWorkflow {
  sessionId: string;
  revision: number;
  applied: number[];
  broadcastAt?: number;
  publishedAt: string | null;
}
export interface WorkflowView {
  state: ScreenWorkflow | null;
  active: number[];
  ready: boolean;
  readyDisplays?: number[];
}
export function activeScreens(applied: readonly number[]): number[] {
  for (let screen = 1; screen <= 8; screen++) if (!applied.includes(screen)) return [screen];
  const parallel = [9, 10].filter(screen => !applied.includes(screen));
  if (parallel.length) return parallel;
  if (!applied.includes(11)) return [11];
  return applied.includes(12) ? [] : [12];
}

// Applying a step increments both values. Restarting increments only the revision.
export function workflowRun(state: ScreenWorkflow) {
  return state.revision - state.applied.length;
}
