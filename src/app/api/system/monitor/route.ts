import { NextResponse } from "next/server";
import os from "os";
import fs from "fs";

export async function GET() {
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model || "Unknown";
  const coreCount = cpus.length;

  const loadAvg = os.loadavg();
  const cpuUsage = Math.min(100, Math.round((loadAvg[0] / coreCount) * 100));
  const cores = cpus.map(() => cpuUsage);

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  const memory = {
    total: +(totalMem / (1024 ** 3)).toFixed(2),
    free: +(freeMem / (1024 ** 3)).toFixed(2),
    used: +(usedMem / (1024 ** 3)).toFixed(2),
    usagePercent: Math.round((usedMem / totalMem) * 100),
  };

  let diskTotal = 0;
  let diskFree = 0;
  let diskUsed = 0;
  try {
    const stats = fs.statfsSync(process.cwd());
    diskTotal = (stats.blocks * stats.bsize) / (1024 ** 3);
    diskFree = (stats.bfree * stats.bsize) / (1024 ** 3);
    diskUsed = diskTotal - diskFree;
  } catch {}

  const disk = {
    total: +diskTotal.toFixed(2),
    free: +diskFree.toFixed(2),
    used: +diskUsed.toFixed(2),
  };

  const system = {
    os: `${os.type()} ${os.release()}`,
    hostname: os.hostname(),
    platform: os.platform(),
    uptime: os.uptime(),
    nodeVersion: process.version,
  };

  const proc = {
    uptime: process.uptime(),
    memory: +(process.memoryUsage().rss / (1024 ** 2)).toFixed(2),
  };

  return NextResponse.json({
    cpu: {
      usage: cpuUsage,
      cores,
      model: cpuModel,
    },
    memory,
    disk,
    system,
    process: proc,
  });
}
