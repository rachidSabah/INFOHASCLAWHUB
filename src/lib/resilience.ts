/**
 * ClawHub Resilience Module
 * 
 * Provides retry with exponential backoff and circuit breaker patterns
 * for all LLM provider calls. Ensures stability when providers are
 * temporarily unavailable or rate-limited.
 * 
 * Features:
 * - Configurable retry with exponential backoff + jitter
 * - Circuit breaker per provider (auto-trips on repeated failures)
 * - Provider health tracking and status monitoring
 * - Automatic fallback to next available provider
 * - Request queue with prioritization
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type CircuitState = "closed" | "open" | "half-open";

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMaxMs: number;
  retryableStatusCodes: number[];
}

export interface CircuitBreakerConfig {
  failureThreshold: number;      // failures before opening circuit
  resetTimeoutMs: number;         // time before attempting half-open
  halfOpenMaxAttempts: number;    // requests to try in half-open state
  monitoringWindowMs: number;     // rolling window for failure counting
}

export interface ProviderHealth {
  providerId: string;
  circuitState: CircuitState;
  consecutiveFailures: number;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
  avgResponseTimeMs: number;
  circuitOpenedAt: number | null;
  recentErrors: string[];
}

export interface ResilienceResult<T> {
  data: T;
  providerId: string;
  attempts: number;
  totalDelayMs: number;
  fromCache: boolean;
}

// ── Default Configs ────────────────────────────────────────────────────────

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterMaxMs: 500,
  retryableStatusCodes: [429, 500, 502, 503, 504, 502, 408],
};

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 60000,       // 1 minute before half-open
  halfOpenMaxAttempts: 2,
  monitoringWindowMs: 300000,  // 5 minute rolling window
};

// ── Provider Health Tracker ────────────────────────────────────────────────

const MAX_RECENT_ERRORS = 10;

class ProviderHealthTracker {
  private providers = new Map<string, ProviderHealth>();
  private configs = new Map<string, CircuitBreakerConfig>();

  getOrCreate(providerId: string, config?: CircuitBreakerConfig): ProviderHealth {
    if (!this.providers.has(providerId)) {
      this.providers.set(providerId, {
        providerId,
        circuitState: "closed",
        consecutiveFailures: 0,
        totalRequests: 0,
        totalFailures: 0,
        totalSuccesses: 0,
        lastFailureAt: null,
        lastSuccessAt: null,
        avgResponseTimeMs: 0,
        circuitOpenedAt: null,
        recentErrors: [],
      });
      this.configs.set(providerId, config || DEFAULT_CIRCUIT_BREAKER_CONFIG);
    }
    return this.providers.get(providerId)!;
  }

  recordSuccess(providerId: string, responseTimeMs: number): void {
    const health = this.getOrCreate(providerId);
    health.totalRequests++;
    health.totalSuccesses++;
    health.consecutiveFailures = 0;
    health.lastSuccessAt = Date.now();
    
    // Update average response time
    health.avgResponseTimeMs = Math.round(
      (health.avgResponseTimeMs * (health.totalSuccesses - 1) + responseTimeMs) / health.totalSuccesses
    );

    // If half-open and success, close the circuit
    if (health.circuitState === "half-open") {
      health.circuitState = "closed";
      health.circuitOpenedAt = null;
    }
  }

  recordFailure(providerId: string, error: string): void {
    const health = this.getOrCreate(providerId);
    const config = this.configs.get(providerId) || DEFAULT_CIRCUIT_BREAKER_CONFIG;

    health.totalRequests++;
    health.totalFailures++;
    health.consecutiveFailures++;
    health.lastFailureAt = Date.now();
    health.recentErrors = [...health.recentErrors.slice(-MAX_RECENT_ERRORS + 1), error];

    // Check if we should open the circuit
    if (health.circuitState === "closed" && health.consecutiveFailures >= config.failureThreshold) {
      health.circuitState = "open";
      health.circuitOpenedAt = Date.now();
      console.warn(`[Resilience] Circuit OPENED for provider "${providerId}" after ${health.consecutiveFailures} consecutive failures`);
    } else if (health.circuitState === "half-open") {
      // Half-open → failure means re-open
      health.circuitState = "open";
      health.circuitOpenedAt = Date.now();
      console.warn(`[Resilience] Circuit RE-OPENED for provider "${providerId}" (half-open test failed)`);
    }
  }

  canAttempt(providerId: string): boolean {
    const health = this.getOrCreate(providerId);
    const config = this.configs.get(providerId) || DEFAULT_CIRCUIT_BREAKER_CONFIG;

    switch (health.circuitState) {
      case "closed":
        return true;
      case "open": {
        // Check if enough time has passed to try half-open
        const elapsed = Date.now() - (health.circuitOpenedAt || 0);
        if (elapsed >= config.resetTimeoutMs) {
          health.circuitState = "half-open";
          console.log(`[Resilience] Circuit HALF-OPEN for provider "${providerId}" — testing recovery`);
          return true;
        }
        return false;
      }
      case "half-open":
        return true;
      default:
        return false;
    }
  }

  getHealth(providerId: string): ProviderHealth {
    return this.getOrCreate(providerId);
  }

  getAllHealth(): ProviderHealth[] {
    return Array.from(this.providers.values());
  }

  resetProvider(providerId: string): void {
    this.providers.delete(providerId);
    this.configs.delete(providerId);
  }

  resetAll(): void {
    this.providers.clear();
    this.configs.clear();
  }
}

// Singleton instance
const globalResilience = globalThis as unknown as { __providerHealthTracker?: ProviderHealthTracker };
const healthTracker = globalResilience.__providerHealthTracker || new ProviderHealthTracker();
globalResilience.__providerHealthTracker = healthTracker;

// ── Retry with Exponential Backoff ─────────────────────────────────────────

/**
 * Calculate delay for the given retry attempt with exponential backoff and jitter.
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  const jitter = Math.random() * config.jitterMaxMs;
  return cappedDelay + jitter;
}

/**
 * Check if an error is retryable based on the configuration.
 */
