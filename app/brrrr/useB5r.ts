"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { simulate, tornado, edoCall, DEFAULT_POLICY, N_ITER, SEED, type DealInputs, type Policy, type SimResult, type EdoCall, type TornadoRow } from "@/lib/b5r/engine";
import type { WorkerResponse } from "@/lib/b5r/worker";

export type RunState = {
  status: "idle" | "running" | "done" | "error";
  result?: SimResult; call?: EdoCall; tornado?: TornadoRow[]; tornadoPending?: boolean;
  error?: string; ms?: number;
};

/** Runs the Monte Carlo off the main thread. Falls back to inline if Workers are unavailable. */
export function useB5r() {
  const [state, setState] = useState<RunState>({ status: "idle" });
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);
  const t0 = useRef(0);

  useEffect(() => {
    try {
      const w = new Worker(new URL("../../lib/b5r/worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const m = e.data;
        if (m.id !== seq.current) return; // stale run
        if (m.kind === "result") setState({ status: "done", result: m.result, call: m.call, tornadoPending: true, ms: Math.round(performance.now() - t0.current) });
        else if (m.kind === "tornado") setState((s) => ({ ...s, tornado: m.rows, tornadoPending: false }));
        else setState({ status: "error", error: m.message });
      };
      w.onerror = () => { worker.current = null; };
      worker.current = w;
    } catch { worker.current = null; }
    return () => { worker.current?.terminate(); worker.current = null; };
  }, []);

  const run = useCallback((deal: DealInputs, policy: Policy = DEFAULT_POLICY, n = N_ITER, seed = SEED) => {
    const id = ++seq.current;
    t0.current = performance.now();
    setState({ status: "running" });
    if (worker.current) { worker.current.postMessage({ id, deal, policy, n, seed }); return; }
    setTimeout(() => {
      try {
        const result = simulate(deal, policy, n, seed);
        setState({ status: "done", result, call: edoCall(result, policy), tornado: tornado(deal, policy, "cashLeftIn", Math.min(n, 3000), seed), tornadoPending: false, ms: Math.round(performance.now() - t0.current) });
      } catch (err) { setState({ status: "error", error: err instanceof Error ? err.message : String(err) }); }
    }, 0);
  }, []);

  return { state, run };
}
