# Task 3b — Core Engine Agent

## Summary
Created two comprehensive core engine libraries for the ClawHub project: a Zero-Trust Federation Engine and an Encryption at Rest Engine.

## Files Created

### `/src/lib/federation-engine.ts`
- **12 exported async functions**: registerPeer, initiateHandshake, completeHandshake, sendFederationMessage, receiveFederationMessage, updateTrustScore, scanForPII, redactPII, getPeerStatus, listPeers, suspendPeer, evictPeer
- **14 PII detection patterns**: email, SSN, phone, credit_card, ip_address, date_of_birth, passport, drivers_license, bank_account, medical_record, social_media, address, zip_code, full_name
- **Trust scoring formula**: `0.4 * successRate + 0.2 * uptimeScore + 0.2 * (1 - threatScore) + 0.2 * integrityScore`
- **4 trust levels**: untrusted (0–0.25), limited (0.25–0.55), trusted (0.55–0.8), full (0.8–1.0)
- **Per-trust-level PII policies**: untrusted→block, limited→redact, trusted→hash, full→pass
- **4 compliance modes**: none, HIPAA, SOC2, GDPR with category-specific PII lists
- **mTLS handshake**: x25519 key generation, challenge-response, simulated certificate
- **Message signing**: HMAC-SHA256 with timing-safe verification
- **Behavioral trust**: auto-upgrade/downgrade on success/error/violation/heartbeat/integrity_check/compliance_breach events

### `/src/lib/encryption-engine.ts`
- **13 exported async functions**: createVault, enableEncryption, disableEncryption, encryptRecord, decryptRecord, encryptBulk, decryptBulk, verifyIntegrity, getVaultStatus, listVaults, rotateKey, migrateVault
- **AES-256-GCM** encryption/decryption using Node.js `crypto` module
- **PBKDF2** key derivation: 100,000 iterations, SHA-256, 32-byte key
- **Magic bytes "RFE1"** for format identification
- **Version tracking** for migration support
- **In-memory key cache** (keys never persisted to DB)
- **Passphrase verification token** stored in vault metadata for re-authentication
- **Bulk encrypt/decrypt** with per-record success/error tracking
- **Auth tag integrity verification** with full GCM tag checking
- **Key rotation**: decrypt all records with old key, re-encrypt with new key, bump version
- **Vault migration**: re-encrypt all records at target version

## Patterns Followed
- `import { db } from './db'` for database access
- `try/catch` around all DB operations
- `parseJsonSafe` helper for safe JSON parsing
- Exported async functions with descriptive error messages
- Typed interfaces for all inputs/outputs
- Consistent mapper functions for DB→domain conversion

## Database
- Prisma models were already defined in schema: FederationPeer, FederationMessage, EncryptionVault, EncryptedRecord
- `npx prisma db push` confirmed database is in sync
- TypeScript type check: no errors in new files
