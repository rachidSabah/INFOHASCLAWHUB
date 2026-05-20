export interface AgentRunConfig {
  model?: string;
  maxIterations?: number;
  autonomyLevel?: "supervised" | "semi" | "full";
  workspacePath?: string;
}

export interface AgentRunStatus {
  id: string;
  agentId: string;
  task: string;
  status: "running" | "paused" | "completed" | "failed";
  startTime: string;
  endTime?: string;
  iterations: number;
  maxIterations: number;
  currentStep?: string;
  config: AgentRunConfig;
  logs: AgentLog[];
  result?: string;
}

export interface AgentLog {
  timestamp: string;
  type: "plan" | "execute" | "observe" | "replan" | "error" | "info" | "complete";
  content: string;
  iteration: number;
}

interface Plan {
  overview: string;
  steps: string[];
}

function logTime() {
  return new Date().toISOString();
}

async function callChatAPI(
  prompt: string,
  model: string,
  agentId: string | null,
  workspacePath: string | undefined,
  signal?: AbortSignal
): Promise<string> {
  const chatUrl = "http://localhost:3000/api/gemini/chat";

  const res = await fetch(chatUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      model,
      agentId: agentId || undefined,
      conversationHistory: [],
      workspacePath: workspacePath || "",
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Chat API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body from chat API");

  const decoder = new TextDecoder();
  let accumulated = "";
  let error: string | undefined;

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
            error = data.error;
          }
        } catch {}
      }
    }
  }

  if (error) throw new Error(error);
  return accumulated;
}

function parsePlan(text: string): Plan {
  const steps: string[] = [];
  const overview = text;

  const numberedRegex = /^\s*(?:\d+[\.\)]\s*|[-*]\s*|Step\s*\d+\s*[:\-]\s*)(.+)$/gm;
  let match;
  while ((match = numberedRegex.exec(text)) !== null) {
    steps.push(match[1].trim());
  }

  if (steps.length === 0) {
    const lines = text.split("\n").filter(l => l.trim().length > 10);
    const planSectionIdx = lines.findIndex(l =>
      l.toLowerCase().includes("plan") || l.toLowerCase().includes("step")
    );
    if (planSectionIdx >= 0) {
      for (let i = planSectionIdx + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length > 0 && line.length < 300) {
          steps.push(line.replace(/^[-*\d.]+\s*/, ""));
        }
      }
    }
  }

  if (steps.length === 0) {
    steps.push("Execute the task as described");
  }

  return { overview, steps: steps.slice(0, 10) };
}

async function queryLLMForStructuredTask(
  prompt: string,
  model: string,
  agentId: string | null,
  workspacePath: string | undefined
): Promise<string> {
  return callChatAPI(prompt, model, agentId, workspacePath);
}

const globalRunner = globalThis as unknown as { __agentRunner?: AgentRunner };

export class AgentRunner {
  private runs: Map<string, AgentRunStatus> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();

  static getInstance(): AgentRunner {
    if (!globalRunner.__agentRunner) {
      globalRunner.__agentRunner = new AgentRunner();
    }
    return globalRunner.__agentRunner;
  }

  start(agentId: string, task: string, config: AgentRunConfig = {}): string {
    const runId = crypto.randomUUID();
    const maxIter = config.maxIterations || 10;
    const model = config.model || "gemini-2.5-flash";

    const run: AgentRunStatus = {
      id: runId,
      agentId,
      task,
      status: "running",
      startTime: logTime(),
      iterations: 0,
      maxIterations: maxIter,
      config: { ...config, model, maxIterations: maxIter },
      logs: [],
    };

    this.runs.set(runId, run);

    const controller = new AbortController();
    this.abortControllers.set(runId, controller);

    this.executeLoop(runId, controller.signal).catch((err) => {
      const r = this.runs.get(runId);
      if (r && r.status === "running") {
        r.status = "failed";
        r.endTime = logTime();
        r.logs.push({
          timestamp: logTime(),
          type: "error",
          content: `Agent execution failed: ${err instanceof Error ? err.message : String(err)}`,
          iteration: r.iterations,
        });
      }
    });

    return runId;
  }

  stop(runId: string): void {
    const controller = this.abortControllers.get(runId);
    if (controller) controller.abort();
    const run = this.runs.get(runId);
    if (run && (run.status === "running" || run.status === "paused")) {
      run.status = "failed";
      run.endTime = logTime();
      run.logs.push({
        timestamp: logTime(),
        type: "info",
        content: "Run stopped by user",
        iteration: run.iterations,
      });
    }
  }

