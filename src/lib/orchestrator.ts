export interface ProjectPlan {
  overview: string;
  category: "saas" | "crm" | "mobile" | "dashboard" | "ecommerce" | "general";
  milestones: Milestone[];
  tasks: OrchestratorTask[];
}

export interface Milestone {
  id: string;
  name: string;
  description: string;
  order: number;
  tasks: string[];
}

export interface OrchestratorTask {
  id: string;
  cardId: string;
  milestoneId: string;
  title: string;
  description: string;
  agentName: string;
  agentRole: string;
  status: "pending" | "running" | "completed" | "failed";
  priority: "low" | "medium" | "high" | "critical";
  labels: string[];
  result?: string;
  retries: number;
}

export interface ProjectStatus {
  projectId: string;
  prompt: string;
  workspacePath: string;
  boardId: string;
  status: "analyzing" | "planning" | "executing" | "completed" | "failed";
  category: string;
  currentTask: string | null;
  startedAt: string;
  completedAt: string | null;
  milestones: Milestone[];
  tasks: OrchestratorTask[];
  completedTasks: number;
  totalTasks: number;
}

export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  taskId?: string;
  agentName?: string;
}

const AGENT_ROLES: Record<string, { role: string; description: string }> = {
  Navigator: { role: "Project Manager", description: "Analyzes intent, breaks down projects, tracks progress" },
  Blueprint: { role: "Software Architect", description: "Designs system architecture, component trees, data models" },
  Prism: { role: "UI/UX Designer", description: "Creates frontend designs, layouts, component mockups" },
  Vertex: { role: "Frontend Developer", description: "Builds React/Next.js UIs, components, styles" },
  Core: { role: "Backend Developer", description: "Implements APIs, server logic, business logic" },
  Harbor: { role: "DevOps Engineer", description: "Configures deployments, CI/CD, Docker, environments" },
  Stratum: { role: "Database Architect", description: "Designs schemas, migrations, queries, data models" },
  Probe: { role: "QA & Testing", description: "Writes tests, verifies functionality, reports bugs" },
  Cipher: { role: "Security Auditor", description: "Reviews security, auth, encryption, vulnerabilities" },
  Refine: { role: "Code Reviewer", description: "Reviews code quality, refactors, optimizes performance" },
};

const CATEGORY_AGENT_MAP: Record<string, string[]> = {
  saas: ["Navigator", "Blueprint", "Prism", "Vertex", "Core", "Harbor", "Stratum", "Probe", "Cipher", "Refine"],
  crm: ["Navigator", "Blueprint", "Core", "Stratum", "Vertex", "Prism", "Probe"],
  mobile: ["Navigator", "Prism", "Vertex", "Core", "Stratum", "Probe"],
  dashboard: ["Navigator", "Blueprint", "Stratum", "Vertex", "Prism", "Probe"],
  ecommerce: ["Navigator", "Blueprint", "Prism", "Vertex", "Core", "Stratum", "Harbor", "Probe"],
  general: ["Navigator", "Blueprint", "Core", "Vertex", "Probe"],
};

const DEFAULT_KANBAN_COLUMNS = [
  { name: "Backlog", color: "#6b7280", order: 0 },
  { name: "Planning", color: "#3b82f6", order: 1 },
  { name: "In Progress", color: "#f59e0b", order: 2 },
  { name: "Completed", color: "#10b981", order: 3 },
  { name: "Failed", color: "#ef4444", order: 4 },
];

function now(): string {
  return new Date().toISOString();
}

async function callChatAPI(
  prompt: string,
  model: string,
  agentId: string | null,
  workspacePath: string | undefined
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
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Chat API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body from chat API");

  const decoder = new TextDecoder();
  let accumulated = "";

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
          }
        } catch {}
      }
    }
  }

  return accumulated;
}

const globalOrchestrator = globalThis as unknown as { __orchestrator?: Orchestrator };

export class Orchestrator {
  private projects: Map<string, ProjectStatus> = new Map();
  private logs: Map<string, LogEntry[]> = new Map();
  private running: Set<string> = new Set();
  private db: any;

