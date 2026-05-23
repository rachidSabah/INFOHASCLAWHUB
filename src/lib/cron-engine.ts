import cron from "node-cron";
import { execSync } from "child_process";
import { db } from "@/lib/db";

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT || 3000}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskExecutionResult {
  success: boolean;
  output: string;
  duration: number;
}

interface TaskHistoryEntry {
  ranAt: string;
  result: unknown;
  duration: number;
}

interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
}

interface WorkerConfig {
  pollIntervalMs?: number;
  maxConcurrentTasks?: number;
  [key: string]: unknown;
}

type CronTaskRow = {
  id: string;
  name: string;
  description: string | null;
  cronExpr: string;
  taskType: string;
  agentId: string | null;
  config: string;
  status: string;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  lastResult: string | null;
  runCount: number;
  failCount: number;
  retryPolicy: string;
  dependencies: string;
  createdAt: Date;
  updatedAt: Date;
};

type AgentWorkerRow = {
  id: string;
  name: string;
  agentId: string;
  status: string;
  currentTask: string | null;
  pid: number | null;
  lastHeartbeat: Date | null;
  totalTasks: number;
  successCount: number;
  errorCount: number;
  config: string;
  createdAt: Date;
  updatedAt: Date;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJsonSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isKnownError(err: unknown): err is Error {
  return err instanceof Error;
}

function errorMessage(err: unknown): string {
  if (isKnownError(err)) return err.message;
  return String(err);
}

/**
 * Call the internal Gemini chat API and return the accumulated text response.
 * Handles SSE streaming transparently.
 */
async function callChatAPI(
  prompt: string,
  agentId?: string | null,
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<string> {
  const chatUrl = `${getBaseUrl()}/api/gemini/chat`;

  const res = await fetch(chatUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      model: "gemini-2.5-flash",
      agentId: agentId || undefined,
      conversationHistory,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Chat API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body from chat API");

  const decoder = new TextDecoder();
  let accumulated = "";
  let streamError: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "chunk") {
            accumulated += data.content || "";
          } else if (data.type === "error") {
            streamError = data.error;
          }
        } catch {
          // Ignore malformed SSE lines
        }
      }
    }
  }

  if (streamError) throw new Error(streamError);
  return accumulated;
}

/**
 * Execute a shell command safely, returning stdout or throwing on non-zero exit.
 */
