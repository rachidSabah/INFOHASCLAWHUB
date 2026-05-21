import fs from "fs";
import path from "path";

const dbPath = path.join(process.cwd(), "prisma", "db", "pipelines.json");

function readStore(): Map<string, any> {
  try {
    if (fs.existsSync(dbPath)) {
      const data = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
      return new Map(Object.entries(data));
    }
  } catch {}
  return new Map();
}

function writeStore(store: Map<string, any>) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(Object.fromEntries(store)), "utf-8");
}

const pipelineStore = {
  getAll: () => Array.from(readStore().values()),
  get: (id: string) => readStore().get(id),
  set: (id: string, data: any) => { const s = readStore(); s.set(id, data); writeStore(s); },
  delete: (id: string) => { const s = readStore(); const ok = s.delete(id); if (ok) writeStore(s); return ok; },
  has: (id: string) => readStore().has(id),
};

export { pipelineStore };