  pause(runId: string): void {
    const run = this.runs.get(runId);
    if (run && run.status === "running") {
      run.status = "paused";
      run.logs.push({
        timestamp: logTime(),
        type: "info",
        content: "Run paused by user",
        iteration: run.iterations,
      });
    }
  }

  resume(runId: string): void {
    const run = this.runs.get(runId);
    if (run && run.status === "paused") {
      run.status = "running";
      run.logs.push({
        timestamp: logTime(),
        type: "info",
        content: "Run resumed by user",
        iteration: run.iterations,
      });
      const controller = new AbortController();
      this.abortControllers.set(runId, controller);
      this.executeLoop(runId, controller.signal).catch((err) => {
        const r = this.runs.get(runId);
        if (r && r.status === "running") {
          r.status = "failed";
          r.endTime = logTime();
          r.logs.push({
            timestamp: logTime(),
            type: "error",
            content: `Agent execution failed: ${err instanceof Error ? err.message : String(err)}`,
            iteration: r.iterations,
          });
        }
      });
    }
  }

  getStatus(runId: string): AgentRunStatus | undefined {
    return this.runs.get(runId);
  }

  getLogs(runId: string): AgentLog[] | undefined {
    return this.runs.get(runId)?.logs;
  }

  getAllRuns(): AgentRunStatus[] {
    return Array.from(this.runs.values()).sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
  }

  deleteRun(runId: string): boolean {
    this.abortControllers.delete(runId);
    return this.runs.delete(runId);
  }

  private async executeLoop(runId: string, signal: AbortSignal): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;

    const { agentId, task, config } = run;
    const model = config.model || "gemini-2.5-flash";
    const maxIter = config.maxIterations || 10;
    const workspacePath = config.workspacePath;
    const autonomy = config.autonomyLevel || "semi";

    // --- PHASE 1: PLAN ---
    run.currentStep = "Planning";
    const planPrompt = [
      `You are an autonomous agent. Create a detailed, numbered step-by-step plan to accomplish this task:`,
      ``,
      `TASK: ${task}`,
      ``,
      autonomy === "full"
        ? `You have full autonomy. Execute all steps without asking for confirmation.`
        : autonomy === "semi"
          ? `You have semi-autonomy. Proceed with most steps but pause for major decisions.`
          : `You are in supervised mode. Present each step for review before executing.`,
      ``,
      `Provide your plan as a numbered list of specific, actionable steps. Each step should be concrete and executable.`,
      `After the plan, begin executing step 1 immediately.`,
    ].join("\n");

