import { db } from './db';

// ============================================================
// Types
// ============================================================

export type SwarmTopology = 'hierarchical' | 'mesh' | 'ring' | 'star' | 'custom';
export type ConsensusProtocol = 'raft' | 'byzantine' | 'gossip' | 'paxos';
export type SwarmStatus = 'idle' | 'forming' | 'active' | 'disbanding' | 'error';
export type AgentRole = 'queen' | 'worker' | 'scout' | 'coordinator' | 'observer';
export type AgentStatus = 'idle' | 'busy' | 'offline' | 'error';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed';

export interface SwarmAgent {
  agentId: string;
  role: AgentRole;
  status: AgentStatus;
  joinedAt: string;
  tasksCompleted: number;
}

export interface SwarmTask {
  id: string;
  task: string;
  assignedTo: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: string;
  completedAt?: string;
  result?: string;
}

export interface ConsensusRound {
  round: number;
  proposal: string;
  votes: Array<{ voterId: string; vote: 'for' | 'against' | 'abstain'; timestamp: string }>;
  decision: 'pending' | 'accepted' | 'rejected' | 'timeout';
  startedAt: string;
  completedAt?: string;
}

export interface SwarmConfig {
  heartbeatIntervalMs?: number;
  taskTimeoutMs?: number;
  consensusTimeoutMs?: number;
  maxRetries?: number;
  autoScaleConfig?: {
    scaleUpThreshold: number;   // CPU/load % to scale up
    scaleDownThreshold: number; // CPU/load % to scale down
    minAgents: number;
    maxAgents: number;
    cooldownMs: number;
  };
  [key: string]: unknown;
}

export interface AutoScaleMetrics {
  cpuLoad: number;        // 0-1
  taskQueueLength: number;
  avgTaskDurationMs: number;
  errorRate: number;      // 0-1
  activeAgents: number;
}

