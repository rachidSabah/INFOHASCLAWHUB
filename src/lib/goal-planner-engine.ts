import { db } from '@/lib/db';

// ============================================================
// Types
// ============================================================

/** A state is a set of key-value pairs representing the world */
export type WorldState = Record<string, unknown>;

/** Precondition / effect condition */
export interface StateCondition {
  key: string;
  value: unknown;
  operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'not_exists';
}

/** Effect of an action on the world state */
export interface StateEffect {
  key: string;
  value: unknown;
  operation?: 'set' | 'increment' | 'decrement' | 'delete' | 'push' | 'merge';
}

/** Action definition for the action graph */
export interface ActionDefinition {
  name: string;
  description?: string;
  preconditions: StateCondition[];
  effects: StateEffect[];
  cost?: number;
  toolMapping?: ToolMapping;
  assignedAgent?: string;
}

/** Mapping an action to an MCP tool call */
export interface ToolMapping {
  serverName: string;
  toolName: string;
  arguments?: Record<string, unknown>;
}

/** A node in the A* search space */
interface SearchNode {
  state: WorldState;
  actions: ActionDefinition[];
  gCost: number; // accumulated cost
  hCost: number; // heuristic cost to goal
  fCost: number; // g + h
  parent: SearchNode | null;
  actionToHere: ActionDefinition | null;
}

/** Plan tree node for hierarchical display */
export interface PlanTreeNode {
  id: string;
  action: string;
  description?: string;
  preconditions: StateCondition[];
  effects: StateEffect[];
  status: string;
  assignedAgent?: string;
  cost: number;
  order: number;
  children: PlanTreeNode[];
}

/** Goal status with progress info */
export interface GoalStatusResult {
  id: string;
  title: string;
  description: string;
  status: string;
  strategy: string;
  progress: number; // 0-1
  totalActions: number;
  completedActions: number;
  failedActions: number;
  pendingActions: number;
  score: number;
  iterations: number;
  currentState: WorldState;
  goalState: WorldState;
}

/** Filter for listing goals */
export interface GoalFilter {
  status?: string;
  strategy?: string;
  limit?: number;
  offset?: number;
}

/** Cost estimate result */
export interface CostEstimate {
  goalId: string;
  totalCost: number;
  actionCosts: Array<{ actionId: string; name: string; cost: number }>;
  estimatedSteps: number;
  feasibility: 'high' | 'medium' | 'low' | 'impossible';
}

// ============================================================
// Helpers
// ============================================================

function parseJsonSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stateToString(state: WorldState): string {
  return JSON.stringify(state, Object.keys(state).sort());
}

/** Check if a state condition is satisfied by the current world state */
function isConditionMet(condition: StateCondition, state: WorldState): boolean {
  const op = condition.operator ?? 'eq';
  const current = state[condition.key];

  switch (op) {
    case 'eq':
      return current === condition.value;
    case 'neq':
      return current !== condition.value;
    case 'gt':
      return typeof current === 'number' && typeof condition.value === 'number' && current > condition.value;
    case 'gte':
      return typeof current === 'number' && typeof condition.value === 'number' && current >= condition.value;
    case 'lt':
      return typeof current === 'number' && typeof condition.value === 'number' && current < condition.value;
    case 'lte':
      return typeof current === 'number' && typeof condition.value === 'number' && current <= condition.value;
    case 'exists':
      return condition.key in state;
    case 'not_exists':
      return !(condition.key in state);
    default:
      return current === condition.value;
  }
}

/** Check if all preconditions are met */
function arePreconditionsMet(preconditions: StateCondition[], state: WorldState): boolean {
  return preconditions.every((cond) => isConditionMet(cond, state));
}

