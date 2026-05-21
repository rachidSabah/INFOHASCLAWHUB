import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

interface HealthEvent {
  id: string;
  route: string;
  status: "ok" | "error";
  code?: number;
  message?: string;
  timestamp: number;
  action: string;
}

interface RouteStatus {
  route: string;
  status: "ok" | "error";
  code?: number;
  message?: string;
  lastChecked: number;
}

const MAX_EVENTS = 50;
const INTERVAL_MS = 60_000;

const ROUTES = [
  "/api/models",
  "/api/agents",
  "/api/kanban/boards",
  "/api/bridge/proxy",
];

const healthLog: HealthEvent[] = [];
const routeStatuses: Map<string, RouteStatus> = new Map();
let healInterval: ReturnType<typeof setInterval> | null = null;
let baseUrl = "http://127.0.0.1:3000";

function addEvent(event: HealthEvent) {
  healthLog.push(event);
  if (healthLog.length > MAX_EVENTS) {
    healthLog.shift();
  }
}

function setRouteStatus(status: RouteStatus) {
  routeStatuses.set(status.route, status);
}

async function checkRoute(route: string): Promise<{ ok: boolean; code?: number; message?: string }> {
  const url = `${baseUrl}${route}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      return { ok: true, code: res.status };
    }
    const text = await res.text().catch(() => "");
    return { ok: false, code: res.status, message: text.slice(0, 200) };
  } catch (e: any) {
    return { ok: false, message: e.message || "Connection failed" };
  }
}

function isPrismaLockError(message: string): boolean {
  return /prisma.*(?:lock|DLL|dylib|engine|QueryEngine)/i.test(message) ||
    /cannot find module.*prisma/i.test(message);
}

function attemptPrismaRegenerate(): boolean {
  try {
    const cwd = process.cwd();
    if (existsSync(join(cwd, "prisma", "schema.prisma"))) {
      execSync("npx prisma generate", { cwd, stdio: "pipe", timeout: 30_000 });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function attemptServerRestart(): boolean {
  try {
    addEvent({
      id: crypto.randomUUID(),
      route: "_system",
      status: "ok",
      message: "Requested server restart — server must be managed externally",
      timestamp: Date.now(),
      action: "restart_requested",
    });
    return false;
  } catch {
    return false;
  }
}

async function runHealthCheck() {
  for (const route of ROUTES) {
    const result = await checkRoute(route);
    const status: RouteStatus = {
      route,
      status: result.ok ? "ok" : "error",
      code: result.code,
      message: result.message,
      lastChecked: Date.now(),
    };
    setRouteStatus(status);

    let action = "none";
    if (!result.ok && result.code === 500) {
      if (result.message && isPrismaLockError(result.message)) {
        const regenerated = attemptPrismaRegenerate();
        action = regenerated ? "prisma_regenerated" : "prisma_regenerate_failed";
      } else {
        attemptServerRestart();
        action = "restart_attempted";
      }
    }

    addEvent({
      id: crypto.randomUUID(),
      route,
      status: result.ok ? "ok" : "error",
      code: result.code,
      message: result.message,
      timestamp: Date.now(),
      action,
    });
  }
}

export function startSelfHealer(port?: number) {
  if (healInterval) return;

  if (port) {
    baseUrl = `http://127.0.0.1:${port}`;
  }

  ROUTES.forEach((route) => {
    setRouteStatus({
      route,
      status: "ok",
      lastChecked: 0,
    });
  });

  addEvent({
    id: crypto.randomUUID(),
    route: "_system",
    status: "ok",
    message: "Self-healer started",
    timestamp: Date.now(),
    action: "started",
  });

  runHealthCheck();

  healInterval = setInterval(runHealthCheck, INTERVAL_MS);
}

export function stopSelfHealer() {
  if (healInterval) {
    clearInterval(healInterval);
    healInterval = null;
    addEvent({
      id: crypto.randomUUID(),
      route: "_system",
      status: "ok",
      message: "Self-healer stopped",
      timestamp: Date.now(),
      action: "stopped",
    });
  }
}

export function getHealthStatus() {
  return {
    routes: Array.from(routeStatuses.values()),
    events: [...healthLog].reverse().slice(0, 50),
    totalEvents: healthLog.length,
    uptime: process.uptime(),
  };
}

export function triggerHealthCheck() {
  return runHealthCheck();
}