export interface SwarmStatusResult {
  id: string;
  name: string;
  description: string | null;
  topology: SwarmTopology;
  consensus: ConsensusProtocol;
  queenAgentId: string | null;
  agents: SwarmAgent[];
  maxAgents: number;
  status: SwarmStatus;
  taskQueue: SwarmTask[];
  consensusLog: ConsensusRound[];
  config: SwarmConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListSwarmsFilter {
  topology?: SwarmTopology;
  consensus?: ConsensusProtocol;
  status?: SwarmStatus;
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

function generateId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function priorityWeight(priority: TaskPriority): number {
  switch (priority) {
    case 'critical': return 4;
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
  }
}

/**
 * Select the best agent for a task based on the swarm topology.
 */
function selectAgentForTopology(
  agents: SwarmAgent[],
  topology: SwarmTopology,
  _task: SwarmTask,
  queenAgentId: string | null
): string | null {
  const available = agents.filter(a => a.status === 'idle');
  if (available.length === 0) return null;

  switch (topology) {
    case 'hierarchical': {
      // In hierarchical, the queen delegates; prefer workers over queen
      const workers = available.filter(a => a.role !== 'queen');
      if (workers.length > 0) {
        // Pick worker with fewest completed tasks (load balance)
        workers.sort((a, b) => a.tasksCompleted - b.tasksCompleted);
        return workers[0].agentId;
      }
      // Fallback: queen does it herself
      return queenAgentId;
    }

    case 'mesh': {
      // In mesh, any node can handle; round-robin-ish via least tasks
      available.sort((a, b) => a.tasksCompleted - b.tasksCompleted);
      return available[0].agentId;
    }

    case 'ring': {
      // In ring topology, assign to the next available agent in order
      return available[0].agentId;
    }

    case 'star': {
      // In star, the center node (queen/coordinator) delegates to periphery
      const periphery = available.filter(a => a.role !== 'queen' && a.role !== 'coordinator');
      if (periphery.length > 0) {
        periphery.sort((a, b) => a.tasksCompleted - b.tasksCompleted);
        return periphery[0].agentId;
      }
      return available[0].agentId;
    }

    case 'custom':
    default: {
      // Default: least-loaded agent
      available.sort((a, b) => a.tasksCompleted - b.tasksCompleted);
      return available[0].agentId;
    }
  }
}

/**
 * Determine the quorum size for a consensus protocol.
 */
function getQuorumSize(agentCount: number, protocol: ConsensusProtocol): number {
  switch (protocol) {
    case 'raft':
      return Math.floor(agentCount / 2) + 1;
    case 'byzantine':
      return Math.floor((2 * agentCount) / 3) + 1;
    case 'paxos':
      return Math.floor(agentCount / 2) + 1;
    case 'gossip':
      // Gossip doesn't need quorum in the traditional sense
      return Math.max(1, Math.floor(agentCount * 0.6));
    default:
      return Math.floor(agentCount / 2) + 1;
  }
}

// ============================================================
// Exported Functions
// ============================================================

/**
 * Create a new swarm with the specified topology and consensus protocol.
 */
export async function createSwarm(
  name: string,
  topology: SwarmTopology = 'hierarchical',
  consensus: ConsensusProtocol = 'raft',
  config?: SwarmConfig
): Promise<SwarmStatusResult> {
  try {
    const swarmConfig: SwarmConfig = {
      heartbeatIntervalMs: 5000,
      taskTimeoutMs: 300000,
      consensusTimeoutMs: 60000,
      maxRetries: 3,
      autoScaleConfig: {
        scaleUpThreshold: 0.8,
        scaleDownThreshold: 0.3,
        minAgents: 1,
        maxAgents: 20,
        cooldownMs: 60000,
      },
      ...config,
    };

    const swarm = await db.swarm.create({
      data: {
        name,
        topology,
        consensus,
        queenAgentId: null,
        agents: '[]',
        maxAgents: swarmConfig.autoScaleConfig?.maxAgents ?? 10,
        status: 'forming',
        taskQueue: '[]',
        consensusLog: '[]',
        config: JSON.stringify(swarmConfig),
      },
    });

    return {
      id: swarm.id,
      name: swarm.name,
      description: swarm.description,
      topology: swarm.topology as SwarmTopology,
      consensus: swarm.consensus as ConsensusProtocol,
      queenAgentId: swarm.queenAgentId,
      agents: [],
      maxAgents: swarm.maxAgents,
      status: swarm.status as SwarmStatus,
      taskQueue: [],
      consensusLog: [],
      config: swarmConfig,
      createdAt: swarm.createdAt,
      updatedAt: swarm.updatedAt,
    };
  } catch (err: unknown) {
    console.error(
      '[SwarmEngine] createSwarm error:',
      err instanceof Error ? err.message : err
    );
    throw err;
  }
}

/**
 * Add an agent to a swarm. For hierarchical topology, the first agent
 * with role 'queen' becomes the queen.
 */
export async function addAgentToSwarm(
  swarmId: string,
  agentId: string,
  role: AgentRole = 'worker'
): Promise<SwarmStatusResult> {
  try {
    const swarm = await db.swarm.findUnique({ where: { id: swarmId } });
    if (!swarm) throw new Error(`Swarm not found: ${swarmId}`);

    const agents = parseJsonSafe<SwarmAgent[]>(swarm.agents, []);

    // Check if agent is already in the swarm
    if (agents.some(a => a.agentId === agentId)) {
      throw new Error(`Agent ${agentId} is already in swarm ${swarmId}`);
    }

    // Check capacity
    if (agents.length >= swarm.maxAgents) {
      throw new Error(`Swarm ${swarmId} is at max capacity (${swarm.maxAgents})`);
    }

    // Verify the agent exists in the Agent table
    const agent = await db.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new Error(`Agent not found: ${agentId}`);

    // Add the agent
    const newAgent: SwarmAgent = {
      agentId,
      role,
      status: 'idle',
      joinedAt: new Date().toISOString(),
      tasksCompleted: 0,
    };

    agents.push(newAgent);

    // If hierarchical and this is the queen, set queenAgentId
    let queenAgentId = swarm.queenAgentId;
    if (role === 'queen' && !queenAgentId) {
      queenAgentId = agentId;
    }

    // Determine new status
    let newStatus: SwarmStatus = swarm.status as SwarmStatus;
    if (newStatus === 'forming' && agents.length >= 1) {
      newStatus = 'active';
    }

    const updated = await db.swarm.update({
      where: { id: swarmId },
      data: {
        agents: JSON.stringify(agents),
        queenAgentId,
        status: newStatus,
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      topology: updated.topology as SwarmTopology,
      consensus: updated.consensus as ConsensusProtocol,
      queenAgentId: updated.queenAgentId,
      agents,
      maxAgents: updated.maxAgents,
      status: updated.status as SwarmStatus,
      taskQueue: parseJsonSafe<SwarmTask[]>(updated.taskQueue, []),
      consensusLog: parseJsonSafe<ConsensusRound[]>(updated.consensusLog, []),
      config: parseJsonSafe<SwarmConfig>(updated.config, {}),
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  } catch (err: unknown) {
    console.error(
      '[SwarmEngine] addAgentToSwarm error:',
      err instanceof Error ? err.message : err
    );
    throw err;
  }
}

/**
 * Remove an agent from a swarm. If the queen is removed, the next
 * senior agent is promoted (for hierarchical topology).
 */
export async function removeAgentFromSwarm(
  swarmId: string,
  agentId: string
): Promise<SwarmStatusResult> {
  try {
    const swarm = await db.swarm.findUnique({ where: { id: swarmId } });
    if (!swarm) throw new Error(`Swarm not found: ${swarmId}`);

    const agents = parseJsonSafe<SwarmAgent[]>(swarm.agents, []);
    const agentIndex = agents.findIndex(a => a.agentId === agentId);

    if (agentIndex === -1) {
      throw new Error(`Agent ${agentId} is not in swarm ${swarmId}`);
    }

    // Remove the agent
    const removedAgent = agents.splice(agentIndex, 1)[0];

    // If the queen was removed, promote the next most experienced agent
    let queenAgentId = swarm.queenAgentId;
    if (removedAgent.role === 'queen' && agents.length > 0) {
      // Promote the agent with the most completed tasks
      const newQueen = agents.reduce((best, a) =>
        a.tasksCompleted > best.tasksCompleted ? a : best
      );
      newQueen.role = 'queen';
      queenAgentId = newQueen.agentId;
    } else if (agents.length === 0) {
      queenAgentId = null;
    }

    // Reassign any tasks that were assigned to this agent
    const taskQueue = parseJsonSafe<SwarmTask[]>(swarm.taskQueue, []);
    for (const task of taskQueue) {
      if (task.assignedTo === agentId && task.status !== 'completed' && task.status !== 'failed') {
        task.assignedTo = null;
        task.status = 'pending';
      }
    }

    // Determine new status
    let newStatus: SwarmStatus = swarm.status as SwarmStatus;
    if (agents.length === 0) {
      newStatus = 'forming';
    }

    const updated = await db.swarm.update({
      where: { id: swarmId },
      data: {
        agents: JSON.stringify(agents),
        queenAgentId,
        taskQueue: JSON.stringify(taskQueue),
        status: newStatus,
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      topology: updated.topology as SwarmTopology,
      consensus: updated.consensus as ConsensusProtocol,
      queenAgentId: updated.queenAgentId,
      agents,
      maxAgents: updated.maxAgents,
      status: updated.status as SwarmStatus,
      taskQueue,
      consensusLog: parseJsonSafe<ConsensusRound[]>(updated.consensusLog, []),
      config: parseJsonSafe<SwarmConfig>(updated.config, {}),
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  } catch (err: unknown) {
    console.error(
      '[SwarmEngine] removeAgentFromSwarm error:',
      err instanceof Error ? err.message : err
    );
    throw err;
  }
}

/**
 * Distribute a task to a swarm via its topology. The task is added
 * to the queue and assigned to an available agent.
 */
export async function distributeTask(
  swarmId: string,
  task: string,
  priority: TaskPriority = 'medium'
): Promise<SwarmTask> {
  try {
    const swarm = await db.swarm.findUnique({ where: { id: swarmId } });
    if (!swarm) throw new Error(`Swarm not found: ${swarmId}`);

    if (swarm.status !== 'active') {
      throw new Error(`Swarm ${swarmId} is not active (status: ${swarm.status})`);
    }

    const agents = parseJsonSafe<SwarmAgent[]>(swarm.agents, []);
    const taskQueue = parseJsonSafe<SwarmTask[]>(swarm.taskQueue, []);

    const newTask: SwarmTask = {
      id: generateId(),
      task,
      assignedTo: null,
      priority,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    // Select agent based on topology
    const selectedAgentId = selectAgentForTopology(
      agents,
      swarm.topology as SwarmTopology,
      newTask,
      swarm.queenAgentId
    );

    if (selectedAgentId) {
      newTask.assignedTo = selectedAgentId;
      newTask.status = 'assigned';

      // Update agent status
      const agent = agents.find(a => a.agentId === selectedAgentId);
      if (agent) {
        agent.status = 'busy';
      }
    }

    // Insert task in priority order
    taskQueue.push(newTask);
    taskQueue.sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority));

    await db.swarm.update({
      where: { id: swarmId },
      data: {
        taskQueue: JSON.stringify(taskQueue),
        agents: JSON.stringify(agents),
      },
    });

    return newTask;
  } catch (err: unknown) {
    console.error(
      '[SwarmEngine] distributeTask error:',
      err instanceof Error ? err.message : err
    );
    throw err;
  }
}

/**
 * Initiate a consensus round for a proposal. The round follows
 * the swarm's consensus protocol rules.
 */
export async function initiateConsensus(
  swarmId: string,
  proposal: string
): Promise<ConsensusRound> {
  try {
    const swarm = await db.swarm.findUnique({ where: { id: swarmId } });
    if (!swarm) throw new Error(`Swarm not found: ${swarmId}`);

    const agents = parseJsonSafe<SwarmAgent[]>(swarm.agents, []);
    const consensusLog = parseJsonSafe<ConsensusRound[]>(swarm.consensusLog, []);

    if (agents.length === 0) {
      throw new Error(`Swarm ${swarmId} has no agents to participate in consensus`);
    }

    const roundNumber = consensusLog.length + 1;

    const newRound: ConsensusRound = {
      round: roundNumber,
      proposal,
      votes: [],
      decision: 'pending',
      startedAt: new Date().toISOString(),
    };

    consensusLog.push(newRound);

    await db.swarm.update({
      where: { id: swarmId },
      data: {
        consensusLog: JSON.stringify(consensusLog),
      },
    });

    return newRound;
  } catch (err: unknown) {
    console.error(
      '[SwarmEngine] initiateConsensus error:',
      err instanceof Error ? err.message : err
    );
    throw err;
  }
}

/**
 * Cast a vote in a consensus round. The vote is evaluated against
 * the protocol's quorum rules.
 */
export async function castVote(
  swarmId: string,
  round: number,
  voterId: string,
  vote: 'for' | 'against' | 'abstain'
): Promise<ConsensusRound> {
  try {
    const swarm = await db.swarm.findUnique({ where: { id: swarmId } });
    if (!swarm) throw new Error(`Swarm not found: ${swarmId}`);

    const agents = parseJsonSafe<SwarmAgent[]>(swarm.agents, []);
    const consensusLog = parseJsonSafe<ConsensusRound[]>(swarm.consensusLog, []);

    const roundEntry = consensusLog.find(r => r.round === round);
    if (!roundEntry) throw new Error(`Consensus round ${round} not found in swarm ${swarmId}`);
    if (roundEntry.decision !== 'pending') {
      throw new Error(`Consensus round ${round} is already ${roundEntry.decision}`);
    }

    // Verify voter is in the swarm
    if (!agents.some(a => a.agentId === voterId)) {
      throw new Error(`Agent ${voterId} is not a member of swarm ${swarmId}`);
    }

    // Check if agent already voted
    if (roundEntry.votes.some(v => v.voterId === voterId)) {
      throw new Error(`Agent ${voterId} already voted in round ${round}`);
    }

    // Record the vote
    roundEntry.votes.push({
      voterId,
      vote,
      timestamp: new Date().toISOString(),
    });

    // Evaluate the decision based on consensus protocol
    const totalAgents = agents.length;
    const quorum = getQuorumSize(totalAgents, swarm.consensus as ConsensusProtocol);
    const votesFor = roundEntry.votes.filter(v => v.vote === 'for').length;
    const votesAgainst = roundEntry.votes.filter(v => v.vote === 'against').length;
    const totalVotes = roundEntry.votes.length;

    // Check if quorum is reached
    if (totalVotes >= quorum) {
      if (votesFor >= quorum) {
        roundEntry.decision = 'accepted';
        roundEntry.completedAt = new Date().toISOString();
      } else if (votesAgainst >= quorum) {
        roundEntry.decision = 'rejected';
        roundEntry.completedAt = new Date().toISOString();
      } else if (totalVotes >= totalAgents) {
        // All agents voted but no quorum for either side
        roundEntry.decision = votesFor > votesAgainst ? 'accepted' : 'rejected';
        roundEntry.completedAt = new Date().toISOString();
      }
    }

    // Check if all agents have voted (early termination possible)
    if (totalVotes >= totalAgents && roundEntry.decision === 'pending') {
      roundEntry.decision = votesFor > votesAgainst ? 'accepted' : 'rejected';
      roundEntry.completedAt = new Date().toISOString();
    }

    await db.swarm.update({
      where: { id: swarmId },
      data: {
        consensusLog: JSON.stringify(consensusLog),
      },
    });

    return roundEntry;
  } catch (err: unknown) {
    console.error(
      '[SwarmEngine] castVote error:',
      err instanceof Error ? err.message : err
    );
    throw err;
  }
}

/**
 * Get the full status of a swarm including agents, tasks, and consensus log.
 */
export async function getSwarmStatus(swarmId: string): Promise<SwarmStatusResult | null> {
  try {
    const swarm = await db.swarm.findUnique({ where: { id: swarmId } });
    if (!swarm) return null;

    return {
      id: swarm.id,
      name: swarm.name,
      description: swarm.description,
      topology: swarm.topology as SwarmTopology,
      consensus: swarm.consensus as ConsensusProtocol,
      queenAgentId: swarm.queenAgentId,
      agents: parseJsonSafe<SwarmAgent[]>(swarm.agents, []),
      maxAgents: swarm.maxAgents,
      status: swarm.status as SwarmStatus,
      taskQueue: parseJsonSafe<SwarmTask[]>(swarm.taskQueue, []),
      consensusLog: parseJsonSafe<ConsensusRound[]>(swarm.consensusLog, []),
      config: parseJsonSafe<SwarmConfig>(swarm.config, {}),
      createdAt: swarm.createdAt,
      updatedAt: swarm.updatedAt,
    };
  } catch (err: unknown) {
    console.error(
      '[SwarmEngine] getSwarmStatus error:',
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * List all swarms, optionally filtered by topology, consensus, or status.
 */
export async function listSwarms(filter?: ListSwarmsFilter): Promise<SwarmStatusResult[]> {
  try {
    const where: Record<string, unknown> = {};

    if (filter?.topology) where.topology = filter.topology;
    if (filter?.consensus) where.consensus = filter.consensus;
    if (filter?.status) where.status = filter.status;

    const swarms = await db.swarm.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return swarms.map(swarm => ({
      id: swarm.id,
      name: swarm.name,
      description: swarm.description,
      topology: swarm.topology as SwarmTopology,
      consensus: swarm.consensus as ConsensusProtocol,
      queenAgentId: swarm.queenAgentId,
      agents: parseJsonSafe<SwarmAgent[]>(swarm.agents, []),
      maxAgents: swarm.maxAgents,
      status: swarm.status as SwarmStatus,
      taskQueue: parseJsonSafe<SwarmTask[]>(swarm.taskQueue, []),
      consensusLog: parseJsonSafe<ConsensusRound[]>(swarm.consensusLog, []),
      config: parseJsonSafe<SwarmConfig>(swarm.config, {}),
      createdAt: swarm.createdAt,
      updatedAt: swarm.updatedAt,
    }));
  } catch (err: unknown) {
    console.error(
      '[SwarmEngine] listSwarms error:',
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

/**
 * Disband a swarm. Marks all tasks as failed and removes all agents.
 */
export async function disbandSwarm(swarmId: string): Promise<void> {
  try {
    const swarm = await db.swarm.findUnique({ where: { id: swarmId } });
    if (!swarm) throw new Error(`Swarm not found: ${swarmId}`);

    // Mark all pending/assigned tasks as failed
    const taskQueue = parseJsonSafe<SwarmTask[]>(swarm.taskQueue, []);
    for (const task of taskQueue) {
      if (task.status !== 'completed' && task.status !== 'failed') {
        task.status = 'failed';
        task.completedAt = new Date().toISOString();
        task.result = 'Swarm disbanded';
      }
    }

    await db.swarm.update({
      where: { id: swarmId },
      data: {
        status: 'disbanding',
        agents: '[]',
        queenAgentId: null,
        taskQueue: JSON.stringify(taskQueue),
      },
    });

    // Final update to mark as disbanded (disbanding is transient)
    await db.swarm.update({
      where: { id: swarmId },
      data: { status: 'disbanding' },
    });

    // Optionally delete the swarm entirely, or keep for audit
    // We'll keep it but mark as disbanded for historical purposes
    await db.swarm.delete({ where: { id: swarmId } });
  } catch (err: unknown) {
    console.error(
      '[SwarmEngine] disbandSwarm error:',
      err instanceof Error ? err.message : err
    );
    throw err;
  }
}

/**
 * Auto-scale a swarm based on current metrics. Adds or removes agents
 * according to the swarm's auto-scale configuration.
 */
export async function autoScaleSwarm(
  swarmId: string,
  metrics: AutoScaleMetrics
): Promise<{
  action: 'scale_up' | 'scale_down' | 'no_change';
  agentsAdded: number;
  agentsRemoved: number;
  reason: string;
}> {
  try {
    const swarm = await db.swarm.findUnique({ where: { id: swarmId } });
    if (!swarm) throw new Error(`Swarm not found: ${swarmId}`);

    const agents = parseJsonSafe<SwarmAgent[]>(swarm.agents, []);
    const config = parseJsonSafe<SwarmConfig>(swarm.config, {});
    const autoScale = config.autoScaleConfig ?? {
      scaleUpThreshold: 0.8,
      scaleDownThreshold: 0.3,
      minAgents: 1,
      maxAgents: 20,
      cooldownMs: 60000,
    };

    const result = {
      action: 'no_change' as 'scale_up' | 'scale_down' | 'no_change',
      agentsAdded: 0,
      agentsRemoved: 0,
      reason: 'Metrics within acceptable range',
    };

    // Compute composite load score
    const loadScore =
      metrics.cpuLoad * 0.3 +
      Math.min(1, metrics.taskQueueLength / Math.max(1, metrics.activeAgents)) * 0.3 +
      metrics.errorRate * 0.2 +
      Math.min(1, metrics.avgTaskDurationMs / 30000) * 0.2;

    // Scale up if overloaded
    if (loadScore >= autoScale.scaleUpThreshold && agents.length < autoScale.maxAgents) {
      // Calculate how many agents to add
      const deficitRatio = loadScore / autoScale.scaleUpThreshold;
      const agentsToAdd = Math.min(
        Math.ceil(deficitRatio) - 1,
        autoScale.maxAgents - agents.length
      );

      if (agentsToAdd > 0) {
        // Find available agents in the system that aren't already in this swarm
        const currentAgentIds = new Set(agents.map(a => a.agentId));
        const availableAgents = await db.agent.findMany({
          where: {
            isActive: true,
            id: { notIn: Array.from(currentAgentIds) },
          },
          take: agentsToAdd,
        });

        for (const agent of availableAgents) {
          agents.push({
            agentId: agent.id,
            role: 'worker',
            status: 'idle',
            joinedAt: new Date().toISOString(),
            tasksCompleted: 0,
          });
        }

        result.action = 'scale_up';
        result.agentsAdded = availableAgents.length;
        result.reason = `Load score ${loadScore.toFixed(2)} exceeds threshold ${autoScale.scaleUpThreshold}. Added ${availableAgents.length} agent(s).`;
      }
    }
    // Scale down if underutilized
    else if (loadScore <= autoScale.scaleDownThreshold && agents.length > autoScale.minAgents) {
      // Calculate how many agents to remove
      const excessRatio = autoScale.scaleDownThreshold / Math.max(0.01, loadScore);
      const agentsToRemove = Math.min(
        Math.max(0, Math.floor(excessRatio) - 1),
        agents.length - autoScale.minAgents
      );

      if (agentsToRemove > 0) {
        // Remove the least productive idle agents first
        const idleAgents = agents
          .filter(a => a.status === 'idle' && a.role !== 'queen')
          .sort((a, b) => a.tasksCompleted - b.tasksCompleted);

        const toRemove = idleAgents.slice(0, agentsToRemove);
        for (const agent of toRemove) {
          const idx = agents.findIndex(a => a.agentId === agent.agentId);
          if (idx !== -1) {
            agents.splice(idx, 1);
          }
        }

        result.action = 'scale_down';
        result.agentsRemoved = toRemove.length;
        result.reason = `Load score ${loadScore.toFixed(2)} below threshold ${autoScale.scaleDownThreshold}. Removed ${toRemove.length} agent(s).`;
      }
    }

    // Update the swarm
    await db.swarm.update({
      where: { id: swarmId },
      data: {
        agents: JSON.stringify(agents),
        maxAgents: autoScale.maxAgents,
      },
    });

    return result;
  } catch (err: unknown) {
    console.error(
      '[SwarmEngine] autoScaleSwarm error:',
      err instanceof Error ? err.message : err
    );
    throw err;
  }
}

// ============================================================
// Advanced Intelligence Features
// ============================================================

// --- Specialist Routing ---

export interface AgentCapability {
  agentId: string;
  specialties: string[];    // e.g., ["code_review", "debugging", "web_scraping"]
  successRate: number;      // 0-1, historical success rate
  avgResponseTime: number;  // ms
  currentLoad: number;      // 0-1, current task load
}

/**
 * Route tasks to the best agent based on agent capabilities and task requirements.
 * Scoring: specialty match (40%) + success rate (30%) + low load (20%) + fast response (10%)
 */
export async function routeToSpecialist(
  swarmId: string,
  taskDescription: string,
  requiredCapability: string
): Promise<{ agentId: string; confidence: number } | null> {
  try {
    const swarm = await db.swarm.findUnique({ where: { id: swarmId } });
    if (!swarm) throw new Error(`Swarm not found: ${swarmId}`);

    const agents = parseJsonSafe<SwarmAgent[]>(swarm.agents, []);
    if (agents.length === 0) return null;

    // Build capability profiles for each agent from the Agent table
    const agentCapabilities: AgentCapability[] = [];

    for (const agent of agents) {
      if (agent.status === 'offline' || agent.status === 'error') continue;

      const agentRecord = await db.agent.findUnique({ where: { id: agent.agentId } });
      if (!agentRecord) continue;

      // Parse skills from the agent record
      const skills = parseJsonSafe<string[]>(agentRecord.skills, []);
      const specialties = skills.length > 0 ? skills : ['general'];

      // Get historical performance from AgentExperience
      const experiences = await db.agentExperience.findMany({
        where: { agentId: agent.agentId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      const successCount = experiences.filter(e => e.outcome === 'success').length;
      const totalExperiences = experiences.length;
      const successRate = totalExperiences > 0 ? successCount / totalExperiences : 0.5;

      const avgResponseTime = experiences.length > 0
        ? experiences.reduce((sum, e) => sum + (e.duration ?? 5000), 0) / experiences.length
        : 5000;

      const currentLoad = agent.status === 'busy' ? 0.8 : 0.2;

      agentCapabilities.push({
        agentId: agent.agentId,
        specialties,
        successRate,
        avgResponseTime,
        currentLoad,
      });
    }

    if (agentCapabilities.length === 0) return null;

    // Score each agent
    const maxResponseTime = Math.max(...agentCapabilities.map(a => a.avgResponseTime), 1);

    const scored = agentCapabilities.map(cap => {
      // Specialty match: does the agent have the required capability?
      const hasSpecialty = cap.specialties.some(
        s => s.toLowerCase().includes(requiredCapability.toLowerCase()) ||
             requiredCapability.toLowerCase().includes(s.toLowerCase())
      );
      const specialtyScore = hasSpecialty ? 1.0 : 0.1; // Small baseline for generalists

      // Normalize response time (lower is better)
      const responseScore = 1 - (cap.avgResponseTime / maxResponseTime);

      // Load score (lower load is better)
      const loadScore = 1 - cap.currentLoad;

      // Weighted composite
      const compositeScore =
        specialtyScore * 0.4 +
        cap.successRate * 0.3 +
        loadScore * 0.2 +
        responseScore * 0.1;

      return {
        agentId: cap.agentId,
        confidence: Math.min(1, compositeScore),
      };
    });

    // Sort by confidence descending
    scored.sort((a, b) => b.confidence - a.confidence);

    return scored[0] ?? null;
  } catch (err: unknown) {
    console.error(
      '[SwarmEngine] routeToSpecialist error:',
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// --- Self-Healing ---

/**
 * Detect and recover from failed agents in the swarm.
 * - Agents with >50% error rate in recent tasks are marked as "degraded"
 * - Degraded agent's pending tasks are reassigned to healthy agents
 * - If queen is degraded in hierarchical topology, promote next senior agent
 */
export async function selfHealSwarm(swarmId: string): Promise<{
  healed: boolean;
  actions: string[];
}> {
  try {
    const swarm = await db.swarm.findUnique({ where: { id: swarmId } });
    if (!swarm) throw new Error(`Swarm not found: ${swarmId}`);

    const agents = parseJsonSafe<SwarmAgent[]>(swarm.agents, []);
    const taskQueue = parseJsonSafe<SwarmTask[]>(swarm.taskQueue, []);
    const actions: string[] = [];
    let healed = false;

    const degradedAgentIds: Set<string> = new Set();

    // Check each agent's health based on recent error rate
    for (const agent of agents) {
      // Get recent task outcomes from AgentExperience
      const recentExperiences = await db.agentExperience.findMany({
        where: { agentId: agent.agentId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      if (recentExperiences.length === 0) continue;

      const errorCount = recentExperiences.filter(e => e.outcome === 'failure').length;
      const errorRate = errorCount / recentExperiences.length;

      if (errorRate > 0.5) {
        degradedAgentIds.add(agent.agentId);
        agent.status = 'error';
        actions.push(`Agent ${agent.agentId} marked as degraded (error rate: ${(errorRate * 100).toFixed(0)}%)`);
        healed = true;
      }
    }

    // Reassign degraded agent's pending tasks to healthy agents
    const healthyAgents = agents.filter(a => !degradedAgentIds.has(a.agentId) && a.status !== 'offline');

    for (const task of taskQueue) {
      if (
        task.assignedTo &&
        degradedAgentIds.has(task.assignedTo) &&
        task.status !== 'completed' &&
        task.status !== 'failed'
      ) {
        // Find the least loaded healthy agent
        const availableHealthy = healthyAgents.filter(a => a.status === 'idle');
        if (availableHealthy.length > 0) {
          availableHealthy.sort((a, b) => a.tasksCompleted - b.tasksCompleted);
          const newAgent = availableHealthy[0];
          const oldAssignee = task.assignedTo;
          task.assignedTo = newAgent.agentId;
          task.status = 'assigned';
          newAgent.status = 'busy';
          actions.push(`Task ${task.id} reassigned from ${oldAssignee} to ${newAgent.agentId}`);
        } else {
          // No healthy agent available — put back in pending queue
          task.assignedTo = null;
          task.status = 'pending';
          actions.push(`Task ${task.id} returned to pending (no healthy agent available)`);
        }
      }
    }

    // If queen is degraded in hierarchical topology, promote next senior agent
    if (
      swarm.topology === 'hierarchical' &&
      swarm.queenAgentId &&
      degradedAgentIds.has(swarm.queenAgentId)
    ) {
      const eligibleAgents = agents.filter(
        a => !degradedAgentIds.has(a.agentId) && a.agentId !== swarm.queenAgentId
      );

      if (eligibleAgents.length > 0) {
        // Promote the agent with the most completed tasks
        const newQueen = eligibleAgents.reduce((best, a) =>
          a.tasksCompleted > best.tasksCompleted ? a : best
        );
        const oldQueenId = swarm.queenAgentId;

        // Update roles
        const oldQueen = agents.find(a => a.agentId === oldQueenId);
        if (oldQueen) oldQueen.role = 'worker';
        newQueen.role = 'queen';

        actions.push(`Queen ${oldQueenId} demoted; agent ${newQueen.agentId} promoted to queen`);
        healed = true;
      } else {
        actions.push(`Queen ${swarm.queenAgentId} is degraded but no eligible replacement found`);
      }
    }

    // Persist changes if any healing occurred
    if (healed) {
      const updatedQueenId = agents.find(a => a.role === 'queen')?.agentId ?? swarm.queenAgentId;
      await db.swarm.update({
        where: { id: swarmId },
        data: {
          agents: JSON.stringify(agents),
          taskQueue: JSON.stringify(taskQueue),
          queenAgentId: updatedQueenId,
        },
      });
    }

    return { healed, actions };
  } catch (err: unknown) {
    console.error(
      '[SwarmEngine] selfHealSwarm error:',
      err instanceof Error ? err.message : err
    );
    return {
      healed: false,
      actions: [`Self-heal failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

// --- Knowledge Sharing ---

export interface SwarmKnowledge {
  id: string;
  swarmId: string;
  category: string;       // "tool_tip" | "code_pattern" | "error_solution" | "best_practice"
  insight: string;
  sourceAgentId: string;
  confidence: number;
  usageCount: number;
  createdAt: string;
}

/**
 * Share a learned insight with the swarm. Stored in the swarm's knowledgeBase JSON array.
 */
export async function shareKnowledge(
  swarmId: string,
  category: string,
  insight: string,
  sourceAgentId: string,
  confidence: number
): Promise<SwarmKnowledge> {
  try {
    const swarm = await db.swarm.findUnique({ where: { id: swarmId } });
    if (!swarm) throw new Error(`Swarm not found: ${swarmId}`);

    const knowledgeBase = parseJsonSafe<SwarmKnowledge[]>(swarm.knowledgeBase, []);

    const entry: SwarmKnowledge = {
      id: `k_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      swarmId,
      category,
      insight,
      sourceAgentId,
      confidence: Math.max(0, Math.min(1, confidence)),
      usageCount: 0,
      createdAt: new Date().toISOString(),
    };

    knowledgeBase.push(entry);

    await db.swarm.update({
      where: { id: swarmId },
      data: {
        knowledgeBase: JSON.stringify(knowledgeBase),
      },
    });

    return entry;
  } catch (err: unknown) {
    console.error(
      '[SwarmEngine] shareKnowledge error:',
      err instanceof Error ? err.message : err
    );
    throw err;
  }
}

/**
 * Query the swarm's knowledge base. Optionally filter by category and/or keyword matching.
 */
export async function queryKnowledge(
  swarmId: string,
  category?: string,
  query?: string
): Promise<SwarmKnowledge[]> {
  try {
    const swarm = await db.swarm.findUnique({ where: { id: swarmId } });
    if (!swarm) return [];

    const knowledgeBase = parseJsonSafe<SwarmKnowledge[]>(swarm.knowledgeBase, []);

    let results = knowledgeBase;

    // Filter by category if provided
    if (category) {
      results = results.filter(k => k.category === category);
    }

    // Filter by keyword matching on insight if query is provided
    if (query) {
      const queryLower = query.toLowerCase();
      const queryWords = queryLower.split(/\s+/).filter(w => w.length > 0);
      results = results.filter(k => {
        const insightLower = k.insight.toLowerCase();
        // Match if any query word appears in the insight
        return queryWords.some(word => insightLower.includes(word));
      });
    }

    // Sort by confidence descending, then by usageCount descending
    results.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.usageCount - a.usageCount;
    });

    return results;
  } catch (err: unknown) {
    console.error(
      '[SwarmEngine] queryKnowledge error:',
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

// --- Enhanced Consensus with Weighted Voting ---

/**
 * Enhanced consensus that considers agent expertise weights.
 * Each agent votes on each option with a reason, and votes are weighted
 * by the agent's expertise relevance and historical accuracy.
 */
export async function weightedConsensus(
  swarmId: string,
  proposal: string,
  options: string[]
): Promise<{
  decided: boolean;
  winner: string | null;
  votes: Record<string, Array<{ agentId: string; vote: string; weight: number; reason: string }>>;
  confidence: number;
}> {
  try {
    const swarm = await db.swarm.findUnique({ where: { id: swarmId } });
    if (!swarm) throw new Error(`Swarm not found: ${swarmId}`);

    const agents = parseJsonSafe<SwarmAgent[]>(swarm.agents, []);

    if (agents.length === 0 || options.length === 0) {
      return { decided: false, winner: null, votes: {}, confidence: 0 };
    }

    const votes: Record<string, Array<{ agentId: string; vote: string; weight: number; reason: string }>> = {};

    // Initialize vote containers for each option
    for (const option of options) {
      votes[option] = [];
    }

    // Each agent votes on each option
    for (const agent of agents) {
      if (agent.status === 'offline' || agent.status === 'error') continue;

      // Calculate agent's weight based on historical accuracy and experience
      const experiences = await db.agentExperience.findMany({
        where: { agentId: agent.agentId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });

      const successCount = experiences.filter(e => e.outcome === 'success').length;
      const totalExp = experiences.length;
      const accuracyScore = totalExp > 0 ? successCount / totalExp : 0.5;

      // Weight: base 0.5 + accuracy bonus (up to 1.0)
      // More experienced agents with higher success rates get more weight
      const experienceBonus = Math.min(0.3, totalExp * 0.01);
      const weight = Math.min(1.0, 0.5 + accuracyScore * 0.3 + experienceBonus);

      // Determine the agent's vote based on a simple heuristic:
      // Agents with more success in relevant task types lean toward options that
      // align with their expertise. For simplicity, we use a deterministic hash
      // based on the agent's experience to assign a "preferred" option.
      const proposalWords = proposal.toLowerCase().split(/\s+/);

      let bestOption = options[0];
      let bestReason = `Agent ${agent.agentId} selected based on experience`;

      // Match agent skills to proposal keywords to find the best option
      const agentRecord = await db.agent.findUnique({ where: { id: agent.agentId } });
      const skills = parseJsonSafe<string[]>(agentRecord?.skills, []);

      if (skills.length > 0) {
        // Find which option keywords best match the agent's skills
        let bestScore = -1;
        for (const option of options) {
          const optionWords = option.toLowerCase().split(/\s+/);
          const skillMatch = skills.filter(s =>
            optionWords.some(ow => ow.includes(s.toLowerCase()) || s.toLowerCase().includes(ow)) ||
            proposalWords.some(pw => pw.includes(s.toLowerCase()) || s.toLowerCase().includes(pw))
          ).length;
          const score = skillMatch + (accuracyScore * 0.5);
          if (score > bestScore) {
            bestScore = score;
            bestOption = option;
            bestReason = `Skills match: ${skills.join(', ')} — best aligned with option "${option}"`;
          }
        }
      } else {
        // No skills — use accuracy-weighted random selection favoring first options
        const idx = Math.floor(accuracyScore * options.length) % options.length;
        bestOption = options[idx];
        bestReason = `No specific skill match; selected based on general accuracy (${(accuracyScore * 100).toFixed(0)}%)`;
      }

      // Record the vote for the best option
      if (votes[bestOption]) {
        votes[bestOption].push({
          agentId: agent.agentId,
          vote: bestOption,
          weight,
          reason: bestReason,
        });
      }
    }

    // Calculate weighted scores for each option
    const weightedScores: Record<string, number> = {};
    let totalWeight = 0;

    for (const option of options) {
      const optionVotes = votes[option] ?? [];
      const score = optionVotes.reduce((sum, v) => sum + v.weight, 0);
      weightedScores[option] = score;
      totalWeight += score;
    }

    // Find the winner
    let winner: string | null = null;
    let highestScore = 0;

    for (const [option, score] of Object.entries(weightedScores)) {
      if (score > highestScore) {
        highestScore = score;
        winner = option;
      }
    }

    // Confidence is the proportion of total weight that went to the winner
    const confidence = totalWeight > 0 ? highestScore / totalWeight : 0;

    // A decision is made if confidence > 0.5 (simple majority by weight)
    const decided = confidence > 0.5 && winner !== null;

    // Log the consensus round to the consensus log
    const consensusLog = parseJsonSafe<ConsensusRound[]>(swarm.consensusLog, []);
    const newRound: ConsensusRound = {
      round: consensusLog.length + 1,
      proposal: `[Weighted Consensus] ${proposal} → ${winner ?? 'no winner'}`,
      votes: agents
        .filter(a => a.status !== 'offline' && a.status !== 'error')
        .map(a => ({
          voterId: a.agentId,
          vote: (winner && votes[winner]?.some(v => v.agentId === a.agentId)) ? 'for' as const : 'against' as const,
          timestamp: new Date().toISOString(),
        })),
      decision: decided ? 'accepted' : 'pending',
      startedAt: new Date().toISOString(),
      completedAt: decided ? new Date().toISOString() : undefined,
    };
    consensusLog.push(newRound);

    await db.swarm.update({
      where: { id: swarmId },
      data: {
        consensusLog: JSON.stringify(consensusLog),
      },
    });

    return { decided, winner, votes, confidence };
  } catch (err: unknown) {
    console.error(
      '[SwarmEngine] weightedConsensus error:',
      err instanceof Error ? err.message : err
    );
    return { decided: false, winner: null, votes: {}, confidence: 0 };
  }
}
