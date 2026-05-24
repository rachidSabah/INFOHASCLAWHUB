"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Network,
  Users,
  Vote,
  Plus,
  Loader2,
  Circle,
  Triangle,
  Hexagon,
  Star,
  Send,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type TopologyType = "hierarchical" | "mesh" | "ring" | "star";

interface SwarmAgentEntry {
  agentId: string;
  role: string;
  status: string;
  joinedAt: string;
  tasksCompleted: number;
}

interface SwarmTaskEntry {
  id: string;
  task: string;
  assignedTo: string | null;
  priority: string;
  status: string;
  createdAt: string;
}

interface ConsensusRoundEntry {
  round: number;
  proposal: string;
  votes: Array<{ voterId: string; vote: string; timestamp: string }>;
  decision: string;
  startedAt: string;
  completedAt?: string;
}

interface Swarm {
  id: string;
  name: string;
  topology: TopologyType;
  agentCount: number;
  status: "active" | "inactive";
  createdAt: string;
}

interface AgentOption {
  id: string;
  name: string;
  role: string;
}

interface SwarmCoordinationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function topologyIcon(topology: TopologyType) {
  switch (topology) {
    case "hierarchical":
      return <Triangle className="h-3.5 w-3.5" />;
    case "mesh":
      return <Hexagon className="h-3.5 w-3.5" />;
    case "ring":
      return <Circle className="h-3.5 w-3.5" />;
    case "star":
      return <Star className="h-3.5 w-3.5" />;
    default:
      return <Network className="h-3.5 w-3.5" />;
  }
}

