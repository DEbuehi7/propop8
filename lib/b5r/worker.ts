/// <reference lib="webworker" />
import { simulate, tornado, edoCall, type DealInputs, type Policy } from "./engine";

export type WorkerRequest = { id: number; deal: DealInputs; policy: Policy; n: number; seed: number; dsa?: number; confidence?: number };
export type WorkerResponse =
  | { id: number; kind: "result"; result: ReturnType<typeof simulate>; call: ReturnType<typeof edoCall> }
  | { id: number; kind: "tornado"; rows: ReturnType<typeof tornado> }
  | { id: number; kind: "error"; message: string };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, deal, policy, n, seed, dsa, confidence } = e.data;
  try {
    const result = simulate(deal, policy, n, seed);
    (self as unknown as Worker).postMessage({ id, kind: "result", result, call: edoCall(result, policy, dsa, confidence) } satisfies WorkerResponse);
    (self as unknown as Worker).postMessage({ id, kind: "tornado", rows: tornado(deal, policy, "cashLeftIn", Math.min(n, 3000), seed) } satisfies WorkerResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, kind: "error", message: err instanceof Error ? err.message : String(err) } satisfies WorkerResponse);
  }
};
