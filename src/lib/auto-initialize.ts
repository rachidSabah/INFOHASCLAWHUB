/**
 * Auto-Initialization System
 * Called on app startup to ensure all pre-configured features are ready.
 * Seeds agents, pipelines, models, and starts the CronEngine.
 */

import { seedPreconfiguredSystem } from "@/lib/preconfigured-system";
import { getCronEngine } from "@/lib/cron-engine";

let initialized = false;
let initializing = false;

/**
 * Initialize the entire ClawHub system on first server boot.
 * This is idempotent — safe to call multiple times.
 */
export async function autoInitialize(): Promise<{
  seeded: boolean;
  cronStarted: boolean;
  summary?: Record<string, number>;
  error?: string;
}> {
  // Prevent double initialization
  if (initialized) {
    return { seeded: true, cronStarted: true };
  }

  if (initializing) {
    // Another initialization is in progress — wait briefly and return
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { seeded: true, cronStarted: true };
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

    // Phase 2: Start the CronEngine (loads active tasks and schedules them)
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
      summary: seedSummary,
    };
  } catch (error) {
    console.error("[AutoInit] Fatal initialization error:", error);
    return {
      seeded: false,
      cronStarted: false,
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
