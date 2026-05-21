/**
 * Cost Tracker Engine
 *
 * A production-grade cost tracking and budget management engine providing:
 * - Budget management: create budgets at global, provider, agent, project, user scopes
 * - Token tracking: record token usage per request
 * - Cost calculation: compute costs from token counts and provider pricing
 * - Period tracking: daily, weekly, monthly with auto-reset
 * - Alert system: threshold alerts (80% default), limit reached, anomaly detection, cost spikes
 * - Spending analytics: breakdown by provider, agent, model, time period
 * - Budget enforcement: block requests when budget exceeded
 */

import { db } from '@/lib/db';

// ── Type Definitions ──────────────────────────────────────────────────────────

export type BudgetScope = 'global' | 'provider' | 'agent' | 'project' | 'user';

export type BudgetPeriod = 'daily' | 'weekly' | 'monthly';

export type AlertType = 'threshold' | 'limit_reached' | 'anomaly' | 'spike';

export interface BudgetConfig {
  tokenLimit?: number;
  costLimit?: number;
  alertThreshold?: number;
  isEnabled?: boolean;
}

export interface BudgetFilter {
  scope?: BudgetScope;
  scopeId?: string;
  period?: BudgetPeriod;
  isEnabled?: boolean;
  limit?: number;
  offset?: number;
}

export interface AlertFilter {
  budgetId?: string;
  alertType?: AlertType;
  isRead?: boolean;
  limit?: number;
  offset?: number;
}

export interface SpendingAnalytics {
  totalTokens: number;
  totalCost: number;
  byScope: Record<string, { tokens: number; cost: number }>;
  byPeriod: Record<string, { tokens: number; cost: number }>;
  topBudgets: Array<{
    id: string;
    name: string;
    scope: string;
    currentTokens: number;
    currentCost: number;
    percentUsed: number;
  }>;
  alertsTriggered: number;
  period: string;
  from: Date;
  to: Date;
}

export interface BudgetStatusResult {
  id: string;
  name: string;
  scope: string;
  scopeId: string | null;
  period: string;
  tokenLimit: number | null;
  costLimit: number | null;
  currentTokens: number;
  currentCost: number;
  alertThreshold: number;
  isEnabled: boolean;
  percentTokensUsed: number;
  percentCostUsed: number;
  remainingTokens: number;
  remainingCost: number;
  isOverBudget: boolean;
  isNearLimit: boolean;
  lastResetAt: Date;
}

export interface CostForecast {
  budgetId: string;
  budgetName: string;
  periodDays: number;
  daysElapsed: number;
  daysRemaining: number;
  currentSpend: number;
  projectedTotalSpend: number;
  projectedOverage: number;
  dailyAverageSpend: number;
  recommendedDailyLimit: number;
}

