/**
 * Auto-Initialization System
 * Called on app startup to ensure all pre-configured features are ready.
 * Seeds agents, pipelines, models, swarms, and starts the CronEngine.
 * 
 * Pre-configured features (zero technical skills required from user):
 * - 46 pre-built agents with optimized system prompts
 * - 7 pipeline templates (Full-Stack SaaS, Security Audit, Deep Research, etc.)
 * - 3 pre-configured swarms (Development, Research, Operations)
 * - Orchestrator with task routing and fallback chains
 * - Provider health monitoring and circuit breakers
 * - Semantic cache for instant repeated-query responses
 * - Conversation recovery for crash resilience
 */

import { seedPreconfiguredSystem } from "@/lib/preconfigured-system";
import { getCronEngine } from "@/lib/cron-engine";
import { db } from "@/lib/db";

let initialized = false;
let initializing = false;

// ── Pre-configured Swarms ──────────────────────────────────────────────────

const PRECONFIGURED_SWARMS = [
  {
    name: "Development Swarm",
    description: "Pre-configured swarm for full-stack development tasks. Uses hierarchical topology with a Navigator queen agent and specialist workers for frontend, backend, database, and testing.",
    topology: "hierarchical" as const,
    consensus: "raft" as const,
    maxAgents: 10,
    config: JSON.stringify({
      heartbeatIntervalMs: 10000,
      taskTimeoutMs: 300000,
      consensusTimeoutMs: 60000,
      maxRetries: 3,
      autoScaleConfig: {
        scaleUpThreshold: 0.8,
        scaleDownThreshold: 0.3,
        minAgents: 3,
        maxAgents: 10,
        cooldownMs: 60000,
      },
    }),
    agentNames: ["Navigator", "Blueprint", "CodeForge", "Core", "Stratum", "Probe", "Refine", "Lens"],
  },
  {
    name: "Research Swarm",
    description: "Pre-configured swarm for deep research and analysis. Uses mesh topology for collaborative knowledge gathering with consensus-based validation.",
    topology: "mesh" as const,
    consensus: "byzantine" as const,
    maxAgents: 8,
    config: JSON.stringify({
      heartbeatIntervalMs: 15000,
      taskTimeoutMs: 600000,
      consensusTimeoutMs: 120000,
      maxRetries: 2,
      autoScaleConfig: {
        scaleUpThreshold: 0.7,
        scaleDownThreshold: 0.2,
        minAgents: 2,
        maxAgents: 8,
        cooldownMs: 90000,
      },
    }),
    agentNames: ["Orion", "Research Assistant", "Scout", "Radar", "Scribe", "Lens"],
  },
  {
    name: "Operations Swarm",
    description: "Pre-configured swarm for incident response and operations. Uses star topology for rapid command-and-control with the Incident Responder at the center.",
    topology: "star" as const,
    consensus: "raft" as const,
    maxAgents: 6,
    config: JSON.stringify({
      heartbeatIntervalMs: 5000,
      taskTimeoutMs: 120000,
      consensusTimeoutMs: 30000,
      maxRetries: 3,
      autoScaleConfig: {
        scaleUpThreshold: 0.9,
        scaleDownThreshold: 0.4,
        minAgents: 2,
        maxAgents: 6,
        cooldownMs: 30000,
      },
    }),
    agentNames: ["Incident Responder", "Self-Healing Server", "AdminGuard", "Infra Monitor", "Probe"],
  },
];

/**
 * Seed pre-configured swarms into the database.
 * Idempotent — won't create duplicates.
 */
