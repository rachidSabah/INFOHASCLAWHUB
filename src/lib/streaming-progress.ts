/**
 * Streaming Progress Manager
 * Provides real-time progress updates during model inference and tool execution.
 * Sends structured SSE events that the frontend can render as progress indicators.
 */

export type ProgressPhase =
  | "connecting"       // Establishing connection to model API
  | "reasoning"        // Model is thinking/reasoning
  | "streaming"        // Model is streaming response tokens
  | "tool_selecting"   // Intelligent tool selection in progress
  | "tool_executing"   // Executing a tool call
  | "tool_result"      // Processing tool result
  | "reflecting"       // Self-reflection on results
  | "quality_check"    // Quality scoring in progress
  | "enhancing"        // Response enhancement in progress
  | "complete";        // All done

export interface ProgressEvent {
  type: "progress";
  phase: ProgressPhase;
  message: string;
  percentage?: number;
  details?: Record<string, unknown>;
  timestamp: number;
}

export interface StepEvent {
  type: "step";
  stepNumber: number;
  totalSteps: number;
  stepName: string;
  status: "pending" | "in_progress" | "completed" | "failed";
}

/**
 * Create a progress event for the current phase
 */
export function createProgressEvent(
  phase: ProgressPhase,
  message: string,
  percentage?: number,
  details?: Record<string, unknown>
): string {
  const event: ProgressEvent = {
    type: "progress",
    phase,
    message,
    percentage,
    details,
    timestamp: Date.now(),
  };
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Create a step tracking event for multi-step workflows
 */
export function createStepEvent(
  stepNumber: number,
  totalSteps: number,
  stepName: string,
  status: "pending" | "in_progress" | "completed" | "failed"
): string {
  const event: StepEvent = {
    type: "step",
    stepNumber,
    totalSteps,
    stepName,
    status,
  };
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Phase-specific progress messages
 */
export const PROGRESS_MESSAGES: Record<ProgressPhase, string> = {
  connecting: "Connecting to AI model...",
  reasoning: "Analyzing your request and planning approach...",
  streaming: "Generating response...",
  tool_selecting: "Selecting relevant tools for your task...",
  tool_executing: "Executing tool...",
  tool_result: "Processing tool results...",
  reflecting: "Reflecting on results and planning next steps...",
  quality_check: "Checking response quality...",
  enhancing: "Enhancing response...",
  complete: "Done!",
};

/**
 * Estimate overall progress percentage based on agent loop state
 */
export function estimateProgress(
  iteration: number,
  maxIterations: number,
  hasToolCalls: boolean,
  isFinalResponse: boolean
): number {
  if (isFinalResponse) return 100;

  // Base progress from iteration
  const iterationProgress = (iteration / maxIterations) * 80;

  // Add progress for tool usage
  const toolProgress = hasToolCalls ? 10 : 0;

  // Reserve 10% for final response
  return Math.min(90, Math.floor(iterationProgress + toolProgress));
}