/** Apply effects to a world state, returning a new state */
function applyEffects(effects: StateEffect[], state: WorldState): WorldState {
  const newState = { ...state };

  for (const effect of effects) {
    const op = effect.operation ?? 'set';

    switch (op) {
      case 'set':
        newState[effect.key] = effect.value;
        break;
      case 'increment':
        newState[effect.key] = (typeof newState[effect.key] === 'number' ? newState[effect.key] : 0) + (typeof effect.value === 'number' ? effect.value : 0);
        break;
      case 'decrement':
        newState[effect.key] = (typeof newState[effect.key] === 'number' ? newState[effect.key] : 0) - (typeof effect.value === 'number' ? effect.value : 0);
        break;
      case 'delete':
        delete newState[effect.key];
        break;
      case 'push':
        if (Array.isArray(newState[effect.key])) {
          newState[effect.key] = [...(newState[effect.key] as unknown[]), effect.value];
        } else {
          newState[effect.key] = [effect.value];
        }
        break;
      case 'merge':
        if (typeof newState[effect.key] === 'object' && typeof effect.value === 'object' && newState[effect.key] !== null && effect.value !== null) {
          newState[effect.key] = { ...(newState[effect.key] as Record<string, unknown>), ...(effect.value as Record<string, unknown>) };
        } else {
          newState[effect.key] = effect.value;
        }
        break;
    }
  }

  return newState;
}

/** Heuristic: count of unsatisfied goal conditions (admissible) */
function computeHeuristic(goalState: WorldState, currentState: WorldState): number {
  let unsatisfied = 0;
  for (const key of Object.keys(goalState)) {
    if (currentState[key] !== goalState[key]) {
      unsatisfied++;
    }
  }
  return unsatisfied;
}

/** Check if current state satisfies the goal state */
function isGoalReached(goalState: WorldState, currentState: WorldState): boolean {
  for (const key of Object.keys(goalState)) {
    if (currentState[key] !== goalState[key]) {
      return false;
    }
  }
  return true;
}

// ============================================================
// Core Engine — exported async functions
// ============================================================

/**
 * Create a new goal plan with a desired goal state.
 */