function execSafe(cmd: string, timeoutMs = 30_000): string {
  return execSync(cmd, {
    encoding: "utf-8",
    timeout: timeoutMs,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

// ---------------------------------------------------------------------------
// CronEngine
// ---------------------------------------------------------------------------

const globalForCron = globalThis as unknown as {
  __cronEngine: CronEngine | undefined;
};

class CronEngine {
  private timers: Map<string, ReturnType<typeof cron.schedule>> = new Map();
  private workers: Map<string, AgentWorkerRow> = new Map();
  private workerLoops: Map<string, ReturnType<typeof setInterval>> = new Map();
  private started = false;

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Start the cron engine – loads all active tasks from the database and
   * schedules them. Also resumes any previously running workers.
   */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    try {
      const tasks = await db.cronTask.findMany({
        where: { status: "active" },
      });

      for (const task of tasks) {
        this.scheduleTask(task as unknown as CronTaskRow);
      }

      // Resume workers that were running before restart
      const activeWorkers = await db.agentWorker.findMany({
        where: { status: { in: ["running", "idle"] } },
      });

      for (const w of activeWorkers) {
        this.workers.set(w.id, w as unknown as AgentWorkerRow);
        // Only auto-start workers that were in "running" state
        if (w.status === "running") {
          this.startWorkerLoop(w.id).catch(() => {
            /* graceful degradation */
          });
        }
      }

      console.log(
        `[CronEngine] Started – ${tasks.length} task(s) scheduled, ${activeWorkers.length} worker(s) loaded`
      );
    } catch (err: unknown) {
      console.error("[CronEngine] Failed to start:", errorMessage(err));
    }
  }

  /**
   * Stop the cron engine – destroys all scheduled timers and worker loops.
   */
  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;

    for (const [id, timer] of this.timers) {
      try {
        timer.stop();
      } catch {
        /* noop */
      }
      this.timers.delete(id);
    }

    for (const [id, loop] of this.workerLoops) {
      clearInterval(loop);
      this.workerLoops.delete(id);
    }

    // Mark all running workers as stopped
    for (const [id] of this.workers) {
      try {
        await db.agentWorker.update({
          where: { id },
          data: { status: "stopped", currentTask: null },
        });
      } catch {
        /* graceful degradation */
      }
    }
    this.workers.clear();

    console.log("[CronEngine] Stopped");
  }

  // -----------------------------------------------------------------------
  // Task CRUD
  // -----------------------------------------------------------------------

  async createTask(params: {
    name: string;
    description?: string;
    cronExpr: string;
    taskType: string;
    agentId?: string;
    config?: Record<string, unknown>;
    retryPolicy?: { maxRetries?: number; backoffMs?: number };
    dependencies?: string[];
  }): Promise<CronTaskRow> {
    // Validate cron expression
    if (!cron.validate(params.cronExpr)) {
      throw new Error(`Invalid cron expression: "${params.cronExpr}"`);
    }

    const retry: RetryPolicy = {
      maxRetries: params.retryPolicy?.maxRetries ?? 3,
      backoffMs: params.retryPolicy?.backoffMs ?? 1000,
    };

    const deps = params.dependencies ?? [];

    const nextRun = this.computeNextRun(params.cronExpr);

    const task = await db.cronTask.create({
      data: {
        name: params.name,
        description: params.description ?? null,
        cronExpr: params.cronExpr,
        taskType: params.taskType,
        agentId: params.agentId ?? null,
        config: JSON.stringify(params.config ?? {}),
        status: "active",
        nextRunAt: nextRun,
        retryPolicy: JSON.stringify(retry),
        dependencies: JSON.stringify(deps),
      },
    });

    this.scheduleTask(task as unknown as CronTaskRow);

    return task as unknown as CronTaskRow;
  }

  async updateTask(
    id: string,
    data: Partial<CronTaskRow>
  ): Promise<CronTaskRow> {
    // If cronExpr is being updated, validate it
    if (data.cronExpr && !cron.validate(data.cronExpr)) {
      throw new Error(`Invalid cron expression: "${data.cronExpr}"`);
    }

    // Build update payload – only allow specific fields
    const updateData: Record<string, unknown> = {};

    const allowedFields = [
      "name",
      "description",
      "cronExpr",
      "taskType",
      "agentId",
      "config",
      "status",
      "retryPolicy",
      "dependencies",
    ] as const;

    for (const field of allowedFields) {
      if (field in data) {
        updateData[field] = (data as Record<string, unknown>)[field];
      }
    }

    // If cronExpr changed, recalculate nextRunAt
    if (data.cronExpr) {
      updateData.nextRunAt = this.computeNextRun(data.cronExpr);
    }

    const task = await db.cronTask.update({
      where: { id },
      data: updateData,
    });

    // Reschedule if active
    this.unscheduleTask(id);
    if (task.status === "active") {
      this.scheduleTask(task as unknown as CronTaskRow);
    }

    return task as unknown as CronTaskRow;
  }

  async deleteTask(id: string): Promise<void> {
    this.unscheduleTask(id);
    await db.cronTask.delete({ where: { id } });
  }

  async pauseTask(id: string): Promise<void> {
    this.unscheduleTask(id);
    await db.cronTask.update({
      where: { id },
      data: { status: "paused" },
    });
  }

  async resumeTask(id: string): Promise<void> {
    const task = await db.cronTask.update({
      where: { id },
      data: {
        status: "active",
        nextRunAt: this.computeNextRun(
          (
            await db.cronTask.findUnique({ where: { id } })
          )?.cronExpr ?? "* * * * *"
        ),
      },
    });
    this.scheduleTask(task as unknown as CronTaskRow);
  }

  // -----------------------------------------------------------------------
  // Task Execution
  // -----------------------------------------------------------------------

  /**
   * Execute a task immediately, regardless of its schedule.
   */
  async executeTask(id: string): Promise<TaskExecutionResult> {
    const task = await db.cronTask.findUnique({ where: { id } });
    if (!task) throw new Error(`Task not found: ${id}`);

    // Check dependencies before execution
    const depsMet = await this.checkDependencies(id);
    if (!depsMet) {
      return {
        success: false,
        output: "Blocked: one or more dependency tasks have not completed successfully since last run",
        duration: 0,
      };
    }

    const retryPolicy: RetryPolicy = parseJsonSafe<RetryPolicy>(
      task.retryPolicy,
      { maxRetries: 3, backoffMs: 1000 }
    );

    let lastResult: TaskExecutionResult = {
      success: false,
      output: "",
      duration: 0,
    };

    for (let attempt = 0; attempt <= retryPolicy.maxRetries; attempt++) {
      const startTime = Date.now();

      try {
        lastResult = await this.runTaskByType(
          task as unknown as CronTaskRow
        );
        lastResult.duration = Date.now() - startTime;

        if (lastResult.success) {
          break;
        }
      } catch (err: unknown) {
        lastResult = {
          success: false,
          output: errorMessage(err),
          duration: Date.now() - startTime,
        };
      }

      // Retry with exponential backoff (skip on last attempt)
      if (attempt < retryPolicy.maxRetries) {
        const backoff =
          retryPolicy.backoffMs * Math.pow(2, attempt);
        await this.sleep(backoff);
      }
    }

    // Persist result
    await db.cronTask.update({
      where: { id },
      data: {
        lastRunAt: new Date(),
        nextRunAt: this.computeNextRun(task.cronExpr),
        lastResult: JSON.stringify(lastResult),
        runCount: { increment: 1 },
        failCount: lastResult.success ? undefined : { increment: 1 },
        status: lastResult.success ? task.status : "error",
      },
    });

    return lastResult;
  }

  // -----------------------------------------------------------------------
  // Worker Management
  // -----------------------------------------------------------------------

  async registerWorker(params: {
    name: string;
    agentId: string;
    config?: Record<string, unknown>;
  }): Promise<AgentWorkerRow> {
    const worker = await db.agentWorker.create({
      data: {
        name: params.name,
        agentId: params.agentId,
        status: "idle",
        config: JSON.stringify(params.config ?? {}),
        lastHeartbeat: new Date(),
      },
    });

    this.workers.set(worker.id, worker as unknown as AgentWorkerRow);
    return worker as unknown as AgentWorkerRow;
  }

  async startWorker(workerId: string): Promise<void> {
    const worker = await db.agentWorker.findUnique({ where: { id: workerId } });
    if (!worker) throw new Error(`Worker not found: ${workerId}`);

    await db.agentWorker.update({
      where: { id: workerId },
      data: {
        status: "running",
        pid: process.pid,
        lastHeartbeat: new Date(),
      },
    });

    this.workers.set(
      workerId,
      (await db.agentWorker.findUnique({
        where: { id: workerId },
      })) as unknown as AgentWorkerRow
    );

    await this.startWorkerLoop(workerId);
  }

  async stopWorker(workerId: string): Promise<void> {
    const loop = this.workerLoops.get(workerId);
    if (loop) {
      clearInterval(loop);
      this.workerLoops.delete(workerId);
    }

    await db.agentWorker.update({
      where: { id: workerId },
      data: { status: "stopped", currentTask: null },
    });

    this.workers.delete(workerId);
  }

  async heartbeat(workerId: string): Promise<void> {
    await db.agentWorker.update({
      where: { id: workerId },
      data: { lastHeartbeat: new Date() },
    });
  }

  async getActiveWorkers(): Promise<AgentWorkerRow[]> {
    const workers = await db.agentWorker.findMany({
      where: { status: { in: ["running", "idle", "waiting"] } },
    });
    return workers as unknown as AgentWorkerRow[];
  }

  // -----------------------------------------------------------------------
  // Query helpers
  // -----------------------------------------------------------------------

  async getAllTasks(): Promise<CronTaskRow[]> {
    const tasks = await db.cronTask.findMany({
      orderBy: { createdAt: "desc" },
    });
    return tasks as unknown as CronTaskRow[];
  }

  async getTaskHistory(
    taskId: string
  ): Promise<TaskHistoryEntry[]> {
    const task = await db.cronTask.findUnique({ where: { id: taskId } });
    if (!task) return [];

    // The lastResult field stores the most recent execution result
    const history: TaskHistoryEntry[] = [];

    // Current result
    const lastResult = parseJsonSafe<TaskExecutionResult | null>(
      task.lastResult,
      null
    );
    if (lastResult && task.lastRunAt) {
      history.push({
        ranAt: task.lastRunAt.toISOString(),
        result: lastResult,
        duration: lastResult.duration,
      });
    }

    // Attempt to load additional history from the config field
    // (some tasks may store extended history there)
    const config = parseJsonSafe<Record<string, unknown>>(task.config, {});
    if (Array.isArray(config._history)) {
      for (const entry of config._history as TaskHistoryEntry[]) {
        history.push(entry);
      }
    }

    return history.sort(
      (a, b) => new Date(b.ranAt).getTime() - new Date(a.ranAt).getTime()
    );
  }

  // -----------------------------------------------------------------------
  // Repository Monitor
  // -----------------------------------------------------------------------

  async monitorRepository(
    repoUrl: string,
    branch?: string
  ): Promise<Array<{ type: string; data: unknown }>> {
    const results: Array<{ type: string; data: unknown }> = [];
    const targetBranch = branch ?? "main";

    try {
      // Clone or pull the repository to a temp directory
      const tmpDir = `/tmp/cron-repo-monitor-${Date.now()}`;
      let gitDir = tmpDir;

      try {
        execSafe(`git clone --depth 50 --branch ${targetBranch} --single-branch ${repoUrl} ${tmpDir}`, 60_000);
      } catch {
        // If clone fails (e.g. already exists), try to pull
        try {
          execSafe(`git -C ${tmpDir} fetch origin ${targetBranch}`, 30_000);
          execSafe(`git -C ${tmpDir} checkout ${targetBranch}`, 10_000);
        } catch {
          // Graceful degradation – return what we can
          results.push({
            type: "error",
            data: { message: "Failed to clone or fetch repository" },
          });
          return results;
        }
      }

      // Recent commits
      try {
        const logOutput = execSafe(
          `git -C ${gitDir} log --oneline -10 --format='{"hash":"%h","subject":"%s","author":"%an","date":"%ci"}'`,
          10_000
        );
        const commits = logOutput
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return { raw: line };
            }
          });
        results.push({ type: "recent_commits", data: commits });
      } catch (err: unknown) {
        results.push({
          type: "commits_error",
          data: { message: errorMessage(err) },
        });
      }

      // Changed files in the last commit
      try {
        const diffOutput = execSafe(
          `git -C ${gitDir} diff-tree --no-commit-id --name-status -r HEAD`,
          10_000
        );
        const changes = diffOutput
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const parts = line.split("\t");
            return { status: parts[0], file: parts[1] ?? parts[0] };
          });
        results.push({ type: "changed_files", data: changes });
      } catch (err: unknown) {
        results.push({
          type: "diff_error",
          data: { message: errorMessage(err) },
        });
      }

      // Open issues (if GitHub)
      if (repoUrl.includes("github.com")) {
        try {
          const repoPath = repoUrl
            .replace(/\.git$/, "")
            .replace("https://github.com/", "")
            .replace("http://github.com/", "");
          const issuesOutput = execSafe(
            `curl -s "https://api.github.com/repos/${repoPath}/issues?state=open&per_page=10"`,
            15_000
          );
          const issues = JSON.parse(issuesOutput);
          if (Array.isArray(issues)) {
            results.push({
              type: "open_issues",
              data: issues.map((i: Record<string, unknown>) => ({
                number: i.number,
                title: i.title,
                state: i.state,
                created_at: i.created_at,
              })),
            });
          }
        } catch {
          // Non-critical, skip
        }
      }
    } catch (err: unknown) {
      results.push({
        type: "monitor_error",
        data: { message: errorMessage(err) },
      });
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // Self-Heal Check
  // -----------------------------------------------------------------------

  async selfHealCheck(): Promise<{
    issues: string[];
    fixed: string[];
  }> {
    const issues: string[] = [];
    const fixed: string[] = [];

    // 1. Check /api/health
    try {
      const healthRes = await fetch(`${getBaseUrl()}/api/health`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!healthRes.ok) {
        issues.push(`/api/health returned status ${healthRes.status}`);
      }
    } catch (err: unknown) {
      issues.push(`/api/health unreachable: ${errorMessage(err)}`);
    }

    // 2. Check /api/doctor
    try {
      const doctorRes = await fetch(`${getBaseUrl()}/api/doctor`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!doctorRes.ok) {
        issues.push(`/api/doctor returned status ${doctorRes.status}`);
      } else {
        const body = (await doctorRes.json()) as {
          summary?: { errors?: number; warnings?: number };
          checks?: Array<{ name: string; status: string; message: string }>;
        };
        const errorChecks = (body.checks ?? []).filter(
          (c) => c.status === "error"
        );
        for (const ec of errorChecks) {
          issues.push(`Doctor [${ec.name}]: ${ec.message}`);
        }
      }
    } catch (err: unknown) {
      issues.push(`/api/doctor unreachable: ${errorMessage(err)}`);
    }

    // 3. Check database connectivity
    try {
      await db.$queryRaw`SELECT 1`;
    } catch (err: unknown) {
      issues.push(`Database connectivity issue: ${errorMessage(err)}`);
      // Attempt to reconnect
      try {
        await db.$disconnect();
        await db.$connect();
        fixed.push("Database reconnected after connectivity failure");
      } catch {
        issues.push("Database reconnection attempt failed");
      }
    }

    // 4. Check disk space
    try {
      const fs = await import("fs");
      const path = await import("path");
      const cwd = process.cwd();

      // Try statfs (Linux/macOS)
      if (typeof (fs as unknown as Record<string, unknown>).statfsSync === "function") {
        const stats = (fs as unknown as { statfsSync: (p: string) => { bfree: number; blocks: number; bsize: number } }).statfsSync(cwd);
        const freePercent = stats.blocks > 0 ? (stats.bfree / stats.blocks) * 100 : 100;
        if (freePercent < 10) {
          issues.push(`Low disk space: ${freePercent.toFixed(1)}% free`);
        }
      } else {
        // Fallback: check if we can write a temp file
        const tmpFile = path.join(cwd, `.disk-check-${Date.now()}`);
        try {
          (fs as unknown as { writeFileSync: (p: string, d: string) => void }).writeFileSync(tmpFile, "ok");
          (fs as unknown as { unlinkSync: (p: string) => void }).unlinkSync(tmpFile);
        } catch (err: unknown) {
          issues.push(`Disk write check failed: ${errorMessage(err)}`);
        }
      }
    } catch (err: unknown) {
      issues.push(`Disk space check error: ${errorMessage(err)}`);
    }

    // 5. Check for stalled cron tasks (active but not run for > 24h)
    try {
      const stalledTasks = await db.cronTask.findMany({
        where: {
          status: "active",
          lastRunAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      if (stalledTasks.length > 0) {
        for (const t of stalledTasks) {
          issues.push(
            `Task "${t.name}" (${t.id}) has not run in >24h – last run: ${t.lastRunAt?.toISOString() ?? "never"}`
          );
        }
      }
    } catch {
      /* Non-critical */
    }

    // 6. Check for dead workers (no heartbeat for >5 min but still "running")
    try {
      const deadThreshold = new Date(Date.now() - 5 * 60 * 1000);
      const deadWorkers = await db.agentWorker.findMany({
        where: {
          status: "running",
          lastHeartbeat: { lt: deadThreshold },
        },
      });
      for (const w of deadWorkers) {
        issues.push(
          `Worker "${w.name}" (${w.id}) has no heartbeat since ${w.lastHeartbeat?.toISOString() ?? "never"}`
        );
        // Auto-fix: mark as stopped
        await db.agentWorker.update({
          where: { id: w.id },
          data: { status: "stopped", currentTask: null },
        });
        this.workers.delete(w.id);
        const loop = this.workerLoops.get(w.id);
        if (loop) {
          clearInterval(loop);
          this.workerLoops.delete(w.id);
        }
        fixed.push(`Worker "${w.name}" marked as stopped (no heartbeat)`);
      }
    } catch {
      /* Non-critical */
    }

    return { issues, fixed };
  }

  // -----------------------------------------------------------------------
  // Internal – Scheduling
  // -----------------------------------------------------------------------

  private scheduleTask(task: CronTaskRow): void {
    // Remove any existing schedule for this task
    this.unscheduleTask(task.id);

    if (task.status !== "active") return;

    // Validate the cron expression
    if (!cron.validate(task.cronExpr)) {
      console.warn(
        `[CronEngine] Invalid cron expression for task "${task.name}" (${task.id}): ${task.cronExpr}`
      );
      return;
    }

    const timer = cron.schedule(task.cronExpr, () => {
      this.executeTask(task.id).catch((err: unknown) => {
        console.error(
          `[CronEngine] Error executing task "${task.name}" (${task.id}):`,
          errorMessage(err)
        );
      });
    });

    this.timers.set(task.id, timer);
  }

  private unscheduleTask(taskId: string): void {
    const timer = this.timers.get(taskId);
    if (timer) {
      try {
        timer.stop();
      } catch {
        /* noop */
      }
      this.timers.delete(taskId);
    }
  }

  // -----------------------------------------------------------------------
  // Internal – Task Execution by Type
  // -----------------------------------------------------------------------

  private async runTaskByType(
    task: CronTaskRow
  ): Promise<TaskExecutionResult> {
    const config = parseJsonSafe<Record<string, unknown>>(task.config, {});

    switch (task.taskType) {
      case "agent_run":
        return this.executeAgentRun(task, config);

      case "repo_monitor":
        return this.executeRepoMonitor(task, config);

      case "health_check":
        return this.executeHealthCheck(task, config);

      case "auto_deploy":
        return this.executeAutoDeploy(task, config);

      case "issue_resolve":
        return this.executeIssueResolve(task, config);

      case "custom":
        return this.executeCustom(task, config);

      default:
        return {
          success: false,
          output: `Unknown task type: "${task.taskType}"`,
          duration: 0,
        };
    }
  }

  /**
   * agent_run: Call the internal chat API with the agent's system prompt + task config.
   */
  private async executeAgentRun(
    task: CronTaskRow,
    config: Record<string, unknown>
  ): Promise<TaskExecutionResult> {
    const prompt =
      (config.prompt as string) ??
      task.description ??
      `Execute scheduled task: ${task.name}`;

    // If agentId is set, look up the agent's system prompt
    let systemContext = "";
    if (task.agentId) {
      try {
        const agent = await db.agent.findUnique({
          where: { id: task.agentId },
        });
        if (agent?.systemPrompt) {
          systemContext = agent.systemPrompt;
        }
      } catch {
        /* graceful */
      }
    }

    const fullPrompt = systemContext
      ? `[System Context]: ${systemContext}\n\n[Task]: ${prompt}`
      : prompt;

    const output = await callChatAPI(fullPrompt, task.agentId ?? undefined);

    return {
      success: true,
      output: output.slice(0, 5000),
      duration: 0, // will be set by caller
    };
  }

  /**
   * repo_monitor: Check git repo for changes.
   */
  private async executeRepoMonitor(
    task: CronTaskRow,
    config: Record<string, unknown>
  ): Promise<TaskExecutionResult> {
    const repoUrl = config.repoUrl as string;
    const branch = config.branch as string | undefined;

    if (!repoUrl) {
      return {
        success: false,
        output: "repo_monitor requires config.repoUrl",
        duration: 0,
      };
    }

    const results = await this.monitorRepository(repoUrl, branch);
    const summary = results
      .map((r) => `${r.type}: ${JSON.stringify(r.data).slice(0, 300)}`)
      .join("\n");

    return {
      success: true,
      output: summary.slice(0, 5000),
      duration: 0,
    };
  }

  /**
   * health_check: Ping critical API endpoints.
   */
  private async executeHealthCheck(
    _task: CronTaskRow,
    config: Record<string, unknown>
  ): Promise<TaskExecutionResult> {
    const defaultEndpoints = [
      "/api/health",
      "/api/doctor",
      "/api/models",
      "/api/agents",
    ];
    const endpoints: string[] =
      (config.endpoints as string[]) ?? defaultEndpoints;

    const results: Array<{ endpoint: string; ok: boolean; status?: number; error?: string }> = [];

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(`${getBaseUrl()}${endpoint}`, {
          signal: AbortSignal.timeout(10_000),
        });
        results.push({
          endpoint,
          ok: res.ok,
          status: res.status,
        });
      } catch (err: unknown) {
        results.push({
          endpoint,
          ok: false,
          error: errorMessage(err),
        });
      }
    }

    const allOk = results.every((r) => r.ok);
    const output = results
      .map((r) =>
        r.ok
          ? `✓ ${r.endpoint} (${r.status})`
          : `✗ ${r.endpoint} ${r.error ?? `status ${r.status}`}`
      )
      .join("\n");

    return {
      success: allOk,
      output,
      duration: 0,
    };
  }

  /**
   * auto_deploy: Trigger deployment pipeline.
   */
  private async executeAutoDeploy(
    task: CronTaskRow,
    config: Record<string, unknown>
  ): Promise<TaskExecutionResult> {
    const envId = config.environmentId as string | undefined;
    const projectPath = config.projectPath as string | undefined;

    if (!projectPath) {
      return {
        success: false,
        output: "auto_deploy requires config.projectPath",
        duration: 0,
      };
    }

    const steps: string[] = [];
    let hasError = false;

    // Step 1: Pull latest changes
    try {
      const pullOutput = execSafe(
        `git -C ${projectPath} pull origin main`,
        60_000
      );
      steps.push(`git pull: ${pullOutput.slice(0, 200)}`);
    } catch (err: unknown) {
      steps.push(`git pull failed: ${errorMessage(err)}`);
      hasError = true;
    }

    // Step 2: Install dependencies
    if (!hasError) {
      try {
        const installOutput = execSafe(
          `cd ${projectPath} && npm install --production`,
          120_000
        );
        steps.push(`npm install: ${installOutput.slice(0, 200)}`);
      } catch (err: unknown) {
        steps.push(`npm install failed: ${errorMessage(err)}`);
        hasError = true;
      }
    }

    // Step 3: Build (if applicable)
    if (!hasError && config.buildCommand) {
      try {
        const buildOutput = execSafe(
          `cd ${projectPath} && ${config.buildCommand}`,
          120_000
        );
        steps.push(`build: ${buildOutput.slice(0, 200)}`);
      } catch (err: unknown) {
        steps.push(`build failed: ${errorMessage(err)}`);
        hasError = true;
      }
    }

    // Step 4: Update deployment record
    if (envId && !hasError) {
      try {
        await db.deployEnvironment.update({
          where: { id: envId },
          data: {
            lastDeploy: new Date(),
            deployCount: { increment: 1 },
            status: "running",
          },
        });
        steps.push("Deployment record updated");
      } catch (err: unknown) {
        steps.push(`Failed to update deployment record: ${errorMessage(err)}`);
      }
    }

    return {
      success: !hasError,
      output: steps.join("\n"),
      duration: 0,
    };
  }

  /**
   * issue_resolve: Create an IssuePipeline entry.
   */
  private async executeIssueResolve(
    task: CronTaskRow,
    config: Record<string, unknown>
  ): Promise<TaskExecutionResult> {
    const issueUrl = config.issueUrl as string | undefined;
    const issueTitle = (config.issueTitle as string) ?? task.name;
    const issueBody = (config.issueBody as string) ?? task.description ?? "";
    const repoUrl = config.repoUrl as string | undefined;

    try {
      const pipeline = await db.issuePipeline.create({
        data: {
          issueUrl: issueUrl ?? null,
          issueTitle,
          issueBody,
          repoUrl: repoUrl ?? null,
          status: "planning",
        },
      });

      return {
        success: true,
        output: `Issue pipeline created: ${pipeline.id} for "${issueTitle}"`,
        duration: 0,
      };
    } catch (err: unknown) {
      return {
        success: false,
        output: `Failed to create issue pipeline: ${errorMessage(err)}`,
        duration: 0,
      };
    }
  }

  /**
   * custom: Execute config.command via child_process.
   */
  private executeCustom(
    _task: CronTaskRow,
    config: Record<string, unknown>
  ): TaskExecutionResult {
    const command = config.command as string | undefined;
    if (!command) {
      return {
        success: false,
        output: "custom task requires config.command",
        duration: 0,
      };
    }

    const timeoutMs = (config.timeoutMs as number) ?? 30_000;

    try {
      const output = execSafe(command, timeoutMs);
      return {
        success: true,
        output: output.slice(0, 5000),
        duration: 0,
      };
    } catch (err: unknown) {
      return {
        success: false,
        output: `Command failed: ${errorMessage(err)}`,
        duration: 0,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Internal – Dependency Checking
  // -----------------------------------------------------------------------

  /**
   * Check that all dependency tasks have completed successfully since the
   * current task's last run. If the task has never run, all dependencies
   * must have run at least once.
   */
  private async checkDependencies(taskId: string): Promise<boolean> {
    const task = await db.cronTask.findUnique({ where: { id: taskId } });
    if (!task) return false;

    const deps: string[] = parseJsonSafe<string[]>(task.dependencies, []);
    if (deps.length === 0) return true;

    const lastRunAt = task.lastRunAt;

    for (const depId of deps) {
      const dep = await db.cronTask.findUnique({ where: { id: depId } });
      if (!dep) {
        // Dependency doesn't exist – block
        return false;
      }

      // If dependency has never run, block
      if (!dep.lastRunAt) {
        return false;
      }

      // If this task has run before, the dependency must have run AFTER
      // this task's last run (i.e. the dependency is "fresh")
      if (lastRunAt && dep.lastRunAt <= lastRunAt) {
        return false;
      }

      // Check that the dependency's last result was successful
      const depResult = parseJsonSafe<TaskExecutionResult | null>(
        dep.lastResult,
        null
      );
      if (depResult && !depResult.success) {
        return false;
      }
    }

    return true;
  }

  // -----------------------------------------------------------------------
  // Internal – Worker Loop
  // -----------------------------------------------------------------------

  private async startWorkerLoop(workerId: string): Promise<void> {
    const worker = await db.agentWorker.findUnique({
      where: { id: workerId },
    });
    if (!worker) return;

    const config: WorkerConfig = parseJsonSafe<WorkerConfig>(worker.config, {});
    const pollIntervalMs = config.pollIntervalMs ?? 5_000;

    const loop = setInterval(async () => {
      try {
        // Update heartbeat
        await this.heartbeat(workerId);

        // Look for pending tasks assigned to this worker's agent
        const pendingTasks = await db.cronTask.findMany({
          where: {
            agentId: worker.agentId,
            status: "active",
            nextRunAt: { lte: new Date() },
          },
          orderBy: { nextRunAt: "asc" },
          take: 1,
        });

        if (pendingTasks.length === 0) {
          // No work – update status to idle
          if (this.workers.has(workerId)) {
            const currentWorker = this.workers.get(workerId)!;
            if (currentWorker.status !== "idle") {
              await db.agentWorker.update({
                where: { id: workerId },
                data: { status: "idle", currentTask: null },
              });
              this.workers.set(workerId, {
                ...currentWorker,
                status: "idle",
                currentTask: null,
              });
            }
          }
          return;
        }

        const task = pendingTasks[0];

        // Update worker status
        await db.agentWorker.update({
          where: { id: workerId },
          data: {
            status: "running",
            currentTask: `Executing: ${task.name}`,
          },
        });

        // Execute the task
        const result = await this.executeTask(task.id);

        // Update worker counters
        await db.agentWorker.update({
          where: { id: workerId },
          data: {
            totalTasks: { increment: 1 },
            successCount: result.success ? { increment: 1 } : undefined,
            errorCount: result.success ? undefined : { increment: 1 },
            currentTask: null,
          },
        });
      } catch (err: unknown) {
        console.error(
          `[CronEngine] Worker loop error for ${workerId}:`,
          errorMessage(err)
        );
      }
    }, pollIntervalMs);

    this.workerLoops.set(workerId, loop);
  }

  // -----------------------------------------------------------------------
  // Internal – Utilities
  // -----------------------------------------------------------------------

  private computeNextRun(cronExpr: string): Date {
    try {
      // node-cron doesn't expose a "next run" calculator directly,
      // so we compute a rough estimate based on common patterns.
      // For precise calculation, we could use a library like `cron-parser`,
      // but this keeps the dependency footprint minimal.
      const now = new Date();

      // Attempt to parse common cron patterns and compute next run
      const parts = cronExpr.trim().split(/\s+/);

      // Standard 5-field cron
      if (parts.length === 5) {
        const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

        // Every N minutes pattern: */N * * * *
        const everyNMin = minute.match(/^\*\/(\d+)$/);
        if (everyNMin) {
          const n = parseInt(everyNMin[1], 10);
          return new Date(now.getTime() + n * 60 * 1000);
        }

        // Every minute: * * * * *
        if (minute === "*") {
          return new Date(now.getTime() + 60_000);
        }

        // Specific minute every hour: N * * * *
        if (/^\d+$/.test(minute) && hour === "*") {
          const targetMin = parseInt(minute, 10);
          const next = new Date(now);
          next.setMinutes(targetMin, 0, 0);
          if (next <= now) next.setHours(next.getHours() + 1);
          return next;
        }

        // Specific hour and minute: N M * * *
        if (/^\d+$/.test(minute) && /^\d+$/.test(hour)) {
          const targetMin = parseInt(minute, 10);
          const targetHour = parseInt(hour, 10);
          const next = new Date(now);
          next.setHours(targetHour, targetMin, 0, 0);
          if (next <= now) next.setDate(next.getDate() + 1);
          return next;
        }
      }

      // Fallback: 1 minute from now
      return new Date(now.getTime() + 60_000);
    } catch {
      return new Date(Date.now() + 60_000);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ---------------------------------------------------------------------------
// Singleton Export
// ---------------------------------------------------------------------------

export function getCronEngine(): CronEngine {
  if (!globalForCron.__cronEngine) {
    globalForCron.__cronEngine = new CronEngine();
  }
  return globalForCron.__cronEngine;
}

export { CronEngine };
export type { TaskExecutionResult, TaskHistoryEntry, RetryPolicy, CronTaskRow, AgentWorkerRow };
