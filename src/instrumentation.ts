/**
 * Next.js Instrumentation Hook
 * Runs once on server startup to initialize the ClawHub system.
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on the server (not during build)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[Instrumentation] Server starting — running auto-initialization...");

    try {
      const { autoInitialize } = await import("@/lib/auto-initialize");
      const result = await autoInitialize();

      if (result.error) {
        console.error("[Instrumentation] Auto-init completed with errors:", result.error);
      } else {
        console.log("[Instrumentation] Auto-init completed successfully:", {
          seeded: result.seeded,
          cronStarted: result.cronStarted,
          summary: result.summary,
        });
      }
    } catch (error) {
      console.error("[Instrumentation] Auto-init failed:", error);
    }
  }
}
