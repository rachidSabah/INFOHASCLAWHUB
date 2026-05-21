/**
 * AI Defence Engine
 *
 * A production-grade defence engine providing:
 * - Prompt injection detection (system prompt overrides, jailbreaks, role manipulation)
 * - PII detection: 14 types (email, SSN, phone, credit card, API key, password,
 *   IP, DOB, address, passport, license, medical record, bank account, crypto wallet)
 * - Unsafe content detection (harmful instructions, code injection, path traversal)
 * - Data exfiltration detection (sensitive data in outputs)
 * - Command injection detection (shell commands in inputs)
 * - Per-rule sensitivity levels: low, medium, high, paranoid
 * - Actions: block, redact, flag, hash
 * - False positive tracking and adaptive calibration
 * - Scan API requests, agent outputs, file uploads, user inputs
 */

import { db } from '@/lib/db';

// ── Type Definitions ──────────────────────────────────────────────────────────

export type DefenceEventType =
  | 'prompt_injection'
  | 'pii_detected'
  | 'unsafe_content'
  | 'data_exfiltration'
  | 'command_injection'
  | 'path_traversal';

export type DefenceSeverity = 'low' | 'medium' | 'high' | 'critical';

export type DefenceSource =
  | 'user_input'
  | 'api_request'
  | 'agent_output'
  | 'file_upload';

export type DefenceAction = 'block' | 'redact' | 'flag' | 'hash';

export type SensitivityLevel = 'low' | 'medium' | 'high' | 'critical' | 'paranoid';

export type RuleType =
  | 'prompt_injection'
  | 'pii'
  | 'safety'
  | 'command_injection'
  | 'path_traversal'
  | 'data_exfil';

export interface DefenceRuleInput {
  name: string;
  description: string;
  ruleType: RuleType;
  pattern: string;
  action: DefenceAction;
  sensitivity?: SensitivityLevel;
  isEnabled?: boolean;
}

export interface DefenceRuleUpdate {
  name?: string;
  description?: string;
  ruleType?: RuleType;
  pattern?: string;
  action?: DefenceAction;
  sensitivity?: SensitivityLevel;
  isEnabled?: boolean;
}

export interface EventFilter {
  eventType?: DefenceEventType;
  severity?: DefenceSeverity;
  source?: DefenceSource;
  isResolved?: boolean;
  agentId?: string;
  sessionId?: string;
  limit?: number;
  offset?: number;
}

export interface RuleFilter {
  ruleType?: RuleType;
  sensitivity?: SensitivityLevel;
  isEnabled?: boolean;
  limit?: number;
  offset?: number;
}

export interface ScanResult {
  isSafe: boolean;
  threats: ThreatMatch[];
  action: DefenceAction;
  redactedContent?: string;
  eventId?: string;
}

export interface ThreatMatch {
  type: DefenceEventType;
  ruleId: string;
  ruleName: string;
  severity: DefenceSeverity;
  matched: string;
  action: DefenceAction;
  confidence: number;
}

export interface PIIDetection {
  type: string;
  value: string;
  start: number;
  end: number;
  confidence: number;
}

export interface DefenceStats {
  totalEvents: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  falsePositiveRate: number;
  totalRules: number;
  activeRules: number;
  recentEvents: number;
}

// ── PII Detection Patterns ────────────────────────────────────────────────────

const PII_PATTERNS: Array<{
  type: string;
  label: string;
  pattern: RegExp;
  sensitivity: SensitivityLevel;
}> = [
  {
    type: 'email',
    label: 'Email Address',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    sensitivity: 'low',
  },
  {
    type: 'ssn',
    label: 'Social Security Number',
    pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    sensitivity: 'high',
  },
  {
    type: 'phone',
    label: 'Phone Number',
    pattern: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    sensitivity: 'low',
  },
  {
    type: 'credit_card',
    label: 'Credit Card Number',
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    sensitivity: 'high',
  },
  {
    type: 'api_key',
    label: 'API Key',
    pattern: /(?:sk|pk|ak|ghp|gho|ghs|ghc|glpat|xox[bpas])[-_][A-Za-z0-9]{20,}/g,
    sensitivity: 'critical',
  },
  {
    type: 'password',
    label: 'Password',
    pattern: /(?:password|passwd|pwd|secret|token|apikey|api_key)\s*[:=]\s*["']?[^\s"']{8,}/gi,
    sensitivity: 'high',
  },
  {
    type: 'ip_address',
    label: 'IP Address',
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    sensitivity: 'low',
  },
  {
    type: 'dob',
    label: 'Date of Birth',
    pattern: /\b(?:DOB|Date of Birth|Born)[:\s]*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/gi,
    sensitivity: 'medium',
  },
  {
    type: 'address',
    label: 'Street Address',
    pattern: /\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl)\.?\b/gi,
    sensitivity: 'medium',
  },
  {
    type: 'passport',
    label: 'Passport Number',
    pattern: /\b[A-Z]{1,2}\d{6,9}\b/g,
    sensitivity: 'high',
  },
  {
    type: 'license',
    label: "Driver's License",
    pattern: /\b[A-Z]{1,2}[-\s]?\d{4,8}\b/g,
    sensitivity: 'high',
  },
  {
    type: 'medical_record',
    label: 'Medical Record Number',
    pattern: /\bMRN[:\s]*\d{6,10}\b|\bMedical\s*Record[:\s]*\d{6,10}\b/gi,
    sensitivity: 'critical',
  },
  {
    type: 'bank_account',
    label: 'Bank Account Number',
    pattern: /\b\d{8,17}\b/g,
    sensitivity: 'high',
  },
  {
    type: 'crypto_wallet',
    label: 'Crypto Wallet Address',
    pattern: /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b|\b0x[a-fA-F0-9]{40}\b|\bbc1[q,p][a-z0-9]{39,59}\b/g,
    sensitivity: 'medium',
  },
];

// ── Prompt Injection Patterns ─────────────────────────────────────────────────

