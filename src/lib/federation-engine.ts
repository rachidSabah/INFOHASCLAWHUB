import { db } from './db';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrustLevel = 'untrusted' | 'limited' | 'trusted' | 'full';
export type PeerStatus = 'disconnected' | 'connecting' | 'connected' | 'suspended' | 'evicted';
export type PIIPolicy = 'block' | 'redact' | 'hash' | 'pass';
export type ComplianceMode = 'none' | 'hipaa' | 'soc2' | 'gdpr';
export type MessageType = 'task_request' | 'task_result' | 'discovery' | 'heartbeat' | 'consensus';
export type Direction = 'inbound' | 'outbound';

export interface PeerInfo {
  id: string;
  name: string;
  endpoint: string;
  publicKey: string | null;
  trustLevel: TrustLevel;
  trustScore: number;
  status: PeerStatus;
  mtlsCert: string | null;
  lastHandshake: Date | null;
  successCount: number;
  errorCount: number;
  uptimeScore: number;
  threatScore: number;
  integrityScore: number;
  piiPolicy: PIIPolicy;
  complianceMode: ComplianceMode;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface FederationMessageInfo {
  id: string;
  peerId: string;
  direction: Direction;
  messageType: MessageType;
  payload: Record<string, unknown>;
  piiScanned: boolean;
  piiDetected: string[];
  signed: boolean;
  signature: string | null;
  createdAt: Date;
}

export interface TrustEvent {
  type: 'success' | 'error' | 'handshake' | 'heartbeat' | 'violation' | 'integrity_check' | 'compliance_breach';
  delta?: number;
  details?: string;
}

export type PIICategory =
  | 'email'
  | 'ssn'
  | 'phone'
  | 'credit_card'
  | 'ip_address'
  | 'date_of_birth'
  | 'passport'
  | 'drivers_license'
  | 'bank_account'
  | 'medical_record'
  | 'social_media'
  | 'address'
  | 'zip_code'
  | 'full_name';

export interface PIIResult {
  category: PIICategory;
  matches: string[];
}

// ---------------------------------------------------------------------------
// PII Detection Patterns
// ---------------------------------------------------------------------------

const PII_PATTERNS: Record<PIICategory, RegExp> = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
  ssn: /\b(?!000|666|9\d{2})\d{3}[-\s]?(?!00)\d{2}[-\s]?(?!0000)\d{4}\b/g,
  phone: /\b(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
  credit_card: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
  ip_address: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
  date_of_birth: /\b(?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12][0-9]|3[01])[-/](?:19|20)\d{2}\b/g,
  passport: /\b[A-Z]{1,2}[0-9]{6,9}\b/g,
  drivers_license: /\b[A-Z]{1,2}[-\s]?[0-9]{3,8}\b/gi,
  bank_account: /\b\d{8,17}\b/g,
  medical_record: /\bMRN[-\s]?\d{4,12}\b/gi,
  social_media: /@[\w]{3,30}\b/g,
  address: /\b\d+\s+[A-Za-z0-9\s]+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Road|Rd|Court|Ct|Way|Place|Pl)\b/gi,
  zip_code: /\b\d{5}(?:[-\s]\d{4})?\b/g,
  full_name: /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g,
};

// Compliance-specific PII policies (stricter for HIPAA/GDPR)
const COMPLIANCE_PII_POLICY: Record<ComplianceMode, PIICategory[]> = {
  none: [],
  hipaa: ['email', 'phone', 'ssn', 'date_of_birth', 'medical_record', 'full_name', 'address', 'zip_code', 'social_media', 'ip_address'],
  soc2: ['email', 'ssn', 'credit_card', 'ip_address', 'bank_account', 'passport'],
  gdpr: ['email', 'phone', 'ip_address', 'full_name', 'address', 'date_of_birth', 'social_media', 'passport', 'drivers_license', 'zip_code'],
};

// Trust level thresholds
const TRUST_THRESHOLDS: Record<TrustLevel, { min: number; max: number }> = {
  untrusted: { min: 0, max: 0.25 },
  limited: { min: 0.25, max: 0.55 },
  trusted: { min: 0.55, max: 0.8 },
  full: { min: 0.8, max: 1.0 },
};

