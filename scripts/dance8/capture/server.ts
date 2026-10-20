/**
 * The local page that reads your body (canon D8-17). Serves page.html, the
 * MediaPipe pose tracker from node_modules, the model from your library and
 * the still frames from a temporary folder, on this computer only
 * (127.0.0.1, a random port and a one-time key), and collects the body
 * points the page sends back. Nothing leaves your computer.
 */
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { dirname, join, normalize, sep } from "node:path";
import type { PreparedTake, TrackedTake } from "../../../lib/dance8/movesPipeline";

const MIME: Record<string, string> = { ".mjs": "text/javascript", ".js": "text/javascript", ".wasm": "application/wasm", ".html": "text/html; charset=utf-8" };

/** Where the installed tracker lives (the repo's devDependency). */
export function trackerDir(): string {
  try {
    // The package exports only its bundles, which sit at its root next to wasm/.
    return dirname(createRequire(join(process.cwd(), "package.json")).resolve("@mediapipe/tasks-vision"));
  } catch {
    throw new Error("the body tracker is not installed; run: npm install");
  }
}

export interface CaptureOptions {
  modelPath: string;
  /** Open the browser (macOS: Chrome if installed, else the default browser). */
  open: boolean;
  log: (line: string) => void;
  /** For tests: serve the tracker from here instead. */
  trackerRoot?: string;
  onUrl?: (url: string) => void;
}

function openBrowser(url: string, log: (l: string) => void) {
  const tryRun = (cmd: string, args: string[]) => new Promise<boolean>((res) => {
    const p = spawn(cmd, args, { stdio: "ignore" });
    p.on("error", () => res(false));
    p.on("exit", (code) => res(code === 0));
  });
  void (async () => {
    if (process.platform === "darwin") {
      if (await tryRun("open", ["-a", "Google Chrome", url])) return;
      if (await tryRun("open", [url])) return;
    } else if (await tryRun("xdg-open", [url])) return;
    log(`open this in Chrome: ${url}`);
  })();
}

export function captureTakes(takes: PreparedTake[], o: CaptureOptions): Promise<TrackedTake[]> {
  const key = randomBytes(16).toString("hex");
  const root = o.trackerRoot ?? trackerDir();
  const page = readFileSync(join(__dirname, "page.html"), "utf8");
  const results: (TrackedTake | null)[] = takes.map(() => null);
  let lastPct = -1;

  return new Promise((resolve, reject) => {
    const send = (res: ServerResponse, code: number, body: string | Buffer, type = "text/plain; charset=utf-8") => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
      res.end(body);
    };
    const file = (res: ServerResponse, path: string, type: string) => {
      res.writeHead(200, { "content-type": type, "content-length": statSync(path).size, "cache-control": "no-store" });
      createReadStream(path).pipe(res);
    };
    const body = (req: IncomingMessage) => new Promise<string>((ok, bad) => {
      const parts: Buffer[] = [];
      req.on("data", (d: Buffer) => parts.push(d));
      req.on("end", () => ok(Buffer.concat(parts).toString("utf8")));
      req.on("error", bad);
    });

    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        const p = url.pathname;
        // The tracker's own files are public code; everything else needs the key.
        if (p.startsWith("/mp/")) {
          const rel = normalize(p.slice(4)).replace(/^(\.\.(\/|\\|$))+/, "");
          const full = join(root, rel);
          if (!full.startsWith(root + sep) || !/^(vision_bundle\.mjs|wasm\/[\w.-]+)$/.test(rel.split(sep).join("/")) || !existsSync(full)) return send(res, 404, "not found");
          return file(res, full, MIME[full.slice(full.lastIndexOf("."))] ?? "application/octet-stream");
        }
        if (url.searchParams.get("k") !== key) return send(res, 403, "forbidden");
        if (p === "/" && req.method === "GET") return send(res, 200, page, MIME[".html"]);
        if (p === "/job") return send(res, 200, JSON.stringify({ takes: takes.map((t) => ({ id: t.takeId, frames: t.frames, fps: t.fps, width: t.width, height: t.height })) }), "application/json");
        if (p === "/model") return file(res, o.modelPath, "application/octet-stream");
        const fm = /^\/frame\/(\d+)\/(\d+)$/.exec(p);
        if (fm) {
          const t = takes[Number(fm[1])], i = Number(fm[2]);
          if (!t || i < 0 || i >= t.frames) return send(res, 404, "not found");
          return file(res, join(t.frameDir, `${String(i + 1).padStart(6, "0")}.jpg`), "image/jpeg");
        }
        if (req.method === "POST" && p === "/progress") {
          const j = JSON.parse(await body(req)) as { take: number; done: number };
          const total = takes.reduce((a, t) => a + t.frames, 0);
          const done = takes.slice(0, j.take).reduce((a, t) => a + t.frames, 0) + j.done;
          const pct = Math.floor((100 * done) / total / 10) * 10;
          if (pct !== lastPct) { lastPct = pct; o.log(`reading your moves... ${pct}%`); }
          return send(res, 204, "");
        }
        const rm = /^\/result\/(\d+)$/.exec(p);
        if (req.method === "POST" && rm) {
          const k = Number(rm[1]);
          const j = JSON.parse(await body(req)) as TrackedTake;
          if (!takes[k] || !Array.isArray(j.frames)) return send(res, 400, "bad result");
          results[k] = { delegate: j.delegate === "GPU" ? "GPU" : "CPU", frames: j.frames };
          send(res, 204, "");
          if (results.every(Boolean)) { finish(res); resolve(results as TrackedTake[]); }
          return;
        }
        if (req.method === "POST" && p === "/fail") {
          const j = JSON.parse(await body(req)) as { message: string };
          send(res, 204, "");
          finish(res);
          return reject(new Error(`the browser page stopped: ${j.message}`));
        }
        send(res, 404, "not found");
      } catch (e) {
        send(res, 500, String((e as Error).message));
      }
    });
    // Stop listening, and let go of the browser's kept-alive connections once the last reply is out.
    const finish = (res: ServerResponse) => {
      server.close();
      res.on("finish", () => server.closeIdleConnections());
      setTimeout(() => server.closeAllConnections(), 2000).unref();
    };
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const url = `http://127.0.0.1:${port}/?k=${key}`;
      o.onUrl?.(url);
      if (o.open) { o.log("opening a page in your browser to read your moves (keep it open until it says done)"); openBrowser(url, o.log); }
      else o.log(`open this in Chrome: ${url}`);
    });
  });
}