const PROMPT_INJECTION_PATTERNS: Array<{
  label: string;
  pattern: RegExp;
  severity: DefenceSeverity;
}> = [
  {
    label: 'System prompt override',
    pattern: /(?:ignore\s+(?:all\s+)?(?:previous|above|prior)\s+instructions?|disregard\s+(?:all\s+)?(?:previous|above|prior)\s+instructions?|forget\s+(?:all\s+)?(?:previous|above|prior)\s+instructions?)/i,
    severity: 'critical',
  },
  {
    label: 'System prompt extraction',
    pattern: /(?:what\s+(?:are|is)\s+(?:your|the)\s+(?:system|initial|original)\s+(?:prompt|instructions?)|reveal\s+(?:your|the)\s+(?:system|initial)\s+(?:prompt|instructions?)|show\s+(?:me\s+)?(?:your|the)\s+(?:system|initial)\s+(?:prompt|instructions?)|repeat\s+(?:your|the)\s+(?:system|initial)\s+(?:prompt|instructions?))/i,
    severity: 'high',
  },
  {
    label: 'Jailbreak attempt',
    pattern: /(?:you\s+are\s+now\s+(?:DAN|jailbroken|unlocked|free)|jailbreak|DAN\s+mode|developer\s+mode|admin\s+mode|root\s+mode|sudo\s+mode)/i,
    severity: 'critical',
  },
  {
    label: 'Role manipulation',
    pattern: /(?:pretend\s+(?:to\s+be|you\s+are)|act\s+as\s+(?:if\s+you\s+(?:are|were)|a|an)|roleplay\s+as|you're\s+now\s+(?:a|an)|you\s+are\s+(?:now\s+)?(?:a|an)\s+(?:evil|malicious|unethical|criminal|hacker))/i,
    severity: 'high',
  },
  {
    label: 'Instruction injection via delimiter',
    pattern: /(?:===\s*(?:NEW|SYSTEM|ADMIN|OVERRIDE)\s*(?:INSTRUCTIONS?|PROMPT|RULES?)\s*===|\[SYSTEM\]|\[ADMIN\]|\[OVERRIDE\])/i,
    severity: 'high',
  },
  {
    label: 'Output manipulation',
    pattern: /(?:output\s+(?:the|your)\s+(?:following|this)|print\s+(?:the|this|following)|respond\s+(?:only\s+)?with|say\s+(?:exactly|only)\s+(?:this|the\s+following))/i,
    severity: 'medium',
  },
  {
    label: 'Context boundary violation',
    pattern: /(?:above\s+all\s+(?:else|rules|instructions)|override\s+(?:any|all|safety|security)|bypass\s+(?:the|any|all|safety|security|filter|guard|restriction))/i,
    severity: 'critical',
  },
];

// ── Unsafe Content Patterns ───────────────────────────────────────────────────

const UNSAFE_CONTENT_PATTERNS: Array<{
  label: string;
  pattern: RegExp;
  severity: DefenceSeverity;
}> = [
  {
    label: 'Harmful instructions',
    pattern: /(?:how\s+to\s+(?:make|build|create|manufacture)\s+(?:a\s+)?(?:bomb|weapon|explosive|poison|drug|meth|cocaine)|instructions\s+for\s+(?:making|building|creating)\s+(?:explosive|weapon|bomb))/i,
    severity: 'critical',
  },
  {
    label: 'Code injection',
    pattern: /(?:<script[\s>]|javascript:|on(?:error|load|click|mouseover)\s*=|eval\s*\(|Function\s*\(|setTimeout\s*\(\s*["']|setInterval\s*\(\s*["'])/i,
    severity: 'high',
  },
  {
    label: 'SQL injection',
    pattern: /(?:UNION\s+(?:ALL\s+)?SELECT|DROP\s+TABLE|;\s*DELETE\s+FROM|;\s*UPDATE\s+\w+\s+SET|;\s*INSERT\s+INTO|OR\s+1\s*=\s*1|'\s*OR\s+'[^']*'\s*=\s*')/i,
    severity: 'high',
  },
  {
    label: 'Self-harm content',
    pattern: /(?:how\s+to\s+(?:commit\s+)?(?:suicide|kill\s+myself|harm\s+myself)|ways\s+to\s+(?:end\s+(?:it\s+all|my\s+life)|kill\s+myself))/i,
    severity: 'critical',
  },
  {
    label: 'Illegal activity instructions',
    pattern: /(?:how\s+to\s+(?:hack|steal|phish|fraud|launder|smuggle)|tutorial\s+(?:for|on)\s+(?:hacking|stealing|phishing|fraud))/i,
    severity: 'high',
  },
];

// ── Command Injection Patterns ────────────────────────────────────────────────

const COMMAND_INJECTION_PATTERNS: Array<{
  label: string;
  pattern: RegExp;
  severity: DefenceSeverity;
}> = [
  {
    label: 'Shell command execution',
    pattern: /(?:;\s*(?:rm|del|format|shutdown|reboot|kill|pkill|curl|wget|nc|ncat|bash|sh|python|perl|ruby|node|php)\b|`\s*(?:rm|del|curl|wget|bash|sh|python|perl)\b|\$\(\s*(?:rm|del|curl|wget|bash|sh)\b)/i,
    severity: 'critical',
  },
  {
    label: 'Command chaining',
    pattern: /(?:&&\s*(?:rm|del|format|shutdown|curl|wget|nc)\b|\|\s*(?:rm|del|format|shutdown|curl|wget)\b|\|\|\s*(?:rm|del|curl|wget)\b)/i,
    severity: 'critical',
  },
  {
    label: 'Privilege escalation',
    pattern: /(?:sudo\s+|su\s+|runas\s+|doas\s+)/i,
    severity: 'high',
  },
  {
    label: 'Reverse shell attempt',
    pattern: /(?:nc\s+-[elp]|ncat\s+-[elp]|bash\s+-i|python\s+-c\s+['"].*socket|perl\s+-e\s+['"].*socket|ruby\s+-e\s+['"].*socket)/i,
    severity: 'critical',
  },
];

// ── Path Traversal Patterns ───────────────────────────────────────────────────

const PATH_TRAVERSAL_PATTERNS: Array<{
  label: string;
  pattern: RegExp;
  severity: DefenceSeverity;
}> = [
  {
    label: 'Directory traversal',
    pattern: /(?:\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\/|\.\.%2f|%2e%2e\\)/i,
    severity: 'critical',
  },
  {
    label: 'Sensitive file access',
    pattern: /(?:\/etc\/(?:passwd|shadow|hosts|sudoers)|\/proc\/(?:self|version|cpuinfo)|\/var\/log\/|\\windows\\(?:system32|syswow64)|\\boot\.ini)/i,
    severity: 'critical',
  },
  {
    label: 'File URI scheme',
    pattern: /file:\/\/\/(?:etc|proc|var|tmp|root|home)/i,
    severity: 'high',
  },
  {
    label: 'Environment file access',
    pattern: /(?:\.env(?:\.\w+)?|\.htaccess|\.htpasswd|web\.config|\.git(?:\/|\w*))/i,
    severity: 'high',
  },
];

// ── Data Exfiltration Patterns ────────────────────────────────────────────────

const DATA_EXFIL_PATTERNS: Array<{
  label: string;
  pattern: RegExp;
  severity: DefenceSeverity;
}> = [
  {
    label: 'Sensitive data in output',
    pattern: /(?:api[_-]?key\s*[:=]\s*["']?[A-Za-z0-9]{20,}|secret[_-]?key\s*[:=]\s*["']?[A-Za-z0-9]{20,}|private[_-]?key\s*[:=]\s*["']?[A-Za-z0-9+/=]{40,})/i,
    severity: 'critical',
  },
  {
    label: 'Database connection string',
    pattern: /(?:mongodb(?:\+srv)?:\/\/|postgres(?:ql)?:\/\/|mysql:\/\/|redis:\/\/)[^\s'"]+/i,
    severity: 'critical',
  },
  {
    label: 'AWS credentials',
    pattern: /(?:AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|aws[_-]?secret[_-]?access[_-]?key\s*[:=])/i,
    severity: 'critical',
  },
  {
    label: 'Private key block',
    pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/i,
    severity: 'critical',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJsonSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function truncateContent(content: string, maxLength: number = 500): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + '... [truncated]';
}

function sensitivityToSeverity(sensitivity: SensitivityLevel): DefenceSeverity {
  switch (sensitivity) {
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
      return 'high';
    case 'critical':
      return 'critical';
    case 'paranoid':
      return 'critical';
  }
}

/**
 * Compute adaptive confidence based on a rule's false/true positive history.
 * Returns a value 0–1. If a rule has many false positives, confidence is lowered.
 */
function adaptiveConfidence(
  baseConfidence: number,
  falsePositives: number,
  truePositives: number
): number {
  const total = falsePositives + truePositives;
  if (total === 0) return baseConfidence;

  const fpRate = falsePositives / total;
  // Lower confidence proportionally to false positive rate
  const adjustment = 1 - fpRate * 0.5;
  return Math.max(0.1, Math.min(1, baseConfidence * adjustment));
}

/**
 * Determine the effective severity for a match given the rule's sensitivity level.
 * Higher sensitivity escalates severity.
 */
function effectiveSeverity(
  matchSeverity: DefenceSeverity,
  ruleSensitivity: SensitivityLevel
): DefenceSeverity {
  const severityOrder: DefenceSeverity[] = ['low', 'medium', 'high', 'critical'];
  const baseIdx = severityOrder.indexOf(matchSeverity);
  const sensIdx = severityOrder.indexOf(sensitivityToSeverity(ruleSensitivity));

  // If rule sensitivity is higher than match severity, escalate
  if (sensIdx > baseIdx) {
    // Escalate at most one level above the match severity
    return severityOrder[Math.min(baseIdx + 1, severityOrder.length - 1)];
  }

  return matchSeverity;
}

// ── Core Detection Functions ──────────────────────────────────────────────────

/**
 * Detect prompt injection attempts in content.
 * Returns matches with severity and confidence.
 */
export async function detectPromptInjection(
  content: string
): Promise<ThreatMatch[]> {
  const threats: ThreatMatch[] = [];

  try {
    // Load enabled prompt_injection rules from DB
    const rules = await db.defenceRule.findMany({
      where: { ruleType: 'prompt_injection', isEnabled: true },
    });

    // Check DB-based rules first
    for (const rule of rules) {
      try {
        const regex = new RegExp(rule.pattern, 'gi');
        if (regex.test(content)) {
          const confidence = adaptiveConfidence(
            0.85,
            rule.falsePositives,
            rule.truePositives
          );
          threats.push({
            type: 'prompt_injection',
            ruleId: rule.id,
            ruleName: rule.name,
            severity: effectiveSeverity(
              sensitivityToSeverity(rule.sensitivity as SensitivityLevel),
              rule.sensitivity as SensitivityLevel
            ),
            matched: truncateContent(content, 100),
            action: rule.action as DefenceAction,
            confidence,
          });
        }
      } catch {
        // Skip invalid regex patterns
      }
    }

    // Also check built-in patterns
    for (const pattern of PROMPT_INJECTION_PATTERNS) {
      if (pattern.pattern.test(content)) {
        // Avoid duplicates if a DB rule covers the same pattern
        const alreadyDetected = threats.some(
          (t) =>
            t.type === 'prompt_injection' &&
            t.ruleName === pattern.label
        );
        if (!alreadyDetected) {
          threats.push({
            type: 'prompt_injection',
            ruleId: 'builtin_prompt_injection',
            ruleName: pattern.label,
            severity: pattern.severity,
            matched: truncateContent(content, 100),
            action: 'block',
            confidence: 0.9,
          });
        }
      }
    }
  } catch (error: unknown) {
    console.error(
      '[AIDefence] detectPromptInjection failed:',
      error instanceof Error ? error.message : error
    );
  }

  return threats;
}

/**
 * Detect PII in content. Returns all PII matches with positions.
 */
export async function detectPII(content: string): Promise<ThreatMatch[]> {
  const threats: ThreatMatch[] = [];

  try {
    // Load enabled PII rules from DB
    const rules = await db.defenceRule.findMany({
      where: { ruleType: 'pii', isEnabled: true },
    });

    // Check DB-based PII rules
    for (const rule of rules) {
      try {
        const regex = new RegExp(rule.pattern, 'gi');
        if (regex.test(content)) {
          const confidence = adaptiveConfidence(
            0.85,
            rule.falsePositives,
            rule.truePositives
          );
          threats.push({
            type: 'pii_detected',
            ruleId: rule.id,
            ruleName: rule.name,
            severity: effectiveSeverity(
              sensitivityToSeverity(rule.sensitivity as SensitivityLevel),
              rule.sensitivity as SensitivityLevel
            ),
            matched: truncateContent(content, 100),
            action: rule.action as DefenceAction,
            confidence,
          });
        }
      } catch {
        // Skip invalid regex patterns
      }
    }

    // Also check built-in PII patterns
    for (const piiPattern of PII_PATTERNS) {
      const regex = new RegExp(piiPattern.pattern.source, piiPattern.pattern.flags);
      if (regex.test(content)) {
        const alreadyDetected = threats.some(
          (t) =>
            t.type === 'pii_detected' &&
            t.ruleName === piiPattern.label
        );
        if (!alreadyDetected) {
          threats.push({
            type: 'pii_detected',
            ruleId: `builtin_pii_${piiPattern.type}`,
            ruleName: piiPattern.label,
            severity: sensitivityToSeverity(piiPattern.sensitivity),
            matched: truncateContent(content, 100),
            action: piiPattern.sensitivity === 'high' || piiPattern.sensitivity === 'critical'
              ? 'redact'
              : 'flag',
            confidence: piiPattern.sensitivity === 'low' ? 0.6 : 0.85,
          });
        }
      }
    }
  } catch (error: unknown) {
    console.error(
      '[AIDefence] detectPII failed:',
      error instanceof Error ? error.message : error
    );
  }

  return threats;
}

/**
 * Detect unsafe content in text.
 */
export async function detectUnsafeContent(
  content: string
): Promise<ThreatMatch[]> {
  const threats: ThreatMatch[] = [];

  try {
    // Load enabled safety rules from DB
    const rules = await db.defenceRule.findMany({
      where: { ruleType: 'safety', isEnabled: true },
    });

    for (const rule of rules) {
      try {
        const regex = new RegExp(rule.pattern, 'gi');
        if (regex.test(content)) {
          const confidence = adaptiveConfidence(
            0.85,
            rule.falsePositives,
            rule.truePositives
          );
          threats.push({
            type: 'unsafe_content',
            ruleId: rule.id,
            ruleName: rule.name,
            severity: effectiveSeverity(
              sensitivityToSeverity(rule.sensitivity as SensitivityLevel),
              rule.sensitivity as SensitivityLevel
            ),
            matched: truncateContent(content, 100),
            action: rule.action as DefenceAction,
            confidence,
          });
        }
      } catch {
        // Skip invalid regex patterns
      }
    }

    // Check built-in patterns
    for (const pattern of UNSAFE_CONTENT_PATTERNS) {
      if (pattern.pattern.test(content)) {
        const alreadyDetected = threats.some(
          (t) => t.type === 'unsafe_content' && t.ruleName === pattern.label
        );
        if (!alreadyDetected) {
          threats.push({
            type: 'unsafe_content',
            ruleId: 'builtin_unsafe_content',
            ruleName: pattern.label,
            severity: pattern.severity,
            matched: truncateContent(content, 100),
            action: 'block',
            confidence: 0.9,
          });
        }
      }
    }
  } catch (error: unknown) {
    console.error(
      '[AIDefence] detectUnsafeContent failed:',
      error instanceof Error ? error.message : error
    );
  }

  return threats;
}

/**
 * Detect command injection attempts in content.
 */
export async function detectCommandInjection(
  content: string
): Promise<ThreatMatch[]> {
  const threats: ThreatMatch[] = [];

  try {
    // Load enabled command_injection rules from DB
    const rules = await db.defenceRule.findMany({
      where: { ruleType: 'command_injection', isEnabled: true },
    });

    for (const rule of rules) {
      try {
        const regex = new RegExp(rule.pattern, 'gi');
        if (regex.test(content)) {
          const confidence = adaptiveConfidence(
            0.85,
            rule.falsePositives,
            rule.truePositives
          );
          threats.push({
            type: 'command_injection',
            ruleId: rule.id,
            ruleName: rule.name,
            severity: effectiveSeverity(
              sensitivityToSeverity(rule.sensitivity as SensitivityLevel),
              rule.sensitivity as SensitivityLevel
            ),
            matched: truncateContent(content, 100),
            action: rule.action as DefenceAction,
            confidence,
          });
        }
      } catch {
        // Skip invalid regex patterns
      }
    }

    // Check built-in patterns
    for (const pattern of COMMAND_INJECTION_PATTERNS) {
      if (pattern.pattern.test(content)) {
        const alreadyDetected = threats.some(
          (t) =>
            t.type === 'command_injection' && t.ruleName === pattern.label
        );
        if (!alreadyDetected) {
          threats.push({
            type: 'command_injection',
            ruleId: 'builtin_command_injection',
            ruleName: pattern.label,
            severity: pattern.severity,
            matched: truncateContent(content, 100),
            action: 'block',
            confidence: 0.9,
          });
        }
      }
    }
  } catch (error: unknown) {
    console.error(
      '[AIDefence] detectCommandInjection failed:',
      error instanceof Error ? error.message : error
    );
  }

  return threats;
}

/**
 * Detect path traversal attempts in content.
 */
export async function detectPathTraversal(
  content: string
): Promise<ThreatMatch[]> {
  const threats: ThreatMatch[] = [];

  try {
    // Load enabled path_traversal rules from DB
    const rules = await db.defenceRule.findMany({
      where: { ruleType: 'path_traversal', isEnabled: true },
    });

    for (const rule of rules) {
      try {
        const regex = new RegExp(rule.pattern, 'gi');
        if (regex.test(content)) {
          const confidence = adaptiveConfidence(
            0.85,
            rule.falsePositives,
            rule.truePositives
          );
          threats.push({
            type: 'path_traversal',
            ruleId: rule.id,
            ruleName: rule.name,
            severity: effectiveSeverity(
              sensitivityToSeverity(rule.sensitivity as SensitivityLevel),
              rule.sensitivity as SensitivityLevel
            ),
            matched: truncateContent(content, 100),
            action: rule.action as DefenceAction,
            confidence,
          });
        }
      } catch {
        // Skip invalid regex patterns
      }
    }

    // Check built-in patterns
    for (const pattern of PATH_TRAVERSAL_PATTERNS) {
      if (pattern.pattern.test(content)) {
        const alreadyDetected = threats.some(
          (t) =>
            t.type === 'path_traversal' && t.ruleName === pattern.label
        );
        if (!alreadyDetected) {
          threats.push({
            type: 'path_traversal',
            ruleId: 'builtin_path_traversal',
            ruleName: pattern.label,
            severity: pattern.severity,
            matched: truncateContent(content, 100),
            action: 'block',
            confidence: 0.9,
          });
        }
      }
    }
  } catch (error: unknown) {
    console.error(
      '[AIDefence] detectPathTraversal failed:',
      error instanceof Error ? error.message : error
    );
  }

  return threats;
}

// ── Redaction ─────────────────────────────────────────────────────────────────

/**
 * Redact detected PII from content.
 * Replaces PII matches with `[REDACTED_{type}]`.
 */
export async function redactContent(
  content: string,
  piiTypes?: string[]
): Promise<string> {
  let redacted = content;

  try {
    const patternsToCheck = piiTypes
      ? PII_PATTERNS.filter((p) => piiTypes.includes(p.type))
      : PII_PATTERNS;

    for (const piiPattern of patternsToCheck) {
      const regex = new RegExp(piiPattern.pattern.source, piiPattern.pattern.flags);
      redacted = redacted.replace(regex, `[REDACTED_${piiPattern.type.toUpperCase()}]`);
    }

    // Also apply DB-based PII rules
    const rules = await db.defenceRule.findMany({
      where: {
        ruleType: 'pii',
        action: 'redact',
        isEnabled: true,
      },
    });

    for (const rule of rules) {
      try {
        const regex = new RegExp(rule.pattern, 'gi');
        redacted = redacted.replace(regex, `[REDACTED_BY_RULE_${rule.name.replace(/\s+/g, '_')}]`);
      } catch {
        // Skip invalid regex
      }
    }
  } catch (error: unknown) {
    console.error(
      '[AIDefence] redactContent failed:',
      error instanceof Error ? error.message : error
    );
  }

  return redacted;
}

// ── Scan Functions ────────────────────────────────────────────────────────────

/**
 * Scan any input for threats.
 * Runs all detection engines and determines the appropriate action.
 */
export async function scanInput(
  content: string,
  source: DefenceSource,
  agentId?: string,
  sessionId?: string
): Promise<ScanResult> {
  const allThreats: ThreatMatch[] = [];

  try {
    // Run all detection engines in parallel
    const [
      promptInjectionThreats,
      piiThreats,
      unsafeThreats,
      commandThreats,
      pathThreats,
    ] = await Promise.all([
      detectPromptInjection(content),
      detectPII(content),
      detectUnsafeContent(content),
      detectCommandInjection(content),
      detectPathTraversal(content),
    ]);

    allThreats.push(
      ...promptInjectionThreats,
      ...piiThreats,
      ...unsafeThreats,
      ...commandThreats,
      ...pathThreats
    );

    // Determine the strongest action needed
    const actionPriority: DefenceAction[] = ['flag', 'hash', 'redact', 'block'];
    let strongestAction: DefenceAction = 'flag';
    let hasCritical = false;
    let hasHigh = false;

    for (const threat of allThreats) {
      const actionIdx = actionPriority.indexOf(threat.action);
      const currentIdx = actionPriority.indexOf(strongestAction);
      if (actionIdx > currentIdx) {
        strongestAction = threat.action;
      }
      if (threat.severity === 'critical') hasCritical = true;
      if (threat.severity === 'high') hasHigh = true;
    }

    // Override: if any critical threat, always block
    if (hasCritical) {
      strongestAction = 'block';
    }

    const isSafe = allThreats.length === 0;

    // Record the event
    let eventId: string | undefined;
    if (allThreats.length > 0) {
      try {
        const worstSeverity: DefenceSeverity = hasCritical
          ? 'critical'
          : hasHigh
            ? 'high'
            : 'medium';

        const event = await db.aIDefenceEvent.create({
          data: {
            eventType: allThreats[0].type,
            severity: worstSeverity,
            source,
            input: truncateContent(content),
            action: strongestAction === 'block'
              ? 'blocked'
              : strongestAction === 'redact'
                ? 'redacted'
                : strongestAction === 'hash'
                  ? 'flagged'
                  : 'flagged',
            ruleId: allThreats.map((t) => t.ruleId).join(','),
            details: JSON.stringify({
              threats: allThreats.map((t) => ({
                type: t.type,
                ruleName: t.ruleName,
                severity: t.severity,
                confidence: t.confidence,
              })),
              totalThreats: allThreats.length,
            }),
            agentId: agentId ?? null,
            sessionId: sessionId ?? null,
            isResolved: false,
          },
        });
        eventId = event.id;

        // Update true positive counts for triggered rules
        for (const threat of allThreats) {
          if (threat.ruleId && !threat.ruleId.startsWith('builtin_')) {
            try {
              await db.defenceRule.update({
                where: { id: threat.ruleId },
                data: { truePositives: { increment: 1 } },
              });
            } catch {
              // Rule may have been deleted
            }
          }
        }
      } catch (error: unknown) {
        console.error(
          '[AIDefence] Failed to record event:',
          error instanceof Error ? error.message : error
        );
      }
    }

    // Apply redaction if needed
    let redactedContent: string | undefined;
    if (strongestAction === 'redact') {
      const piiTypes = allThreats
        .filter((t) => t.type === 'pii_detected')
        .map((t) => {
          const match = t.ruleId.match(/builtin_pii_(\w+)/);
          return match ? match[1] : undefined;
        })
        .filter(Boolean) as string[];

      redactedContent = await redactContent(content, piiTypes.length > 0 ? piiTypes : undefined);
    }

    // Apply hashing if needed
    if (strongestAction === 'hash') {
      // Simple hash: replace the sensitive portion with a hash representation
      redactedContent = `[HASHED:${content.length}chars]`;
    }

    return {
      isSafe,
      threats: allThreats,
      action: strongestAction,
      redactedContent,
      eventId,
    };
  } catch (error: unknown) {
    console.error(
      '[AIDefence] scanInput failed:',
      error instanceof Error ? error.message : error
    );
    // Fail open — don't block on engine errors
    return {
      isSafe: true,
      threats: [],
      action: 'flag',
    };
  }
}

/**
 * Scan agent output for data exfiltration.
 * Detects sensitive data that should not leave the system.
 */
export async function scanOutput(
  content: string,
  agentId?: string,
  sessionId?: string
): Promise<ScanResult> {
  const threats: ThreatMatch[] = [];

  try {
    // Load enabled data_exfil rules from DB
    const rules = await db.defenceRule.findMany({
      where: { ruleType: 'data_exfil', isEnabled: true },
    });

    for (const rule of rules) {
      try {
        const regex = new RegExp(rule.pattern, 'gi');
        if (regex.test(content)) {
          const confidence = adaptiveConfidence(
            0.85,
            rule.falsePositives,
            rule.truePositives
          );
          threats.push({
            type: 'data_exfiltration',
            ruleId: rule.id,
            ruleName: rule.name,
            severity: effectiveSeverity(
              sensitivityToSeverity(rule.sensitivity as SensitivityLevel),
              rule.sensitivity as SensitivityLevel
            ),
            matched: truncateContent(content, 100),
            action: rule.action as DefenceAction,
            confidence,
          });
        }
      } catch {
        // Skip invalid regex
      }
    }

    // Check built-in exfiltration patterns
    for (const pattern of DATA_EXFIL_PATTERNS) {
      if (pattern.pattern.test(content)) {
        const alreadyDetected = threats.some(
          (t) => t.type === 'data_exfiltration' && t.ruleName === pattern.label
        );
        if (!alreadyDetected) {
          threats.push({
            type: 'data_exfiltration',
            ruleId: 'builtin_data_exfil',
            ruleName: pattern.label,
            severity: pattern.severity,
            matched: truncateContent(content, 100),
            action: 'redact',
            confidence: 0.9,
          });
        }
      }
    }

    // Also check for PII in output
    const piiThreats = await detectPII(content);
    const piiAsExfil: ThreatMatch[] = piiThreats.map((t) => ({
      ...t,
      type: 'data_exfiltration' as DefenceEventType,
      action: 'redact' as DefenceAction,
    }));
    threats.push(...piiAsExfil);

    // Determine action
    const hasCritical = threats.some((t) => t.severity === 'critical');
    const strongestAction: DefenceAction = hasCritical ? 'block' : 'redact';
    const isSafe = threats.length === 0;

    // Record the event
    let eventId: string | undefined;
    if (threats.length > 0) {
      try {
        const worstSeverity: DefenceSeverity = hasCritical ? 'critical' : 'high';
        const event = await db.aIDefenceEvent.create({
          data: {
            eventType: 'data_exfiltration',
            severity: worstSeverity,
            source: 'agent_output',
            input: truncateContent(content),
            action: strongestAction === 'block' ? 'blocked' : 'redacted',
            ruleId: threats.map((t) => t.ruleId).join(','),
            details: JSON.stringify({
              threats: threats.map((t) => ({
                type: t.type,
                ruleName: t.ruleName,
                severity: t.severity,
                confidence: t.confidence,
              })),
              totalThreats: threats.length,
            }),
            agentId: agentId ?? null,
            sessionId: sessionId ?? null,
            isResolved: false,
          },
        });
        eventId = event.id;

        // Update true positive counts
        for (const threat of threats) {
          if (threat.ruleId && !threat.ruleId.startsWith('builtin_')) {
            try {
              await db.defenceRule.update({
                where: { id: threat.ruleId },
                data: { truePositives: { increment: 1 } },
              });
            } catch {
              // Rule may have been deleted
            }
          }
        }
      } catch (error: unknown) {
        console.error(
          '[AIDefence] Failed to record output event:',
          error instanceof Error ? error.message : error
        );
      }
    }

    // Apply redaction if needed
    let redactedContent: string | undefined;
    if (strongestAction === 'redact' && threats.length > 0) {
      redactedContent = await redactContent(content);
    }

    return {
      isSafe,
      threats,
      action: strongestAction,
      redactedContent,
      eventId,
    };
  } catch (error: unknown) {
    console.error(
      '[AIDefence] scanOutput failed:',
      error instanceof Error ? error.message : error
    );
    return {
      isSafe: true,
      threats: [],
      action: 'flag',
    };
  }
}

// ── Rule Management ───────────────────────────────────────────────────────────

/**
 * Add a new defence rule.
 */
export async function addRule(rule: DefenceRuleInput) {
  try {
    // Validate the pattern is a valid regex
    try {
      new RegExp(rule.pattern);
    } catch {
      throw new Error(`Invalid regex pattern: ${rule.pattern}`);
    }

    const created = await db.defenceRule.create({
      data: {
        name: rule.name,
        description: rule.description,
        ruleType: rule.ruleType,
        pattern: rule.pattern,
        action: rule.action,
        sensitivity: rule.sensitivity ?? 'medium',
        isEnabled: rule.isEnabled ?? true,
        falsePositives: 0,
        truePositives: 0,
      },
    });

    return created;
  } catch (error: unknown) {
    console.error(
      '[AIDefence] addRule failed:',
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

/**
 * Update an existing defence rule.
 */
export async function updateRule(ruleId: string, updates: DefenceRuleUpdate) {
  try {
    // Validate pattern if provided
    if (updates.pattern) {
      try {
        new RegExp(updates.pattern);
      } catch {
        throw new Error(`Invalid regex pattern: ${updates.pattern}`);
      }
    }

    const updated = await db.defenceRule.update({
      where: { id: ruleId },
      data: updates,
    });

    return updated;
  } catch (error: unknown) {
    console.error(
      '[AIDefence] updateRule failed:',
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

/**
 * Delete a defence rule.
 */
export async function deleteRule(ruleId: string): Promise<void> {
  try {
    await db.defenceRule.delete({
      where: { id: ruleId },
    });
  } catch (error: unknown) {
    console.error(
      '[AIDefence] deleteRule failed:',
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

/**
 * List defence rules with optional filter.
 */
export async function listRules(filter?: RuleFilter) {
  try {
    const where: Record<string, unknown> = {};
    if (filter?.ruleType) where.ruleType = filter.ruleType;
    if (filter?.sensitivity) where.sensitivity = filter.sensitivity;
    if (filter?.isEnabled !== undefined) where.isEnabled = filter.isEnabled;

    const rules = await db.defenceRule.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filter?.limit ?? 100,
      skip: filter?.offset ?? 0,
    });

    return rules;
  } catch (error: unknown) {
    console.error(
      '[AIDefence] listRules failed:',
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

// ── Event Management ──────────────────────────────────────────────────────────

/**
 * Get defence events with optional filter.
 */
export async function getEvents(filter?: EventFilter) {
  try {
    const where: Record<string, unknown> = {};
    if (filter?.eventType) where.eventType = filter.eventType;
    if (filter?.severity) where.severity = filter.severity;
    if (filter?.source) where.source = filter.source;
    if (filter?.isResolved !== undefined) where.isResolved = filter.isResolved;
    if (filter?.agentId) where.agentId = filter.agentId;
    if (filter?.sessionId) where.sessionId = filter.sessionId;

    const events = await db.aIDefenceEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filter?.limit ?? 100,
      skip: filter?.offset ?? 0,
    });

    return events;
  } catch (error: unknown) {
    console.error(
      '[AIDefence] getEvents failed:',
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

/**
 * Mark a defence event as resolved.
 */
export async function resolveEvent(
  eventId: string,
  isFalsePositive?: boolean
) {
  try {
    const event = await db.aIDefenceEvent.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    // If flagged as false positive, update the rule's FP counter
    if (isFalsePositive && event.ruleId) {
      const ruleIds = event.ruleId.split(',').filter(Boolean);
      for (const ruleId of ruleIds) {
        if (!ruleId.startsWith('builtin_')) {
          try {
            await db.defenceRule.update({
              where: { id: ruleId },
              data: { falsePositives: { increment: 1 } },
            });
          } catch {
            // Rule may have been deleted
          }
        }
      }
    }

    const resolved = await db.aIDefenceEvent.update({
      where: { id: eventId },
      data: { isResolved: true },
    });

    return resolved;
  } catch (error: unknown) {
    console.error(
      '[AIDefence] resolveEvent failed:',
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

/**
 * Get comprehensive defence statistics.
 */
export async function getDefenceStats(): Promise<DefenceStats> {
  try {
    const [
      totalEvents,
      eventsByType,
      eventsBySeverity,
      totalRules,
      activeRules,
      recentEvents,
      allRules,
    ] = await Promise.all([
      db.aIDefenceEvent.count(),
      db.aIDefenceEvent.groupBy({ by: ['eventType'], _count: true }),
      db.aIDefenceEvent.groupBy({ by: ['severity'], _count: true }),
      db.defenceRule.count(),
      db.defenceRule.count({ where: { isEnabled: true } }),
      db.aIDefenceEvent.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
      db.defenceRule.findMany({
        select: { falsePositives: true, truePositives: true },
      }),
    ]);

    const byType: Record<string, number> = {};
    for (const entry of eventsByType) {
      byType[entry.eventType] = entry._count;
    }

    const bySeverity: Record<string, number> = {};
    for (const entry of eventsBySeverity) {
      bySeverity[entry.severity] = entry._count;
    }

    // Calculate global false positive rate
    let totalFP = 0;
    let totalTP = 0;
    for (const rule of allRules) {
      totalFP += rule.falsePositives;
      totalTP += rule.truePositives;
    }
    const totalClassifications = totalFP + totalTP;
    const falsePositiveRate =
      totalClassifications > 0 ? totalFP / totalClassifications : 0;

    return {
      totalEvents,
      byType,
      bySeverity,
      falsePositiveRate,
      totalRules,
      activeRules,
      recentEvents,
    };
  } catch (error: unknown) {
    console.error(
      '[AIDefence] getDefenceStats failed:',
      error instanceof Error ? error.message : error
    );
    return {
      totalEvents: 0,
      byType: {},
      bySeverity: {},
      falsePositiveRate: 0,
      totalRules: 0,
      activeRules: 0,
      recentEvents: 0,
    };
  }
}

// ── Default Rules Seeding ─────────────────────────────────────────────────────

const DEFAULT_RULES: DefenceRuleInput[] = [
  // Prompt injection rules
  {
    name: 'System Prompt Override Detection',
    description:
      'Detects attempts to override or ignore system instructions',
    ruleType: 'prompt_injection',
    pattern:
      '(?:ignore\\s+(?:all\\s+)?(?:previous|above|prior)\\s+instructions?|disregard\\s+(?:all\\s+)?(?:previous|above|prior)\\s+instructions?)',
    action: 'block',
    sensitivity: 'high',
  },
  {
    name: 'Jailbreak Attempt Detection',
    description:
      'Detects known jailbreak patterns like DAN mode, developer mode',
    ruleType: 'prompt_injection',
    pattern:
      '(?:jailbreak|DAN\\s+mode|developer\\s+mode|admin\\s+mode|sudo\\s+mode)',
    action: 'block',
    sensitivity: 'paranoid',
  },
  {
    name: 'Role Manipulation Detection',
    description:
      'Detects attempts to change the AI role or persona for malicious purposes',
    ruleType: 'prompt_injection',
    pattern:
      '(?:pretend\\s+to\\s+be|act\\s+as\\s+(?:if|a|an)|roleplay\\s+as)',
    action: 'flag',
    sensitivity: 'medium',
  },
  {
    name: 'Context Boundary Violation',
    description:
      'Detects attempts to override safety boundaries and filters',
    ruleType: 'prompt_injection',
    pattern:
      '(?:above\\s+all\\s+(?:else|rules|instructions)|override\\s+(?:any|all|safety|security)|bypass\\s+(?:the|any|all|safety|security|filter))',
    action: 'block',
    sensitivity: 'high',
  },

  // PII rules
  {
    name: 'Email Address PII Detection',
    description: 'Detects email addresses in content',
    ruleType: 'pii',
    pattern: '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b',
    action: 'redact',
    sensitivity: 'low',
  },
  {
    name: 'SSN PII Detection',
    description: 'Detects US Social Security Numbers',
    ruleType: 'pii',
    pattern: '\\b\\d{3}[-\\s]?\\d{2}[-\\s]?\\d{4}\\b',
    action: 'block',
    sensitivity: 'paranoid',
  },
  {
    name: 'Credit Card PII Detection',
    description: 'Detects credit card numbers',
    ruleType: 'pii',
    pattern: '\\b(?:\\d{4}[-\\s]?){3}\\d{4}\\b',
    action: 'block',
    sensitivity: 'high',
  },
  {
    name: 'API Key PII Detection',
    description: 'Detects API keys and tokens in content',
    ruleType: 'pii',
    pattern:
      '(?:sk|pk|ak|ghp|gho|ghs|ghc|glpat|xox[bpas])[-_][A-Za-z0-9]{20,}',
    action: 'hash',
    sensitivity: 'critical',
  },

  // Safety rules
  {
    name: 'XSS/Code Injection Detection',
    description: 'Detects cross-site scripting and code injection attempts',
    ruleType: 'safety',
    pattern:
      '(?:<script[\\s>]|javascript:|on(?:error|load|click)\\s*=|eval\\s*\\()',
    action: 'block',
    sensitivity: 'high',
  },
  {
    name: 'SQL Injection Detection',
    description:
      'Detects SQL injection patterns in user input',
    ruleType: 'safety',
    pattern:
      "(?:UNION\\s+(?:ALL\\s+)?SELECT|DROP\\s+TABLE|;\\s*DELETE\\s+FROM|OR\\s+1\\s*=\\s*1|'\\s*OR\\s+'[^']*'\\s*=\\s*')",
    action: 'block',
    sensitivity: 'high',
  },
  {
    name: 'Harmful Instructions Detection',
    description:
      'Detects requests for instructions on creating harmful items',
    ruleType: 'safety',
    pattern:
      '(?:how\\s+to\\s+(?:make|build|create)\\s+(?:a\\s+)?(?:bomb|weapon|explosive|poison))',
    action: 'block',
    sensitivity: 'paranoid',
  },

  // Command injection rules
  {
    name: 'Shell Command Injection Detection',
    description:
      'Detects shell command injection attempts in user input',
    ruleType: 'command_injection',
    pattern:
      '(?:;\\s*(?:rm|del|format|shutdown|curl|wget|nc|bash|sh|python)\\b|`\\s*(?:rm|curl|wget|bash|sh)\\b|\\$\\(\\s*(?:rm|curl|wget|bash|sh)\\b)',
    action: 'block',
    sensitivity: 'high',
  },
  {
    name: 'Reverse Shell Detection',
    description: 'Detects reverse shell connection attempts',
    ruleType: 'command_injection',
    pattern:
      '(?:nc\\s+-[elp]|ncat\\s+-[elp]|bash\\s+-i|python\\s+-c\\s+[\'"].*socket)',
    action: 'block',
    sensitivity: 'paranoid',
  },

  // Path traversal rules
  {
    name: 'Directory Traversal Detection',
    description:
      'Detects directory traversal attempts (../ etc.)',
    ruleType: 'path_traversal',
    pattern: '(?:\\.\\.\\/|\\.\\.\\\\|%2e%2e%2f|%2e%2e\\/|\\.\\.%2f)',
    action: 'block',
    sensitivity: 'high',
  },
  {
    name: 'Sensitive File Access Detection',
    description:
      'Detects attempts to access sensitive system files',
    ruleType: 'path_traversal',
    pattern:
      '(?:\\/etc\\/(?:passwd|shadow|hosts|sudoers)|\\/proc\\/(?:self|version)|\\\\windows\\\\system32)',
    action: 'block',
    sensitivity: 'paranoid',
  },

  // Data exfiltration rules
  {
    name: 'Credential Exfiltration Detection',
    description:
      'Detects API keys, secrets, or credentials in output',
    ruleType: 'data_exfil',
    pattern:
      '(?:api[_-]?key\\s*[:=]\\s*["\']?[A-Za-z0-9]{20,}|secret[_-]?key\\s*[:=]\\s*["\']?[A-Za-z0-9]{20,})',
    action: 'redact',
    sensitivity: 'high',
  },
  {
    name: 'Private Key Exfiltration Detection',
    description:
      'Detects private key blocks in output',
    ruleType: 'data_exfil',
    pattern: '-----BEGIN\\s+(?:RSA\\s+)?PRIVATE\\s+KEY-----',
    action: 'block',
    sensitivity: 'paranoid',
  },
  {
    name: 'AWS Credential Exfiltration Detection',
    description:
      'Detects AWS access keys and secrets in output',
    ruleType: 'data_exfil',
    pattern: '(?:AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16})',
    action: 'block',
    sensitivity: 'paranoid',
  },
  {
    name: 'Database Connection String Exfiltration',
    description:
      'Detects database connection URIs in output',
    ruleType: 'data_exfil',
    pattern:
      '(?:mongodb(?:\\+srv)?:\\/\\/|postgres(?:ql)?:\\/\\/|mysql:\\/\\/|redis:\\/\\/)[^\\s\'"]+',
    action: 'redact',
    sensitivity: 'high',
  },
];

/**
 * Seed default defence rules into the database.
 * Only creates rules that don't already exist (by unique name).
 */
export async function seedDefaultRules(): Promise<{
  created: number;
  skipped: number;
  total: number;
}> {
  let created = 0;
  let skipped = 0;

  try {
    for (const rule of DEFAULT_RULES) {
      try {
        const existing = await db.defenceRule.findUnique({
          where: { name: rule.name },
        });

        if (existing) {
          skipped++;
          continue;
        }

        await db.defenceRule.create({
          data: {
            name: rule.name,
            description: rule.description,
            ruleType: rule.ruleType,
            pattern: rule.pattern,
            action: rule.action,
            sensitivity: rule.sensitivity ?? 'medium',
            isEnabled: rule.isEnabled ?? true,
            falsePositives: 0,
            truePositives: 0,
          },
        });

        created++;
      } catch (error: unknown) {
        console.error(
          `[AIDefence] Failed to seed rule "${rule.name}":`,
          error instanceof Error ? error.message : error
        );
        skipped++;
      }
    }
  } catch (error: unknown) {
    console.error(
      '[AIDefence] seedDefaultRules failed:',
      error instanceof Error ? error.message : error
    );
  }

  return {
    created,
    skipped,
    total: DEFAULT_RULES.length,
  };
}