// Trust-level policies for PII
const TRUST_LEVEL_POLICIES: Record<TrustLevel, PIIPolicy> = {
  untrusted: 'block',
  limited: 'redact',
  trusted: 'hash',
  full: 'pass',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJsonSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function computeTrustLevel(score: number): TrustLevel {
  if (score >= TRUST_THRESHOLDS.full.min) return 'full';
  if (score >= TRUST_THRESHOLDS.trusted.min) return 'trusted';
  if (score >= TRUST_THRESHOLDS.limited.min) return 'limited';
  return 'untrusted';
}

function computeTrustScore(
  successCount: number,
  errorCount: number,
  uptimeScore: number,
  threatScore: number,
  integrityScore: number
): number {
  const total = successCount + errorCount;
  const successRate = total > 0 ? successCount / total : 0;
  const score = 0.4 * successRate + 0.2 * uptimeScore + 0.2 * (1 - threatScore) + 0.2 * integrityScore;
  return Math.max(0, Math.min(1, score));
}

function generateChallenge(): string {
  return crypto.randomBytes(32).toString('hex');
}

function signPayload(payload: string, privateKey?: string): string {
  // Simulate signing with HMAC-SHA256 if no Ed25519 key available
  const key = privateKey || crypto.randomBytes(32).toString('hex');
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function verifySignature(payload: string, signature: string, publicKey: string): boolean {
  // Simulate verification — re-derive with the same key
  try {
    const expected = crypto.createHmac('sha256', publicKey).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Exported Functions
// ---------------------------------------------------------------------------

/**
 * Register a new federation peer.
 */
export async function registerPeer(
  name: string,
  endpoint: string,
  complianceMode: ComplianceMode = 'none'
): Promise<PeerInfo> {
  try {
    // Check for duplicate endpoint
    const existing = await db.federationPeer.findUnique({ where: { endpoint } });
    if (existing) {
      throw new Error(`Peer with endpoint "${endpoint}" already exists (id: ${existing.id})`);
    }

    const piiPolicy = TRUST_LEVEL_POLICIES.untrusted;

    const peer = await db.federationPeer.create({
      data: {
        name,
        endpoint,
        trustLevel: 'untrusted',
        trustScore: 0,
        status: 'disconnected',
        piiPolicy,
        complianceMode,
        metadata: JSON.stringify({ registeredAt: new Date().toISOString() }),
      },
    });

    return mapPeerToInfo(peer);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('already exists')) {
      throw error;
    }
    throw new Error(`Failed to register peer: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Initiate an mTLS handshake with a peer.
 * Generates a challenge and transitions the peer to "connecting" status.
 */
export async function initiateHandshake(
  peerId: string
): Promise<{ challenge: string; ourPublicKey: string }> {
  try {
    const peer = await db.federationPeer.findUnique({ where: { id: peerId } });
    if (!peer) throw new Error(`Peer not found: ${peerId}`);
    if (peer.status === 'suspended') throw new Error(`Peer is suspended: ${peerId}`);
    if (peer.status === 'evicted') throw new Error(`Peer has been evicted: ${peerId}`);

    // Generate our ephemeral key pair for this handshake
    const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
    const ourPublicB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const challenge = generateChallenge();

    // Store the challenge in metadata for verification later
    const metadata = parseJsonSafe<Record<string, unknown>>(peer.metadata, {});
    metadata._handshake = {
      challenge,
      ourPublicKey: ourPublicB64,
      initiatedAt: new Date().toISOString(),
    };

    await db.federationPeer.update({
      where: { id: peerId },
      data: {
        status: 'connecting',
        metadata: JSON.stringify(metadata),
      },
    });

    // Clean up key objects
    privateKey.export({ type: 'pkcs8', format: 'der' });

    return { challenge, ourPublicKey: ourPublicB64 };
  } catch (error: unknown) {
    if (error instanceof Error && (error.message.includes('not found') || error.message.includes('suspended') || error.message.includes('evicted'))) {
      throw error;
    }
    throw new Error(`Failed to initiate handshake: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Complete an mTLS handshake by providing the peer's public key and challenge response.
 */
export async function completeHandshake(
  peerId: string,
  publicKey: string,
  challenge: string
): Promise<{ success: boolean; trustLevel: TrustLevel; trustScore: number }> {
  try {
    const peer = await db.federationPeer.findUnique({ where: { id: peerId } });
    if (!peer) throw new Error(`Peer not found: ${peerId}`);
    if (peer.status !== 'connecting') throw new Error(`Peer is not in connecting state: ${peerId} (state: ${peer.status})`);

    const metadata = parseJsonSafe<Record<string, unknown>>(peer.metadata, {});
    const handshake = metadata._handshake as { challenge?: string; ourPublicKey?: string } | undefined;

    // Verify challenge matches
    if (handshake?.challenge && handshake.challenge !== challenge) {
      await updateTrustScoreInternal(peerId, { type: 'violation', delta: -0.1, details: 'Handshake challenge mismatch' });
      throw new Error('Challenge mismatch — possible man-in-the-middle attack');
    }

    // Generate a simulated mTLS certificate
    const mtlsCert = `RFE1-CERT-${crypto.randomBytes(16).toString('hex')}`;

    // Compute new trust score — handshake is a success event
    const newSuccessCount = peer.successCount + 1;
    const newScore = computeTrustScore(newSuccessCount, peer.errorCount, peer.uptimeScore, peer.threatScore, peer.integrityScore);
    const newTrustLevel = computeTrustLevel(newScore);

    // Update metadata
    delete metadata._handshake;
    metadata.handshakeCompletedAt = new Date().toISOString();
    metadata.peerPublicKey = publicKey;

    await db.federationPeer.update({
      where: { id: peerId },
      data: {
        publicKey,
        trustLevel: newTrustLevel,
        trustScore: newScore,
        status: 'connected',
        mtlsCert,
        lastHandshake: new Date(),
        successCount: newSuccessCount,
        piiPolicy: TRUST_LEVEL_POLICIES[newTrustLevel],
        metadata: JSON.stringify(metadata),
      },
    });

    return { success: true, trustLevel: newTrustLevel, trustScore: newScore };
  } catch (error: unknown) {
    if (error instanceof Error && (error.message.includes('not found') || error.message.includes('not in connecting') || error.message.includes('Challenge mismatch'))) {
      throw error;
    }
    throw new Error(`Failed to complete handshake: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Send a federation message with PII scanning and signing.
 */
export async function sendFederationMessage(
  peerId: string,
  messageType: MessageType,
  payload: Record<string, unknown>
): Promise<FederationMessageInfo> {
  try {
    const peer = await db.federationPeer.findUnique({ where: { id: peerId } });
    if (!peer) throw new Error(`Peer not found: ${peerId}`);
    if (peer.status === 'suspended') throw new Error(`Cannot send to suspended peer: ${peerId}`);
    if (peer.status === 'evicted') throw new Error(`Cannot send to evicted peer: ${peerId}`);

    // Serialize payload for scanning
    const payloadStr = JSON.stringify(payload);

    // Scan for PII
    const piiResults = scanForPIIInternal(payloadStr);

    // Apply PII policy based on trust level
    let processedPayload = payload;
    let piiDetected: string[] = [];

    if (piiResults.length > 0) {
      piiDetected = piiResults.map((r) => r.category);

      const policy = peer.piiPolicy as PIIPolicy;
      const complianceExtra = COMPLIANCE_PII_POLICY[peer.complianceMode as ComplianceMode] ?? [];
      const relevantPII = piiResults.filter(
        (r) => complianceExtra.length === 0 || complianceExtra.includes(r.category)
      );

      switch (policy) {
        case 'block':
          if (relevantPII.length > 0) {
            throw new Error(
              `Message blocked: PII detected [${relevantPII.map((r) => r.category).join(', ')}] — policy is "block"`
            );
          }
          break;

        case 'redact':
          processedPayload = redactPIIInternal(payload, piiResults);
          break;

        case 'hash':
          processedPayload = hashPIIInternal(payload, piiResults);
          break;

        case 'pass':
          // No transformation
          break;
      }
    }

    // Sign the message
    const signature = signPayload(payloadStr);

    // Store message
    const message = await db.federationMessage.create({
      data: {
        peerId,
        direction: 'outbound',
        messageType,
        payload: JSON.stringify(processedPayload),
        piiScanned: true,
        piiDetected: JSON.stringify(piiDetected),
        signed: true,
        signature,
      },
    });

    // Update success count
    await db.federationPeer.update({
      where: { id: peerId },
      data: { successCount: { increment: 1 } },
    });

    return mapMessageToInfo(message);
  } catch (error: unknown) {
    // Record error on peer
    try {
      await db.federationPeer.update({
        where: { id: peerId },
        data: { errorCount: { increment: 1 } },
      });
    } catch {
      // Graceful degradation
    }

    if (error instanceof Error && (error.message.includes('not found') || error.message.includes('suspended') || error.message.includes('evicted') || error.message.includes('blocked'))) {
      throw error;
    }
    throw new Error(`Failed to send federation message: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Receive and process an incoming federation message.
 */
export async function receiveFederationMessage(
  peerId: string,
  message: { messageType: MessageType; payload: Record<string, unknown>; signature?: string }
): Promise<FederationMessageInfo> {
  try {
    const peer = await db.federationPeer.findUnique({ where: { id: peerId } });
    if (!peer) throw new Error(`Peer not found: ${peerId}`);
    if (peer.status === 'evicted') throw new Error(`Cannot receive from evicted peer: ${peerId}`);

    const payloadStr = JSON.stringify(message.payload);

    // Verify signature if provided
    let signed = false;
    if (message.signature && peer.publicKey) {
      signed = verifySignature(payloadStr, message.signature, peer.publicKey);
    }

    // Scan for PII
    const piiResults = scanForPIIInternal(payloadStr);
    const piiDetected = piiResults.map((r) => r.category);

    // Process through policy
    let processedPayload = message.payload;
    const policy = peer.piiPolicy as PIIPolicy;

    if (piiResults.length > 0) {
      switch (policy) {
        case 'block':
          // For inbound, we still accept but flag
          break;
        case 'redact':
          processedPayload = redactPIIInternal(message.payload, piiResults);
          break;
        case 'hash':
          processedPayload = hashPIIInternal(message.payload, piiResults);
          break;
        case 'pass':
          break;
      }
    }

    // Store message
    const stored = await db.federationMessage.create({
      data: {
        peerId,
        direction: 'inbound',
        messageType: message.messageType,
        payload: JSON.stringify(processedPayload),
        piiScanned: true,
        piiDetected: JSON.stringify(piiDetected),
        signed,
        signature: message.signature ?? null,
      },
    });

    // Behavioral trust: update based on message
    if (!signed && peer.publicKey) {
      await updateTrustScoreInternal(peerId, {
        type: 'violation',
        delta: -0.05,
        details: 'Inbound message not signed but peer has public key',
      });
    } else {
      await updateTrustScoreInternal(peerId, { type: 'success' });
    }

    return mapMessageToInfo(stored);
  } catch (error: unknown) {
    if (error instanceof Error && (error.message.includes('not found') || error.message.includes('evicted'))) {
      throw error;
    }
    throw new Error(`Failed to receive federation message: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Update a peer's trust score based on an event.
 * Implements behavioral trust with auto-upgrade/downgrade.
 */
export async function updateTrustScore(
  peerId: string,
  event: TrustEvent
): Promise<{ trustScore: number; trustLevel: TrustLevel; changed: boolean }> {
  return updateTrustScoreInternal(peerId, event);
}

async function updateTrustScoreInternal(
  peerId: string,
  event: TrustEvent
): Promise<{ trustScore: number; trustLevel: TrustLevel; changed: boolean }> {
  try {
    const peer = await db.federationPeer.findUnique({ where: { id: peerId } });
    if (!peer) throw new Error(`Peer not found: ${peerId}`);

    let { successCount, errorCount, uptimeScore, threatScore, integrityScore } = peer;

    switch (event.type) {
      case 'success':
        successCount += 1;
        break;
      case 'error':
        errorCount += 1;
        break;
      case 'handshake':
        successCount += 1;
        break;
      case 'heartbeat':
        // Uptime increases slightly on each heartbeat
        uptimeScore = Math.min(1, uptimeScore + 0.01);
        break;
      case 'violation':
        threatScore = Math.min(1, threatScore + Math.abs(event.delta ?? 0.1));
        errorCount += 1;
        break;
      case 'integrity_check':
        if (event.delta && event.delta > 0) {
          integrityScore = Math.min(1, integrityScore + event.delta);
        } else {
          integrityScore = Math.max(0, integrityScore + (event.delta ?? -0.1));
        }
        break;
      case 'compliance_breach':
        threatScore = Math.min(1, threatScore + 0.15);
        errorCount += 1;
        break;
    }

    const newScore = computeTrustScore(successCount, errorCount, uptimeScore, threatScore, integrityScore);
    const newTrustLevel = computeTrustLevel(newScore);
    const changed = newTrustLevel !== peer.trustLevel;

    await db.federationPeer.update({
      where: { id: peerId },
      data: {
        trustScore: newScore,
        trustLevel: newTrustLevel,
        successCount,
        errorCount,
        uptimeScore,
        threatScore,
        integrityScore,
        piiPolicy: TRUST_LEVEL_POLICIES[newTrustLevel],
      },
    });

    return { trustScore: newScore, trustLevel: newTrustLevel, changed };
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    throw new Error(`Failed to update trust score: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Scan content for PII. Returns a list of PII categories found with matches.
 */
export function scanForPII(content: string): PIIResult[] {
  return scanForPIIInternal(content);
}

function scanForPIIInternal(content: string): PIIResult[] {
  const results: PIIResult[] = [];

  for (const [category, pattern] of Object.entries(PII_PATTERNS)) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      // Filter out obvious false positives
      const filtered = matches.filter((m) => m.length > 2);
      if (filtered.length > 0) {
        results.push({ category: category as PIICategory, matches: filtered });
      }
    }
  }

  return results;
}

/**
 * Redact detected PII from content, replacing matches with [REDACTED_<CATEGORY>].
 */
export function redactPII(content: string, piiTypes: PIICategory[]): string {
  let result = content;

  for (const category of piiTypes) {
    const pattern = PII_PATTERNS[category];
    pattern.lastIndex = 0;
    result = result.replace(pattern, `[REDACTED_${category.toUpperCase()}]`);
  }

  return result;
}

function redactPIIInternal(payload: Record<string, unknown>, piiResults: PIIResult[]): Record<string, unknown> {
  const payloadStr = JSON.stringify(payload);
  let result = payloadStr;

  for (const pii of piiResults) {
    const pattern = PII_PATTERNS[pii.category];
    pattern.lastIndex = 0;
    result = result.replace(pattern, `[REDACTED_${pii.category.toUpperCase()}]`);
  }

  try {
    return JSON.parse(result);
  } catch {
    return { redacted: result };
  }
}

function hashPIIInternal(payload: Record<string, unknown>, piiResults: PIIResult[]): Record<string, unknown> {
  const payloadStr = JSON.stringify(payload);
  let result = payloadStr;

  for (const pii of piiResults) {
    const pattern = PII_PATTERNS[pii.category];
    pattern.lastIndex = 0;
    result = result.replace(pattern, (match) => {
      const hash = crypto.createHash('sha256').update(match).digest('hex').slice(0, 12);
      return `[HASH_${pii.category.toUpperCase()}:${hash}]`;
    });
  }

  try {
    return JSON.parse(result);
  } catch {
    return { hashed: result };
  }
}

/**
 * Get the full status of a peer.
 */
export async function getPeerStatus(peerId: string): Promise<PeerInfo | null> {
  try {
    const peer = await db.federationPeer.findUnique({ where: { id: peerId } });
    if (!peer) return null;
    return mapPeerToInfo(peer);
  } catch (error: unknown) {
    throw new Error(`Failed to get peer status: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * List all peers, optionally filtered by status or trust level.
 */
export async function listPeers(filter?: {
  status?: PeerStatus;
  trustLevel?: TrustLevel;
  complianceMode?: ComplianceMode;
}): Promise<PeerInfo[]> {
  try {
    const where: Record<string, unknown> = {};
    if (filter?.status) where.status = filter.status;
    if (filter?.trustLevel) where.trustLevel = filter.trustLevel;
    if (filter?.complianceMode) where.complianceMode = filter.complianceMode;

    const peers = await db.federationPeer.findMany({
      where,
      orderBy: { trustScore: 'desc' },
    });

    return peers.map(mapPeerToInfo);
  } catch (error: unknown) {
    throw new Error(`Failed to list peers: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Suspend a peer — disconnects and prevents all communication.
 */
export async function suspendPeer(peerId: string): Promise<PeerInfo> {
  try {
    const peer = await db.federationPeer.findUnique({ where: { id: peerId } });
    if (!peer) throw new Error(`Peer not found: ${peerId}`);
    if (peer.status === 'evicted') throw new Error(`Cannot suspend evicted peer: ${peerId}`);

    const updated = await db.federationPeer.update({
      where: { id: peerId },
      data: {
        status: 'suspended',
        threatScore: Math.min(1, peer.threatScore + 0.2),
        metadata: JSON.stringify({
          ...parseJsonSafe<Record<string, unknown>>(peer.metadata, {}),
          suspendedAt: new Date().toISOString(),
        }),
      },
    });

    return mapPeerToInfo(updated);
  } catch (error: unknown) {
    if (error instanceof Error && (error.message.includes('not found') || error.message.includes('evicted'))) {
      throw error;
    }
    throw new Error(`Failed to suspend peer: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Evict a peer — permanently removes trust and marks as evicted.
 */
export async function evictPeer(peerId: string): Promise<PeerInfo> {
  try {
    const peer = await db.federationPeer.findUnique({ where: { id: peerId } });
    if (!peer) throw new Error(`Peer not found: ${peerId}`);

    const updated = await db.federationPeer.update({
      where: { id: peerId },
      data: {
        status: 'evicted',
        trustLevel: 'untrusted',
        trustScore: 0,
        publicKey: null,
        mtlsCert: null,
        threatScore: 1,
        integrityScore: 0,
        piiPolicy: 'block',
        metadata: JSON.stringify({
          ...parseJsonSafe<Record<string, unknown>>(peer.metadata, {}),
          evictedAt: new Date().toISOString(),
          evictionReason: 'Manual eviction',
        }),
      },
    });

    return mapPeerToInfo(updated);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    throw new Error(`Failed to evict peer: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ---------------------------------------------------------------------------
// Internal Mappers
// ---------------------------------------------------------------------------

function mapPeerToInfo(peer: Record<string, unknown>): PeerInfo {
  return {
    id: peer.id as string,
    name: peer.name as string,
    endpoint: peer.endpoint as string,
    publicKey: (peer.publicKey as string) ?? null,
    trustLevel: peer.trustLevel as TrustLevel,
    trustScore: peer.trustScore as number,
    status: peer.status as PeerStatus,
    mtlsCert: (peer.mtlsCert as string) ?? null,
    lastHandshake: (peer.lastHandshake as Date) ?? null,
    successCount: peer.successCount as number,
    errorCount: peer.errorCount as number,
    uptimeScore: peer.uptimeScore as number,
    threatScore: peer.threatScore as number,
    integrityScore: peer.integrityScore as number,
    piiPolicy: peer.piiPolicy as PIIPolicy,
    complianceMode: peer.complianceMode as ComplianceMode,
    metadata: parseJsonSafe<Record<string, unknown>>(peer.metadata as string, {}),
    createdAt: peer.createdAt as Date,
    updatedAt: peer.updatedAt as Date,
  };
}

function mapMessageToInfo(msg: Record<string, unknown>): FederationMessageInfo {
  return {
    id: msg.id as string,
    peerId: msg.peerId as string,
    direction: msg.direction as Direction,
    messageType: msg.messageType as MessageType,
    payload: parseJsonSafe<Record<string, unknown>>(msg.payload as string, {}),
    piiScanned: msg.piiScanned as boolean,
    piiDetected: parseJsonSafe<string[]>(msg.piiDetected as string, []),
    signed: msg.signed as boolean,
    signature: (msg.signature as string) ?? null,
    createdAt: msg.createdAt as Date,
  };
}
