import { db } from './db';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAGIC_BYTES = 'RFE1';
const CURRENT_VERSION = 1;
const ALGORITHM = 'aes-256-gcm';
const KEY_DERIVATION = 'pbkdf2';
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LENGTH = 32; // 256 bits for AES-256
const PBKDF2_SALT_LENGTH = 16;
const GCM_IV_LENGTH = 12;
const GCM_AUTH_TAG_LENGTH = 16;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VaultConfig {
  algorithm?: string;
  keyDerivation?: string;
  iterations?: number;
  metadata?: Record<string, unknown>;
}

export interface VaultInfo {
  id: string;
  storeName: string;
  algorithm: string;
  keyDerivation: string;
  isActive: boolean;
  encryptedAt: Date | null;
  version: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface EncryptedRecordInfo {
  id: string;
  vaultId: string;
  recordType: string;
  recordId: string | null;
  iv: string;
  authTag: string;
  ciphertext: string;
  magic: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BulkEncryptInput {
  recordType: string;
  recordId: string;
  plaintext: string;
}

export interface BulkEncryptResult {
  recordId: string;
  success: boolean;
  error?: string;
  encryptedRecordId?: string;
}

export interface BulkDecryptResult {
  recordId: string;
  success: boolean;
  plaintext?: string;
  error?: string;
}

export interface IntegrityResult {
  recordId: string;
  valid: boolean;
  details: string;
}

// ---------------------------------------------------------------------------
// In-Memory Key Cache (keys are never persisted to DB)
// ---------------------------------------------------------------------------

const keyCache = new Map<string, Buffer>(); // vaultId → derived key

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

/**
 * Derive a 256-bit key from a passphrase using PBKDF2.
 */
function deriveKey(passphrase: string, salt: Buffer, iterations: number = PBKDF2_ITERATIONS): Buffer {
  return crypto.pbkdf2Sync(passphrase, salt, iterations, PBKDF2_KEY_LENGTH, 'sha256');
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns { iv, ciphertext, authTag } all base64-encoded.
 */
function aes256GcmEncrypt(
  key: Buffer,
  plaintext: string
): { iv: string; ciphertext: string; authTag: string } {
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: GCM_AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    ciphertext: encrypted,
    authTag: authTag.toString('base64'),
  };
}

/**
 * Decrypt ciphertext using AES-256-GCM.
 * Throws if auth tag verification fails.
 */
function aes256GcmDecrypt(
  key: Buffer,
  ivBase64: string,
  ciphertextBase64: string,
  authTagBase64: string
): string {
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: GCM_AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextBase64, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Get or derive the encryption key for a vault.
 */
function getVaultKey(vaultId: string, passphrase: string, salt: Buffer, iterations: number): Buffer {
  const cached = keyCache.get(vaultId);
  if (cached) return cached;

  const key = deriveKey(passphrase, salt, iterations);
  keyCache.set(vaultId, key);
  return key;
}

// ---------------------------------------------------------------------------
// Exported Functions
// ---------------------------------------------------------------------------

/**
 * Create a new encryption vault for a store.
 */
export async function createVault(
  storeName: string,
  config?: VaultConfig
): Promise<VaultInfo> {
  try {
    // Check for duplicate storeName
    const existing = await db.encryptionVault.findUnique({ where: { storeName } });
    if (existing) {
      throw new Error(`Vault with storeName "${storeName}" already exists (id: ${existing.id})`);
    }

    const algorithm = config?.algorithm ?? ALGORITHM;
    const keyDerivation = config?.keyDerivation ?? KEY_DERIVATION;
    const metadata = {
      ...(config?.metadata ?? {}),
      iterations: config?.iterations ?? PBKDF2_ITERATIONS,
      salt: crypto.randomBytes(PBKDF2_SALT_LENGTH).toString('base64'),
      createdAt: new Date().toISOString(),
    };

    const vault = await db.encryptionVault.create({
      data: {
        storeName,
        algorithm,
        keyDerivation,
        isActive: false,
        version: CURRENT_VERSION,
        metadata: JSON.stringify(metadata),
      },
    });

    return mapVaultToInfo(vault);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('already exists')) {
      throw error;
    }
    throw new Error(`Failed to create vault: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Enable encryption on a vault with a passphrase.
 * The passphrase is used to derive the encryption key via PBKDF2.
 * Keys are stored in memory only — never persisted.
 */
export async function enableEncryption(
  vaultId: string,
  passphrase: string
): Promise<VaultInfo> {
  try {
    const vault = await db.encryptionVault.findUnique({ where: { id: vaultId } });
    if (!vault) throw new Error(`Vault not found: ${vaultId}`);
    if (vault.isActive) throw new Error(`Vault is already active: ${vaultId}`);

    const metadata = parseJsonSafe<Record<string, unknown>>(vault.metadata, {});
    const salt = Buffer.from((metadata.salt as string) || crypto.randomBytes(PBKDF2_SALT_LENGTH).toString('base64'), 'base64');
    const iterations = (metadata.iterations as number) ?? PBKDF2_ITERATIONS;

    // Derive and cache the key
    const key = deriveKey(passphrase, salt, iterations);
    keyCache.set(vaultId, key);

    // Store a verification token to validate passphrase on future operations
    const verificationToken = aes256GcmEncrypt(key, `RFE1-VERIFY-${vaultId}`);
    metadata.verificationToken = verificationToken;
    metadata.enabledAt = new Date().toISOString();

    const updated = await db.encryptionVault.update({
      where: { id: vaultId },
      data: {
        isActive: true,
        encryptedAt: new Date(),
        metadata: JSON.stringify(metadata),
      },
    });

    return mapVaultToInfo(updated);
  } catch (error: unknown) {
    if (error instanceof Error && (error.message.includes('not found') || error.message.includes('already active'))) {
      throw error;
    }
    throw new Error(`Failed to enable encryption: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Disable encryption on a vault — decrypts all records and deactivates.
 * Requires the passphrase to perform decryption.
 */
export async function disableEncryption(
  vaultId: string,
  passphrase: string
): Promise<{ vault: VaultInfo; decryptedCount: number }> {
  try {
    const vault = await db.encryptionVault.findUnique({ where: { id: vaultId } });
    if (!vault) throw new Error(`Vault not found: ${vaultId}`);
    if (!vault.isActive) throw new Error(`Vault is not active: ${vaultId}`);

    const metadata = parseJsonSafe<Record<string, unknown>>(vault.metadata, {});
    const salt = Buffer.from((metadata.salt as string) || '', 'base64');
    const iterations = (metadata.iterations as number) ?? PBKDF2_ITERATIONS;

    // Derive key from passphrase
    const key = deriveKey(passphrase, salt, iterations);

    // Verify the passphrase by checking the verification token
    if (metadata.verificationToken) {
      try {
        const vt = metadata.verificationToken as { iv: string; ciphertext: string; authTag: string };
        aes256GcmDecrypt(key, vt.iv, vt.ciphertext, vt.authTag);
      } catch {
        throw new Error('Invalid passphrase — verification failed');
      }
    }

    // Find all encrypted records for this vault
    const records = await db.encryptedRecord.findMany({ where: { vaultId } });
    let decryptedCount = 0;

    // We decrypt records and store plaintext in metadata for retrieval,
    // then delete the encrypted records
    const decryptedData: Record<string, string> = {};
    for (const record of records) {
      try {
        const plaintext = aes256GcmDecrypt(key, record.iv, record.ciphertext, record.authTag);
        decryptedData[record.id] = plaintext;
        decryptedCount++;
      } catch {
        // Record decryption failed — skip but count
        decryptedData[record.id] = '[DECRYPTION_FAILED]';
      }
    }

    // Delete all encrypted records
    await db.encryptedRecord.deleteMany({ where: { vaultId } });

    // Update vault
    metadata.disabledAt = new Date().toISOString();
    metadata.lastDecryptedData = decryptedData;

    const updated = await db.encryptionVault.update({
      where: { id: vaultId },
      data: {
        isActive: false,
        encryptedAt: null,
        metadata: JSON.stringify(metadata),
      },
    });

    // Remove key from cache
    keyCache.delete(vaultId);

    return { vault: mapVaultToInfo(updated), decryptedCount };
  } catch (error: unknown) {
    if (error instanceof Error && (error.message.includes('not found') || error.message.includes('not active') || error.message.includes('Invalid passphrase'))) {
      throw error;
    }
    throw new Error(`Failed to disable encryption: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Encrypt a single record and store it in the vault.
 */
export async function encryptRecord(
  vaultId: string,
  recordType: string,
  recordId: string,
  plaintext: string
): Promise<EncryptedRecordInfo> {
  try {
    const vault = await db.encryptionVault.findUnique({ where: { id: vaultId } });
    if (!vault) throw new Error(`Vault not found: ${vaultId}`);
    if (!vault.isActive) throw new Error(`Vault is not active: ${vaultId}`);

    const key = keyCache.get(vaultId);
    if (!key) throw new Error(`Encryption key not available for vault: ${vaultId}. Re-enable encryption with passphrase.`);

    // Check if record already exists
    const existing = await db.encryptedRecord.findFirst({
      where: { vaultId, recordId },
    });

    const { iv, ciphertext, authTag } = aes256GcmEncrypt(key, plaintext);

    if (existing) {
      // Update existing record
      const updated = await db.encryptedRecord.update({
        where: { id: existing.id },
        data: {
          recordType,
          iv,
          authTag,
          ciphertext,
          magic: MAGIC_BYTES,
          version: vault.version,
        },
      });
      return mapRecordToInfo(updated);
    }

    // Create new record
    const record = await db.encryptedRecord.create({
      data: {
        vaultId,
        recordType,
        recordId,
        iv,
        authTag,
        ciphertext,
        magic: MAGIC_BYTES,
        version: vault.version,
      },
    });

    return mapRecordToInfo(record);
  } catch (error: unknown) {
    if (error instanceof Error && (error.message.includes('not found') || error.message.includes('not active') || error.message.includes('not available'))) {
      throw error;
    }
    throw new Error(`Failed to encrypt record: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Decrypt a single record by its ID.
 */
export async function decryptRecord(
  vaultId: string,
  recordId: string
): Promise<string> {
  try {
    const vault = await db.encryptionVault.findUnique({ where: { id: vaultId } });
    if (!vault) throw new Error(`Vault not found: ${vaultId}`);

    const key = keyCache.get(vaultId);
    if (!key) throw new Error(`Encryption key not available for vault: ${vaultId}. Re-enable encryption with passphrase.`);

    const record = await db.encryptedRecord.findFirst({
      where: { vaultId, recordId },
    });
    if (!record) throw new Error(`Encrypted record not found: ${recordId}`);

    // Verify magic bytes
    if (record.magic !== MAGIC_BYTES) {
      throw new Error(`Invalid magic bytes: expected "${MAGIC_BYTES}", got "${record.magic}"`);
    }

    // Decrypt
    const plaintext = aes256GcmDecrypt(key, record.iv, record.ciphertext, record.authTag);
    return plaintext;
  } catch (error: unknown) {
    if (error instanceof Error && (error.message.includes('not found') || error.message.includes('not available') || error.message.includes('Invalid magic'))) {
      throw error;
    }
    throw new Error(`Failed to decrypt record: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Bulk encrypt multiple records.
 */
export async function encryptBulk(
  vaultId: string,
  records: BulkEncryptInput[]
): Promise<BulkEncryptResult[]> {
  const results: BulkEncryptResult[] = [];

  for (const record of records) {
    try {
      const encrypted = await encryptRecord(vaultId, record.recordType, record.recordId, record.plaintext);
      results.push({
        recordId: record.recordId,
        success: true,
        encryptedRecordId: encrypted.id,
      });
    } catch (error: unknown) {
      results.push({
        recordId: record.recordId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

/**
 * Bulk decrypt multiple records by their IDs.
 */
export async function decryptBulk(
  vaultId: string,
  recordIds: string[]
): Promise<BulkDecryptResult[]> {
  const results: BulkDecryptResult[] = [];

  for (const recordId of recordIds) {
    try {
      const plaintext = await decryptRecord(vaultId, recordId);
      results.push({
        recordId,
        success: true,
        plaintext,
      });
    } catch (error: unknown) {
      results.push({
        recordId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

/**
 * Verify the integrity of an encrypted record by checking its auth tag.
 */
export async function verifyIntegrity(
  vaultId: string,
  recordId: string
): Promise<IntegrityResult> {
  try {
    const record = await db.encryptedRecord.findFirst({
      where: { vaultId, recordId },
    });
    if (!record) {
      return { recordId, valid: false, details: 'Record not found' };
    }

    // Check magic bytes
    if (record.magic !== MAGIC_BYTES) {
      return { recordId, valid: false, details: `Invalid magic bytes: expected "${MAGIC_BYTES}", got "${record.magic}"` };
    }

    // Check version compatibility
    const vault = await db.encryptionVault.findUnique({ where: { id: vaultId } });
    if (vault && record.version > vault.version) {
      return { recordId, valid: false, details: `Record version (${record.version}) is newer than vault version (${vault.version}) — migration needed` };
    }

    // Verify auth tag by attempting decryption
    const key = keyCache.get(vaultId);
    if (!key) {
      return { recordId, valid: false, details: 'Encryption key not available — cannot verify auth tag' };
    }

    try {
      aes256GcmDecrypt(key, record.iv, record.ciphertext, record.authTag);
      return { recordId, valid: true, details: 'Auth tag verification passed' };
    } catch {
      return { recordId, valid: false, details: 'Auth tag verification failed — data may be tampered' };
    }
  } catch (error: unknown) {
    return {
      recordId,
      valid: false,
      details: `Integrity check error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get the status of a vault.
 */
export async function getVaultStatus(vaultId: string): Promise<VaultInfo | null> {
  try {
    const vault = await db.encryptionVault.findUnique({ where: { id: vaultId } });
    if (!vault) return null;
    return mapVaultToInfo(vault);
  } catch (error: unknown) {
    throw new Error(`Failed to get vault status: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * List all vaults.
 */
export async function listVaults(): Promise<VaultInfo[]> {
  try {
    const vaults = await db.encryptionVault.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return vaults.map(mapVaultToInfo);
  } catch (error: unknown) {
    throw new Error(`Failed to list vaults: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Rotate the encryption key for a vault.
 * Decrypts all records with the old key and re-encrypts with the new key.
 */
export async function rotateKey(
  vaultId: string,
  newPassphrase: string
): Promise<{ rotatedCount: number; newVersion: number }> {
  try {
    const vault = await db.encryptionVault.findUnique({ where: { id: vaultId } });
    if (!vault) throw new Error(`Vault not found: ${vaultId}`);
    if (!vault.isActive) throw new Error(`Vault is not active: ${vaultId}`);

    const oldKey = keyCache.get(vaultId);
    if (!oldKey) throw new Error(`Current encryption key not available for vault: ${vaultId}. Re-enable encryption with passphrase.`);

    // Generate new salt and derive new key
    const newSalt = crypto.randomBytes(PBKDF2_SALT_LENGTH);
    const iterations = PBKDF2_ITERATIONS;
    const newKey = deriveKey(newPassphrase, newSalt, iterations);

    // Find all records
    const records = await db.encryptedRecord.findMany({ where: { vaultId } });
    let rotatedCount = 0;
    const newVersion = vault.version + 1;

    for (const record of records) {
      try {
        // Decrypt with old key
        const plaintext = aes256GcmDecrypt(oldKey, record.iv, record.ciphertext, record.authTag);

        // Re-encrypt with new key
        const { iv, ciphertext, authTag } = aes256GcmEncrypt(newKey, plaintext);

        // Update record
        await db.encryptedRecord.update({
          where: { id: record.id },
          data: {
            iv,
            ciphertext,
            authTag,
            version: newVersion,
          },
        });

        rotatedCount++;
      } catch {
        // Failed to decrypt/re-encrypt this record — skip
      }
    }

    // Update vault with new version and salt
    const metadata = parseJsonSafe<Record<string, unknown>>(vault.metadata, {});
    metadata.salt = newSalt.toString('base64');
    metadata.iterations = iterations;
    metadata.keyRotatedAt = new Date().toISOString();

    // New verification token
    const verificationToken = aes256GcmEncrypt(newKey, `RFE1-VERIFY-${vaultId}`);
    metadata.verificationToken = verificationToken;

    await db.encryptionVault.update({
      where: { id: vaultId },
      data: {
        version: newVersion,
        metadata: JSON.stringify(metadata),
      },
    });

    // Update key cache
    keyCache.set(vaultId, newKey);

    return { rotatedCount, newVersion };
  } catch (error: unknown) {
    if (error instanceof Error && (error.message.includes('not found') || error.message.includes('not active') || error.message.includes('not available'))) {
      throw error;
    }
    throw new Error(`Failed to rotate key: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Migrate a vault to a target version.
 * Re-encrypts all records at the target version format.
 */
export async function migrateVault(
  vaultId: string,
  targetVersion: number
): Promise<{ migratedCount: number; fromVersion: number; toVersion: number }> {
  try {
    const vault = await db.encryptionVault.findUnique({ where: { id: vaultId } });
    if (!vault) throw new Error(`Vault not found: ${vaultId}`);
    if (!vault.isActive) throw new Error(`Vault is not active: ${vaultId}`);

    const key = keyCache.get(vaultId);
    if (!key) throw new Error(`Encryption key not available for vault: ${vaultId}. Re-enable encryption with passphrase.`);

    const fromVersion = vault.version;

    if (targetVersion <= fromVersion) {
      throw new Error(`Target version (${targetVersion}) must be greater than current version (${fromVersion})`);
    }

    const records = await db.encryptedRecord.findMany({ where: { vaultId } });
    let migratedCount = 0;

    for (const record of records) {
      try {
        // Decrypt with current key
        const plaintext = aes256GcmDecrypt(key, record.iv, record.ciphertext, record.authTag);

        // Re-encrypt (same key, new version metadata)
        const { iv, ciphertext, authTag } = aes256GcmEncrypt(key, plaintext);

        await db.encryptedRecord.update({
          where: { id: record.id },
          data: {
            iv,
            ciphertext,
            authTag,
            version: targetVersion,
          },
        });

        migratedCount++;
      } catch {
        // Failed to migrate this record — skip
      }
    }

    // Update vault version
    const metadata = parseJsonSafe<Record<string, unknown>>(vault.metadata, {});
    metadata.migratedAt = new Date().toISOString();
    metadata.migratedFrom = fromVersion;
    metadata.migratedTo = targetVersion;

    await db.encryptionVault.update({
      where: { id: vaultId },
      data: {
        version: targetVersion,
        metadata: JSON.stringify(metadata),
      },
    });

    return { migratedCount, fromVersion, toVersion: targetVersion };
  } catch (error: unknown) {
    if (error instanceof Error && (error.message.includes('not found') || error.message.includes('not active') || error.message.includes('not available') || error.message.includes('must be greater'))) {
      throw error;
    }
    throw new Error(`Failed to migrate vault: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ---------------------------------------------------------------------------
// Internal Mappers
// ---------------------------------------------------------------------------

function mapVaultToInfo(vault: Record<string, unknown>): VaultInfo {
  return {
    id: vault.id as string,
    storeName: vault.storeName as string,
    algorithm: vault.algorithm as string,
    keyDerivation: vault.keyDerivation as string,
    isActive: vault.isActive as boolean,
    encryptedAt: (vault.encryptedAt as Date) ?? null,
    version: vault.version as number,
    metadata: parseJsonSafe<Record<string, unknown>>(vault.metadata as string, {}),
    createdAt: vault.createdAt as Date,
    updatedAt: vault.updatedAt as Date,
  };
}

function mapRecordToInfo(record: Record<string, unknown>): EncryptedRecordInfo {
  return {
    id: record.id as string,
    vaultId: record.vaultId as string,
    recordType: record.recordType as string,
    recordId: (record.recordId as string) ?? null,
    iv: record.iv as string,
    authTag: record.authTag as string,
    ciphertext: record.ciphertext as string,
    magic: record.magic as string,
    version: record.version as number,
    createdAt: record.createdAt as Date,
    updatedAt: record.updatedAt as Date,
  };
}