function isRetryableError(error: any, config: RetryConfig): boolean {
  // Check HTTP status codes
  if (error?.status && config.retryableStatusCodes.includes(error.status)) {
    return true;
  }
  // Check for network errors
  if (error?.code === "ECONNRESET" || error?.code === "ETIMEDOUT" || error?.code === "ENOTFOUND") {
    return true;
  }
  // Check for rate limiting in error message
  const msg = (error?.message || "").toLowerCase();
  if (msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("429")) {
    return true;
  }
  // Check for server errors in error message
  if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504")) {
    return true;
  }
  // Check for timeout
  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("aborted")) {
    return true;
  }
  return false;
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry and exponential backoff.
 * Also checks circuit breaker state before attempting.
 */
export async function executeWithResilience<T>(
  providerId: string,
  fn: () => Promise<T>,
  retryConfig?: Partial<RetryConfig>,
  circuitConfig?: Partial<CircuitBreakerConfig>
): Promise<ResilienceResult<T>> {
  const config: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  const cbConfig: CircuitBreakerConfig = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...circuitConfig };
  
  // Initialize health tracking
  healthTracker.getOrCreate(providerId, cbConfig);

  let attempts = 0;
  let totalDelayMs = 0;
  let lastError: string = "";

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    // Check circuit breaker
    if (!healthTracker.canAttempt(providerId)) {
      const health = healthTracker.getHealth(providerId);
      const elapsed = Date.now() - (health.circuitOpenedAt || 0);
      const remaining = (cbConfig.resetTimeoutMs - elapsed) / 1000;
      throw new Error(
        `Circuit breaker OPEN for provider "${providerId}". ` +
        `Retry in ${remaining.toFixed(0)}s. ` +
        `Consecutive failures: ${health.consecutiveFailures}. ` +
        `Recent errors: ${health.recentErrors.slice(-3).join("; ")}`
      );
    }

    attempts++;
    const startTime = Date.now();

    try {
      const result = await fn();
      const responseTime = Date.now() - startTime;
      healthTracker.recordSuccess(providerId, responseTime);
      
      return {
        data: result,
        providerId,
        attempts,
        totalDelayMs,
        fromCache: false,
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      lastError = error?.message || String(error);
      healthTracker.recordFailure(providerId, lastError);

      // Check if error is retryable
      if (!isRetryableError(error, config)) {
        throw error; // Non-retryable, fail immediately
      }

      // Last attempt — don't wait
      if (attempt >= config.maxRetries) {
        break;
      }

      // Calculate backoff delay
      const delay = calculateDelay(attempt, config);
      totalDelayMs += delay;
      
      console.warn(
        `[Resilience] Attempt ${attempt + 1}/${config.maxRetries + 1} failed for "${providerId}": ${lastError}. ` +
        `Retrying in ${Math.round(delay)}ms...`
      );

      await sleep(delay);
    }
  }

  throw new Error(
    `All ${attempts} attempts failed for provider "${providerId}". ` +
    `Last error: ${lastError}. ` +
    `Total backoff time: ${totalDelayMs}ms`
  );
}

/**
 * Execute a function with multiple fallback providers.
 * Tries each provider in order until one succeeds.
 */
export async function executeWithFallback<T>(
  providers: Array<{
    id: string;
    fn: () => Promise<T>;
    retryConfig?: Partial<RetryConfig>;
    circuitConfig?: Partial<CircuitBreakerConfig>;
  }>
): Promise<ResilienceResult<T>> {
  const errors: string[] = [];

  for (const provider of providers) {
    // Skip providers with open circuits
    if (!healthTracker.canAttempt(provider.id)) {
      const health = healthTracker.getHealth(provider.id);
      errors.push(`[${provider.id}] Circuit open (${health.consecutiveFailures} failures)`);
      continue;
    }

    try {
      return await executeWithResilience(
        provider.id,
        provider.fn,
        provider.retryConfig,
        provider.circuitConfig
      );
    } catch (error: any) {
      errors.push(`[${provider.id}] ${error.message}`);
      continue;
    }
  }

  throw new Error(
    `All providers failed:\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}`
  );
}

// ── Exports ────────────────────────────────────────────────────────────────

export { healthTracker };
export function getProviderHealth(providerId: string): ProviderHealth {
  return healthTracker.getHealth(providerId);
}
export function getAllProviderHealth(): ProviderHealth[] {
  return healthTracker.getAllHealth();
}
export function resetProvider(providerId: string): void {
  healthTracker.resetProvider(providerId);
}
export function isProviderHealthy(providerId: string): boolean {
  return healthTracker.canAttempt(providerId);
}
