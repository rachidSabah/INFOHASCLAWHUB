// =============================================================================
// INFOHASCLAWHUB — Preconfigured Orchestration, Pipeline & Agent System
// =============================================================================
// This is the CORE data definitions file that powers the entire preconfigured
// system. It contains pipeline templates, orchestration rules, agent
// enhancements, provider scores, and the seed function that populates the
// database with all preconfigured data.
// =============================================================================

import { db } from "@/lib/db";
import { AGENT_DEFINITIONS } from "@/lib/agent-definitions";

// =============================================================================
// §1  PIPELINE TEMPLATE DEFINITIONS
// =============================================================================

export interface PipelineStep {
  id: string;
  name: string;
  agentName: string;
  description: string;
  inputMapping: Record<string, string>;
  outputMapping: Record<string, string>;
  approvalRequired: boolean;
  retryCount: number;
  timeout: number; // ms
}

export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  steps: PipelineStep[];
  parallelGroups: number[][]; // indices into steps[]
  version: string;
  author: string;
  tags: string[];
}

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  // ── 1. Full-Stack SaaS Builder ──────────────────────────────────────────
  {
    id: "pipeline-fullstack-saas",
    name: "Full-Stack SaaS Builder",
    description:
      "End-to-end pipeline that takes a project issue from ideation through architecture, frontend/backend coding, database setup, testing, review, deployment, and monitoring — producing a production-ready SaaS application.",
    category: "development",
    icon: "🏗️",
    steps: [
      {
        id: "saas-step-issue",
        name: "Issue Analysis",
        agentName: "Orion",
        description: "Analyze the project issue, break it into actionable requirements, and identify the critical path for delivery.",
        inputMapping: { issueText: "input.issue", projectContext: "input.context" },
        outputMapping: { requirements: "output.requirements", taskBreakdown: "output.tasks" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 120_000,
      },
      {
        id: "saas-step-arch",
        name: "Architecture Design",
        agentName: "Blueprint",
        description: "Design the system architecture — component tree, data flow, API surface, and technology choices.",
        inputMapping: { requirements: "output.requirements" },
        outputMapping: { architecture: "output.architecture", dataModel: "output.dataModel" },
        approvalRequired: true,
        retryCount: 1,
        timeout: 180_000,
      },
      {
        id: "saas-step-frontend",
        name: "Code Frontend",
        agentName: "CodeForge",
        description: "Implement the frontend application — pages, components, state management, and UI/UX.",
        inputMapping: { architecture: "output.architecture", requirements: "output.requirements" },
        outputMapping: { frontendCode: "output.frontendCode", uiComponents: "output.uiComponents" },
        approvalRequired: false,
        retryCount: 2,
        timeout: 300_000,
      },
      {
        id: "saas-step-backend",
        name: "Code Backend",
        agentName: "Core",
        description: "Implement the backend — API routes, business logic, authentication, and integrations.",
        inputMapping: { architecture: "output.architecture", dataModel: "output.dataModel" },
        outputMapping: { backendCode: "output.backendCode", apiEndpoints: "output.apiEndpoints" },
        approvalRequired: false,
        retryCount: 2,
        timeout: 300_000,
      },
      {
        id: "saas-step-database",
        name: "Database Setup",
        agentName: "Stratum",
        description: "Design the Prisma schema, run migrations, and set up seed data.",
        inputMapping: { dataModel: "output.dataModel" },
        outputMapping: { schema: "output.schema", migrations: "output.migrations" },
        approvalRequired: true,
        retryCount: 1,
        timeout: 120_000,
      },
      {
        id: "saas-step-test",
        name: "Test Suite",
        agentName: "Probe",
        description: "Write and execute unit, integration, and E2E tests for all implemented features.",
        inputMapping: { frontendCode: "output.frontendCode", backendCode: "output.backendCode" },
        outputMapping: { testResults: "output.testResults", coverage: "output.coverage" },
        approvalRequired: false,
        retryCount: 2,
        timeout: 240_000,
      },
      {
        id: "saas-step-review",
        name: "Code Review",
        agentName: "Lens",
        description: "Perform a thorough code review — quality, security, performance, and maintainability.",
        inputMapping: { frontendCode: "output.frontendCode", backendCode: "output.backendCode", testResults: "output.testResults" },
        outputMapping: { reviewNotes: "output.reviewNotes", issues: "output.reviewIssues" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 180_000,
      },
      {
        id: "saas-step-deploy",
        name: "Deploy",
        agentName: "Deploy Guardian",
        description: "Deploy the application through staging to production with canary validation and rollback safety.",
        inputMapping: { frontendCode: "output.frontendCode", backendCode: "output.backendCode", reviewNotes: "output.reviewNotes" },
        outputMapping: { deployUrl: "output.deployUrl", deployStatus: "output.deployStatus" },
        approvalRequired: true,
        retryCount: 1,
        timeout: 300_000,
      },
      {
        id: "saas-step-monitor",
        name: "Monitor Setup",
        agentName: "Infra Monitor",
        description: "Configure monitoring dashboards, alerting rules, SLOs, and on-call runbooks.",
        inputMapping: { deployUrl: "output.deployUrl", deployStatus: "output.deployStatus" },
        outputMapping: { monitorConfig: "output.monitorConfig", alertRules: "output.alertRules" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 120_000,
      },
    ],
    parallelGroups: [[2, 3], [4]], // frontend + backend in parallel; DB standalone
    version: "1.0.0",
    author: "ClawHub",
    tags: ["fullstack", "saas", "development", "deployment", "production"],
  },

  // ── 2. Security Audit Fortress ──────────────────────────────────────────
  {
    id: "pipeline-security-audit",
    name: "Security Audit Fortress",
    description:
      "Comprehensive security assessment pipeline — from reconnaissance and scanning through vulnerability assessment, exploit testing, reporting, remediation, verification, and compliance checking.",
    category: "security",
    icon: "🏰",
    steps: [
      {
        id: "sec-step-recon",
        name: "Reconnaissance",
        agentName: "Scout",
        description: "Gather intelligence on the target — surface area, technologies, endpoints, and potential attack vectors.",
        inputMapping: { targetScope: "input.scope", projectContext: "input.context" },
        outputMapping: { attackSurface: "output.attackSurface", techStack: "output.techStack" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 180_000,
      },
      {
        id: "sec-step-scan",
        name: "Vulnerability Scan",
        agentName: "Vuln Scanner",
        description: "Run automated vulnerability scans — OWASP Top 10, dependency auditing, SAST/DAST, and port scanning.",
        inputMapping: { attackSurface: "output.attackSurface", techStack: "output.techStack" },
        outputMapping: { vulnerabilities: "output.vulnerabilities", scanReport: "output.scanReport" },
        approvalRequired: false,
        retryCount: 2,
        timeout: 300_000,
      },
      {
        id: "sec-step-assess",
        name: "Vulnerability Assessment",
        agentName: "Vuln Scanner",
        description: "Triage and prioritize vulnerabilities by exploitability × impact, produce risk-scored findings.",
        inputMapping: { vulnerabilities: "output.vulnerabilities" },
        outputMapping: { assessedFindings: "output.assessedFindings", riskMatrix: "output.riskMatrix" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 180_000,
      },
      {
        id: "sec-step-exploit",
        name: "Exploit Test",
        agentName: "Vuln Scanner",
        description: "Generate proof-of-concept exploits for critical and high-severity findings to confirm real risk.",
        inputMapping: { assessedFindings: "output.assessedFindings" },
        outputMapping: { exploitResults: "output.exploitResults", confirmedVulns: "output.confirmedVulns" },
        approvalRequired: true,
        retryCount: 1,
        timeout: 240_000,
      },
      {
        id: "sec-step-report",
        name: "Security Report",
        agentName: "Scribe",
        description: "Generate a comprehensive security audit report with findings, risk ratings, and executive summary.",
        inputMapping: { assessedFindings: "output.assessedFindings", exploitResults: "output.exploitResults" },
        outputMapping: { auditReport: "output.auditReport", executiveSummary: "output.execSummary" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 120_000,
      },
      {
        id: "sec-step-fix",
        name: "Remediate Vulnerabilities",
        agentName: "CodeForge",
        description: "Implement fixes for all confirmed vulnerabilities — code patches, configuration hardening, and dependency updates.",
        inputMapping: { confirmedVulns: "output.confirmedVulns", auditReport: "output.auditReport" },
        outputMapping: { fixes: "output.fixes", patchLog: "output.patchLog" },
        approvalRequired: true,
        retryCount: 2,
        timeout: 300_000,
      },
      {
        id: "sec-step-verify",
        name: "Verify Fixes",
        agentName: "Vuln Scanner",
        description: "Re-scan and verify that all remediation fixes are effective and no regressions were introduced.",
        inputMapping: { fixes: "output.fixes", confirmedVulns: "output.confirmedVulns" },
        outputMapping: { verificationResults: "output.verificationResults", remainingIssues: "output.remaining" },
        approvalRequired: false,
        retryCount: 2,
        timeout: 240_000,
      },
      {
        id: "sec-step-compliance",
        name: "Compliance Check",
        agentName: "Access Auditor",
        description: "Map remaining and resolved findings to compliance frameworks — SOC 2, GDPR, HIPAA, PCI-DSS, ISO 27001.",
        inputMapping: { verificationResults: "output.verificationResults", auditReport: "output.auditReport" },
        outputMapping: { complianceStatus: "output.complianceStatus", complianceGaps: "output.complianceGaps" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 180_000,
      },
    ],
    parallelGroups: [[1, 2], [5, 7]], // scan+assess in parallel; report+compliance parallel
    version: "1.0.0",
    author: "ClawHub",
    tags: ["security", "audit", "compliance", "vulnerability", "penetration-testing"],
  },

  // ── 3. Deep Research Engine ─────────────────────────────────────────────
  {
    id: "pipeline-deep-research",
    name: "Deep Research Engine",
    description:
      "Multi-stage research pipeline — from query formulation through web search, source analysis, citation extraction, hallucination checking, synthesis, report generation, and export.",
    category: "research",
    icon: "🔬",
    steps: [
      {
        id: "research-step-query",
        name: "Query Formulation",
        agentName: "Orion",
        description: "Refine the raw research query into structured sub-queries and identify the research scope and methodology.",
        inputMapping: { rawQuery: "input.query", depth: "input.depth" },
        outputMapping: { subQueries: "output.subQueries", scope: "output.scope" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 60_000,
      },
      {
        id: "research-step-search",
        name: "Web Search",
        agentName: "Research Assistant",
        description: "Execute sub-queries across web sources, academic databases, and code repositories to gather raw materials.",
        inputMapping: { subQueries: "output.subQueries", scope: "output.scope" },
        outputMapping: { rawSources: "output.rawSources", searchStats: "output.searchStats" },
        approvalRequired: false,
        retryCount: 2,
        timeout: 180_000,
      },
      {
        id: "research-step-analyze",
        name: "Source Analysis",
        agentName: "Scout",
        description: "Evaluate source credibility, relevance, and recency. Filter out low-quality or biased sources.",
        inputMapping: { rawSources: "output.rawSources" },
        outputMapping: { vettedSources: "output.vettedSources", sourceRatings: "output.sourceRatings" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 120_000,
      },
      {
        id: "research-step-cite",
        name: "Citation Extraction",
        agentName: "Research Assistant",
        description: "Extract key claims, data points, and quotes from vetted sources with proper citation metadata.",
        inputMapping: { vettedSources: "output.vettedSources" },
        outputMapping: { citations: "output.citations", claimMap: "output.claimMap" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 120_000,
      },
      {
        id: "research-step-hallucination",
        name: "Hallucination Check",
        agentName: "Lens",
        description: "Cross-reference extracted claims against source material to identify unsupported statements, logical gaps, and potential hallucinations.",
        inputMapping: { citations: "output.citations", vettedSources: "output.vettedSources" },
        outputMapping: { verifiedClaims: "output.verifiedClaims", flaggedClaims: "output.flaggedClaims" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 120_000,
      },
      {
        id: "research-step-synthesize",
        name: "Synthesis",
        agentName: "Radar",
        description: "Synthesize verified claims into a coherent narrative, identify patterns, and draw evidence-based conclusions.",
        inputMapping: { verifiedClaims: "output.verifiedClaims", claimMap: "output.claimMap" },
        outputMapping: { synthesis: "output.synthesis", insights: "output.insights" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 180_000,
      },
      {
        id: "research-step-report",
        name: "Report Generation",
        agentName: "Scribe",
        description: "Generate a structured research report with executive summary, methodology, findings, citations, and recommendations.",
        inputMapping: { synthesis: "output.synthesis", insights: "output.insights", citations: "output.citations" },
        outputMapping: { report: "output.report", appendix: "output.appendix" },
        approvalRequired: true,
        retryCount: 1,
        timeout: 180_000,
      },
      {
        id: "research-step-export",
        name: "Export & Archive",
        agentName: "ETL Pipeline",
        description: "Export the report in multiple formats (Markdown, PDF) and archive all source materials and citations for future reference.",
        inputMapping: { report: "output.report", appendix: "output.appendix", citations: "output.citations" },
        outputMapping: { exports: "output.exports", archivePath: "output.archivePath" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 60_000,
      },
    ],
    parallelGroups: [[2, 3], [4, 5]], // analyze+cite parallel; hallucination+synthesis parallel
    version: "1.0.0",
    author: "ClawHub",
    tags: ["research", "analysis", "citations", "synthesis", "report"],
  },

  // ── 4. Data Pipeline Architect ──────────────────────────────────────────
  {
    id: "pipeline-data-architect",
    name: "Data Pipeline Architect",
    description:
      "Design and implement data pipelines — from schema design through extraction, transformation, validation, loading, monitoring, and alerting.",
    category: "data",
    icon: "🔄",
    steps: [
      {
        id: "data-step-schema",
        name: "Schema Design",
        agentName: "Stratum",
        description: "Design the target data schema — tables, columns, types, constraints, indexes, and relationships.",
        inputMapping: { sourceSpec: "input.sourceSpec", requirements: "input.requirements" },
        outputMapping: { schema: "output.schema", erDiagram: "output.erDiagram" },
        approvalRequired: true,
        retryCount: 1,
        timeout: 120_000,
      },
      {
        id: "data-step-extract",
        name: "Extract Data",
        agentName: "ETL Pipeline",
        description: "Build extraction connectors — API calls, database queries, file readers, and streaming consumers.",
        inputMapping: { schema: "output.schema", sourceSpec: "input.sourceSpec" },
        outputMapping: { rawDataset: "output.rawDataset", extractLog: "output.extractLog" },
        approvalRequired: false,
        retryCount: 2,
        timeout: 300_000,
      },
      {
        id: "data-step-transform",
        name: "Transform Data",
        agentName: "ETL Pipeline",
        description: "Implement transformation logic — cleaning, normalization, enrichment, deduplication, and aggregation.",
        inputMapping: { rawDataset: "output.rawDataset", schema: "output.schema" },
        outputMapping: { transformedData: "output.transformedData", transformLog: "output.transformLog" },
        approvalRequired: false,
        retryCount: 2,
        timeout: 300_000,
      },
      {
        id: "data-step-validate",
        name: "Validate Data",
        agentName: "Probe",
        description: "Validate transformed data — schema conformance, referential integrity, statistical anomaly detection, and completeness checks.",
        inputMapping: { transformedData: "output.transformedData", schema: "output.schema" },
        outputMapping: { validationReport: "output.validationReport", cleanData: "output.cleanData" },
        approvalRequired: false,
        retryCount: 2,
        timeout: 180_000,
      },
      {
        id: "data-step-load",
        name: "Load Data",
        agentName: "Stratum",
        description: "Load validated data into the target — bulk inserts, upserts, partition management, and index rebuilding.",
        inputMapping: { cleanData: "output.cleanData", schema: "output.schema" },
        outputMapping: { loadReport: "output.loadReport", rowCount: "output.rowCount" },
        approvalRequired: true,
        retryCount: 2,
        timeout: 300_000,
      },
      {
        id: "data-step-monitor",
        name: "Pipeline Monitoring",
        agentName: "Infra Monitor",
        description: "Set up pipeline monitoring — data freshness, throughput, error rates, and SLA tracking.",
        inputMapping: { loadReport: "output.loadReport", extractLog: "output.extractLog" },
        outputMapping: { monitorConfig: "output.monitorConfig", dashboards: "output.dashboards" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 120_000,
      },
      {
        id: "data-step-alert",
        name: "Alert Setup",
        agentName: "Incident Responder",
        description: "Configure alerting rules — data staleness, anomaly thresholds, pipeline failure notifications, and escalation paths.",
        inputMapping: { monitorConfig: "output.monitorConfig" },
        outputMapping: { alertRules: "output.alertRules", runbooks: "output.runbooks" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 120_000,
      },
    ],
    parallelGroups: [[2, 3], [5, 6]], // extract+transform parallel; monitor+alert parallel
    version: "1.0.0",
    author: "ClawHub",
    tags: ["data", "etl", "pipeline", "monitoring", "validation"],
  },

  // ── 5. Incident Command ─────────────────────────────────────────────────
  {
    id: "pipeline-incident-command",
    name: "Incident Command",
    description:
      "Production incident response pipeline — from detection and triage through containment, root cause analysis, fix, verification, post-mortem, and prevention rule creation.",
    category: "operations",
    icon: "🚨",
    steps: [
      {
        id: "inc-step-detect",
        name: "Detect Incident",
        agentName: "Infra Monitor",
        description: "Detect the incident from alerts, metrics anomalies, or user reports. Classify severity and affected components.",
        inputMapping: { alertData: "input.alert", metricsSnapshot: "input.metrics" },
        outputMapping: { incidentSummary: "output.incidentSummary", severity: "output.severity" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 30_000,
      },
      {
        id: "inc-step-triage",
        name: "Triage",
        agentName: "Incident Responder",
        description: "Assess impact radius, assign severity level, identify affected services and users, and establish the incident command structure.",
        inputMapping: { incidentSummary: "output.incidentSummary", severity: "output.severity" },
        outputMapping: { triageResult: "output.triageResult", commanderAssign: "output.commander" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 30_000,
      },
      {
        id: "inc-step-contain",
        name: "Contain",
        agentName: "Self-Healing Server",
        description: "Execute containment actions — circuit breakers, service isolation, traffic rerouting, and rollback if needed.",
        inputMapping: { triageResult: "output.triageResult" },
        outputMapping: { containmentActions: "output.containmentActions", serviceStatus: "output.serviceStatus" },
        approvalRequired: true,
        retryCount: 1,
        timeout: 60_000,
      },
      {
        id: "inc-step-rca",
        name: "Root Cause Analysis",
        agentName: "Trace",
        description: "Perform root cause analysis using 5-Why technique, trace through logs and call stacks, and identify the specific change or condition.",
        inputMapping: { containmentActions: "output.containmentActions", triageResult: "output.triageResult" },
        outputMapping: { rootCause: "output.rootCause", timeline: "output.timeline" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 180_000,
      },
      {
        id: "inc-step-fix",
        name: "Fix",
        agentName: "CodeForge",
        description: "Implement the fix for the root cause — code patches, configuration changes, or infrastructure updates.",
        inputMapping: { rootCause: "output.rootCause" },
        outputMapping: { fixDetails: "output.fixDetails", fixCommit: "output.fixCommit" },
        approvalRequired: true,
        retryCount: 2,
        timeout: 240_000,
      },
      {
        id: "inc-step-verify",
        name: "Verify Fix",
        agentName: "Probe",
        description: "Verify the fix is effective — run smoke tests, check metrics, confirm service restoration.",
        inputMapping: { fixDetails: "output.fixDetails", rootCause: "output.rootCause" },
        outputMapping: { verificationResult: "output.verificationResult", serviceHealth: "output.serviceHealth" },
        approvalRequired: false,
        retryCount: 2,
        timeout: 120_000,
      },
      {
        id: "inc-step-postmortem",
        name: "Post-Mortem",
        agentName: "Incident Responder",
        description: "Write a blameless post-mortem — timeline, root cause, impact, what went well, what could improve, and action items.",
        inputMapping: { timeline: "output.timeline", rootCause: "output.rootCause", verificationResult: "output.verificationResult" },
        outputMapping: { postMortem: "output.postMortem", actionItems: "output.actionItems" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 120_000,
      },
      {
        id: "inc-step-prevent",
        name: "Prevention Rules",
        agentName: "AdminGuard",
        description: "Create prevention rules — monitoring alerts, automated remediation, deployment safeguards, and on-call runbooks.",
        inputMapping: { actionItems: "output.actionItems", postMortem: "output.postMortem" },
        outputMapping: { preventionRules: "output.preventionRules", newAlerts: "output.newAlerts" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 120_000,
      },
    ],
    parallelGroups: [[0, 1], [3, 4]], // detect+triage fast; rca+fix parallel
    version: "1.0.0",
    author: "ClawHub",
    tags: ["incident", "operations", "post-mortem", "reliability", "sre"],
  },

  // ── 6. Code Modernization ───────────────────────────────────────────────
  {
    id: "pipeline-code-modernization",
    name: "Code Modernization",
    description:
      "Legacy code modernization pipeline — from analysis and migration planning through refactoring, testing, benchmarking, deployment, and cleanup.",
    category: "development",
    icon: "⚡",
    steps: [
      {
        id: "mod-step-analyze",
        name: "Legacy Analysis",
        agentName: "Lens",
        description: "Analyze the legacy codebase — identify technical debt, dependency age, language versions, architecture patterns, and modernization targets.",
        inputMapping: { codebasePath: "input.path", targetStack: "input.targetStack" },
        outputMapping: { analysisReport: "output.analysisReport", debtItems: "output.debtItems" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 180_000,
      },
      {
        id: "mod-step-plan",
        name: "Migration Plan",
        agentName: "Blueprint",
        description: "Create a phased migration plan — prioritize by risk and impact, identify breaking changes, and define rollback points.",
        inputMapping: { analysisReport: "output.analysisReport", debtItems: "output.debtItems" },
        outputMapping: { migrationPlan: "output.migrationPlan", phases: "output.phases" },
        approvalRequired: true,
        retryCount: 1,
        timeout: 120_000,
      },
      {
        id: "mod-step-refactor",
        name: "Refactor",
        agentName: "CodeForge",
        description: "Execute the refactoring — modernize syntax, update APIs, migrate dependencies, and restructure architecture.",
        inputMapping: { migrationPlan: "output.migrationPlan", phases: "output.phases" },
        outputMapping: { refactoredCode: "output.refactoredCode", changeLog: "output.changeLog" },
        approvalRequired: false,
        retryCount: 2,
        timeout: 600_000,
      },
      {
        id: "mod-step-test",
        name: "Test",
        agentName: "Probe",
        description: "Run comprehensive tests — regression suite, compatibility checks, and new test coverage for modernized components.",
        inputMapping: { refactoredCode: "output.refactoredCode", changeLog: "output.changeLog" },
        outputMapping: { testResults: "output.testResults", regressionStatus: "output.regressionStatus" },
        approvalRequired: false,
        retryCount: 2,
        timeout: 300_000,
      },
      {
        id: "mod-step-bench",
        name: "Performance Benchmark",
        agentName: "Pulse",
        description: "Benchmark performance before and after modernization — response times, memory usage, bundle size, and throughput.",
        inputMapping: { refactoredCode: "output.refactoredCode", testResults: "output.testResults" },
        outputMapping: { benchmarkReport: "output.benchmarkReport", perfDelta: "output.perfDelta" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 180_000,
      },
      {
        id: "mod-step-deploy",
        name: "Deploy",
        agentName: "Deploy Guardian",
        description: "Deploy the modernized codebase with progressive delivery — canary → staged rollout → full production.",
        inputMapping: { refactoredCode: "output.refactoredCode", benchmarkReport: "output.benchmarkReport" },
        outputMapping: { deployStatus: "output.deployStatus", deployUrl: "output.deployUrl" },
        approvalRequired: true,
        retryCount: 1,
        timeout: 300_000,
      },
      {
        id: "mod-step-cleanup",
        name: "Cleanup",
        agentName: "Refine",
        description: "Remove deprecated code paths, clean up feature flags, update documentation, and archive legacy artifacts.",
        inputMapping: { deployStatus: "output.deployStatus", changeLog: "output.changeLog" },
        outputMapping: { cleanupReport: "output.cleanupReport", archivePaths: "output.archivePaths" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 120_000,
      },
    ],
    parallelGroups: [[3, 4], [5, 6]], // test+benchmark parallel; deploy+cleanup parallel
    version: "1.0.0",
    author: "ClawHub",
    tags: ["modernization", "refactoring", "migration", "legacy", "technical-debt"],
  },

  // ── 7. Product Launch Pad ───────────────────────────────────────────────
  {
    id: "pipeline-product-launch",
    name: "Product Launch Pad",
    description:
      "Product launch pipeline — from requirements gathering through design, build, QA, staging, launch, monitoring, and iteration planning.",
    category: "product",
    icon: "🚀",
    steps: [
      {
        id: "launch-step-requirements",
        name: "Requirements Gathering",
        agentName: "Orion",
        description: "Gather and structure product requirements — user stories, acceptance criteria, priorities, and success metrics.",
        inputMapping: { productBrief: "input.brief", stakeholderInput: "input.stakeholder" },
        outputMapping: { requirements: "output.requirements", userStories: "output.userStories" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 120_000,
      },
      {
        id: "launch-step-design",
        name: "Design",
        agentName: "Prism",
        description: "Create product design — wireframes, user flows, component library, and design system specifications.",
        inputMapping: { requirements: "output.requirements", userStories: "output.userStories" },
        outputMapping: { designSpec: "output.designSpec", wireframes: "output.wireframes" },
        approvalRequired: true,
        retryCount: 1,
        timeout: 180_000,
      },
      {
        id: "launch-step-build",
        name: "Build",
        agentName: "CodeForge",
        description: "Implement the product — frontend, backend, database, integrations, and configuration.",
        inputMapping: { designSpec: "output.designSpec", requirements: "output.requirements" },
        outputMapping: { productCode: "output.productCode", buildLog: "output.buildLog" },
        approvalRequired: false,
        retryCount: 2,
        timeout: 600_000,
      },
      {
        id: "launch-step-qa",
        name: "QA",
        agentName: "Probe",
        description: "Quality assurance — functional testing, cross-browser testing, accessibility audit, and performance testing.",
        inputMapping: { productCode: "output.productCode", requirements: "output.requirements" },
        outputMapping: { qaReport: "output.qaReport", bugList: "output.bugList" },
        approvalRequired: false,
        retryCount: 2,
        timeout: 300_000,
      },
      {
        id: "launch-step-staging",
        name: "Staging Deploy",
        agentName: "Deploy Guardian",
        description: "Deploy to staging environment for final validation — smoke tests, load tests, and stakeholder review.",
        inputMapping: { productCode: "output.productCode", qaReport: "output.qaReport" },
        outputMapping: { stagingUrl: "output.stagingUrl", stagingStatus: "output.stagingStatus" },
        approvalRequired: true,
        retryCount: 1,
        timeout: 180_000,
      },
      {
        id: "launch-step-launch",
        name: "Launch",
        agentName: "Deploy Guardian",
        description: "Execute the production launch — progressive rollout, monitoring, and immediate rollback readiness.",
        inputMapping: { stagingStatus: "output.stagingStatus", productCode: "output.productCode" },
        outputMapping: { launchUrl: "output.launchUrl", launchStatus: "output.launchStatus" },
        approvalRequired: true,
        retryCount: 1,
        timeout: 300_000,
      },
      {
        id: "launch-step-monitor",
        name: "Monitor",
        agentName: "Pulse",
        description: "Monitor launch metrics — user adoption, error rates, performance, and user feedback channels.",
        inputMapping: { launchUrl: "output.launchUrl", launchStatus: "output.launchStatus" },
        outputMapping: { metricsDashboard: "output.metricsDashboard", launchMetrics: "output.launchMetrics" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 120_000,
      },
      {
        id: "launch-step-iterate",
        name: "Iterate Planning",
        agentName: "Orion",
        description: "Plan the next iteration — prioritize feedback, triage bugs, identify quick wins, and update the roadmap.",
        inputMapping: { launchMetrics: "output.launchMetrics", bugList: "output.bugList" },
        outputMapping: { iterationPlan: "output.iterationPlan", roadmap: "output.roadmap" },
        approvalRequired: false,
        retryCount: 1,
        timeout: 120_000,
      },
    ],
    parallelGroups: [[2, 3], [6, 7]], // build+qa parallel; monitor+iterate parallel
    version: "1.0.0",
    author: "ClawHub",
    tags: ["product", "launch", "development", "deployment", "iteration"],
  },
];

// =============================================================================
// §2  ORCHESTRATION RULES
// =============================================================================

export interface TaskRoutingEntry {
  preferredAgent: string;
  fallbackChain: string[];
}

export interface ExecutionStrategyConfig {
  type: "parallel" | "sequential" | "consensus" | "race" | "waterfall";
  description: string;
  config: {
    maxConcurrency?: number;
    consensusThreshold?: number; // 0-1, fraction that must agree
    raceTimeout?: number; // ms
    waterfallDelay?: number; // ms between steps
    retryOnFail?: boolean;
    abortOnFirstError?: boolean;
  };
}

export interface AutoScalingRule {
  trigger: "queue_depth" | "wait_time" | "error_rate" | "cpu_usage";
  threshold: number;
  action: "scale_up" | "scale_down" | "alert";
  value: number; // how many workers to add/remove, or alert severity
  cooldown: number; // ms before rule can fire again
}

export interface QualityGate {
  id: string;
  name: string;
  condition: string; // human-readable
  check: {
    metric: string;
    operator: ">=" | "<=" | "==" | "!=" | ">" | "<";
    value: number;
  };
  blocking: boolean; // true = cannot proceed if not met
}

export interface OrchestrationRules {
  taskRouting: Record<string, TaskRoutingEntry>;
  executionStrategies: ExecutionStrategyConfig[];
  fallbackChains: Record<string, string[]>;
  autoScalingRules: AutoScalingRule[];
  qualityGates: QualityGate[];
}

export const ORCHESTRATION_RULES: OrchestrationRules = {
  // ── Task Routing ──
  taskRouting: {
    code_gen: { preferredAgent: "CodeForge", fallbackChain: ["Core", "Vertex"] },
    code_review: { preferredAgent: "Lens", fallbackChain: ["Refine", "Cipher"] },
    bug_fix: { preferredAgent: "Trace", fallbackChain: ["CodeForge", "Core"] },
    architecture: { preferredAgent: "Blueprint", fallbackChain: ["CodeForge", "Stratum"] },
    frontend: { preferredAgent: "Vertex", fallbackChain: ["CodeForge", "Prism"] },
    backend: { preferredAgent: "Core", fallbackChain: ["CodeForge", "Stratum"] },
    database: { preferredAgent: "Stratum", fallbackChain: ["Core", "Radar"] },
    devops: { preferredAgent: "Harbor", fallbackChain: ["Deploy Guardian", "Forge"] },
    deploy: { preferredAgent: "Deploy Guardian", fallbackChain: ["Harbor", "Forge"] },
    security_scan: { preferredAgent: "Vuln Scanner", fallbackChain: ["Access Auditor", "Cipher"] },
    compliance: { preferredAgent: "Access Auditor", fallbackChain: ["Vuln Scanner", "Cipher"] },
    testing: { preferredAgent: "Probe", fallbackChain: ["Trace", "Lens"] },
    monitoring: { preferredAgent: "Infra Monitor", fallbackChain: ["Pulse", "Self-Healing Server"] },
    incident: { preferredAgent: "Incident Responder", fallbackChain: ["Self-Healing Server", "AdminGuard"] },
    documentation: { preferredAgent: "Scribe", fallbackChain: ["Research Assistant", "Scribe"] },
    research: { preferredAgent: "Research Assistant", fallbackChain: ["Scout", "Radar"] },
    analytics: { preferredAgent: "Pulse", fallbackChain: ["Radar", "ETL Pipeline"] },
    etl: { preferredAgent: "ETL Pipeline", fallbackChain: ["Stratum", "Radar"] },
    content: { preferredAgent: "Echo", fallbackChain: ["Copywriter", "Rank"] },
    seo: { preferredAgent: "Rank", fallbackChain: ["Echo", "Copywriter"] },
    ux_design: { preferredAgent: "Prism", fallbackChain: ["UX Researcher", "Vertex"] },
    planning: { preferredAgent: "Orion", fallbackChain: ["Navigator", "Blueprint"] },
    sales: { preferredAgent: "Pipeline", fallbackChain: ["Scout", "Echo"] },
    support: { preferredAgent: "Compass", fallbackChain: ["Compass", "Scribe"] },
    infra: { preferredAgent: "AdminGuard", fallbackChain: ["Self-Healing Server", "Forge"] },
    data_analysis: { preferredAgent: "Radar", fallbackChain: ["ETL Pipeline", "Pulse"] },
    sql: { preferredAgent: "SQL Assistant", fallbackChain: ["Stratum", "Radar"] },
    reporting: { preferredAgent: "Report Generator", fallbackChain: ["Scribe", "Radar"] },
  },

  // ── Execution Strategies ──
  executionStrategies: [
    {
      type: "parallel",
      description: "Execute all tasks concurrently. Best for independent sub-tasks with no dependencies.",
      config: { maxConcurrency: 5, abortOnFirstError: false, retryOnFail: true },
    },
    {
      type: "sequential",
      description: "Execute tasks one after another. Each task receives the previous task's output as input.",
      config: { retryOnFail: true, abortOnFirstError: true },
    },
    {
      type: "consensus",
      description: "Run multiple agents on the same task and aggregate results. Proceed when consensusThreshold fraction agree.",
      config: { maxConcurrency: 3, consensusThreshold: 0.67, retryOnFail: true },
    },
    {
      type: "race",
      description: "Fire multiple providers/agents simultaneously. Use the first successful result and cancel the rest.",
      config: { maxConcurrency: 3, raceTimeout: 30_000, retryOnFail: false },
    },
    {
      type: "waterfall",
      description: "Execute tasks sequentially with a configurable delay between steps. Good for rate-limited APIs.",
      config: { waterfallDelay: 2_000, retryOnFail: true, abortOnFirstError: false },
    },
  ],

  // ── Fallback Chains ──
  fallbackChains: {
    coding: ["CodeForge", "Core", "Vertex", "Blueprint"],
    security: ["Vuln Scanner", "Access Auditor", "Cipher", "AdminGuard"],
    infra: ["AdminGuard", "Self-Healing Server", "Forge", "Harbor"],
    data: ["Radar", "ETL Pipeline", "Stratum", "SQL Assistant"],
    research: ["Research Assistant", "Scout", "Radar", "Scribe"],
    content: ["Echo", "Copywriter", "Rank", "Scribe"],
    ops: ["Incident Responder", "Self-Healing Server", "AdminGuard", "Deploy Guardian"],
    qa: ["Probe", "Lens", "Trace", "Refine"],
    design: ["Prism", "UX Researcher", "Vertex", "CodeForge"],
    planning: ["Orion", "Navigator", "Blueprint", "CodeForge"],
  },

  // ── Auto-Scaling Rules ──
  autoScalingRules: [
    {
      trigger: "queue_depth",
      threshold: 10,
      action: "scale_up",
      value: 2,
      cooldown: 60_000,
    },
    {
      trigger: "queue_depth",
      threshold: 50,
      action: "scale_up",
      value: 5,
      cooldown: 30_000,
    },
    {
      trigger: "queue_depth",
      threshold: 2,
      action: "scale_down",
      value: 1,
      cooldown: 120_000,
    },
    {
      trigger: "wait_time",
      threshold: 30_000, // 30 seconds
      action: "scale_up",
      value: 3,
      cooldown: 60_000,
    },
    {
      trigger: "error_rate",
      threshold: 0.15, // 15% error rate
      action: "alert",
      value: 1, // severity 1 = high
      cooldown: 30_000,
    },
    {
      trigger: "cpu_usage",
      threshold: 0.85, // 85% CPU
      action: "scale_up",
      value: 2,
      cooldown: 60_000,
    },
  ],

  // ── Quality Gates ──
  qualityGates: [
    {
      id: "qg-test-pass-rate",
      name: "Test Pass Rate",
      condition: "At least 90% of tests must pass before proceeding to deploy",
      check: { metric: "testPassRate", operator: ">=", value: 0.9 },
      blocking: true,
    },
    {
      id: "qg-code-review-score",
      name: "Code Review Score",
      condition: "Code review must achieve a quality score of 0.7 or higher",
      check: { metric: "reviewScore", operator: ">=", value: 0.7 },
      blocking: true,
    },
    {
      id: "qg-security-critical",
      name: "No Critical Security Vulnerabilities",
      condition: "Zero critical-severity security vulnerabilities may remain unresolved",
      check: { metric: "criticalVulns", operator: "==", value: 0 },
      blocking: true,
    },
    {
      id: "qg-deploy-success",
      name: "Deploy Success Rate",
      condition: "Deployment must achieve at least 95% success rate in canary phase",
      check: { metric: "deploySuccessRate", operator: ">=", value: 0.95 },
      blocking: true,
    },
    {
      id: "qg-latency-p95",
      name: "P95 Latency Under Threshold",
      condition: "P95 latency must be under 2 seconds for deploy approval",
      check: { metric: "p95Latency", operator: "<=", value: 2000 },
      blocking: false,
    },
    {
      id: "qg-coverage-minimum",
      name: "Minimum Test Coverage",
      condition: "Code coverage must be at least 60% for production deploy",
      check: { metric: "codeCoverage", operator: ">=", value: 0.6 },
      blocking: false,
    },
    {
      id: "qg-hallucination-rate",
      name: "Hallucination Rate",
      condition: "Research pipeline must flag fewer than 10% of claims as potential hallucinations",
      check: { metric: "hallucinationRate", operator: "<=", value: 0.1 },
      blocking: true,
    },
    {
      id: "qg-data-freshness",
      name: "Data Freshness",
      condition: "ETL pipeline data must be no more than 1 hour stale at load time",
      check: { metric: "dataStalenessMinutes", operator: "<=", value: 60 },
      blocking: false,
    },
  ],
};

// =============================================================================
// §3  PRECONFIGURED AGENT ENHANCEMENTS
// =============================================================================

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  backoffMultiplier: number;
}

export interface AgentEnhancement {
  executionStrategy: "streaming" | "batch" | "interactive";
  preferredModel: string;
  fallbackModels: string[];
  maxConcurrentTasks: number;
  timeout: number; // ms
  retryPolicy: RetryPolicy;
  qualityThreshold: number; // 0-1
  memoryScope: "session" | "project" | "global";
  toolAccess: string[];
  costLimit: number; // max cost per task in USD
}

export const AGENT_ENHANCEMENTS: Record<string, AgentEnhancement> = {
  CodeForge: {
    executionStrategy: "streaming",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash", "deepseek-chat"],
    maxConcurrentTasks: 3,
    timeout: 300_000,
    retryPolicy: { maxRetries: 2, backoffMs: 2000, backoffMultiplier: 2 },
    qualityThreshold: 0.75,
    memoryScope: "project",
    toolAccess: ["fs", "terminal", "git", "browser", "database", "coding-agent"],
    costLimit: 0.5,
  },
  AdminGuard: {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.5-pro"],
    maxConcurrentTasks: 2,
    timeout: 180_000,
    retryPolicy: { maxRetries: 2, backoffMs: 3000, backoffMultiplier: 2 },
    qualityThreshold: 0.7,
    memoryScope: "global",
    toolAccess: ["terminal", "ssh", "monitoring", "infrastructure"],
    costLimit: 0.3,
  },
  ResumePro: {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.5-pro"],
    maxConcurrentTasks: 5,
    timeout: 120_000,
    retryPolicy: { maxRetries: 1, backoffMs: 1000, backoffMultiplier: 2 },
    qualityThreshold: 0.8,
    memoryScope: "session",
    toolAccess: ["pdf", "docx", "web-search"],
    costLimit: 0.2,
  },
  Orion: {
    executionStrategy: "streaming",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 2,
    timeout: 120_000,
    retryPolicy: { maxRetries: 1, backoffMs: 2000, backoffMultiplier: 2 },
    qualityThreshold: 0.7,
    memoryScope: "project",
    toolAccess: ["browser", "web-search", "terminal"],
    costLimit: 0.3,
  },
  Pulse: {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.5-pro"],
    maxConcurrentTasks: 3,
    timeout: 120_000,
    retryPolicy: { maxRetries: 2, backoffMs: 1500, backoffMultiplier: 2 },
    qualityThreshold: 0.7,
    memoryScope: "global",
    toolAccess: ["browser", "web-search", "database"],
    costLimit: 0.2,
  },
  Lens: {
    executionStrategy: "streaming",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash", "deepseek-chat"],
    maxConcurrentTasks: 3,
    timeout: 180_000,
    retryPolicy: { maxRetries: 2, backoffMs: 2000, backoffMultiplier: 2 },
    qualityThreshold: 0.8,
    memoryScope: "project",
    toolAccess: ["fs", "terminal", "git", "browser", "coding-agent"],
    costLimit: 0.4,
  },
  Trace: {
    executionStrategy: "interactive",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 2,
    timeout: 240_000,
    retryPolicy: { maxRetries: 3, backoffMs: 1500, backoffMultiplier: 2 },
    qualityThreshold: 0.75,
    memoryScope: "session",
    toolAccess: ["fs", "terminal", "git", "browser", "database", "coding-agent"],
    costLimit: 0.4,
  },
  Scribe: {
    executionStrategy: "streaming",
    preferredModel: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.5-pro"],
    maxConcurrentTasks: 5,
    timeout: 120_000,
    retryPolicy: { maxRetries: 1, backoffMs: 1000, backoffMultiplier: 2 },
    qualityThreshold: 0.7,
    memoryScope: "project",
    toolAccess: ["browser", "web-search", "fs"],
    costLimit: 0.2,
  },
  Forge: {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 2,
    timeout: 180_000,
    retryPolicy: { maxRetries: 2, backoffMs: 3000, backoffMultiplier: 2 },
    qualityThreshold: 0.7,
    memoryScope: "project",
    toolAccess: ["terminal", "git", "fs", "browser", "coding-agent"],
    costLimit: 0.3,
  },
  Echo: {
    executionStrategy: "streaming",
    preferredModel: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.5-pro"],
    maxConcurrentTasks: 5,
    timeout: 120_000,
    retryPolicy: { maxRetries: 1, backoffMs: 1000, backoffMultiplier: 2 },
    qualityThreshold: 0.7,
    memoryScope: "session",
    toolAccess: ["browser", "web-search"],
    costLimit: 0.2,
  },
  Rank: {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.5-pro"],
    maxConcurrentTasks: 3,
    timeout: 120_000,
    retryPolicy: { maxRetries: 1, backoffMs: 1500, backoffMultiplier: 2 },
    qualityThreshold: 0.7,
    memoryScope: "session",
    toolAccess: ["browser", "web-search"],
    costLimit: 0.2,
  },
  Scout: {
    executionStrategy: "streaming",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 2,
    timeout: 180_000,
    retryPolicy: { maxRetries: 2, backoffMs: 2000, backoffMultiplier: 2 },
    qualityThreshold: 0.75,
    memoryScope: "global",
    toolAccess: ["browser", "web-search"],
    costLimit: 0.3,
  },
  Radar: {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 3,
    timeout: 180_000,
    retryPolicy: { maxRetries: 2, backoffMs: 2000, backoffMultiplier: 2 },
    qualityThreshold: 0.75,
    memoryScope: "global",
    toolAccess: ["browser", "web-search", "database"],
    costLimit: 0.3,
  },
  Compass: {
    executionStrategy: "interactive",
    preferredModel: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.5-pro"],
    maxConcurrentTasks: 5,
    timeout: 60_000,
    retryPolicy: { maxRetries: 1, backoffMs: 1000, backoffMultiplier: 2 },
    qualityThreshold: 0.8,
    memoryScope: "session",
    toolAccess: ["browser", "web-search", "fs"],
    costLimit: 0.1,
  },
  Pipeline: {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 2,
    timeout: 120_000,
    retryPolicy: { maxRetries: 1, backoffMs: 2000, backoffMultiplier: 2 },
    qualityThreshold: 0.7,
    memoryScope: "session",
    toolAccess: ["browser", "web-search"],
    costLimit: 0.3,
  },
  "Incident Responder": {
    executionStrategy: "streaming",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 1,
    timeout: 60_000,
    retryPolicy: { maxRetries: 3, backoffMs: 500, backoffMultiplier: 1.5 },
    qualityThreshold: 0.8,
    memoryScope: "global",
    toolAccess: ["terminal", "ssh", "monitoring", "infrastructure", "browser", "coding-agent"],
    costLimit: 0.5,
  },
  "Deploy Guardian": {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 2,
    timeout: 300_000,
    retryPolicy: { maxRetries: 2, backoffMs: 5000, backoffMultiplier: 2 },
    qualityThreshold: 0.85,
    memoryScope: "project",
    toolAccess: ["terminal", "git", "fs", "browser", "coding-agent"],
    costLimit: 0.4,
  },
  "Infra Monitor": {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.5-pro"],
    maxConcurrentTasks: 5,
    timeout: 120_000,
    retryPolicy: { maxRetries: 2, backoffMs: 2000, backoffMultiplier: 2 },
    qualityThreshold: 0.7,
    memoryScope: "global",
    toolAccess: ["monitoring", "terminal", "browser"],
    costLimit: 0.2,
  },
  "Self-Healing Server": {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.5-pro"],
    maxConcurrentTasks: 3,
    timeout: 60_000,
    retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
    qualityThreshold: 0.8,
    memoryScope: "global",
    toolAccess: ["terminal", "ssh", "monitoring", "infrastructure", "browser"],
    costLimit: 0.2,
  },
  "Vuln Scanner": {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash", "deepseek-chat"],
    maxConcurrentTasks: 2,
    timeout: 300_000,
    retryPolicy: { maxRetries: 2, backoffMs: 3000, backoffMultiplier: 2 },
    qualityThreshold: 0.8,
    memoryScope: "project",
    toolAccess: ["terminal", "fs", "browser", "coding-agent"],
    costLimit: 0.5,
  },
  "Access Auditor": {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 2,
    timeout: 180_000,
    retryPolicy: { maxRetries: 2, backoffMs: 2000, backoffMultiplier: 2 },
    qualityThreshold: 0.8,
    memoryScope: "global",
    toolAccess: ["terminal", "fs", "browser"],
    costLimit: 0.3,
  },
  "ETL Pipeline": {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.5-pro"],
    maxConcurrentTasks: 3,
    timeout: 300_000,
    retryPolicy: { maxRetries: 3, backoffMs: 3000, backoffMultiplier: 2 },
    qualityThreshold: 0.75,
    memoryScope: "project",
    toolAccess: ["database", "terminal", "fs", "browser"],
    costLimit: 0.3,
  },
  "SQL Assistant": {
    executionStrategy: "streaming",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 5,
    timeout: 60_000,
    retryPolicy: { maxRetries: 2, backoffMs: 1000, backoffMultiplier: 2 },
    qualityThreshold: 0.8,
    memoryScope: "session",
    toolAccess: ["database", "browser"],
    costLimit: 0.15,
  },
  "Report Generator": {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.5-pro"],
    maxConcurrentTasks: 3,
    timeout: 180_000,
    retryPolicy: { maxRetries: 1, backoffMs: 1500, backoffMultiplier: 2 },
    qualityThreshold: 0.7,
    memoryScope: "session",
    toolAccess: ["database", "browser", "web-search"],
    costLimit: 0.2,
  },
  "Resume Screener": {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.5-pro"],
    maxConcurrentTasks: 5,
    timeout: 60_000,
    retryPolicy: { maxRetries: 1, backoffMs: 1000, backoffMultiplier: 2 },
    qualityThreshold: 0.75,
    memoryScope: "session",
    toolAccess: ["pdf", "docx", "browser"],
    costLimit: 0.1,
  },
  Recruiter: {
    executionStrategy: "streaming",
    preferredModel: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.5-pro"],
    maxConcurrentTasks: 3,
    timeout: 120_000,
    retryPolicy: { maxRetries: 1, backoffMs: 1500, backoffMultiplier: 2 },
    qualityThreshold: 0.7,
    memoryScope: "session",
    toolAccess: ["browser", "web-search"],
    costLimit: 0.2,
  },
  "Contract Reviewer": {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 2,
    timeout: 180_000,
    retryPolicy: { maxRetries: 1, backoffMs: 2000, backoffMultiplier: 2 },
    qualityThreshold: 0.85,
    memoryScope: "session",
    toolAccess: ["pdf", "docx", "browser"],
    costLimit: 0.3,
  },
  "Expense Tracker": {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.5-pro"],
    maxConcurrentTasks: 5,
    timeout: 60_000,
    retryPolicy: { maxRetries: 1, backoffMs: 1000, backoffMultiplier: 2 },
    qualityThreshold: 0.8,
    memoryScope: "session",
    toolAccess: ["database", "browser"],
    costLimit: 0.1,
  },
  "Fraud Detector": {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 3,
    timeout: 120_000,
    retryPolicy: { maxRetries: 2, backoffMs: 2000, backoffMultiplier: 2 },
    qualityThreshold: 0.9,
    memoryScope: "global",
    toolAccess: ["database", "browser", "terminal"],
    costLimit: 0.4,
  },
  "Symptom Triage": {
    executionStrategy: "interactive",
    preferredModel: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.5-pro"],
    maxConcurrentTasks: 5,
    timeout: 60_000,
    retryPolicy: { maxRetries: 1, backoffMs: 1000, backoffMultiplier: 2 },
    qualityThreshold: 0.85,
    memoryScope: "session",
    toolAccess: ["browser", "web-search"],
    costLimit: 0.15,
  },
  Tutor: {
    executionStrategy: "interactive",
    preferredModel: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.5-pro"],
    maxConcurrentTasks: 5,
    timeout: 120_000,
    retryPolicy: { maxRetries: 1, backoffMs: 1000, backoffMultiplier: 2 },
    qualityThreshold: 0.7,
    memoryScope: "session",
    toolAccess: ["browser", "web-search"],
    costLimit: 0.15,
  },
  "Research Assistant": {
    executionStrategy: "streaming",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 2,
    timeout: 180_000,
    retryPolicy: { maxRetries: 2, backoffMs: 2000, backoffMultiplier: 2 },
    qualityThreshold: 0.75,
    memoryScope: "project",
    toolAccess: ["browser", "web-search", "pdf"],
    costLimit: 0.4,
  },
  Copywriter: {
    executionStrategy: "streaming",
    preferredModel: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.5-pro"],
    maxConcurrentTasks: 5,
    timeout: 60_000,
    retryPolicy: { maxRetries: 1, backoffMs: 1000, backoffMultiplier: 2 },
    qualityThreshold: 0.7,
    memoryScope: "session",
    toolAccess: ["browser", "web-search"],
    costLimit: 0.15,
  },
  "UX Researcher": {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 2,
    timeout: 180_000,
    retryPolicy: { maxRetries: 1, backoffMs: 2000, backoffMultiplier: 2 },
    qualityThreshold: 0.75,
    memoryScope: "project",
    toolAccess: ["browser", "web-search"],
    costLimit: 0.3,
  },
  "Product Lister": {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.5-pro"],
    maxConcurrentTasks: 5,
    timeout: 60_000,
    retryPolicy: { maxRetries: 1, backoffMs: 1000, backoffMultiplier: 2 },
    qualityThreshold: 0.7,
    memoryScope: "session",
    toolAccess: ["browser", "web-search"],
    costLimit: 0.1,
  },
  "Churn Preventer": {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 2,
    timeout: 180_000,
    retryPolicy: { maxRetries: 2, backoffMs: 2000, backoffMultiplier: 2 },
    qualityThreshold: 0.8,
    memoryScope: "global",
    toolAccess: ["database", "browser", "web-search"],
    costLimit: 0.3,
  },
  Navigator: {
    executionStrategy: "streaming",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 2,
    timeout: 120_000,
    retryPolicy: { maxRetries: 1, backoffMs: 2000, backoffMultiplier: 2 },
    qualityThreshold: 0.7,
    memoryScope: "project",
    toolAccess: ["browser", "web-search", "terminal"],
    costLimit: 0.3,
  },
  Blueprint: {
    executionStrategy: "streaming",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 2,
    timeout: 180_000,
    retryPolicy: { maxRetries: 1, backoffMs: 2000, backoffMultiplier: 2 },
    qualityThreshold: 0.75,
    memoryScope: "project",
    toolAccess: ["browser", "web-search", "terminal", "database"],
    costLimit: 0.4,
  },
  Prism: {
    executionStrategy: "streaming",
    preferredModel: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.5-pro"],
    maxConcurrentTasks: 3,
    timeout: 120_000,
    retryPolicy: { maxRetries: 1, backoffMs: 1500, backoffMultiplier: 2 },
    qualityThreshold: 0.7,
    memoryScope: "project",
    toolAccess: ["browser", "web-search"],
    costLimit: 0.2,
  },
  Vertex: {
    executionStrategy: "streaming",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 3,
    timeout: 300_000,
    retryPolicy: { maxRetries: 2, backoffMs: 2000, backoffMultiplier: 2 },
    qualityThreshold: 0.75,
    memoryScope: "project",
    toolAccess: ["fs", "terminal", "browser", "coding-agent"],
    costLimit: 0.4,
  },
  Core: {
    executionStrategy: "streaming",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash", "deepseek-chat"],
    maxConcurrentTasks: 3,
    timeout: 300_000,
    retryPolicy: { maxRetries: 2, backoffMs: 2000, backoffMultiplier: 2 },
    qualityThreshold: 0.75,
    memoryScope: "project",
    toolAccess: ["fs", "terminal", "git", "database", "browser", "coding-agent"],
    costLimit: 0.5,
  },
  Harbor: {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 2,
    timeout: 180_000,
    retryPolicy: { maxRetries: 2, backoffMs: 3000, backoffMultiplier: 2 },
    qualityThreshold: 0.75,
    memoryScope: "project",
    toolAccess: ["terminal", "git", "fs", "browser"],
    costLimit: 0.3,
  },
  Stratum: {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 2,
    timeout: 180_000,
    retryPolicy: { maxRetries: 2, backoffMs: 2000, backoffMultiplier: 2 },
    qualityThreshold: 0.8,
    memoryScope: "project",
    toolAccess: ["database", "terminal", "fs", "browser"],
    costLimit: 0.3,
  },
  Probe: {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-flash",
    fallbackModels: ["gemini-2.5-pro"],
    maxConcurrentTasks: 3,
    timeout: 240_000,
    retryPolicy: { maxRetries: 2, backoffMs: 1500, backoffMultiplier: 2 },
    qualityThreshold: 0.8,
    memoryScope: "project",
    toolAccess: ["fs", "terminal", "git", "browser", "coding-agent"],
    costLimit: 0.3,
  },
  Cipher: {
    executionStrategy: "batch",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 2,
    timeout: 180_000,
    retryPolicy: { maxRetries: 2, backoffMs: 2000, backoffMultiplier: 2 },
    qualityThreshold: 0.85,
    memoryScope: "project",
    toolAccess: ["terminal", "fs", "browser", "coding-agent"],
    costLimit: 0.4,
  },
  Refine: {
    executionStrategy: "streaming",
    preferredModel: "gemini-2.5-pro",
    fallbackModels: ["gemini-2.5-flash"],
    maxConcurrentTasks: 3,
    timeout: 180_000,
    retryPolicy: { maxRetries: 1, backoffMs: 2000, backoffMultiplier: 2 },
    qualityThreshold: 0.75,
    memoryScope: "project",
    toolAccess: ["fs", "terminal", "git", "browser", "coding-agent"],
    costLimit: 0.3,
  },
};

// =============================================================================
// §4  DEFAULT PROVIDER SCORES
// =============================================================================

export interface ProviderScoreEntry {
  providerName: string;
  modelId: string;
  taskType: string;
  avgLatency: number;
  avgTokensPerSec: number;
  successRate: number;
  costPer1kTokens: number;
  contextLength: number;
  qualityScore: number;
  privacyLevel: "local" | "hybrid" | "cloud";
}

export const DEFAULT_PROVIDER_SCORES: ProviderScoreEntry[] = [
  // Z.AI (primary provider)
  { providerName: "zai", modelId: "auto", taskType: "chat", avgLatency: 800, avgTokensPerSec: 45, successRate: 0.95, costPer1kTokens: 0, contextLength: 128000, qualityScore: 0.85, privacyLevel: "cloud" },
  { providerName: "zai", modelId: "gemini-2.5-pro", taskType: "code", avgLatency: 1200, avgTokensPerSec: 35, successRate: 0.92, costPer1kTokens: 0, contextLength: 1000000, qualityScore: 0.92, privacyLevel: "cloud" },
  { providerName: "zai", modelId: "gemini-2.5-pro", taskType: "reasoning", avgLatency: 2000, avgTokensPerSec: 25, successRate: 0.90, costPer1kTokens: 0, contextLength: 1000000, qualityScore: 0.95, privacyLevel: "cloud" },
  { providerName: "zai", modelId: "gemini-2.5-pro", taskType: "analysis", avgLatency: 1500, avgTokensPerSec: 30, successRate: 0.91, costPer1kTokens: 0, contextLength: 1000000, qualityScore: 0.91, privacyLevel: "cloud" },
  { providerName: "zai", modelId: "gemini-2.5-pro", taskType: "creative", avgLatency: 1400, avgTokensPerSec: 32, successRate: 0.93, costPer1kTokens: 0, contextLength: 1000000, qualityScore: 0.89, privacyLevel: "cloud" },
  { providerName: "zai", modelId: "gemini-2.5-flash", taskType: "quick", avgLatency: 400, avgTokensPerSec: 80, successRate: 0.97, costPer1kTokens: 0, contextLength: 1000000, qualityScore: 0.80, privacyLevel: "cloud" },
  { providerName: "zai", modelId: "gemini-2.5-flash", taskType: "chat", avgLatency: 500, avgTokensPerSec: 75, successRate: 0.96, costPer1kTokens: 0, contextLength: 1000000, qualityScore: 0.82, privacyLevel: "cloud" },
  { providerName: "zai", modelId: "gemini-2.5-flash", taskType: "code", avgLatency: 600, avgTokensPerSec: 70, successRate: 0.94, costPer1kTokens: 0, contextLength: 1000000, qualityScore: 0.84, privacyLevel: "cloud" },
  { providerName: "zai", modelId: "gemini-2.5-flash", taskType: "embedding", avgLatency: 200, avgTokensPerSec: 150, successRate: 0.99, costPer1kTokens: 0, contextLength: 1000000, qualityScore: 0.78, privacyLevel: "cloud" },

  // OpenAI
  { providerName: "openai", modelId: "gpt-4o", taskType: "code", avgLatency: 1500, avgTokensPerSec: 30, successRate: 0.93, costPer1kTokens: 0.005, contextLength: 128000, qualityScore: 0.93, privacyLevel: "cloud" },
  { providerName: "openai", modelId: "gpt-4o", taskType: "reasoning", avgLatency: 1800, avgTokensPerSec: 25, successRate: 0.91, costPer1kTokens: 0.005, contextLength: 128000, qualityScore: 0.92, privacyLevel: "cloud" },
  { providerName: "openai", modelId: "gpt-4o", taskType: "creative", avgLatency: 1600, avgTokensPerSec: 28, successRate: 0.92, costPer1kTokens: 0.005, contextLength: 128000, qualityScore: 0.90, privacyLevel: "cloud" },
  { providerName: "openai", modelId: "gpt-4o-mini", taskType: "quick", avgLatency: 500, avgTokensPerSec: 80, successRate: 0.96, costPer1kTokens: 0.00015, contextLength: 128000, qualityScore: 0.78, privacyLevel: "cloud" },
  { providerName: "openai", modelId: "gpt-4o-mini", taskType: "chat", avgLatency: 600, avgTokensPerSec: 75, successRate: 0.95, costPer1kTokens: 0.00015, contextLength: 128000, qualityScore: 0.80, privacyLevel: "cloud" },

  // Anthropic
  { providerName: "anthropic", modelId: "claude-sonnet-4", taskType: "code", avgLatency: 1300, avgTokensPerSec: 35, successRate: 0.94, costPer1kTokens: 0.003, contextLength: 200000, qualityScore: 0.94, privacyLevel: "cloud" },
  { providerName: "anthropic", modelId: "claude-sonnet-4", taskType: "reasoning", avgLatency: 1600, avgTokensPerSec: 30, successRate: 0.92, costPer1kTokens: 0.003, contextLength: 200000, qualityScore: 0.93, privacyLevel: "cloud" },
  { providerName: "anthropic", modelId: "claude-sonnet-4", taskType: "analysis", avgLatency: 1400, avgTokensPerSec: 32, successRate: 0.93, costPer1kTokens: 0.003, contextLength: 200000, qualityScore: 0.93, privacyLevel: "cloud" },

  // DeepSeek
  { providerName: "deepseek", modelId: "deepseek-chat", taskType: "code", avgLatency: 900, avgTokensPerSec: 40, successRate: 0.91, costPer1kTokens: 0.00014, contextLength: 64000, qualityScore: 0.88, privacyLevel: "cloud" },
  { providerName: "deepseek", modelId: "deepseek-chat", taskType: "reasoning", avgLatency: 1200, avgTokensPerSec: 30, successRate: 0.88, costPer1kTokens: 0.00014, contextLength: 64000, qualityScore: 0.86, privacyLevel: "cloud" },
  { providerName: "deepseek", modelId: "deepseek-chat", taskType: "chat", avgLatency: 800, avgTokensPerSec: 45, successRate: 0.92, costPer1kTokens: 0.00014, contextLength: 64000, qualityScore: 0.84, privacyLevel: "cloud" },

  // Groq (ultra-fast)
  { providerName: "groq", modelId: "llama-3.3-70b", taskType: "quick", avgLatency: 150, avgTokensPerSec: 250, successRate: 0.95, costPer1kTokens: 0.00059, contextLength: 128000, qualityScore: 0.75, privacyLevel: "cloud" },
  { providerName: "groq", modelId: "llama-3.3-70b", taskType: "chat", avgLatency: 200, avgTokensPerSec: 200, successRate: 0.94, costPer1kTokens: 0.00059, contextLength: 128000, qualityScore: 0.73, privacyLevel: "cloud" },

  // Local
  { providerName: "local", modelId: "lmstudio", taskType: "chat", avgLatency: 2000, avgTokensPerSec: 15, successRate: 0.80, costPer1kTokens: 0, contextLength: 32000, qualityScore: 0.65, privacyLevel: "local" },
  { providerName: "local", modelId: "lmstudio", taskType: "code", avgLatency: 2500, avgTokensPerSec: 12, successRate: 0.75, costPer1kTokens: 0, contextLength: 32000, qualityScore: 0.60, privacyLevel: "local" },
  { providerName: "local", modelId: "lmstudio", taskType: "reasoning", avgLatency: 3000, avgTokensPerSec: 10, successRate: 0.70, costPer1kTokens: 0, contextLength: 32000, qualityScore: 0.55, privacyLevel: "local" },
  { providerName: "local", modelId: "lmstudio", taskType: "embedding", avgLatency: 500, avgTokensPerSec: 50, successRate: 0.90, costPer1kTokens: 0, contextLength: 32000, qualityScore: 0.60, privacyLevel: "local" },
];

// =============================================================================
// §5  SEED FUNCTION
// =============================================================================

export interface SeedSummary {
  agents: number;
  pipelines: number;
  providers: number;
  routes: number;
  templates: number;
}

/**
 * Seeds the entire preconfigured system into the database.
 * Uses upsert patterns to handle duplicate entries gracefully.
 * Safe to call multiple times — existing records are updated, not duplicated.
 */
export async function seedPreconfiguredSystem(): Promise<SeedSummary> {
  const summary: SeedSummary = {
    agents: 0,
    pipelines: 0,
    providers: 0,
    routes: 0,
    templates: 0,
  };

  // ── 1. Upsert Agents ──
  for (const def of AGENT_DEFINITIONS) {
    try {
      const enhancement = AGENT_ENHANCEMENTS[def.name];

      await db.agent.upsert({
        where: { name: def.name },
        update: {
          role: def.role,
          systemPrompt: def.systemPrompt,
          avatar: def.avatar,
          skills: JSON.stringify(def.skills),
          isActive: true,
        },
        create: {
          name: def.name,
          role: def.role,
          systemPrompt: def.systemPrompt,
          avatar: def.avatar,
          skills: JSON.stringify(def.skills),
          isActive: true,
        },
      });

      summary.agents++;
    } catch (err: unknown) {
      console.error(
        `[PreconfiguredSystem] Failed to upsert agent "${def.name}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // ── 2. Seed Pipeline Templates ──
  for (const template of PIPELINE_TEMPLATES) {
    try {
      // Check if a pipeline with this template ID already exists (by name match)
      const existing = await db.agentPipeline.findFirst({
        where: { name: template.name },
      });

      const stepsData = template.steps.map((step, index) => ({
        agentId: step.agentName,
        order: index,
        approvalRequired: step.approvalRequired,
        inputMapping: step.inputMapping,
        outputMapping: step.outputMapping,
        name: step.name,
        description: step.description,
        retryCount: step.retryCount,
        timeout: step.timeout,
      }));

      if (existing) {
        await db.agentPipeline.update({
          where: { id: existing.id },
          data: {
            description: template.description,
            steps: JSON.stringify(stepsData),
            parallelGroups: JSON.stringify(template.parallelGroups),
            status: "draft",
            currentStep: 0,
            results: existing.results || null,
          },
        });
      } else {
        await db.agentPipeline.create({
          data: {
            name: template.name,
            description: template.description,
            steps: JSON.stringify(stepsData),
            status: "draft",
            currentStep: 0,
            results: null,
            parallelGroups: JSON.stringify(template.parallelGroups),
          },
        });
      }

      summary.pipelines++;
    } catch (err: unknown) {
      console.error(
        `[PreconfiguredSystem] Failed to seed pipeline "${template.name}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // ── 3. Seed Provider Scores ──
  for (const score of DEFAULT_PROVIDER_SCORES) {
    try {
      await db.providerScore.upsert({
        where: {
          providerName_modelId_taskType: {
            providerName: score.providerName,
            modelId: score.modelId,
            taskType: score.taskType,
          },
        },
        update: {
          avgLatency: score.avgLatency,
          avgTokensPerSec: score.avgTokensPerSec,
          successRate: score.successRate,
          costPer1kTokens: score.costPer1kTokens,
          contextLength: score.contextLength,
          qualityScore: score.qualityScore,
          privacyLevel: score.privacyLevel,
          lastEvaluated: new Date(),
          sampleSize: 0,
        },
        create: {
          providerName: score.providerName,
          modelId: score.modelId,
          taskType: score.taskType,
          avgLatency: score.avgLatency,
          avgTokensPerSec: score.avgTokensPerSec,
          successRate: score.successRate,
          costPer1kTokens: score.costPer1kTokens,
          contextLength: score.contextLength,
          qualityScore: score.qualityScore,
          privacyLevel: score.privacyLevel,
          lastEvaluated: new Date(),
          sampleSize: 0,
        },
      });

      summary.providers++;
    } catch (err: unknown) {
      console.error(
        `[PreconfiguredSystem] Failed to seed provider score "${score.providerName}/${score.modelId}/${score.taskType}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // ── 4. Seed Model Routes ──
  const modelRouteSeeds: Array<{
    name: string;
    taskType: string;
    modelId: string;
    priority: number;
    fallbackIds: string[];
    costPerToken: number | null;
    avgLatency: number | null;
    successRate: number | null;
  }> = [
    {
      name: "Code Generation — Gemini Pro",
      taskType: "code",
      modelId: "gemini-2.5-pro",
      priority: 10,
      fallbackIds: ["gemini-2.5-flash", "deepseek-chat"],
      costPerToken: 0,
      avgLatency: 1200,
      successRate: 0.92,
    },
    {
      name: "Quick Response — Gemini Flash",
      taskType: "quick",
      modelId: "gemini-2.5-flash",
      priority: 10,
      fallbackIds: ["llama-3.3-70b"],
      costPerToken: 0,
      avgLatency: 400,
      successRate: 0.97,
    },
    {
      name: "General Chat — Gemini Flash",
      taskType: "chat",
      modelId: "gemini-2.5-flash",
      priority: 8,
      fallbackIds: ["gemini-2.5-pro", "gpt-4o-mini"],
      costPerToken: 0,
      avgLatency: 500,
      successRate: 0.96,
    },
    {
      name: "Deep Reasoning — Gemini Pro",
      taskType: "reasoning",
      modelId: "gemini-2.5-pro",
      priority: 10,
      fallbackIds: ["claude-sonnet-4", "gpt-4o"],
      costPerToken: 0,
      avgLatency: 2000,
      successRate: 0.90,
    },
    {
      name: "Creative Writing — Gemini Pro",
      taskType: "creative",
      modelId: "gemini-2.5-pro",
      priority: 9,
      fallbackIds: ["gemini-2.5-flash", "gpt-4o"],
      costPerToken: 0,
      avgLatency: 1400,
      successRate: 0.93,
    },
    {
      name: "Embedding — Gemini Flash",
      taskType: "embedding",
      modelId: "gemini-2.5-flash",
      priority: 10,
      fallbackIds: ["lmstudio"],
      costPerToken: 0,
      avgLatency: 200,
      successRate: 0.99,
    },
    {
      name: "Analysis — Gemini Pro",
      taskType: "analysis",
      modelId: "gemini-2.5-pro",
      priority: 10,
      fallbackIds: ["claude-sonnet-4", "gpt-4o"],
      costPerToken: 0,
      avgLatency: 1500,
      successRate: 0.91,
    },
  ];

  for (const route of modelRouteSeeds) {
    try {
      const existing = await db.modelRoute.findFirst({
        where: { name: route.name },
      });

      if (existing) {
        await db.modelRoute.update({
          where: { id: existing.id },
          data: {
            taskType: route.taskType,
            modelId: route.modelId,
            priority: route.priority,
            fallbackIds: JSON.stringify(route.fallbackIds),
            costPerToken: route.costPerToken,
            avgLatency: route.avgLatency,
            successRate: route.successRate,
            isEnabled: true,
          },
        });
      } else {
        await db.modelRoute.create({
          data: {
            name: route.name,
            taskType: route.taskType,
            modelId: route.modelId,
            priority: route.priority,
            fallbackIds: JSON.stringify(route.fallbackIds),
            costPerToken: route.costPerToken,
            avgLatency: route.avgLatency,
            successRate: route.successRate,
            isEnabled: true,
          },
        });
      }

      summary.routes++;
    } catch (err: unknown) {
      console.error(
        `[PreconfiguredSystem] Failed to seed model route "${route.name}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // ── 5. Seed Prompt Templates ──
  const promptTemplateSeeds: Array<{
    taskType: string;
    agentRole: string | null;
    template: string;
    score: number;
  }> = [
    {
      taskType: "code_gen",
      agentRole: "Senior Software Architect & Full-Stack Developer",
      template: `You are {{agent_name}}, {{agent_role}}.

TASK: {{task_description}}
LANGUAGE: {{language}}
FRAMEWORK: {{framework}}
CONSTRAINTS: {{constraints}}

Write production-grade code that follows best practices:
- Clean, self-documenting code with meaningful names
- Proper type safety and error handling
- Input validation and security considerations
- Comprehensive comments for complex logic

OUTPUT FORMAT:
- Complete, ready-to-run code with correct imports
- File structure description for large changes
- Brief explanation of key design decisions`,
      score: 0.82,
    },
    {
      taskType: "code_review",
      agentRole: "Code Review & Quality Assurance Specialist",
      template: `You are {{agent_name}}, {{agent_role}}.

Review the following code changes with meticulous attention to quality, security, and maintainability.

CODE TO REVIEW:
{{code}}

Review checklist:
1. Correctness: Does the code do what it's supposed to?
2. Security: Any vulnerabilities or unsafe patterns?
3. Performance: N+1 queries, unnecessary re-renders, memory leaks?
4. Maintainability: Clear naming, proper abstractions, DRY?
5. Testing: Are edge cases covered?

Categorize findings: Critical / High / Medium / Low
For each issue: Problem → Risk → Fix (with code example)
Final verdict: Approve / Approve with Comments / Request Changes`,
      score: 0.85,
    },
    {
      taskType: "bug_fix",
      agentRole: "Bug Hunter & Debugging Specialist",
      template: `You are {{agent_name}}, {{agent_role}}.

BUG REPORT:
{{bug_description}}

ERROR DETAILS:
{{error_output}}

ENVIRONMENT:
{{environment}}

Debugging methodology:
1. Reproduce: Create minimal reproduction steps
2. Hypothesize: Form 2-3 possible root causes
3. Test: Verify which hypothesis is correct
4. Fix: Implement the minimal, correct fix
5. Prevent: Add regression test

OUTPUT FORMAT:
- Bug Summary: actual vs expected behavior
- Root Cause: specific code/configuration responsible
- Fix: complete patch with before/after
- Regression Test: test that would have caught this`,
      score: 0.80,
    },
    {
      taskType: "architecture",
      agentRole: "Software Architect",
      template: `You are {{agent_name}}, {{agent_role}}.

PROJECT REQUIREMENTS:
{{requirements}}

CONSTRAINTS:
{{constraints}}

Design a system architecture that addresses:
1. Component decomposition and boundaries
2. Data flow and state management
3. API surface and contracts
4. Technology choices with rationale
5. Scalability and performance considerations
6. Security model

OUTPUT FORMAT:
- High-level architecture diagram (text-based)
- Component descriptions with responsibilities
- Data model and relationships
- API endpoint specifications
- Technology stack with justification
- Trade-offs and alternatives considered`,
      score: 0.83,
    },
    {
      taskType: "security_scan",
      agentRole: "Vulnerability Assessment & Penetration Testing Agent",
      template: `You are {{agent_name}}, {{agent_role}}.

TARGET:
{{target_description}}

SCOPE:
{{scope}}

Perform a comprehensive security assessment:
1. Reconnaissance: Identify attack surface
2. Vulnerability Scan: OWASP Top 10, dependency audit
3. Risk Assessment: Score by exploitability × impact
4. Proof of Concept: Demonstrate critical findings
5. Remediation: Specific fixes with code examples
6. Compliance: Map findings to SOC 2 / GDPR / HIPAA

OUTPUT FORMAT:
- Executive summary with risk heatmap
- Detailed findings with severity, CVSS score, PoC
- Remediation plan prioritized by risk
- Compliance gap analysis`,
      score: 0.87,
    },
    {
      taskType: "research",
      agentRole: "Research Assistant",
      template: `You are {{agent_name}}, {{agent_role}}.

RESEARCH QUERY:
{{query}}

DEPTH: {{depth}}

Research methodology:
1. Decompose query into sub-questions
2. Search for authoritative sources
3. Evaluate source credibility and recency
4. Extract key claims with citations
5. Cross-reference for consistency
6. Synthesize findings into coherent narrative

IMPORTANT:
- Every claim must be supported by a citation
- Flag any unsupported claims as potential hallucinations
- Indicate confidence level for each finding
- Present multiple perspectives where they exist

OUTPUT FORMAT:
- Executive summary
- Methodology description
- Findings organized by sub-question
- Citation list with credibility ratings
- Confidence assessment per finding`,
      score: 0.81,
    },
    {
      taskType: "incident_response",
      agentRole: "Production Incident Response & Troubleshooting Agent",
      template: `You are {{agent_name}}, {{agent_role}}.

INCIDENT DETAILS:
{{incident_description}}

ALERT DATA:
{{alert_data}}

Follow incident command protocol:
1. DETECT: Confirm and classify severity (SEV1-SEV5)
2. TRIAGE: Assess impact, assign commander, notify stakeholders
3. CONTAIN: Stabilize — rollback, circuit break, isolate
4. ROOT CAUSE: 5-Why analysis, log correlation
5. FIX: Implement and verify remediation
6. POST-MORTEM: Blameless timeline, action items

URGENCY: Respond immediately. Prioritize stabilization over investigation.

OUTPUT FORMAT:
- Incident summary (severity, impact, status)
- Timeline of events and actions
- Root cause analysis
- Fix implemented
- Post-mortem action items with owners`,
      score: 0.84,
    },
    {
      taskType: "documentation",
      agentRole: "Technical Documentation & Knowledge Base Specialist",
      template: `You are {{agent_name}}, {{agent_role}}.

DOCUMENTATION TARGET:
{{subject}}

AUDIENCE: {{audience}}
FORMAT: {{format}}

Write clear, accessible documentation:
- Start with a brief summary (progressive disclosure)
- Use proper heading hierarchy (H1 → H2 → H3)
- Include code examples with language specification
- Add warnings, tips, and notes using admonitions
- Anticipate common questions
- Define acronyms on first use

OUTPUT FORMAT:
- Title and summary
- Table of contents
- Structured sections with examples
- Related resources section`,
      score: 0.79,
    },
    {
      taskType: "deploy",
      agentRole: "Deployment Safety & Release Management Specialist",
      template: `You are {{agent_name}}, {{agent_role}}.

DEPLOYMENT REQUEST:
{{deployment_description}}

ENVIRONMENT: {{environment}}
STRATEGY: {{strategy}}

Create a deployment plan that ensures safety:
1. Pre-deployment checks: tests passed, security scan clean
2. Deployment strategy: canary / blue-green / rolling
3. Rollback criteria and procedures
4. Monitoring and validation steps
5. Communication plan

RULES:
- Every deployment must be reversible
- Deploy during business hours
- Separate deploy from release
- Monitor canary for at least 15 minutes

OUTPUT FORMAT:
- Deployment plan with steps and owners
- Rollback trigger criteria
- Validation checklist
- Risk assessment matrix`,
      score: 0.86,
    },
    {
      taskType: "data_pipeline",
      agentRole: "Database Architect",
      template: `You are {{agent_name}}, {{agent_role}}.

PIPELINE REQUIREMENTS:
{{pipeline_requirements}}

SOURCE: {{source_spec}}
TARGET: {{target_spec}}

Design the data pipeline:
1. Schema: Target table design with constraints
2. Extract: Source connectors and scheduling
3. Transform: Cleaning, enrichment, aggregation logic
4. Validate: Schema conformance, integrity checks
5. Load: Bulk insert, upsert, partition management
6. Monitor: Freshness, throughput, error tracking
7. Alert: Staleness, anomaly, failure notifications

OUTPUT FORMAT:
- Schema DDL
- ETL code with error handling
- Validation rules
- Monitoring dashboard spec
- Alert rules and runbooks`,
      score: 0.82,
    },
  ];

  for (const pt of promptTemplateSeeds) {
    try {
      // Check if a template with this taskType and agentRole already exists
      const existing = await db.promptTemplate.findFirst({
        where: {
          taskType: pt.taskType,
          ...(pt.agentRole ? { agentRole: pt.agentRole } : {}),
        },
      });

      if (existing) {
        await db.promptTemplate.update({
          where: { id: existing.id },
          data: {
            template: pt.template,
            score: pt.score,
            isActive: true,
          },
        });
      } else {
        await db.promptTemplate.create({
          data: {
            taskType: pt.taskType,
            agentRole: pt.agentRole,
            template: pt.template,
            version: 1,
            score: pt.score,
            usageCount: 0,
            successRate: 0,
            isActive: true,
          },
        });
      }

      summary.templates++;
    } catch (err: unknown) {
      console.error(
        `[PreconfiguredSystem] Failed to seed prompt template "${pt.taskType}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `[PreconfiguredSystem] Seed complete: ${summary.agents} agents, ${summary.pipelines} pipelines, ${summary.providers} providers, ${summary.routes} routes, ${summary.templates} templates`,
  );

  return summary;
}