export async function createGoal(
  title: string,
  description: string,
  goalState: WorldState,
  strategy: 'astar' | 'bfs' | 'dfs' | 'greedy' = 'astar'
): Promise<{
  id: string;
  title: string;
  description: string;
  status: string;
  strategy: string;
  goalState: WorldState;
}> {
  try {
    const plan = await db.goalPlan.create({
      data: {
        title,
        description,
        status: 'planning',
        goalState: JSON.stringify(goalState),
        currentState: JSON.stringify({}),
        planTree: JSON.stringify([]),
        strategy,
        maxDepth: 10,
        iterations: 0,
        score: 0,
      },
    });

    return {
      id: plan.id,
      title: plan.title,
      description: plan.description,
      status: plan.status,
      strategy: plan.strategy,
      goalState: parseJsonSafe<WorldState>(plan.goalState, {}),
    };
  } catch (error: unknown) {
    throw new Error(`Failed to create goal: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Add an action to a goal plan's action graph.
 */
export async function addAction(
  planId: string,
  action: ActionDefinition
): Promise<{
  id: string;
  name: string;
  status: string;
  cost: number;
  order: number;
}> {
  try {
    // Get current max order
    const existingActions = await db.goalAction.findMany({
      where: { planId },
      orderBy: { order: 'desc' },
      take: 1,
    });

    const nextOrder = existingActions.length > 0 ? existingActions[0].order + 1 : 0;

    const goalAction = await db.goalAction.create({
      data: {
        planId,
        name: action.name,
        description: action.description ?? null,
        preconditions: JSON.stringify(action.preconditions),
        effects: JSON.stringify(action.effects),
        cost: action.cost ?? 1.0,
        status: 'pending',
        assignedAgent: action.assignedAgent ?? null,
        toolMapping: action.toolMapping ? JSON.stringify(action.toolMapping) : null,
        order: nextOrder,
      },
    });

    return {
      id: goalAction.id,
      name: goalAction.name,
      status: goalAction.status,
      cost: goalAction.cost,
      order: goalAction.order,
    };
  } catch (error: unknown) {
    throw new Error(`Failed to add action: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Run A* (or other strategy) planning algorithm to generate an optimal plan.
 * Returns the ordered plan tree.
 */
export async function planGoal(goalId: string): Promise<{
  planId: string;
  strategy: string;
  actions: PlanTreeNode[];
  score: number;
  iterations: number;
  feasible: boolean;
}> {
  try {
    const plan = await db.goalPlan.findUnique({
      where: { id: goalId },
      include: { actions: { orderBy: { order: 'asc' } } },
    });

    if (!plan) {
      throw new Error(`Goal plan not found: ${goalId}`);
    }

    const goalState = parseJsonSafe<WorldState>(plan.goalState, {});
    const currentState = parseJsonSafe<WorldState>(plan.currentState, {});

    // Parse all available actions
    const availableActions: ActionDefinition[] = plan.actions.map((a) => ({
      name: a.name,
      description: a.description ?? undefined,
      preconditions: parseJsonSafe<StateCondition[]>(a.preconditions, []),
      effects: parseJsonSafe<StateEffect[]>(a.effects, []),
      cost: a.cost,
      toolMapping: a.toolMapping ? parseJsonSafe<ToolMapping>(a.toolMapping, undefined as unknown as ToolMapping) : undefined,
      assignedAgent: a.assignedAgent ?? undefined,
    }));

    // Run the selected strategy
    const strategy = plan.strategy as 'astar' | 'bfs' | 'dfs' | 'greedy';
    let result: ActionDefinition[];
    let iterations = 0;

    switch (strategy) {
      case 'astar':
        ({ result, iterations } = runAStar(currentState, goalState, availableActions, plan.maxDepth));
        break;
      case 'bfs':
        ({ result, iterations } = runBFS(currentState, goalState, availableActions, plan.maxDepth));
        break;
      case 'dfs':
        ({ result, iterations } = runDFS(currentState, goalState, availableActions, plan.maxDepth));
        break;
      case 'greedy':
        ({ result, iterations } = runGreedy(currentState, goalState, availableActions, plan.maxDepth));
        break;
      default:
        ({ result, iterations } = runAStar(currentState, goalState, availableActions, plan.maxDepth));
    }

    // Build plan tree
    const planTree: PlanTreeNode[] = result.map((action, index) => {
      const dbAction = plan.actions.find((a) => a.name === action.name);
      return {
        id: dbAction?.id ?? `action_${index}`,
        action: action.name,
        description: action.description,
        preconditions: action.preconditions,
        effects: action.effects,
        status: 'pending',
        assignedAgent: action.assignedAgent,
        cost: action.cost ?? 1.0,
        order: index,
        children: [],
      };
    });

    // Calculate plan quality score
    const totalCost = result.reduce((sum, a) => sum + (a.cost ?? 1.0), 0);
    const maxPossibleCost = availableActions.reduce((sum, a) => sum + (a.cost ?? 1.0), 0);
    const score = maxPossibleCost > 0 ? Math.max(0, 1 - totalCost / maxPossibleCost) : 1;

    // Update action orders and statuses based on the plan
    for (let i = 0; i < result.length; i++) {
      const dbAction = plan.actions.find((a) => a.name === result[i].name);
      if (dbAction) {
        await db.goalAction.update({
          where: { id: dbAction.id },
          data: { order: i, status: 'pending' },
        });
      }
    }

    // Update the plan
    await db.goalPlan.update({
      where: { id: goalId },
      data: {
        status: 'planning',
        planTree: JSON.stringify(planTree),
        score,
        iterations,
      },
    });

    return {
      planId: goalId,
      strategy,
      actions: planTree,
      score,
      iterations,
      feasible: result.length > 0 || isGoalReached(goalState, currentState),
    };
  } catch (error: unknown) {
    throw new Error(`Failed to plan goal: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Execute the next action in the plan. Returns the action and its result placeholder.
 */
export async function executeNextAction(goalId: string): Promise<{
  actionId: string;
  actionName: string;
  status: string;
  description?: string;
  assignedAgent?: string;
  toolMapping?: ToolMapping;
} | null> {
  try {
    const plan = await db.goalPlan.findUnique({
      where: { id: goalId },
    });

    if (!plan) {
      throw new Error(`Goal plan not found: ${goalId}`);
    }

    if (plan.status !== 'planning' && plan.status !== 'executing') {
      throw new Error(`Goal plan is in '${plan.status}' status, cannot execute`);
    }

    // Find the next pending action
    const nextAction = await db.goalAction.findFirst({
      where: {
        planId: goalId,
        status: 'pending',
      },
      orderBy: { order: 'asc' },
    });

    if (!nextAction) {
      // No more actions — check if goal is reached
      const goalState = parseJsonSafe<WorldState>(plan.goalState, {});
      const currentState = parseJsonSafe<WorldState>(plan.currentState, {});
      const goalReached = isGoalReached(goalState, currentState);

      await db.goalPlan.update({
        where: { id: goalId },
        data: {
          status: goalReached ? 'completed' : 'failed',
        },
      });

      return null;
    }

    // Mark action as in_progress and plan as executing
    await db.goalAction.update({
      where: { id: nextAction.id },
      data: { status: 'in_progress' },
    });

    await db.goalPlan.update({
      where: { id: goalId },
      data: { status: 'executing' },
    });

    return {
      actionId: nextAction.id,
      actionName: nextAction.name,
      status: 'in_progress',
      description: nextAction.description ?? undefined,
      assignedAgent: nextAction.assignedAgent ?? undefined,
      toolMapping: nextAction.toolMapping
        ? parseJsonSafe<ToolMapping>(nextAction.toolMapping, undefined as unknown as ToolMapping)
        : undefined,
    };
  } catch (error: unknown) {
    throw new Error(`Failed to execute next action: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Report the result of an action execution. Updates the world state and action status.
 */
export async function reportActionResult(
  actionId: string,
  result: 'success' | 'failure',
  newState?: WorldState
): Promise<{
  actionId: string;
  status: string;
  planStatus: string;
}> {
  try {
    const action = await db.goalAction.findUnique({
      where: { id: actionId },
    });

    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }

    const actionStatus = result === 'success' ? 'completed' : 'failed';

    // Update the action
    await db.goalAction.update({
      where: { id: actionId },
      data: {
        status: actionStatus,
        result: JSON.stringify({ outcome: result, newState: newState ?? {} }),
      },
    });

    // If successful, update the plan's current state by applying effects
    if (result === 'success' && newState) {
      const plan = await db.goalPlan.findUnique({
        where: { id: action.planId },
      });

      if (plan) {
        const currentState = parseJsonSafe<WorldState>(plan.currentState, {});
        const effects = parseJsonSafe<StateEffect[]>(action.effects, []);
        const updatedState = applyEffects(effects, { ...currentState, ...newState });

        await db.goalPlan.update({
          where: { id: action.planId },
          data: {
            currentState: JSON.stringify(updatedState),
          },
        });
      }
    }

    // Check if all actions are done
    const pendingActions = await db.goalAction.count({
      where: { planId: action.planId, status: 'pending' },
    });

    const inProgressActions = await db.goalAction.count({
      where: { planId: action.planId, status: 'in_progress' },
    });

    let planStatus = 'executing';
    if (pendingActions === 0 && inProgressActions === 0) {
      // All actions complete — determine final status
      const failedCount = await db.goalAction.count({
        where: { planId: action.planId, status: 'failed' },
      });
      planStatus = failedCount > 0 ? 'failed' : 'completed';

      await db.goalPlan.update({
        where: { id: action.planId },
        data: { status: planStatus },
      });
    }

    return {
      actionId,
      status: actionStatus,
      planStatus,
    };
  } catch (error: unknown) {
    throw new Error(`Failed to report action result: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Replan from a new state when actions fail or the world changes.
 */
export async function replan(
  goalId: string,
  newState: WorldState
): Promise<{
  planId: string;
  actions: PlanTreeNode[];
  score: number;
  iterations: number;
  feasible: boolean;
}> {
  try {
    // Update current state
    await db.goalPlan.update({
      where: { id: goalId },
      data: {
        currentState: JSON.stringify(newState),
        status: 'planning',
      },
    });

    // Reset failed actions to pending
    await db.goalAction.updateMany({
      where: { planId: goalId, status: 'failed' },
      data: { status: 'pending', result: null },
    });

    // Re-run planning
    return await planGoal(goalId);
  } catch (error: unknown) {
    throw new Error(`Failed to replan: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Assign an agent to an action.
 */
export async function assignAgent(
  actionId: string,
  agentId: string
): Promise<{
  actionId: string;
  assignedAgent: string;
}> {
  try {
    const action = await db.goalAction.update({
      where: { id: actionId },
      data: { assignedAgent: agentId },
    });

    return {
      actionId: action.id,
      assignedAgent: action.assignedAgent ?? agentId,
    };
  } catch (error: unknown) {
    throw new Error(`Failed to assign agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get the full plan as a tree structure.
 */
export async function getPlanTree(goalId: string): Promise<PlanTreeNode[]> {
  try {
    const plan = await db.goalPlan.findUnique({
      where: { id: goalId },
      include: { actions: { orderBy: { order: 'asc' } } },
    });

    if (!plan) {
      throw new Error(`Goal plan not found: ${goalId}`);
    }

    // First try the stored plan tree
    const storedTree = parseJsonSafe<PlanTreeNode[]>(plan.planTree, []);
    if (storedTree.length > 0) {
      // Update statuses from DB actions
      const actionMap = new Map(plan.actions.map((a) => [a.name, a]));
      return storedTree.map((node) => {
        const dbAction = actionMap.get(node.action);
        if (dbAction) {
          return {
            ...node,
            status: dbAction.status,
            assignedAgent: dbAction.assignedAgent ?? node.assignedAgent,
          };
        }
        return node;
      });
    }

    // Fallback: build from actions
    return plan.actions.map((action, index) => ({
      id: action.id,
      action: action.name,
      description: action.description ?? undefined,
      preconditions: parseJsonSafe<StateCondition[]>(action.preconditions, []),
      effects: parseJsonSafe<StateEffect[]>(action.effects, []),
      status: action.status,
      assignedAgent: action.assignedAgent ?? undefined,
      cost: action.cost,
      order: action.order,
      children: [],
    }));
  } catch (error: unknown) {
    throw new Error(`Failed to get plan tree: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get goal status with progress information.
 */
export async function getGoalStatus(goalId: string): Promise<GoalStatusResult> {
  try {
    const plan = await db.goalPlan.findUnique({
      where: { id: goalId },
      include: { actions: true },
    });

    if (!plan) {
      throw new Error(`Goal plan not found: ${goalId}`);
    }

    const total = plan.actions.length;
    const completed = plan.actions.filter((a) => a.status === 'completed').length;
    const failed = plan.actions.filter((a) => a.status === 'failed').length;
    const pending = plan.actions.filter((a) => a.status === 'pending' || a.status === 'in_progress').length;
    const progress = total > 0 ? completed / total : 0;

    return {
      id: plan.id,
      title: plan.title,
      description: plan.description,
      status: plan.status,
      strategy: plan.strategy,
      progress,
      totalActions: total,
      completedActions: completed,
      failedActions: failed,
      pendingActions: pending,
      score: plan.score,
      iterations: plan.iterations,
      currentState: parseJsonSafe<WorldState>(plan.currentState, {}),
      goalState: parseJsonSafe<WorldState>(plan.goalState, {}),
    };
  } catch (error: unknown) {
    throw new Error(`Failed to get goal status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * List all goals with optional filter.
 */
export async function listGoals(filter?: GoalFilter): Promise<GoalStatusResult[]> {
  try {
    const where: Record<string, unknown> = {};
    if (filter?.status) where.status = filter.status;
    if (filter?.strategy) where.strategy = filter.strategy;

    const plans = await db.goalPlan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filter?.limit ?? 50,
      skip: filter?.offset ?? 0,
      include: { actions: true },
    });

    return plans.map((plan) => {
      const total = plan.actions.length;
      const completed = plan.actions.filter((a) => a.status === 'completed').length;
      const failed = plan.actions.filter((a) => a.status === 'failed').length;
      const pending = plan.actions.filter((a) => a.status === 'pending' || a.status === 'in_progress').length;
      const progress = total > 0 ? completed / total : 0;

      return {
        id: plan.id,
        title: plan.title,
        description: plan.description,
        status: plan.status,
        strategy: plan.strategy,
        progress,
        totalActions: total,
        completedActions: completed,
        failedActions: failed,
        pendingActions: pending,
        score: plan.score,
        iterations: plan.iterations,
        currentState: parseJsonSafe<WorldState>(plan.currentState, {}),
        goalState: parseJsonSafe<WorldState>(plan.goalState, {}),
      };
    });
  } catch (error: unknown) {
    throw new Error(`Failed to list goals: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Cancel a goal plan.
 */
export async function cancelGoal(goalId: string): Promise<{
  id: string;
  status: string;
}> {
  try {
    const plan = await db.goalPlan.update({
      where: { id: goalId },
      data: { status: 'cancelled' },
    });

    // Mark all in-progress actions as skipped
    await db.goalAction.updateMany({
      where: { planId: goalId, status: { in: ['pending', 'in_progress'] } },
      data: { status: 'skipped' },
    });

    return {
      id: plan.id,
      status: plan.status,
    };
  } catch (error: unknown) {
    throw new Error(`Failed to cancel goal: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Estimate the total cost of a plan and assess feasibility.
 */
export async function estimatePlanCost(goalId: string): Promise<CostEstimate> {
  try {
    const plan = await db.goalPlan.findUnique({
      where: { id: goalId },
      include: { actions: true },
    });

    if (!plan) {
      throw new Error(`Goal plan not found: ${goalId}`);
    }

    const actionCosts = plan.actions.map((a) => ({
      actionId: a.id,
      name: a.name,
      cost: a.cost,
    }));

    const totalCost = actionCosts.reduce((sum, a) => sum + a.cost, 0);

    // Assess feasibility by checking preconditions
    const currentState = parseJsonSafe<WorldState>(plan.currentState, {});
    const goalState = parseJsonSafe<WorldState>(plan.goalState, {});

    // Quick check: can we reach any action from current state?
    let reachableActions = 0;
    for (const action of plan.actions) {
      const preconditions = parseJsonSafe<StateCondition[]>(action.preconditions, []);
      if (arePreconditionsMet(preconditions, currentState)) {
        reachableActions++;
      }
    }

    let feasibility: CostEstimate['feasibility'];
    if (plan.actions.length === 0) {
      feasibility = isGoalReached(goalState, currentState) ? 'high' : 'impossible';
    } else if (reachableActions === 0) {
      feasibility = 'impossible';
    } else if (reachableActions === plan.actions.length) {
      feasibility = 'high';
    } else if (reachableActions >= plan.actions.length / 2) {
      feasibility = 'medium';
    } else {
      feasibility = 'low';
    }

    return {
      goalId,
      totalCost,
      actionCosts,
      estimatedSteps: plan.actions.length,
      feasibility,
    };
  } catch (error: unknown) {
    throw new Error(`Failed to estimate plan cost: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================================
// Search Strategy Implementations
// ============================================================

function runAStar(
  startState: WorldState,
  goalState: WorldState,
  actions: ActionDefinition[],
  maxDepth: number
): { result: ActionDefinition[]; iterations: number } {
  if (isGoalReached(goalState, startState)) {
    return { result: [], iterations: 0 };
  }

  const openSet: SearchNode[] = [];
  const closedSet = new Set<string>();

  const startNode: SearchNode = {
    state: startState,
    actions: [],
    gCost: 0,
    hCost: computeHeuristic(goalState, startState),
    fCost: computeHeuristic(goalState, startState),
    parent: null,
    actionToHere: null,
  };

  openSet.push(startNode);
  let iterations = 0;

  while (openSet.length > 0 && iterations < 1000) {
    iterations++;

    // Get node with lowest fCost
    openSet.sort((a, b) => a.fCost - b.fCost);
    const current = openSet.shift()!;

    // Check if goal reached
    if (isGoalReached(goalState, current.state)) {
      return {
        result: reconstructPath(current),
        iterations,
      };
    }

    const stateKey = stateToString(current.state);
    if (closedSet.has(stateKey)) continue;
    closedSet.add(stateKey);

    // Depth check
    if (current.actions.length >= maxDepth) continue;

    // Expand: try each applicable action
    for (const action of actions) {
      if (!arePreconditionsMet(action.preconditions, current.state)) continue;

      const newState = applyEffects(action.effects, current.state);
      const newStateKey = stateToString(newState);

      if (closedSet.has(newStateKey)) continue;

      const gCost = current.gCost + (action.cost ?? 1.0);
      const hCost = computeHeuristic(goalState, newState);

      const successor: SearchNode = {
        state: newState,
        actions: [...current.actions, action],
        gCost,
        hCost,
        fCost: gCost + hCost,
        parent: current,
        actionToHere: action,
      };

      // Check if we already have a better path to this state
      const existingIndex = openSet.findIndex(
        (n) => stateToString(n.state) === newStateKey
      );

      if (existingIndex >= 0) {
        if (gCost < openSet[existingIndex].gCost) {
          openSet[existingIndex] = successor;
        }
      } else {
        openSet.push(successor);
      }
    }
  }

  return { result: [], iterations };
}

function runBFS(
  startState: WorldState,
  goalState: WorldState,
  actions: ActionDefinition[],
  maxDepth: number
): { result: ActionDefinition[]; iterations: number } {
  if (isGoalReached(goalState, startState)) {
    return { result: [], iterations: 0 };
  }

  const queue: SearchNode[] = [];
  const visited = new Set<string>();

  queue.push({
    state: startState,
    actions: [],
    gCost: 0,
    hCost: 0,
    fCost: 0,
    parent: null,
    actionToHere: null,
  });

  visited.add(stateToString(startState));
  let iterations = 0;

  while (queue.length > 0 && iterations < 1000) {
    iterations++;

    const current = queue.shift()!;

    if (isGoalReached(goalState, current.state)) {
      return {
        result: reconstructPath(current),
        iterations,
      };
    }

    if (current.actions.length >= maxDepth) continue;

    for (const action of actions) {
      if (!arePreconditionsMet(action.preconditions, current.state)) continue;

      const newState = applyEffects(action.effects, current.state);
      const stateKey = stateToString(newState);

      if (visited.has(stateKey)) continue;
      visited.add(stateKey);

      queue.push({
        state: newState,
        actions: [...current.actions, action],
        gCost: current.gCost + (action.cost ?? 1.0),
        hCost: 0,
        fCost: 0,
        parent: current,
        actionToHere: action,
      });
    }
  }

  return { result: [], iterations };
}

function runDFS(
  startState: WorldState,
  goalState: WorldState,
  actions: ActionDefinition[],
  maxDepth: number
): { result: ActionDefinition[]; iterations: number } {
  if (isGoalReached(goalState, startState)) {
    return { result: [], iterations: 0 };
  }

  const stack: SearchNode[] = [];
  const visited = new Set<string>();

  stack.push({
    state: startState,
    actions: [],
    gCost: 0,
    hCost: 0,
    fCost: 0,
    parent: null,
    actionToHere: null,
  });

  let iterations = 0;

  while (stack.length > 0 && iterations < 1000) {
    iterations++;

    const current = stack.pop()!;

    const stateKey = stateToString(current.state);
    if (visited.has(stateKey)) continue;
    visited.add(stateKey);

    if (isGoalReached(goalState, current.state)) {
      return {
        result: reconstructPath(current),
        iterations,
      };
    }

    if (current.actions.length >= maxDepth) continue;

    for (const action of actions) {
      if (!arePreconditionsMet(action.preconditions, current.state)) continue;

      const newState = applyEffects(action.effects, current.state);

      stack.push({
        state: newState,
        actions: [...current.actions, action],
        gCost: current.gCost + (action.cost ?? 1.0),
        hCost: 0,
        fCost: 0,
        parent: current,
        actionToHere: action,
      });
    }
  }

  return { result: [], iterations };
}

function runGreedy(
  startState: WorldState,
  goalState: WorldState,
  actions: ActionDefinition[],
  maxDepth: number
): { result: ActionDefinition[]; iterations: number } {
  if (isGoalReached(goalState, startState)) {
    return { result: [], iterations: 0 };
  }

  let currentState = { ...startState };
  const path: ActionDefinition[] = [];
  let iterations = 0;

  while (!isGoalReached(goalState, currentState) && iterations < maxDepth) {
    iterations++;

    // Find all applicable actions
    const applicable = actions.filter((a) =>
      arePreconditionsMet(a.preconditions, currentState)
    );

    if (applicable.length === 0) break;

    // Pick the action that reduces the heuristic the most
    let bestAction: ActionDefinition | null = null;
    let bestHeuristic = computeHeuristic(goalState, currentState);

    for (const action of applicable) {
      const newState = applyEffects(action.effects, currentState);
      const h = computeHeuristic(goalState, newState);
      if (h < bestHeuristic) {
        bestHeuristic = h;
        bestAction = action;
      }
    }

    // If no action improves the state, pick the cheapest applicable one
    if (!bestAction) {
      bestAction = applicable.sort((a, b) => (a.cost ?? 1.0) - (b.cost ?? 1.0))[0];
    }

    if (!bestAction) break;

    currentState = applyEffects(bestAction.effects, currentState);
    path.push(bestAction);
  }

  return { result: path, iterations };
}

function reconstructPath(node: SearchNode): ActionDefinition[] {
  const path: ActionDefinition[] = [];
  let current: SearchNode | null = node;
  while (current?.actionToHere) {
    path.unshift(current.actionToHere);
    current = current.parent;
  }
  return path;
}
