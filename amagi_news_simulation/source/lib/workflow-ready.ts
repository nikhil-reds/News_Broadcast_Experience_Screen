"use client";
import { createContext, useContext, useEffect } from "react";
export const WorkflowReadyContext = createContext<(ready: boolean) => void>(() => {});
export const WorkflowDirtyContext = createContext<(dirty: boolean) => void>(() => {});
export function useWorkflowDirty(dirty: boolean) {
  const report = useContext(WorkflowDirtyContext);
  useEffect(() => { report(dirty); return () => report(false); }, [dirty, report]);
}
export function useWorkflowReady(ready: boolean) {
  const report = useContext(WorkflowReadyContext);
  useEffect(() => { report(ready); return () => report(false); }, [ready, report]);
}