  static getInstance(): Orchestrator {
    if (!globalOrchestrator.__orchestrator) {
      globalOrchestrator.__orchestrator = new Orchestrator();
    }
    return globalOrchestrator.__orchestrator;
  }

  setDb(database: any) {
    this.db = database;
  }

  addLog(projectId: string, level: LogEntry["level"], message: string, taskId?: string, agentName?: string) {
    const entry: LogEntry = { timestamp: now(), level, message, taskId, agentName };
    if (!this.logs.has(projectId)) this.logs.set(projectId, []);
    this.logs.get(projectId)!.push(entry);
    console.log(`[Orchestrator:${projectId}] [${level.toUpperCase()}] ${message}`);
  }

  async startProject(prompt: string, workspacePath: string): Promise<string> {
    const projectId = crypto.randomUUID();
    const model = "gemini-2.5-flash";

    const project: ProjectStatus = {
      projectId,
      prompt,
      workspacePath,
      boardId: "",
      status: "analyzing",
      category: "general",
      currentTask: null,
      startedAt: now(),
      completedAt: null,
      milestones: [],
      tasks: [],
      completedTasks: 0,
      totalTasks: 0,
    };

    this.projects.set(projectId, project);
    this.logs.set(projectId, []);
    this.running.add(projectId);

    this.addLog(projectId, "info", `Starting project: "${prompt.slice(0, 100)}"`, undefined, "Orchestrator");

    this.executeProject(projectId, prompt, workspacePath, model).catch((err) => {
      const p = this.projects.get(projectId);
      if (p) {
        p.status = "failed";
        p.completedAt = now();
      }
      this.addLog(projectId, "error", `Project failed: ${err.message}`, undefined, "Orchestrator");
      this.running.delete(projectId);
    });

    return projectId;
  }