    try {
      if (signal.aborted) return;

      run.logs.push({
        timestamp: logTime(),
        type: "plan",
        content: "Creating execution plan...",
        iteration: 0,
      });

      const planStartTime = Date.now();

      const planResponse = await queryLLMForStructuredTask(
        planPrompt,
        model,
        agentId,
        workspacePath
      );

      if (signal.aborted) return;

      const plan = parsePlan(planResponse);
      run.logs.push({
        timestamp: logTime(),
        type: "plan",
        content: `Plan: ${plan.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
        iteration: 0,
      });

      // --- PHASE 2-5: EXECUTE, OBSERVE, REPLAN, SELF-CORRECT ---
      const completedSteps: string[] = [];
      const failedSteps: string[] = [];
      let observations: string[] = [];
      const retryCount = new Map<number, number>();

      for (let stepIdx = 0; stepIdx < plan.steps.length && run.iterations < maxIter; stepIdx++) {
        if (signal.aborted) return;
        if (run.status === "paused") return;

        run.iterations++;
        const step = plan.steps[stepIdx];
        const attempt = retryCount.get(stepIdx) || 0;
        run.currentStep = `Step ${stepIdx + 1}/${plan.steps.length}${attempt > 0 ? ` (retry ${attempt})` : ""}`;

        run.logs.push({
          timestamp: logTime(),
          type: "execute",
          content: `Executing: ${step}`,
          iteration: run.iterations,
        });

        const context = [
          `ORIGINAL TASK: ${task}`,
          ``,
          completedSteps.length > 0
            ? `COMPLETED STEPS:\n${completedSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
            : ``,
          failedSteps.length > 0
            ? `FAILED STEPS:\n${failedSteps.join("\n")}`
            : ``,
          observations.length > 0
            ? `PREVIOUS OBSERVATIONS:\n${observations.join("\n")}`
            : ``,
          ``,
          `CURRENT STEP (${stepIdx + 1}/${plan.steps.length}): ${step}`,
          ``,
          `Execute this step now. You have access to tools (read_file, write_file, list_files, web_search, local_cmd). After completing this step, describe what you did and the outcome.`,
          attempt > 0
            ? `This is retry attempt ${attempt}. The previous attempt failed. Try a different approach.`
            : ``,
        ]
          .filter(Boolean)
          .join("\n");

        try {
          const stepResponse = await callChatAPI(context, model, agentId, workspacePath, signal);

          if (signal.aborted) return;

          run.logs.push({
            timestamp: logTime(),
            type: "observe",
            content: `Step ${stepIdx + 1} result: ${stepResponse.slice(0, 500)}${stepResponse.length > 500 ? "..." : ""}`,
            iteration: run.iterations,
          });

          const success = !stepResponse.toLowerCase().includes("error") &&
            !stepResponse.toLowerCase().includes("failed");
          // Ignore benign mentions of "error" in code contexts
          const looksLikeFailure =
            /^(?:error|failure|unsuccessful|i couldn't|unable to)/im.test(stepResponse.trim());

          if (looksLikeFailure && retryCount.has(stepIdx)) {
            // Already failed once; try replanning
            run.logs.push({
              timestamp: logTime(),
              type: "replan",
              content: `Step ${stepIdx + 1} failed after ${attempt + 1} attempts. Attempting alternative approach.`,
              iteration: run.iterations,
            });

            const replanResponse = await callChatAPI(
              `The step "${step}" failed multiple times. Suggest an alternative approach to achieve the same goal. Task: ${task}. Completed so far: ${completedSteps.join("; ")}. Observations: ${observations.join("; ")}`,
              model,
              agentId,
              workspacePath,
              signal
            );

            if (signal.aborted) return;

            {
              const altPlan = parsePlan(replanResponse);
              if (altPlan.steps.length > 0 && altPlan.steps[0] !== step) {
                plan.steps.splice(stepIdx + 1, 0, altPlan.steps[0]);
                run.logs.push({
                  timestamp: logTime(),
                  type: "replan",
                  content: `Alternative step added: ${altPlan.steps[0]}`,
                  iteration: run.iterations,
                });
              } else {
                // No good alternative, mark step as failed
                failedSteps.push(step);
                observations.push(`[FAILED] Step "${step}" could not be completed`);
              }
            }
            retryCount.delete(stepIdx);
          } else if (looksLikeFailure) {
            // First failure, retry the same step
            retryCount.set(stepIdx, (retryCount.get(stepIdx) || 0) + 1);
            stepIdx--; // Re-run this step
            observations.push(`[WARNING] Step "${step}" may have failed, retrying...`);
          } else {
            completedSteps.push(`${stepIdx + 1}. ${step}: ${stepResponse.slice(0, 200)}`);
            observations.push(`[DONE] ${step}: ${stepResponse.slice(0, 300)}`);
          }
        } catch (execErr: unknown) {
          const msg = execErr instanceof Error ? execErr.message : String(execErr);
          run.logs.push({
            timestamp: logTime(),
            type: "error",
            content: `Step ${stepIdx + 1} error: ${msg}`,
            iteration: run.iterations,
          });

          if (retryCount.has(stepIdx)) {
            failedSteps.push(step);
            observations.push(`[FAILED] Step "${step}" error: ${msg}`);
            retryCount.delete(stepIdx);
          } else {
            retryCount.set(stepIdx, 1);
            stepIdx--;
            observations.push(`[RETRY] Error in step "${step}": ${msg}`);
          }
        }
      }

      // --- COMPLETION ---
      if (run.iterations >= maxIter) {
        run.status = "failed";
        run.result = `Reached maximum iterations (${maxIter}). Completed steps: ${completedSteps.length}/${plan.steps.length}`;
        run.logs.push({
          timestamp: logTime(),
          type: "error",
          content: `Reached max iterations (${maxIter})`,
          iteration: run.iterations,
        });
      } else if (!signal.aborted && run.status !== "paused") {
        run.status = "completed";
        run.result = `Task completed. ${completedSteps.length}/${plan.steps.length} steps done.`;
        run.logs.push({
          timestamp: logTime(),
          type: "complete",
          content: `Task completed successfully. Total iterations: ${run.iterations}`,
          iteration: run.iterations,
        });
      }

      run.endTime = logTime();
    } catch (err: unknown) {
      if (signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      run.status = "failed";
      run.endTime = logTime();
      run.logs.push({
        timestamp: logTime(),
        type: "error",
        content: `Fatal error: ${msg}`,
        iteration: run.iterations,
      });
    }
  }
}