async function seedPreconfiguredSwarms(): Promise<number> {
  let count = 0;

  for (const swarmConfig of PRECONFIGURED_SWARMS) {
    try {
      // Check if swarm already exists by name
      const existing = await db.swarm.findFirst({
        where: { name: swarmConfig.name },
      });

      if (existing) {
        // Update existing swarm with latest config
        await db.swarm.update({
          where: { id: existing.id },
          data: {
            description: swarmConfig.description,
            topology: swarmConfig.topology,
            consensus: swarmConfig.consensus,
            maxAgents: swarmConfig.maxAgents,
            config: swarmConfig.config,
            // Only set status to active if it was idle (don't interrupt running swarms)
            ...(existing.status === "idle" ? { status: "active" } : {}),
          },
        });
        console.log(`[AutoInit] Updated existing swarm: ${swarmConfig.name}`);
      } else {
        // Create new swarm
        // Find agent IDs for the configured agent names
        const agents = await db.agent.findMany({
          where: {
            name: { in: swarmConfig.agentNames },
            isActive: true,
          },
          select: { id: true, name: true },
        });

        const swarmAgents = agents.map((agent, index) => ({
          agentId: agent.id,
          role: index === 0 ? "queen" as const : "worker" as const,
          status: "idle" as const,
          joinedAt: new Date().toISOString(),
          tasksCompleted: 0,
        }));

        const queenAgentId = agents.length > 0 ? agents[0].id : null;

        await db.swarm.create({
          data: {
            name: swarmConfig.name,
            description: swarmConfig.description,
            topology: swarmConfig.topology,
            consensus: swarmConfig.consensus,
            queenAgentId,
            agents: JSON.stringify(swarmAgents),
            maxAgents: swarmConfig.maxAgents,
            status: "active",
            taskQueue: "[]",
            consensusLog: "[]",
            config: swarmConfig.config,
          },
        });
        console.log(`[AutoInit] Created swarm: ${swarmConfig.name} with ${agents.length} agents`);
      }

      count++;
    } catch (err: unknown) {
      console.error(
        `[AutoInit] Failed to seed swarm "${swarmConfig.name}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return count;
}

/**
 * Initialize the entire ClawHub system on first server boot.
 * This is idempotent — safe to call multiple times.
 */
export async function autoInitialize(): Promise<{
  seeded: boolean;
  cronStarted: boolean;
  swarmsSeeded: number;
  summary?: Record<string, number>;
  error?: string;
}> {
  // Prevent double initialization
  if (initialized) {
    return { seeded: true, cronStarted: true, swarmsSeeded: 0 };
  }

  if (initializing) {
    // Another initialization is in progress — wait briefly and return
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { seeded: true, cronStarted: true, swarmsSeeded: 0 };
  }

  initializing = true;

  try {
    console.log("[AutoInit] Starting ClawHub system initialization...");

    // Phase 1: Seed the preconfigured system (agents, pipelines, models, etc.)
    let seedSummary: Record<string, number> = {};
    try {
      const result = await seedPreconfiguredSystem();
      seedSummary = { ...result } as Record<string, number>;
      console.log("[AutoInit] Preconfigured system seeded:", seedSummary);
    } catch (seedError) {
      console.error("[AutoInit] Seed failed (may already be seeded):", seedError instanceof Error ? seedError.message : seedError);
      // Non-fatal — the data may already exist from a previous run
    }

    // Phase 2: Seed pre-configured swarms
    let swarmsSeeded = 0;
    try {
      swarmsSeeded = await seedPreconfiguredSwarms();
      console.log(`[AutoInit] Seeded ${swarmsSeeded} pre-configured swarms`);
    } catch (swarmError) {
      console.error("[AutoInit] Swarm seeding failed:", swarmError instanceof Error ? swarmError.message : swarmError);
      // Non-fatal — swarms can be created manually via the API
    }

    // Phase 3: Start the CronEngine (loads active tasks and schedules them)
    let cronStarted = false;
    try {
      const cronEngine = getCronEngine();
      await cronEngine.start();
      cronStarted = true;
      console.log("[AutoInit] CronEngine started successfully");
    } catch (cronError) {
      console.error("[AutoInit] CronEngine start failed:", cronError instanceof Error ? cronError.message : cronError);
      // Non-fatal — cron tasks can be started later via the API
    }

    initialized = true;
    console.log("[AutoInit] Initialization complete!");

    return {
      seeded: true,
      cronStarted,
      swarmsSeeded,
      summary: seedSummary,
    };
  } catch (error) {
    console.error("[AutoInit] Fatal initialization error:", error);
    return {
      seeded: false,
      cronStarted: false,
      swarmsSeeded: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    initializing = false;
  }
}

/**
 * Check if the system has been initialized.
 */
export function isInitialized(): boolean {
  return initialized;
}