  private async executeProject(
    projectId: string,
    prompt: string,
    workspacePath: string,
    model: string
  ) {
    const project = this.projects.get(projectId);
    if (!project) return;

    // ── PHASE 1: Analyze Intent ──
    this.addLog(projectId, "info", "Phase 1: Analyzing intent...", undefined, "Navigator");
    project.status = "analyzing";

    const analyzePrompt = `You are Navigator, a Project Manager. Analyze the following project request and classify it into one category: SaaS, CRM, mobile, dashboard, ecommerce, or general. Then briefly describe the project scope.

PROJECT REQUEST: "${prompt}"

Respond in JSON format:
{
  "category": "saas|crm|mobile|dashboard|ecommerce|general",
  "overview": "Brief description of the project",
  "estimatedComplexity": "low|medium|high"
}`;

    let analysis: { category: string; overview: string; estimatedComplexity: string };
    try {
      const analysisText = await callChatAPI(analyzePrompt, model, null, workspacePath);
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { category: "general", overview: prompt, estimatedComplexity: "medium" };
    } catch {
      analysis = { category: "general", overview: prompt, estimatedComplexity: "medium" };
    }

    project.category = analysis.category;
    this.addLog(projectId, "info", `Classified as: ${analysis.category} (${analysis.estimatedComplexity} complexity)`, undefined, "Navigator");

    // ── PHASE 2: Generate Plan ──
    this.addLog(projectId, "info", "Phase 2: Generating execution plan...", undefined, "Navigator");
    project.status = "planning";

    const planAgents = (CATEGORY_AGENT_MAP[analysis.category] || CATEGORY_AGENT_MAP.general).join(", ");
    const planPrompt = `You are a Project Manager. Generate a detailed execution plan for this project.

Category: ${analysis.category}
Overview: ${analysis.overview}
Estimated Complexity: ${analysis.estimatedComplexity}

Available agents: ${planAgents}

Create a plan with 3-5 milestones, each containing 2-4 specific tasks. Each task should be assigned to one of the available agents based on their role.
The agents and their roles are:
${Object.entries(AGENT_ROLES).map(([name, info]) => `- ${name}: ${info.role} - ${info.description}`).join("\n")}

Respond in JSON format:
{
  "milestones": [
    {
      "name": "Milestone name",
      "description": "What this milestone achieves",
      "order": 0,
      "tasks": [
        {
          "title": "Task title",
          "description": "Detailed task description",
          "agentName": "AgentName",
          "priority": "critical|high|medium|low",
          "labels": ["label1", "label2"]
        }
      ]
    }
  ]
}`;

    let plan: ProjectPlan;
    try {
      const planText = await callChatAPI(planPrompt, model, null, workspacePath);
      const jsonMatch = planText.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

      if (parsed && parsed.milestones) {
        plan = {
          overview: analysis.overview,
          category: analysis.category as any,
          milestones: parsed.milestones.map((m: any, i: number) => ({
            id: crypto.randomUUID(),
            name: m.name,
            description: m.description,
            order: m.order ?? i,
            tasks: m.tasks?.map((t: any) => t.title) || [],
          })),
          tasks: [],
        };
      } else {
        plan = this.generateFallbackPlan(projectId, analysis);
      }
    } catch {
      plan = this.generateFallbackPlan(projectId, analysis);
    }

    project.milestones = plan.milestones;
    this.addLog(projectId, "info", `Plan generated: ${plan.milestones.length} milestones with ${plan.tasks.length} tasks`, undefined, "Navigator");

    // ── PHASE 3: Create Kanban Board ──
    this.addLog(projectId, "info", "Phase 3: Creating Kanban board...", undefined, "Orchestrator");

    try {
      const boardId = crypto.randomUUID();
      project.boardId = boardId;

      if (this.db) {
        await this.db.$executeRawUnsafe(
          "INSERT INTO KanbanBoard (id, name, createdAt, updatedAt) VALUES (?, ?, datetime('now'), datetime('now'))",
          boardId,
          `Orchestrator: ${analysis.overview.slice(0, 50)}`
        );

        const columnIds: Record<string, string> = {};
        for (const col of DEFAULT_KANBAN_COLUMNS) {
          const cid = crypto.randomUUID();
          columnIds[col.name] = cid;
          await this.db.$executeRawUnsafe(
            `INSERT INTO KanbanColumn (id, boardId, name, color, "order", createdAt) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
            cid, boardId, col.name, col.color, col.order
          );
        }

        let taskIndex = 0;
        for (const milestone of plan.milestones) {
          if (!milestone.tasks) continue;
          for (const taskTitle of milestone.tasks) {
            const cardId = crypto.randomUUID();
            const taskDetail = typeof taskTitle === "string"
              ? { title: taskTitle, description: `Milestone: ${milestone.name}`, agentName: "Refine", priority: "medium", labels: [] }
              : taskTitle;

            const task: OrchestratorTask = {
              id: crypto.randomUUID(),
              cardId,
              milestoneId: milestone.id,
              title: taskDetail.title,
              description: taskDetail.description || "",
              agentName: taskDetail.agentName || "Refine",
              agentRole: AGENT_ROLES[taskDetail.agentName]?.role || "Generalist",
              status: "pending",
              priority: (taskDetail.priority || "medium") as OrchestratorTask["priority"],
              labels: taskDetail.labels || [analysis.category],
              retries: 0,
            };

            project.tasks.push(task);
            taskIndex++;

            const targetCol = columnIds["Backlog"] || Object.values(columnIds)[0];
            await this.db.$executeRawUnsafe(
              `INSERT INTO KanbanCard (id, columnId, title, description, priority, labels, assignee, status, subtasks, "order", createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
              cardId,
              targetCol,
              task.title,
              `[${task.agentName}] ${task.description}`,
              task.priority,
              JSON.stringify(task.labels),
              task.agentName,
              "pending",
              JSON.stringify([{ title: "Assigned to " + task.agentName, done: false }]),
              taskIndex
            );
          }
        }
      }

      project.totalTasks = project.tasks.length;
      this.addLog(projectId, "info", `Created board with ${project.totalTasks} cards`, undefined, "Orchestrator");
    } catch (e: any) {
      this.addLog(projectId, "error", `Failed to create Kanban board: ${e.message}`, undefined, "Orchestrator");
    }

    // ── PHASE 4: Execute Tasks ──
    this.addLog(projectId, "info", `Phase 4: Executing ${project.tasks.length} tasks...`, undefined, "Orchestrator");
    project.status = "executing";

    for (let i = 0; i < project.tasks.length; i++) {
      const task = project.tasks[i];
      if (!this.running.has(projectId)) break;

      project.currentTask = task.id;
      task.status = "running";

      this.addLog(projectId, "info", `[${i + 1}/${project.tasks.length}] Executing: ${task.title}`, task.id, task.agentName);

      if (this.db) {
        try {
          await this.db.$executeRawUnsafe(
            `UPDATE KanbanCard SET status = 'in-progress' WHERE id = ?`,
            task.cardId
          );
        } catch {}
      }

      try {
        const taskPrompt = `You are ${task.agentName}, ${AGENT_ROLES[task.agentName]?.role || "a specialized AI agent"}. ${AGENT_ROLES[task.agentName]?.description || ""}

You are working on a project in the category "${project.category}" at workspace path "${workspacePath}".

PROJECT OVERVIEW: ${analysis.overview}

YOUR TASK:
Title: ${task.title}
Description: ${task.description}
Priority: ${task.priority}

Execute this task. You have access to the file system, terminal, and coding tools. Create files, write code, set up configuration as needed. After completing, describe what you did and the outcome.

IMPORTANT: After completing your work, start your response with "TASK COMPLETE:" followed by a summary of what you accomplished.`;

        const result = await callChatAPI(taskPrompt, model, null, workspacePath);

        const isComplete = result.includes("TASK COMPLETE") || result.length > 100;
        if (isComplete) {
          task.status = "completed";
          task.result = result.slice(0, 500);
          project.completedTasks++;

          if (this.db) {
            try {
              const completedCol = await this.db.$queryRawUnsafe(
                `SELECT id FROM KanbanColumn WHERE boardId = ? AND name = 'Completed'`,
                project.boardId
              );
              if (completedCol && completedCol.length > 0) {
                await this.db.$executeRawUnsafe(
                  `UPDATE KanbanCard SET columnId = ?, status = 'completed', subtasks = ? WHERE id = ?`,
                  completedCol[0].id,
                  JSON.stringify([{ title: "Task completed by " + task.agentName, done: true }]),
                  task.cardId
                );
              }
            } catch {}
          }

          this.addLog(projectId, "info", `Task completed: ${task.title}`, task.id, task.agentName);
        } else {
          task.status = "failed";
          task.retries++;

          if (this.db) {
            try {
              const failedCol = await this.db.$queryRawUnsafe(
                `SELECT id FROM KanbanColumn WHERE boardId = ? AND name = 'Failed'`,
                project.boardId
              );
              if (failedCol && failedCol.length > 0) {
                await this.db.$executeRawUnsafe(
                  `UPDATE KanbanCard SET columnId = ?, status = 'failed' WHERE id = ?`,
                  failedCol[0].id,
                  task.cardId
                );
              }
            } catch {}
          }

          this.addLog(projectId, "warn", `Task failed: ${task.title}`, task.id, task.agentName);

          // Retry logic
          if (task.retries < 2) {
            this.addLog(projectId, "info", `Retrying task: ${task.title} (attempt ${task.retries + 1})`, task.id, task.agentName);
            task.status = "running";

            const retryPrompt = `You are ${task.agentName}. Your previous attempt at this task did not complete successfully. Try a different approach.

PREVIOUS TASK: ${task.title}
TASK DESCRIPTION: ${task.description}
PREVIOUS RESULT: ${result.slice(0, 300)}

Please complete the task now. Start with "TASK COMPLETE:" when done.`;

            const retryResult = await callChatAPI(retryPrompt, model, null, workspacePath);
            if (retryResult.includes("TASK COMPLETE") || retryResult.length > 100) {
              task.status = "completed";
              task.result = retryResult.slice(0, 500);
              project.completedTasks++;
              this.addLog(projectId, "info", `Task completed after retry: ${task.title}`, task.id, task.agentName);
            } else {
              task.status = "failed";
              this.addLog(projectId, "error", `Task failed after retry: ${task.title}`, task.id, task.agentName);
            }
          }
        }
      } catch (err: any) {
        task.status = "failed";
        task.retries++;
        this.addLog(projectId, "error", `Task error: ${task.title} - ${err.message}`, task.id, task.agentName);

        if (task.retries < 2) {
          this.addLog(projectId, "info", `Retrying after error: ${task.title}`, task.id, task.agentName);
          task.status = "running";

          try {
            const retryResult = await callChatAPI(
              `Retry task: ${task.title}. ${task.description}. You encountered an error. Try a different approach. Start with "TASK COMPLETE:" when done.`,
              model,
              null,
              workspacePath
            );
            if (retryResult.includes("TASK COMPLETE") || retryResult.length > 100) {
              task.status = "completed";
              task.result = retryResult.slice(0, 500);
              project.completedTasks++;
            }
          } catch {
            task.status = "failed";
          }
        }
      }
    }

    project.currentTask = null;
    project.status = project.completedTasks > 0 ? "completed" : "failed";
    project.completedAt = now();

    this.addLog(
      projectId,
      "info",
      `Project ${project.status}. ${project.completedTasks}/${project.totalTasks} tasks completed.`,
      undefined,
      "Orchestrator"
    );

    this.running.delete(projectId);
  }