export interface AnomalyResult {
  isAnomalous: boolean;
  anomalyScore: number;
  expectedRange: { min: number; max: number };
  actualSpend: number;
  deviation: number;
  description: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJsonSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Calculate the start of the current period for a given budget period type.
 */
function getPeriodStart(period: BudgetPeriod): Date {
  const now = new Date();

  switch (period) {
    case 'daily': {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    case 'weekly': {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
      return new Date(now.getFullYear(), now.getMonth(), diff);
    }
    case 'monthly': {
      return new Date(now.getFullYear(), now.getMonth(), 1);
    }
    default:
      return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

/**
 * Get the number of days in the current period.
 */
function getPeriodDays(period: BudgetPeriod): number {
  switch (period) {
    case 'daily':
      return 1;
    case 'weekly':
      return 7;
    case 'monthly': {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    }
    default:
      return 30;
  }
}

/**
 * Check if a budget needs to be reset for the current period.
 */
function needsReset(lastResetAt: Date, period: BudgetPeriod): boolean {
  const periodStart = getPeriodStart(period);
  return new Date(lastResetAt) < periodStart;
}

// ── Budget Management ─────────────────────────────────────────────────────────

/**
 * Reset a budget for a new period.
 * Zeros out current tokens and cost, updates lastResetAt.
 * Defined first since other functions depend on it.
 */
export async function resetBudget(budgetId: string) {
  try {
    const budget = await db.costBudget.findUnique({
      where: { id: budgetId },
    });

    if (!budget) {
      throw new Error(`Budget not found: ${budgetId}`);
    }

    const reset = await db.costBudget.update({
      where: { id: budgetId },
      data: {
        currentTokens: 0,
        currentCost: 0,
        lastResetAt: new Date(),
      },
    });

    return reset;
  } catch (error: unknown) {
    console.error(
      '[CostTracker] resetBudget failed:',
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

/**
 * Create a new cost budget.
 */
export async function createBudget(
  name: string,
  scope: BudgetScope,
  scopeId?: string,
  config?: BudgetConfig
) {
  try {
    const budget = await db.costBudget.create({
      data: {
        name,
        scope,
        scopeId: scopeId ?? null,
        period: 'monthly',
        tokenLimit: config?.tokenLimit ?? null,
        costLimit: config?.costLimit ?? null,
        currentTokens: 0,
        currentCost: 0,
        alertThreshold: config?.alertThreshold ?? 0.8,
        isEnabled: config?.isEnabled ?? true,
        lastResetAt: new Date(),
      },
    });

    return budget;
  } catch (error: unknown) {
    console.error(
      '[CostTracker] createBudget failed:',
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

/**
 * List all budgets with optional filter.
 */
export async function listBudgets(filter?: BudgetFilter) {
  try {
    const where: Record<string, unknown> = {};
    if (filter?.scope) where.scope = filter.scope;
    if (filter?.scopeId) where.scopeId = filter.scopeId;
    if (filter?.period) where.period = filter.period;
    if (filter?.isEnabled !== undefined) where.isEnabled = filter.isEnabled;

    const budgets = await db.costBudget.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filter?.limit ?? 100,
      skip: filter?.offset ?? 0,
    });

    return budgets;
  } catch (error: unknown) {
    console.error(
      '[CostTracker] listBudgets failed:',
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

/**
 * Get detailed budget status with remaining capacity.
 */
export async function getBudgetStatus(
  budgetId: string
): Promise<BudgetStatusResult | null> {
  try {
    const budget = await db.costBudget.findUnique({
      where: { id: budgetId },
    });

    if (!budget) return null;

    // Auto-reset if needed
    if (
      budget.isEnabled &&
      needsReset(budget.lastResetAt, budget.period as BudgetPeriod)
    ) {
      await resetBudget(budgetId);
      // Re-fetch after reset
      const refreshedBudget = await db.costBudget.findUnique({
        where: { id: budgetId },
      });
      if (!refreshedBudget) return null;
      return computeBudgetStatus(refreshedBudget);
    }

    return computeBudgetStatus(budget);
  } catch (error: unknown) {
    console.error(
      '[CostTracker] getBudgetStatus failed:',
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

function computeBudgetStatus(budget: {
  id: string;
  name: string;
  scope: string;
  scopeId: string | null;
  period: string;
  tokenLimit: number | null;
  costLimit: number | null;
  currentTokens: number;
  currentCost: number;
  alertThreshold: number;
  isEnabled: boolean;
  lastResetAt: Date;
}): BudgetStatusResult {
  const percentTokensUsed =
    budget.tokenLimit && budget.tokenLimit > 0
      ? (budget.currentTokens / budget.tokenLimit) * 100
      : 0;

  const percentCostUsed =
    budget.costLimit && budget.costLimit > 0
      ? (budget.currentCost / budget.costLimit) * 100
      : 0;

  const remainingTokens = budget.tokenLimit
    ? Math.max(0, budget.tokenLimit - budget.currentTokens)
    : Infinity;

  const remainingCost = budget.costLimit
    ? Math.max(0, budget.costLimit - budget.currentCost)
    : Infinity;

  const isOverBudget =
    (budget.tokenLimit !== null && budget.currentTokens > budget.tokenLimit) ||
    (budget.costLimit !== null && budget.currentCost > budget.costLimit);

  const isNearLimit =
    percentTokensUsed >= budget.alertThreshold * 100 ||
    percentCostUsed >= budget.alertThreshold * 100;

  return {
    id: budget.id,
    name: budget.name,
    scope: budget.scope,
    scopeId: budget.scopeId,
    period: budget.period,
    tokenLimit: budget.tokenLimit,
    costLimit: budget.costLimit,
    currentTokens: budget.currentTokens,
    currentCost: budget.currentCost,
    alertThreshold: budget.alertThreshold,
    isEnabled: budget.isEnabled,
    percentTokensUsed,
    percentCostUsed,
    remainingTokens: remainingTokens === Infinity ? -1 : remainingTokens,
    remainingCost: remainingCost === Infinity ? -1 : remainingCost,
    isOverBudget,
    isNearLimit,
    lastResetAt: budget.lastResetAt,
  };
}

// ── Token Usage Recording ─────────────────────────────────────────────────────

/**
 * Record token usage against the appropriate budget.
 * Auto-resets budgets if the period has rolled over.
 * Triggers alerts if thresholds are crossed.
 */
export async function recordUsage(
  scope: BudgetScope,
  scopeId: string | null | undefined,
  tokens: number,
  cost: number,
  model?: string,
  provider?: string
) {
  try {
    // Find matching budget
    const budget = await findMatchingBudget(scope, scopeId);

    if (!budget) {
      // No budget found for this scope — usage is not tracked
      return { recorded: false, reason: 'no_matching_budget' };
    }

    // Auto-reset if period has rolled over
    if (needsReset(budget.lastResetAt, budget.period as BudgetPeriod)) {
      await resetBudget(budget.id);
    }

    // Update usage
    const updated = await db.costBudget.update({
      where: { id: budget.id },
      data: {
        currentTokens: { increment: tokens },
        currentCost: { increment: cost },
      },
    });

    // Check if we need to trigger alerts
    await checkAndTriggerAlerts(updated, model, provider);

    return { recorded: true, budgetId: budget.id };
  } catch (error: unknown) {
    console.error(
      '[CostTracker] recordUsage failed:',
      error instanceof Error ? error.message : error
    );
    return { recorded: false, reason: 'internal_error' };
  }
}

/**
 * Find the matching budget for a given scope and scopeId.
 * Falls back from specific to broader scopes:
 * agent → project → provider → global
 */
async function findMatchingBudget(
  scope: BudgetScope,
  scopeId?: string | null
) {
  try {
    // Try exact scope match first
    if (scopeId) {
      const exact = await db.costBudget.findFirst({
        where: { scope, scopeId, isEnabled: true },
      });
      if (exact) return exact;
    }

    // Try scope without scopeId (for global)
    if (scope === 'global') {
      const global = await db.costBudget.findFirst({
        where: { scope: 'global', isEnabled: true },
      });
      if (global) return global;
    }

    // Fallback chain: agent → project → provider → global
    const fallbackOrder: BudgetScope[] = [
      'agent',
      'project',
      'provider',
      'global',
    ];
    const scopeIdx = fallbackOrder.indexOf(scope);

    for (let i = scopeIdx + 1; i < fallbackOrder.length; i++) {
      const fallback = await db.costBudget.findFirst({
        where: { scope: fallbackOrder[i], isEnabled: true },
      });
      if (fallback) return fallback;
    }

    return null;
  } catch (error: unknown) {
    console.error(
      '[CostTracker] findMatchingBudget failed:',
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Check if a budget allows more usage.
 * Returns true if under limits, false if over budget.
 */
export async function checkBudget(
  scope: BudgetScope,
  scopeId?: string | null
): Promise<{
  allowed: boolean;
  reason?: string;
  budgetId?: string;
  percentUsed?: number;
}> {
  try {
    const budget = await findMatchingBudget(scope, scopeId);

    if (!budget) {
      // No budget configured — allow by default
      return { allowed: true, reason: 'no_budget_configured' };
    }

    // Auto-reset if period has rolled over
    if (needsReset(budget.lastResetAt, budget.period as BudgetPeriod)) {
      await resetBudget(budget.id);
      // Re-fetch after reset
      const refreshedBudget = await db.costBudget.findUnique({
        where: { id: budget.id },
      });
      if (refreshedBudget) {
        return {
          allowed: true,
          budgetId: refreshedBudget.id,
          percentUsed: 0,
        };
      }
    }

    // Check token limit
    if (
      budget.tokenLimit !== null &&
      budget.currentTokens >= budget.tokenLimit
    ) {
      return {
        allowed: false,
        reason: 'token_limit_reached',
        budgetId: budget.id,
        percentUsed:
          budget.tokenLimit > 0
            ? (budget.currentTokens / budget.tokenLimit) * 100
            : 100,
      };
    }

    // Check cost limit
    if (budget.costLimit !== null && budget.currentCost >= budget.costLimit) {
      return {
        allowed: false,
        reason: 'cost_limit_reached',
        budgetId: budget.id,
        percentUsed:
          budget.costLimit > 0
            ? (budget.currentCost / budget.costLimit) * 100
            : 100,
      };
    }

    const tokenPercent =
      budget.tokenLimit && budget.tokenLimit > 0
        ? (budget.currentTokens / budget.tokenLimit) * 100
        : 0;
    const costPercent =
      budget.costLimit && budget.costLimit > 0
        ? (budget.currentCost / budget.costLimit) * 100
        : 0;

    return {
      allowed: true,
      budgetId: budget.id,
      percentUsed: Math.max(tokenPercent, costPercent),
    };
  } catch (error: unknown) {
    console.error(
      '[CostTracker] checkBudget failed:',
      error instanceof Error ? error.message : error
    );
    // Fail open — don't block on engine errors
    return { allowed: true, reason: 'check_failed' };
  }
}

// ── Alert System ──────────────────────────────────────────────────────────────

/**
 * Create a cost alert.
 */
export async function triggerAlert(
  budgetId: string,
  alertType: AlertType,
  message: string,
  threshold?: number,
  currentSpend?: number
) {
  try {
    const alert = await db.costAlert.create({
      data: {
        budgetId,
        alertType,
        message,
        threshold: threshold ?? null,
        currentSpend: currentSpend ?? null,
        isRead: false,
      },
    });

    return alert;
  } catch (error: unknown) {
    console.error(
      '[CostTracker] triggerAlert failed:',
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

/**
 * Get cost alerts with optional filter.
 */
export async function getAlerts(filter?: AlertFilter) {
  try {
    const where: Record<string, unknown> = {};
    if (filter?.budgetId) where.budgetId = filter.budgetId;
    if (filter?.alertType) where.alertType = filter.alertType;
    if (filter?.isRead !== undefined) where.isRead = filter.isRead;

    const alerts = await db.costAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filter?.limit ?? 100,
      skip: filter?.offset ?? 0,
    });

    return alerts;
  } catch (error: unknown) {
    console.error(
      '[CostTracker] getAlerts failed:',
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

/**
 * Mark a cost alert as read.
 */
export async function markAlertRead(alertId: string) {
  try {
    const updated = await db.costAlert.update({
      where: { id: alertId },
      data: { isRead: true },
    });

    return updated;
  } catch (error: unknown) {
    console.error(
      '[CostTracker] markAlertRead failed:',
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

/**
 * Check budget thresholds and trigger alerts if needed.
 */
async function checkAndTriggerAlerts(
  budget: {
    id: string;
    name: string;
    scope: string;
    tokenLimit: number | null;
    costLimit: number | null;
    currentTokens: number;
    currentCost: number;
    alertThreshold: number;
  },
  model?: string,
  provider?: string
): Promise<void> {
  try {
    // Check token threshold
    if (budget.tokenLimit && budget.tokenLimit > 0) {
      const tokenPercent = budget.currentTokens / budget.tokenLimit;

      if (tokenPercent >= 1.0) {
        // Limit reached
        await triggerAlert(
          budget.id,
          'limit_reached',
          `Budget "${budget.name}" token limit reached: ${budget.currentTokens}/${budget.tokenLimit} tokens (${(tokenPercent * 100).toFixed(1)}%)${model ? ` [model: ${model}]` : ''}${provider ? ` [provider: ${provider}]` : ''}`,
          budget.alertThreshold,
          budget.currentTokens
        ).catch(() => {});
      } else if (tokenPercent >= budget.alertThreshold) {
        // Threshold crossed
        await triggerAlert(
          budget.id,
          'threshold',
          `Budget "${budget.name}" token usage at ${(tokenPercent * 100).toFixed(1)}% (${budget.currentTokens}/${budget.tokenLimit} tokens)${model ? ` [model: ${model}]` : ''}${provider ? ` [provider: ${provider}]` : ''}`,
          budget.alertThreshold,
          budget.currentTokens
        ).catch(() => {});
      }
    }

    // Check cost threshold
    if (budget.costLimit && budget.costLimit > 0) {
      const costPercent = budget.currentCost / budget.costLimit;

      if (costPercent >= 1.0) {
        // Limit reached
        await triggerAlert(
          budget.id,
          'limit_reached',
          `Budget "${budget.name}" cost limit reached: $${budget.currentCost.toFixed(2)}/$${budget.costLimit.toFixed(2)} (${(costPercent * 100).toFixed(1)}%)${model ? ` [model: ${model}]` : ''}${provider ? ` [provider: ${provider}]` : ''}`,
          budget.alertThreshold,
          budget.currentCost
        ).catch(() => {});
      } else if (costPercent >= budget.alertThreshold) {
        // Threshold crossed
        await triggerAlert(
          budget.id,
          'threshold',
          `Budget "${budget.name}" cost usage at ${(costPercent * 100).toFixed(1)}% ($${budget.currentCost.toFixed(2)}/$${budget.costLimit.toFixed(2)})${model ? ` [model: ${model}]` : ''}${provider ? ` [provider: ${provider}]` : ''}`,
          budget.alertThreshold,
          budget.currentCost
        ).catch(() => {});
      }
    }
  } catch (error: unknown) {
    console.error(
      '[CostTracker] checkAndTriggerAlerts failed:',
      error instanceof Error ? error.message : error
    );
  }
}

// ── Spending Analytics ────────────────────────────────────────────────────────

/**
 * Get detailed spending analytics.
 */
export async function getSpendingAnalytics(
  period?: BudgetPeriod,
  scope?: BudgetScope,
  scopeId?: string
): Promise<SpendingAnalytics> {
  try {
    const where: Record<string, unknown> = {};
    if (scope) where.scope = scope;
    if (scopeId) where.scopeId = scopeId;
    if (period) where.period = period;

    const budgets = await db.costBudget.findMany({ where });

    const now = new Date();
    const periodLabel = period ?? 'monthly';
    const from = getPeriodStart(period ?? 'monthly');
    const to = now;

    let totalTokens = 0;
    let totalCost = 0;
    const byScope: Record<string, { tokens: number; cost: number }> = {};
    const byPeriod: Record<string, { tokens: number; cost: number }> = {};
    const topBudgets: SpendingAnalytics['topBudgets'] = [];

    for (const budget of budgets) {
      totalTokens += budget.currentTokens;
      totalCost += budget.currentCost;

      // By scope
      if (!byScope[budget.scope]) {
        byScope[budget.scope] = { tokens: 0, cost: 0 };
      }
      byScope[budget.scope].tokens += budget.currentTokens;
      byScope[budget.scope].cost += budget.currentCost;

      // By period (group by budget's period type)
      const periodKey = budget.period;
      if (!byPeriod[periodKey]) {
        byPeriod[periodKey] = { tokens: 0, cost: 0 };
      }
      byPeriod[periodKey].tokens += budget.currentTokens;
      byPeriod[periodKey].cost += budget.currentCost;

      // Compute percent used
      const tokenPercent =
        budget.tokenLimit && budget.tokenLimit > 0
          ? (budget.currentTokens / budget.tokenLimit) * 100
          : 0;
      const costPercent =
        budget.costLimit && budget.costLimit > 0
          ? (budget.currentCost / budget.costLimit) * 100
          : 0;

      topBudgets.push({
        id: budget.id,
        name: budget.name,
        scope: budget.scope,
        currentTokens: budget.currentTokens,
        currentCost: budget.currentCost,
        percentUsed: Math.max(tokenPercent, costPercent),
      });
    }

    // Sort top budgets by percent used descending
    topBudgets.sort((a, b) => b.percentUsed - a.percentUsed);

    // Count alerts triggered
    const alertsTriggered = await db.costAlert.count({
      where: { createdAt: { gte: from } },
    });

    return {
      totalTokens,
      totalCost,
      byScope,
      byPeriod,
      topBudgets: topBudgets.slice(0, 20),
      alertsTriggered,
      period: periodLabel,
      from,
      to,
    };
  } catch (error: unknown) {
    console.error(
      '[CostTracker] getSpendingAnalytics failed:',
      error instanceof Error ? error.message : error
    );
    return {
      totalTokens: 0,
      totalCost: 0,
      byScope: {},
      byPeriod: {},
      topBudgets: [],
      alertsTriggered: 0,
      period: period ?? 'monthly',
      from: new Date(),
      to: new Date(),
    };
  }
}

// ── Anomaly Detection ─────────────────────────────────────────────────────────

/**
 * Detect spending anomalies for a specific scope.
 * Uses a simple statistical approach: compares current spend
 * against the expected range based on historical patterns.
 */
export async function detectAnomaly(
  scope: BudgetScope,
  scopeId: string | null | undefined,
  currentSpend: number
): Promise<AnomalyResult> {
  try {
    const budget = await findMatchingBudget(scope, scopeId);

    if (!budget) {
      return {
        isAnomalous: false,
        anomalyScore: 0,
        expectedRange: { min: 0, max: currentSpend * 2 },
        actualSpend: currentSpend,
        deviation: 0,
        description: 'No budget configured for anomaly detection',
      };
    }

    // Calculate expected daily spend based on budget limit and period
    const periodDays = getPeriodDays(budget.period as BudgetPeriod);
    const dailyBudgetCost = budget.costLimit
      ? budget.costLimit / periodDays
      : null;

    // Calculate days elapsed in current period
    const periodStart = getPeriodStart(budget.period as BudgetPeriod);
    const now = new Date();
    const daysElapsed = Math.max(
      1,
      Math.ceil(
        (now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)
      )
    );

    // Expected spend so far = daily average * days elapsed
    const expectedSpend = dailyBudgetCost
      ? dailyBudgetCost * daysElapsed
      : budget.currentCost; // Fallback to current cost if no limit

    // Standard deviation estimate: assume ~20% of expected spend
    const stdDev = expectedSpend * 0.2;

    // Z-score: how many standard deviations from the mean
    const zScore =
      stdDev > 0 ? (currentSpend - expectedSpend) / stdDev : 0;

    // Anomaly threshold: 2 standard deviations (95% confidence)
    const isAnomalous = Math.abs(zScore) > 2;
    const anomalyScore = Math.min(1, Math.abs(zScore) / 4); // Normalize to 0-1

    const expectedMin = Math.max(0, expectedSpend - 2 * stdDev);
    const expectedMax = expectedSpend + 2 * stdDev;
    const deviation = currentSpend - expectedSpend;

    let description: string;
    if (isAnomalous && deviation > 0) {
      description = `Spending is significantly higher than expected: $${currentSpend.toFixed(2)} vs expected range $${expectedMin.toFixed(2)}-$${expectedMax.toFixed(2)} (${zScore.toFixed(1)}σ above normal)`;
    } else if (isAnomalous && deviation < 0) {
      description = `Spending is significantly lower than expected: $${currentSpend.toFixed(2)} vs expected range $${expectedMin.toFixed(2)}-$${expectedMax.toFixed(2)} (${Math.abs(zScore).toFixed(1)}σ below normal)`;
    } else {
      description = `Spending is within normal range: $${currentSpend.toFixed(2)} (expected $${expectedMin.toFixed(2)}-$${expectedMax.toFixed(2)})`;
    }

    // If anomalous and positive deviation, trigger an alert
    if (isAnomalous && deviation > 0) {
      await triggerAlert(
        budget.id,
        'anomaly',
        `Anomalous spending detected: ${description}`,
        undefined,
        currentSpend
      ).catch(() => {});
    }

    return {
      isAnomalous,
      anomalyScore,
      expectedRange: { min: expectedMin, max: expectedMax },
      actualSpend: currentSpend,
      deviation,
      description,
    };
  } catch (error: unknown) {
    console.error(
      '[CostTracker] detectAnomaly failed:',
      error instanceof Error ? error.message : error
    );
    return {
      isAnomalous: false,
      anomalyScore: 0,
      expectedRange: { min: 0, max: currentSpend * 2 },
      actualSpend: currentSpend,
      deviation: 0,
      description: 'Anomaly detection failed due to internal error',
    };
  }
}

// ── Budget Enforcement ────────────────────────────────────────────────────────

/**
 * Check and enforce budget limits.
 * Returns whether the request should be allowed.
 * If budget is exceeded, triggers a limit_reached alert.
 */
export async function enforceBudget(
  scope: BudgetScope,
  scopeId?: string | null
): Promise<{
  allowed: boolean;
  reason?: string;
  budgetId?: string;
  percentUsed?: number;
}> {
  try {
    const result = await checkBudget(scope, scopeId);

    if (!result.allowed && result.budgetId) {
      // Already over budget — ensure alert was triggered
      const existingAlerts = await db.costAlert.findMany({
        where: {
          budgetId: result.budgetId,
          alertType: 'limit_reached',
          isRead: false,
          createdAt: {
            gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
          },
        },
      });

      if (existingAlerts.length === 0) {
        const budget = await db.costBudget.findUnique({
          where: { id: result.budgetId },
        });
        if (budget) {
          await triggerAlert(
            budget.id,
            'limit_reached',
            `Budget "${budget.name}" is over limit. Requests are being blocked. Current: ${budget.currentTokens} tokens, $${budget.currentCost.toFixed(2)}`,
            undefined,
            budget.currentCost
          ).catch(() => {});
        }
      }
    }

    // Also check for cost spikes
    if (result.allowed && result.budgetId) {
      const budget = await db.costBudget.findUnique({
        where: { id: result.budgetId },
      });

      if (budget && budget.costLimit && budget.costLimit > 0) {
        // Simple spike detection: if cost jumped >50% of budget in the last hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentAlerts = await db.costAlert.count({
          where: {
            budgetId: budget.id,
            alertType: 'spike',
            createdAt: { gte: oneHourAgo },
          },
        });

        // Only check for spikes if we haven't alerted recently
        if (recentAlerts === 0) {
          const costPercent = budget.currentCost / budget.costLimit;
          const periodStart = getPeriodStart(
            budget.period as BudgetPeriod
          );
          const hoursElapsed = Math.max(
            1,
            (Date.now() - periodStart.getTime()) / (1000 * 60 * 60)
          );
          const expectedPercent = hoursElapsed / (getPeriodDays(budget.period as BudgetPeriod) * 24);

          // If actual usage is more than 3x the expected rate
          if (costPercent > expectedPercent * 3 && costPercent > 0.2) {
            await triggerAlert(
              budget.id,
              'spike',
              `Cost spike detected for budget "${budget.name}": usage at ${(costPercent * 100).toFixed(1)}% but only ${(expectedPercent * 100).toFixed(1)}% of period elapsed`,
              undefined,
              budget.currentCost
            ).catch(() => {});
          }
        }
      }
    }

    return result;
  } catch (error: unknown) {
    console.error(
      '[CostTracker] enforceBudget failed:',
      error instanceof Error ? error.message : error
    );
    // Fail open — don't block on engine errors
    return { allowed: true, reason: 'enforcement_failed' };
  }
}

// ── Cost Forecasting ──────────────────────────────────────────────────────────

/**
 * Forecast cost for the remaining period.
 * Uses linear extrapolation based on current spend rate.
 */
export async function getCostForecast(
  budgetId: string
): Promise<CostForecast | null> {
  try {
    const budget = await db.costBudget.findUnique({
      where: { id: budgetId },
    });

    if (!budget) return null;

    const periodDays = getPeriodDays(budget.period as BudgetPeriod);
    const periodStart = getPeriodStart(budget.period as BudgetPeriod);
    const now = new Date();

    const daysElapsed = Math.max(
      1,
      Math.ceil(
        (now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)
      )
    );
    const daysRemaining = Math.max(0, periodDays - daysElapsed);

    const dailyAverageSpend =
      daysElapsed > 0 ? budget.currentCost / daysElapsed : 0;

    const projectedTotalSpend = dailyAverageSpend * periodDays;
    const projectedOverage = budget.costLimit
      ? Math.max(0, projectedTotalSpend - budget.costLimit)
      : 0;

    const recommendedDailyLimit =
      daysRemaining > 0 && budget.costLimit
        ? Math.max(0, (budget.costLimit - budget.currentCost) / daysRemaining)
        : 0;

    return {
      budgetId: budget.id,
      budgetName: budget.name,
      periodDays,
      daysElapsed,
      daysRemaining,
      currentSpend: budget.currentCost,
      projectedTotalSpend,
      projectedOverage,
      dailyAverageSpend,
      recommendedDailyLimit,
    };
  } catch (error: unknown) {
    console.error(
      '[CostTracker] getCostForecast failed:',
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

// ── Default Budget Seeding ────────────────────────────────────────────────────

const DEFAULT_BUDGETS: Array<{
  name: string;
  scope: BudgetScope;
  scopeId?: string;
  period: BudgetPeriod;
  tokenLimit: number;
  costLimit: number;
  alertThreshold: number;
}> = [
  {
    name: 'Global Monthly Budget',
    scope: 'global',
    period: 'monthly',
    tokenLimit: 10_000_000, // 10M tokens
    costLimit: 100.0, // $100
    alertThreshold: 0.8,
  },
  {
    name: 'Global Daily Budget',
    scope: 'global',
    period: 'daily',
    tokenLimit: 500_000, // 500K tokens
    costLimit: 5.0, // $5
    alertThreshold: 0.8,
  },
  {
    name: 'Global Weekly Budget',
    scope: 'global',
    period: 'weekly',
    tokenLimit: 2_500_000, // 2.5M tokens
    costLimit: 25.0, // $25
    alertThreshold: 0.8,
  },
];

/**
 * Seed default budgets into the database.
 * Only creates budgets that don't already exist (by name + scope combination).
 */
export async function seedDefaultBudgets(): Promise<{
  created: number;
  skipped: number;
  total: number;
}> {
  let created = 0;
  let skipped = 0;

  try {
    for (const budget of DEFAULT_BUDGETS) {
      try {
        // Check if a budget with this name and scope already exists
        const existing = await db.costBudget.findFirst({
          where: { name: budget.name, scope: budget.scope },
        });

        if (existing) {
          skipped++;
          continue;
        }

        await db.costBudget.create({
          data: {
            name: budget.name,
            scope: budget.scope,
            scopeId: budget.scopeId ?? null,
            period: budget.period,
            tokenLimit: budget.tokenLimit,
            costLimit: budget.costLimit,
            currentTokens: 0,
            currentCost: 0,
            alertThreshold: budget.alertThreshold,
            isEnabled: true,
            lastResetAt: new Date(),
          },
        });

        created++;
      } catch (error: unknown) {
        console.error(
          `[CostTracker] Failed to seed budget "${budget.name}":`,
          error instanceof Error ? error.message : error
        );
        skipped++;
      }
    }
  } catch (error: unknown) {
    console.error(
      '[CostTracker] seedDefaultBudgets failed:',
      error instanceof Error ? error.message : error
    );
  }

  return {
    created,
    skipped,
    total: DEFAULT_BUDGETS.length,
  };
}