function topologyColor(topology: TopologyType) {
  switch (topology) {
    case "hierarchical":
      return "bg-violet-500/15 text-violet-400 border-violet-500/30";
    case "mesh":
      return "bg-purple-500/15 text-purple-400 border-purple-500/30";
    case "ring":
      return "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30";
    case "star":
      return "bg-pink-500/15 text-pink-400 border-pink-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function agentStatusColor(status: string) {
  switch (status) {
    case "idle":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "busy":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "error":
    case "offline":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function taskStatusColor(status: string) {
  switch (status) {
    case "completed":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "in_progress":
    case "assigned":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "pending":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "failed":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function decisionColor(decision: string) {
  switch (decision) {
    case "accepted":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "rejected":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "timeout":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "pending":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SwarmCoordinationPanel({
  open,
  onOpenChange,
}: SwarmCoordinationPanelProps) {
  const [activeTab, setActiveTab] = useState("swarms");

  // ══ Swarms Tab State ══
  const [swarms, setSwarms] = useState<Swarm[]>([]);
  const [loadingSwarms, setLoadingSwarms] = useState(false);
  const [newSwarmName, setNewSwarmName] = useState("");
  const [newSwarmTopology, setNewSwarmTopology] = useState<TopologyType>("star");
  const [creatingSwarm, setCreatingSwarm] = useState(false);

  // ══ Distribute Task State ══
  const [distributingSwarmId, setDistributingSwarmId] = useState<string | null>(null);
  const [taskDescription, setTaskDescription] = useState("");
  const [taskPriority, setTaskPriority] = useState<string>("medium");
  const [distributing, setDistributing] = useState(false);

  // ══ Topology Tab State ══
  const [agents, setAgents] = useState<SwarmAgentEntry[]>([]);
  const [tasks, setTasks] = useState<SwarmTaskEntry[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [selectedSwarmId, setSelectedSwarmId] = useState("");
  const [availableAgents, setAvailableAgents] = useState<AgentOption[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedAgentRole, setSelectedAgentRole] = useState("worker");
  const [addingAgent, setAddingAgent] = useState(false);

  // ══ Consensus Tab State ══
  const [votes, setVotes] = useState<ConsensusRoundEntry[]>([]);
  const [loadingVotes, setLoadingVotes] = useState(false);
  const [newVoteProposal, setNewVoteProposal] = useState("");
  const [newVoteSwarmId, setNewVoteSwarmId] = useState("");
  const [creatingVote, setCreatingVote] = useState(false);

  // ── Fetch data on open ──
  const fetchSwarms = useCallback(async () => {
    setLoadingSwarms(true);
    try {
      const res = await fetch("/api/swarm");
      if (res.ok) {
        const data = await res.json();
        setSwarms(data.swarms || []);
      }
    } catch {
      toast.error("Failed to load swarms");
    } finally {
      setLoadingSwarms(false);
    }
  }, []);

  const fetchSwarmDetails = useCallback(async (swarmId: string) => {
    if (!swarmId) return;
    setLoadingAgents(true);
    try {
      const res = await fetch(`/api/swarm/${swarmId}`);
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
        setTasks(data.taskQueue || []);
      }
    } catch {
      toast.error("Failed to load swarm details");
    } finally {
      setLoadingAgents(false);
    }
  }, []);

  const fetchAvailableAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (res.ok) {
        const data = await res.json();
        setAvailableAgents(
          Array.isArray(data)
            ? data.map((a: { id: string; name: string; role: string }) => ({
                id: a.id,
                name: a.name,
                role: a.role,
              }))
            : []
        );
      }
    } catch {
      // Non-critical, silently fail
    }
  }, []);

  const fetchVotes = useCallback(async (swarmId?: string) => {
    setLoadingVotes(true);
    try {
      // Fetch votes from a specific swarm or all swarms
      if (swarmId) {
        const res = await fetch(`/api/swarm/${swarmId}`);
        if (res.ok) {
          const data = await res.json();
          setVotes(data.consensusLog || []);
        }
      } else {
        // Fetch from all swarms
        const allVotes: ConsensusRoundEntry[] = [];
        for (const swarm of swarms) {
          try {
            const res = await fetch(`/api/swarm/${swarm.id}`);
            if (res.ok) {
              const data = await res.json();
              if (data.consensusLog) {
                allVotes.push(...data.consensusLog);
              }
            }
          } catch {
            // Skip failed swarms
          }
        }
        // Sort by round number descending
        allVotes.sort((a, b) => b.round - a.round);
        setVotes(allVotes);
      }
    } catch {
      toast.error("Failed to load consensus votes");
    } finally {
      setLoadingVotes(false);
    }
  }, [swarms]);

  useEffect(() => {
    if (open) {
      fetchSwarms();
      fetchAvailableAgents();
    }
  }, [open, fetchSwarms, fetchAvailableAgents]);

  useEffect(() => {
    if (open && selectedSwarmId) {
      fetchSwarmDetails(selectedSwarmId);
    }
  }, [open, selectedSwarmId, fetchSwarmDetails]);

  useEffect(() => {
    if (open && swarms.length > 0 && activeTab === "consensus") {
      fetchVotes(newVoteSwarmId || undefined);
    }
  }, [open, swarms, activeTab, newVoteSwarmId, fetchVotes]);

  // ── Create Swarm ──
  const createSwarm = async () => {
    if (!newSwarmName.trim()) {
      toast.error("Swarm name is required");
      return;
    }
    setCreatingSwarm(true);
    try {
      const res = await fetch("/api/swarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSwarmName.trim(), topology: newSwarmTopology }),
      });
      if (res.ok) {
        toast.success("Swarm created successfully");
        setNewSwarmName("");
        fetchSwarms();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create swarm");
      }
    } catch {
      toast.error("Failed to create swarm");
    } finally {
      setCreatingSwarm(false);
    }
  };

  // ── Distribute Task ──
  const handleDistributeClick = (swarmId: string) => {
    setDistributingSwarmId(swarmId);
    setTaskDescription("");
    setTaskPriority("medium");
  };

  const distributeTask = async () => {
    if (!distributingSwarmId || !taskDescription.trim()) {
      toast.error("Task description is required");
      return;
    }
    setDistributing(true);
    try {
      const res = await fetch(`/api/swarm/${distributingSwarmId}/task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: taskDescription.trim(),
          priority: taskPriority,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        toast.success(
          result.assignedTo
            ? `Task distributed to agent ${result.assignedTo}`
            : "Task queued (no idle agents available)"
        );
        setDistributingSwarmId(null);
        setTaskDescription("");
        // Refresh swarm details if this is the selected swarm
        if (selectedSwarmId === distributingSwarmId) {
          fetchSwarmDetails(distributingSwarmId);
        }
        fetchSwarms();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to distribute task");
      }
    } catch {
      toast.error("Failed to distribute task");
    } finally {
      setDistributing(false);
    }
  };

  // ── Add Agent ──
  const addAgent = async () => {
    if (!selectedAgentId || !selectedSwarmId) {
      toast.error("Please select an agent and a swarm");
      return;
    }
    setAddingAgent(true);
    try {
      const res = await fetch(`/api/swarm/${selectedSwarmId}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: selectedAgentId,
          role: selectedAgentRole,
        }),
      });
      if (res.ok) {
        toast.success("Agent added to swarm");
        setSelectedAgentId("");
        fetchSwarmDetails(selectedSwarmId);
        fetchSwarms();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to add agent");
      }
    } catch {
      toast.error("Failed to add agent");
    } finally {
      setAddingAgent(false);
    }
  };

  // ── Create Vote ──
  const createVote = async () => {
    if (!newVoteProposal.trim() || !newVoteSwarmId) {
      toast.error("Proposal and swarm are required");
      return;
    }
    setCreatingVote(true);
    try {
      const res = await fetch(`/api/swarm/${newVoteSwarmId}/consensus`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal: newVoteProposal.trim() }),
      });
      if (res.ok) {
        toast.success("Consensus vote created");
        setNewVoteProposal("");
        fetchVotes(newVoteSwarmId);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create vote");
      }
    } catch {
      toast.error("Failed to create vote");
    } finally {
      setCreatingVote(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/30">
              <Network className="h-4 w-4 text-violet-400" />
            </div>
            Swarm Coordination
          </DialogTitle>
          <DialogDescription>
            Create swarms, manage agents, visualize topology, and run consensus voting
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 mb-1 shrink-0">
            <TabsTrigger value="swarms" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              Swarms
            </TabsTrigger>
            <TabsTrigger value="topology" className="gap-1.5 text-xs">
              <Network className="h-3.5 w-3.5" />
              Topology
            </TabsTrigger>
            <TabsTrigger value="consensus" className="gap-1.5 text-xs">
              <Vote className="h-3.5 w-3.5" />
              Consensus
            </TabsTrigger>
          </TabsList>

          {/* ═══ SWARMS TAB ═══ */}
          <TabsContent value="swarms" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Create Swarm */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Plus className="h-4 w-4 text-violet-400" />
                    Create Swarm
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Swarm Name</Label>
                      <Input
                        value={newSwarmName}
                        onChange={(e) => setNewSwarmName(e.target.value)}
                        placeholder="e.g., research-swarm-01"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Topology</Label>
                      <Select value={newSwarmTopology} onValueChange={(v) => setNewSwarmTopology(v as TopologyType)}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hierarchical">Hierarchical</SelectItem>
                          <SelectItem value="mesh">Mesh</SelectItem>
                          <SelectItem value="ring">Ring</SelectItem>
                          <SelectItem value="star">Star</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center justify-end">
                    <Button size="sm" onClick={createSwarm} disabled={creatingSwarm || !newSwarmName.trim()} className="h-9 text-xs gap-1.5 min-w-[150px]">
                      {creatingSwarm ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      Create Swarm
                    </Button>
                  </div>
                </div>

                {/* Swarms List */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Swarms</h4>
                  {loadingSwarms ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading swarms...
                    </div>
                  ) : swarms.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                      <Network className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No swarms found</p>
                      <p className="text-xs mt-1">Create a swarm above to get started</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {swarms.map((swarm) => (
                        <div key={swarm.id} className="space-y-2">
                          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 p-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium">{swarm.name}</div>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge className={cn("h-5 text-[10px] border gap-1", topologyColor(swarm.topology))}>
                                  {topologyIcon(swarm.topology)}
                                  {swarm.topology}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground">{swarm.agentCount} agents</span>
                                <Badge className={cn("h-5 text-[10px] border", swarm.status === "active" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30")}>
                                  {swarm.status}
                                </Badge>
                              </div>
                            </div>
                            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => handleDistributeClick(swarm.id)}>
                              <Send className="h-3 w-3" />
                              Distribute
                            </Button>
                          </div>
                          {/* Task distribution form (shown when Distribute is clicked) */}
                          {distributingSwarmId === swarm.id && (
                            <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 space-y-3">
                              <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Task Description</Label>
                                <Input
                                  value={taskDescription}
                                  onChange={(e) => setTaskDescription(e.target.value)}
                                  placeholder="Describe the task to distribute..."
                                  className="h-9"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && taskDescription.trim()) {
                                      distributeTask();
                                    }
                                  }}
                                />
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="space-y-1.5 flex-1">
                                  <Label className="text-xs font-medium">Priority</Label>
                                  <Select value={taskPriority} onValueChange={setTaskPriority}>
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="critical">Critical</SelectItem>
                                      <SelectItem value="high">High</SelectItem>
                                      <SelectItem value="medium">Medium</SelectItem>
                                      <SelectItem value="low">Low</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex items-end gap-2 pt-4">
                                  <Button size="sm" onClick={distributeTask} disabled={distributing || !taskDescription.trim()} className="h-8 text-xs gap-1.5">
                                    {distributing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3 w-3" />}
                                    Send
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setDistributingSwarmId(null)} className="h-8 text-xs">
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ TOPOLOGY TAB ═══ */}
          <TabsContent value="topology" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Select Swarm */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Eye className="h-4 w-4 text-purple-400" />
                    Topology View
                  </h4>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Select Swarm</Label>
                    <Select value={selectedSwarmId} onValueChange={setSelectedSwarmId}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Choose a swarm..." />
                      </SelectTrigger>
                      <SelectContent>
                        {swarms.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name} ({s.topology})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Topology Visualization */}
                  {selectedSwarmId && (
                    <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-6">
                      <div className="flex items-center justify-center gap-6">
                        {swarms.find((s) => s.id === selectedSwarmId)?.topology === "star" && (
                          <div className="relative flex items-center justify-center">
                            <div className="h-16 w-16 rounded-full bg-violet-500/20 border-2 border-violet-400 flex items-center justify-center">
                              <Star className="h-6 w-6 text-violet-400" />
                            </div>
                            <div className="absolute -top-6 h-8 w-8 rounded-full bg-purple-500/20 border border-purple-400 flex items-center justify-center"><Users className="h-3 w-3 text-purple-400" /></div>
                            <div className="absolute -bottom-6 h-8 w-8 rounded-full bg-purple-500/20 border border-purple-400 flex items-center justify-center"><Users className="h-3 w-3 text-purple-400" /></div>
                            <div className="absolute -left-6 h-8 w-8 rounded-full bg-purple-500/20 border border-purple-400 flex items-center justify-center"><Users className="h-3 w-3 text-purple-400" /></div>
                            <div className="absolute -right-6 h-8 w-8 rounded-full bg-purple-500/20 border border-purple-400 flex items-center justify-center"><Users className="h-3 w-3 text-purple-400" /></div>
                          </div>
                        )}
                        {swarms.find((s) => s.id === selectedSwarmId)?.topology === "mesh" && (
                          <div className="grid grid-cols-3 gap-3">
                            {Array.from({ length: 9 }).map((_, i) => (
                              <div key={i} className="h-10 w-10 rounded-full bg-violet-500/20 border border-violet-400/50 flex items-center justify-center">
                                <Users className="h-3 w-3 text-violet-400" />
                              </div>
                            ))}
                          </div>
                        )}
                        {(swarms.find((s) => s.id === selectedSwarmId)?.topology === "ring" || swarms.find((s) => s.id === selectedSwarmId)?.topology === "hierarchical") && (
                          <div className="flex flex-col items-center gap-2">
                            <div className="h-12 w-12 rounded-full bg-violet-500/20 border-2 border-violet-400 flex items-center justify-center">
                              {swarms.find((s) => s.id === selectedSwarmId)?.topology === "hierarchical" ? <Triangle className="h-5 w-5 text-violet-400" /> : <Circle className="h-5 w-5 text-violet-400" />}
                            </div>
                            <div className="flex gap-4">
                              <div className="h-8 w-8 rounded-full bg-purple-500/20 border border-purple-400 flex items-center justify-center"><Users className="h-3 w-3 text-purple-400" /></div>
                              <div className="h-8 w-8 rounded-full bg-purple-500/20 border border-purple-400 flex items-center justify-center"><Users className="h-3 w-3 text-purple-400" /></div>
                              <div className="h-8 w-8 rounded-full bg-purple-500/20 border border-purple-400 flex items-center justify-center"><Users className="h-3 w-3 text-purple-400" /></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Add Agent */}
                {selectedSwarmId && (
                  <div className="rounded-xl border bg-card p-5 space-y-4">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Plus className="h-4 w-4 text-violet-400" />
                      Add Agent to Swarm
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Select Agent</Label>
                        <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Choose an agent..." />
                          </SelectTrigger>
                          <SelectContent>
                            {availableAgents.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name} ({a.role})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Swarm Role</Label>
                        <Select value={selectedAgentRole} onValueChange={setSelectedAgentRole}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="queen">Queen</SelectItem>
                            <SelectItem value="coordinator">Coordinator</SelectItem>
                            <SelectItem value="worker">Worker</SelectItem>
                            <SelectItem value="scout">Scout</SelectItem>
                            <SelectItem value="observer">Observer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-end">
                        <Button size="sm" onClick={addAgent} disabled={addingAgent || !selectedAgentId} className="h-9 text-xs gap-1.5 min-w-[150px]">
                          {addingAgent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                          Add Agent
                        </Button>
                      </div>
                    </div>
                    {availableAgents.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No agents available. Create agents in the Agents section first, then add them to the swarm.
                      </p>
                    )}
                  </div>
                )}

                {/* Agents List */}
                {selectedSwarmId && (
                  <div className="rounded-xl border bg-card p-5 space-y-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Agents in Swarm</h4>
                    {loadingAgents ? (
                      <div className="flex items-center justify-center py-8 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        Loading agents...
                      </div>
                    ) : agents.length === 0 ? (
                      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No agents in this swarm</p>
                        <p className="text-xs mt-1">Add agents above</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {agents.map((agent) => (
                          <div key={agent.agentId} className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                            <Badge className={cn("h-5 text-[10px] border", agentStatusColor(agent.status))}>
                              {agent.status}
                            </Badge>
                            <div className="min-w-0 flex-1">
                              <span className="text-xs font-medium">{agent.agentId}</span>
                              <span className="text-[10px] text-muted-foreground ml-2">{agent.role}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">{agent.tasksCompleted} tasks</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Task Queue */}
                {selectedSwarmId && tasks.length > 0 && (
                  <div className="rounded-xl border bg-card p-5 space-y-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Task Queue</h4>
                    <div className="space-y-2">
                      {tasks.map((task) => (
                        <div key={task.id} className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                          <Badge className={cn("h-5 text-[10px] border", taskStatusColor(task.status))}>
                            {task.status}
                          </Badge>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{task.task}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {task.assignedTo ? `Assigned: ${task.assignedTo}` : "Unassigned"} · Priority: {task.priority}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ CONSENSUS TAB ═══ */}
          <TabsContent value="consensus" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Create Vote */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Vote className="h-4 w-4 text-purple-400" />
                    Create Consensus Vote
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Proposal</Label>
                      <Input value={newVoteProposal} onChange={(e) => setNewVoteProposal(e.target.value)} placeholder="e.g., Approve deployment plan" className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Swarm</Label>
                      <Select value={newVoteSwarmId} onValueChange={setNewVoteSwarmId}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Choose a swarm..." />
                        </SelectTrigger>
                        <SelectContent>
                          {swarms.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center justify-end">
                    <Button size="sm" onClick={createVote} disabled={creatingVote || !newVoteProposal.trim() || !newVoteSwarmId} className="h-9 text-xs gap-1.5 min-w-[150px]">
                      {creatingVote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Vote className="h-3.5 w-3.5" />}
                      Create Vote
                    </Button>
                  </div>
                </div>

                {/* Voting Log */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Voting Log</h4>
                  {loadingVotes ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading votes...
                    </div>
                  ) : votes.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                      <Vote className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No consensus votes found</p>
                      <p className="text-xs mt-1">Create a vote above or select a swarm to view its votes</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {votes.map((vote, i) => {
                        const votesFor = vote.votes.filter(v => v.vote === "for").length;
                        const votesAgainst = vote.votes.filter(v => v.vote === "against").length;
                        const totalVoters = vote.votes.length;
                        return (
                          <div key={`${vote.round}-${i}`} className="rounded-lg bg-muted/30 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium truncate max-w-[60%]">{vote.proposal}</span>
                              <Badge className={cn("h-5 text-[10px] border", decisionColor(vote.decision))}>
                                {vote.decision === "pending" ? <Clock className="h-3 w-3 mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                                {vote.decision}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-1.5">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                <span className="text-xs text-emerald-400">{votesFor}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <XCircle className="h-3.5 w-3.5 text-red-400" />
                                <span className="text-xs text-red-400">{votesAgainst}</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground">of {totalVoters} voters</span>
                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-emerald-500 transition-all"
                                  style={{ width: `${totalVoters > 0 ? (votesFor / totalVoters) * 100 : 0}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
