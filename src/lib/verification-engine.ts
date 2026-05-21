import { db } from '@/lib/db';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ============================================================
// Types
// ============================================================

/** Ed25519 key pair result */
export interface KeyPairResult {
  publicKey: string; // base64url encoded
  privateKey: string; // base64url encoded (DER PKCS8)
  publicKeyPem: string;
}

/** Witness result from database */
export interface WitnessResult {
  id: string;
  filePath: string;
  fileHash: string;
  algorithm: string;
  signature?: string;
  publicKey?: string;
  commitHash?: string;
  verified: boolean;
  verifiedAt?: Date;
  createdAt: Date;
}

/** Report result from database */
export interface ReportResult {
  id: string;
  status: string;
  totalFiles: number;
  verifiedFiles: number;
  failedFiles: number;
  details: Array<{
    filePath: string;
    expected: string;
    actual: string;
    match: boolean;
  }>;
  signature?: string;
  createdAt: Date;
}

/** Verification result for a single file */
export interface FileVerificationResult {
  filePath: string;
  match: boolean;
  expectedHash?: string;
  actualHash: string;
  signatureValid?: boolean;
  error?: string;
}

/** Batch verification result */
export interface BatchVerificationResult {
  totalFiles: number;
  verifiedFiles: number;
  failedFiles: number;
  results: FileVerificationResult[];
  allPassed: boolean;
}

/** Filter for listing witnesses */
export interface WitnessFilter {
  verified?: boolean;
  algorithm?: string;
  filePathContains?: string;
  limit?: number;
  offset?: number;
}