  private generateFallbackPlan(projectId: string, analysis: { category: string; overview: string; estimatedComplexity: string }): ProjectPlan {
    const milestones: Milestone[] = [];
    const category = analysis.category;

    const templates: Record<string, { name: string; description: string; tasks: { title: string; description: string; agentName: string; priority: string; labels: string[] }[] }[]> = {
      saas: [
        {
          name: "Project Setup",
          description: "Initialize project structure and configuration",
          tasks: [
            { title: "Initialize project scaffolding", description: "Set up Next.js project with TypeScript, Tailwind CSS, and shadcn/ui", agentName: "Navigator", priority: "critical", labels: ["setup", "nextjs"] },
            { title: "Design system architecture", description: "Define component tree, data flow, API routes, and database schema", agentName: "Blueprint", priority: "critical", labels: ["architecture"] },
            { title: "Set up database schema", description: "Create Prisma schema with models for users, subscriptions, and core entities", agentName: "Stratum", priority: "high", labels: ["database", "prisma"] },
            { title: "Configure DevOps pipeline", description: "Set up Docker, CI/CD with GitHub Actions, and deployment config", agentName: "Harbor", priority: "medium", labels: ["devops"] },
          ],
        },
        {
          name: "Core Features",
          description: "Implement the main SaaS features",
          tasks: [
            { title: "Build authentication system", description: "Implement OAuth 2.0 + JWT with login, register, password reset", agentName: "Core", priority: "critical", labels: ["auth", "backend"] },
            { title: "Create landing page UI", description: "Design and build the SaaS landing page with hero, features, pricing", agentName: "Prism", priority: "high", labels: ["frontend", "landing"] },
            { title: "Implement subscription billing", description: "Integrate Stripe for subscription management and payments", agentName: "Core", priority: "high", labels: ["billing", "stripe"] },
            { title: "Build dashboard UI", description: "Create the main dashboard with navigation, stats, and data tables", agentName: "Vertex", priority: "high", labels: ["frontend", "dashboard"] },
            { title: "Write security audit", description: "Review authentication, API security, and data protection measures", agentName: "Cipher", priority: "high", labels: ["security", "audit"] },
          ],
        },
        {
          name: "Testing & Refinement",
          description: "Test the application and fix issues",
          tasks: [
            { title: "Write E2E tests", description: "Create Playwright tests for critical user flows", agentName: "Probe", priority: "medium", labels: ["testing", "e2e"] },
            { title: "Code review and refactor", description: "Review all code for quality, performance, and maintainability", agentName: "Refine", priority: "medium", labels: ["review", "refactor"] },
          ],
        },
      ],
      crm: [
        {
          name: "Foundation",
          description: "Set up the core CRM infrastructure",
          tasks: [
            { title: "Design CRM data model", description: "Create schema for contacts, deals, activities, and pipelines", agentName: "Blueprint", priority: "critical", labels: ["architecture", "database"] },
            { title: "Initialize project and DB", description: "Set up project with database migrations and seed data", agentName: "Stratum", priority: "critical", labels: ["setup", "database"] },
          ],
        },
        {
          name: "Core CRM Features",
          description: "Build the essential CRM functionality",
          tasks: [
            { title: "Build contact management API", description: "CRUD endpoints for contacts with search and filtering", agentName: "Core", priority: "critical", labels: ["backend", "api"] },
            { title: "Create deal pipeline UI", description: "Kanban-style deal pipeline with drag-and-drop", agentName: "Vertex", priority: "high", labels: ["frontend", "ui"] },
            { title: "Build contacts table view", description: "Data table with sorting, filtering, and bulk actions", agentName: "Prism", priority: "high", labels: ["frontend", "table"] },
            { title: "Implement activity logging", description: "Track calls, emails, meetings per contact/deal", agentName: "Core", priority: "medium", labels: ["backend", "logging"] },
          ],
        },
      ],
      general: [
        {
          name: "Setup & Architecture",
          description: "Initialize project and design architecture",
          tasks: [
            { title: "Analyze requirements and plan", description: "Create detailed specification and architecture document", agentName: "Navigator", priority: "critical", labels: ["planning"] },
            { title: "Design system architecture", description: "Define components, data flow, and technology choices", agentName: "Blueprint", priority: "critical", labels: ["architecture"] },
            { title: "Set up project scaffold", description: "Initialize the project with proper tooling and configuration", agentName: "Core", priority: "high", labels: ["setup"] },
          ],
        },
        {
          name: "Implementation",
          description: "Build the core functionality",
          tasks: [
            { title: "Implement core features", description: "Build the primary feature set based on the architecture", agentName: "Core", priority: "high", labels: ["backend", "features"] },
            { title: "Build user interface", description: "Create the frontend application with all views and components", agentName: "Vertex", priority: "high", labels: ["frontend", "ui"] },
            { title: "Write tests", description: "Create unit and integration tests for all features", agentName: "Probe", priority: "medium", labels: ["testing"] },
          ],
        },
        {
          name: "Polish & Review",
          description: "Finalize and review the project",
          tasks: [
            { title: "Code review", description: "Review all code for quality and consistency", agentName: "Refine", priority: "medium", labels: ["review"] },
            { title: "Performance optimization", description: "Optimize bundle size, queries, and rendering", agentName: "Refine", priority: "low", labels: ["performance"] },
          ],
        },
      ],
    };

    const categoryTemplates = templates[category] || templates.general;

    for (let i = 0; i < categoryTemplates.length; i++) {
      const t = categoryTemplates[i];
      const m: Milestone = {
        id: crypto.randomUUID(),
        name: t.name,
        description: t.description,
        order: i,
        tasks: t.tasks.map((task) => task.title),
      };
      milestones.push(m);
    }

    const tasks: OrchestratorTask[] = [];
    for (const milestone of milestones) {
      const template = categoryTemplates.find((t) => t.name === milestone.name);
      if (!template) continue;
      for (const taskTpl of template.tasks) {
        tasks.push({
          id: crypto.randomUUID(),
          cardId: crypto.randomUUID(),
          milestoneId: milestone.id,
          title: taskTpl.title,
          description: taskTpl.description,
          agentName: taskTpl.agentName,
          agentRole: AGENT_ROLES[taskTpl.agentName]?.role || "Generalist",
          status: "pending",
          priority: taskTpl.priority as any,
          labels: taskTpl.labels,
          retries: 0,
        });
      }
    }

    return { overview: analysis.overview, category: analysis.category as any, milestones, tasks };
  }

  getStatus(projectId: string): ProjectStatus | undefined {
    return this.projects.get(projectId);
  }

  getLogs(projectId: string): LogEntry[] {
    return this.logs.get(projectId) || [];
  }

  getAllProjects(): ProjectStatus[] {
    return Array.from(this.projects.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  isRunning(projectId: string): boolean {
    return this.running.has(projectId);
  }

  stopProject(projectId: string): boolean {
    this.running.delete(projectId);
    const project = this.projects.get(projectId);
    if (project && project.status === "executing") {
      project.status = "failed";
      project.completedAt = now();
      this.addLog(projectId, "warn", "Project stopped by user", undefined, "Orchestrator");
      return true;
    }
    return false;
  }
}
