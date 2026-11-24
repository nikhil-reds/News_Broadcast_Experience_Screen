import assert from "node:assert/strict";
import test from "node:test";
import { mergeWorkflowView, screenWorkflowStatus, workflowEpoch, type WorkflowView } from "@/lib/screen-workflow";

function view(sessionId: string, applied: number[], revision = applied.length, restartAt?: number): WorkflowView {
  return {
    state: { sessionId, applied, revision, restartAt, publishedAt: null },
    active: [],
    ready: true,
  };
}

test("an older poll cannot remove applied screens in the same workflow epoch", () => {
  const merged = mergeWorkflowView(view("session-a", [1, 2], 2), view("session-a", [1], 1));
  assert.deepEqual(merged.state?.applied, [1, 2]);
  assert.deepEqual(merged.active, [3]);
});

test("a transient empty workflow response retains the last confirmed view", () => {
  const previous = view("session-a", [1, 2], 2);
  const merged = mergeWorkflowView(previous, { state: null, active: [], ready: false });
  assert.equal(merged, previous);
});

test("an explicit restart may reset applied screens", () => {
  const merged = mergeWorkflowView(view("session-a", [1, 2], 3, 100), view("session-a", [], 4, 200));
  assert.deepEqual(merged.state?.applied, []);
});

test("a new recording session may reset applied screens", () => {
  const merged = mergeWorkflowView(view("session-a", [1, 2], 2), view("session-b", [], 0));
  assert.equal(merged.state?.sessionId, "session-b");
  assert.deepEqual(merged.state?.applied, []);
});

test("a freshly revealed demo screen remains Apply, not Applied", () => {
  const freshDemo = view("demo-session", [], 0, 100);
  freshDemo.active = [1];
  const status = screenWorkflowStatus(freshDemo, 1, workflowEpoch(freshDemo.state!));
  assert.equal(status.displayRetained, true);
  assert.equal(status.active, true);
  assert.equal(status.applied, false);
});