/** Filter for listing reports */
export interface ReportFilter {
  status?: string;
  limit?: number;
  offset?: number;
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

function witnessToResult(w: {
  id: string;
  filePath: string;
  fileHash: string;
  algorithm: string;
  signature: string | null;
  publicKey: string | null;
  commitHash: string | null;
  verified: boolean;
  verifiedAt: Date | null;
  createdAt: Date;
}): WitnessResult {
  return {
    id: w.id,
    filePath: w.filePath,
    fileHash: w.fileHash,
    algorithm: w.algorithm,
    signature: w.signature ?? undefined,
    publicKey: w.publicKey ?? undefined,
    commitHash: w.commitHash ?? undefined,
    verified: w.verified,
    verifiedAt: w.verifiedAt ?? undefined,
    createdAt: w.createdAt,
  };
}

function reportToResult(r: {
  id: string;
  status: string;
  totalFiles: number;
  verifiedFiles: number;
  failedFiles: number;
  details: string;
  signature: string | null;
  createdAt: Date;
}): ReportResult {
  return {
    id: r.id,
    status: r.status,
    totalFiles: r.totalFiles,
    verifiedFiles: r.verifiedFiles,
    failedFiles: r.failedFiles,
    details: parseJsonSafe<Array<{ filePath: string; expected: string; actual: string; match: boolean }>>(
      r.details,
      []
    ),
    signature: r.signature ?? undefined,
    createdAt: r.createdAt,
  };
}

/** Get git commit hash for a file's directory */
async function getGitCommitHash(filePath: string): Promise<string | undefined> {
  try {
    const { execSync } = await import('child_process');
    const dir = path.dirname(filePath);
    const hash = execSync('git rev-parse HEAD', {
      cwd: dir,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    return hash || undefined;
  } catch {
    return undefined;
  }
}

// ============================================================
// Core Engine — exported async functions
// ============================================================

/**
 * Hash a file with SHA-256.
 */
export async function hashFile(filePath: string): Promise<{
  filePath: string;
  hash: string;
  algorithm: string;
  fileSize: number;
}> {
  try {
    const absolutePath = path.resolve(filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }

    const stats = fs.statSync(absolutePath);
    const fileBuffer = fs.readFileSync(absolutePath);
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    return {
      filePath: absolutePath,
      hash,
      algorithm: 'sha256',
      fileSize: stats.size,
    };
  } catch (error: unknown) {
    throw new Error(`Failed to hash file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Hash a string with SHA-256.
 */
export function hashString(content: string): {
  hash: string;
  algorithm: string;
} {
  const hash = crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  return {
    hash,
    algorithm: 'sha256',
  };
}

/**
 * Generate an Ed25519 key pair for signing.
 */
export function generateKeyPair(): KeyPairResult {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  // Encode public key as base64url for storage
  const publicKeyDer = crypto.createPublicKey(publicKey).export({
    type: 'spki',
    format: 'der',
  });
  const publicKeyBase64Url = publicKeyDer.toString('base64url');

  // Encode private key as base64url for storage
  const privateKeyDer = crypto.createPrivateKey(privateKey).export({
    type: 'pkcs8',
    format: 'der',
  });
  const privateKeyBase64Url = privateKeyDer.toString('base64url');

  return {
    publicKey: publicKeyBase64Url,
    privateKey: privateKeyBase64Url,
    publicKeyPem: publicKey,
  };
}

/**
 * Sign a hash with an Ed25519 private key.
 */
export function signHash(
  hash: string,
  privateKey: string
): {
  signature: string;
  algorithm: string;
} {
  try {
    // Reconstruct the private key from base64url DER
    const privateKeyDer = Buffer.from(privateKey, 'base64url');
    const privateKeyObj = crypto.createPrivateKey({
      key: privateKeyDer,
      format: 'der',
      type: 'pkcs8',
    });

    const signature = crypto.sign(null, Buffer.from(hash, 'hex'), privateKeyObj);
    return {
      signature: signature.toString('base64url'),
      algorithm: 'ed25519',
    };
  } catch (error: unknown) {
    throw new Error(`Failed to sign hash: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Verify an Ed25519 signature against a hash.
 */
export function verifySignature(
  hash: string,
  signature: string,
  publicKey: string
): {
  valid: boolean;
  algorithm: string;
} {
  try {
    // Reconstruct the public key from base64url DER
    const publicKeyDer = Buffer.from(publicKey, 'base64url');
    const publicKeyObj = crypto.createPublicKey({
      key: publicKeyDer,
      format: 'der',
      type: 'spki',
    });

    const signatureBuffer = Buffer.from(signature, 'base64url');
    const valid = crypto.verify(
      null,
      Buffer.from(hash, 'hex'),
      publicKeyObj,
      signatureBuffer
    );

    return {
      valid,
      algorithm: 'ed25519',
    };
  } catch (error: unknown) {
    return {
      valid: false,
      algorithm: 'ed25519',
    };
  }
}

/**
 * Create a verification witness for a file.
 * This hashes the file, optionally signs it, and stores the witness in the database.
 */
export async function createWitness(
  filePath: string,
  commitHash?: string
): Promise<WitnessResult> {
  try {
    const absolutePath = path.resolve(filePath);

    // Hash the file
    const hashResult = await hashFile(absolutePath);

    // Get commit hash if not provided
    const resolvedCommitHash = commitHash ?? (await getGitCommitHash(absolutePath));

    // Generate key pair and sign
    const keyPair = generateKeyPair();
    const signatureResult = signHash(hashResult.hash, keyPair.privateKey);

    // Upsert the witness (filePath is unique)
    const witness = await db.verificationWitness.upsert({
      where: { filePath: absolutePath },
      update: {
        fileHash: hashResult.hash,
        algorithm: hashResult.algorithm,
        signature: signatureResult.signature,
        publicKey: keyPair.publicKey,
        commitHash: resolvedCommitHash ?? null,
        verified: false,
        verifiedAt: null,
      },
      create: {
        filePath: absolutePath,
        fileHash: hashResult.hash,
        algorithm: hashResult.algorithm,
        signature: signatureResult.signature,
        publicKey: keyPair.publicKey,
        commitHash: resolvedCommitHash ?? null,
        verified: false,
      },
    });

    return witnessToResult(witness);
  } catch (error: unknown) {
    throw new Error(`Failed to create witness: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Verify a file against its stored witness.
 */
export async function verifyFile(filePath: string): Promise<FileVerificationResult> {
  try {
    const absolutePath = path.resolve(filePath);

    // Get the stored witness
    const witness = await db.verificationWitness.findUnique({
      where: { filePath: absolutePath },
    });

    if (!witness) {
      // No witness — hash the file but can't verify
      const hashResult = await hashFile(absolutePath);
      return {
        filePath: absolutePath,
        match: false,
        actualHash: hashResult.hash,
        error: 'No witness found for this file',
      };
    }

    // Hash the current file
    const hashResult = await hashFile(absolutePath);
    const match = hashResult.hash === witness.fileHash;

    // Verify signature if present
    let signatureValid: boolean | undefined;
    if (witness.signature && witness.publicKey) {
      const sigResult = verifySignature(
        witness.fileHash,
        witness.signature,
        witness.publicKey
      );
      signatureValid = sigResult.valid;
    }

    // Update witness verification status
    await db.verificationWitness.update({
      where: { id: witness.id },
      data: {
        verified: match,
        verifiedAt: new Date(),
      },
    });

    return {
      filePath: absolutePath,
      match,
      expectedHash: witness.fileHash,
      actualHash: hashResult.hash,
      signatureValid,
    };
  } catch (error: unknown) {
    return {
      filePath: path.resolve(filePath),
      match: false,
      actualHash: '',
      error: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Verify multiple files at once.
 */
export async function verifyBatch(filePaths: string[]): Promise<BatchVerificationResult> {
  try {
    const results: FileVerificationResult[] = [];

    for (const filePath of filePaths) {
      const result = await verifyFile(filePath);
      results.push(result);
    }

    const verifiedFiles = results.filter((r) => r.match).length;
    const failedFiles = results.filter((r) => !r.match).length;

    return {
      totalFiles: filePaths.length,
      verifiedFiles,
      failedFiles,
      results,
      allPassed: failedFiles === 0,
    };
  } catch (error: unknown) {
    throw new Error(`Failed to batch verify: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate a verification report for the given file paths.
 * If no paths are provided, generates a report for all witnessed files.
 */
export async function generateReport(filePaths?: string[]): Promise<ReportResult> {
  try {
    let targetPaths: string[] = filePaths ?? [];

    // If no paths specified, use all witnessed files
    if (targetPaths.length === 0) {
      const allWitnesses = await db.verificationWitness.findMany({
        select: { filePath: true },
      });
      targetPaths = allWitnesses.map((w) => w.filePath);
    }

    // Verify each file
    const details: Array<{ filePath: string; expected: string; actual: string; match: boolean }> = [];

    for (const filePath of targetPaths) {
      try {
        const result = await verifyFile(filePath);
        details.push({
          filePath: result.filePath,
          expected: result.expectedHash ?? 'no-witness',
          actual: result.actualHash,
          match: result.match,
        });
      } catch {
        details.push({
          filePath,
          expected: 'error',
          actual: 'error',
          match: false,
        });
      }
    }

    const verifiedFiles = details.filter((d) => d.match).length;
    const failedFiles = details.filter((d) => !d.match).length;
    const status = failedFiles === 0 ? 'passed' : (verifiedFiles > 0 ? 'partial' : 'failed');

    // Sign the report
    const reportData = JSON.stringify(details);
    const reportHash = hashString(reportData).hash;
    const keyPair = generateKeyPair();
    const signature = signHash(reportHash, keyPair.privateKey);

    const report = await db.verificationReport.create({
      data: {
        status,
        totalFiles: details.length,
        verifiedFiles,
        failedFiles,
        details: JSON.stringify(details),
        signature: signature.signature,
      },
    });

    return reportToResult(report);
  } catch (error: unknown) {
    throw new Error(`Failed to generate report: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get witness for a specific file.
 */
export async function getWitness(filePath: string): Promise<WitnessResult | null> {
  try {
    const absolutePath = path.resolve(filePath);
    const witness = await db.verificationWitness.findUnique({
      where: { filePath: absolutePath },
    });

    return witness ? witnessToResult(witness) : null;
  } catch (error: unknown) {
    throw new Error(`Failed to get witness: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * List all witnesses with optional filter.
 */
export async function listWitnesses(filter?: WitnessFilter): Promise<WitnessResult[]> {
  try {
    const where: Record<string, unknown> = {};

    if (filter?.verified !== undefined) where.verified = filter.verified;
    if (filter?.algorithm) where.algorithm = filter.algorithm;
    if (filter?.filePathContains) {
      where.filePath = { contains: filter.filePathContains };
    }

    const witnesses = await db.verificationWitness.findMany({
      where: where as never,
      orderBy: { createdAt: 'desc' },
      take: filter?.limit ?? 50,
      skip: filter?.offset ?? 0,
    });

    return witnesses.map(witnessToResult);
  } catch (error: unknown) {
    throw new Error(`Failed to list witnesses: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * List all reports with optional filter.
 */
export async function listReports(filter?: ReportFilter): Promise<ReportResult[]> {
  try {
    const where: Record<string, unknown> = {};

    if (filter?.status) where.status = filter.status;

    const reports = await db.verificationReport.findMany({
      where: where as never,
      orderBy: { createdAt: 'desc' },
      take: filter?.limit ?? 50,
      skip: filter?.offset ?? 0,
    });

    return reports.map(reportToResult);
  } catch (error: unknown) {
    throw new Error(`Failed to list reports: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
