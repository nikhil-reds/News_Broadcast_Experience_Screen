export interface ScreenWorkflow {
  sessionId: string;
  revision: number;
  applied: number[];
  restartAt?: number;
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

/** A workflow may advance many steps without resetting already-open screens. */
export function workflowEpoch(state: Pick<ScreenWorkflow, "sessionId" | "restartAt">) {
  return `${state.sessionId}:${state.restartAt ?? 0}`;
}

/** Keep display persistence separate from workflow completion. */
export function screenWorkflowStatus(view: WorkflowView | null, screen: number, revealedEpoch: string | null) {
  const currentEpoch = view?.state ? workflowEpoch(view.state) : null;
  const latched = Boolean(currentEpoch && revealedEpoch === currentEpoch);
  const applied = view?.state?.applied.includes(screen) ?? false;
  return {
    currentEpoch,
    latched,
    applied,
    active: view?.active.includes(screen) ?? false,
    displayRetained: applied || latched,
  };
}

/**
 * Applied screens are monotonic within one workflow epoch. A delayed or
 * temporarily stale poll must never hide content that a newer response has
 * already confirmed. A new session or explicit restart starts a new epoch and
 * is allowed to reset the applied list.
 */
export function mergeWorkflowView(previous: WorkflowView | null, next: WorkflowView): WorkflowView {
  if (!previous?.state) return next;
  if (!next.state) return previous;
  if (workflowEpoch(previous.state) !== workflowEpoch(next.state)) return next;

  const applied = [...new Set([...previous.state.applied, ...next.state.applied])].sort((a, b) => a - b);
  if (applied.length === next.state.applied.length && applied.every((screen, index) => screen === next.state!.applied[index])) {
    return next;
  }

  const state = { ...next.state, revision: Math.max(previous.state.revision, next.state.revision), applied };
  return { ...next, state, active: activeScreens(applied) };
}
