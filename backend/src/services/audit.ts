import { createHash } from "node:crypto";
import { pool } from "../db";

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalize(record[key])])
    );
  }

  return value;
}

export function calculateEventHash(event: any): string {
  const occurredAt =
    event.occurred_at instanceof Date
      ? event.occurred_at.toISOString()
      : new Date(event.occurred_at).toISOString();

  const payload = {
    actorId: event.actor_id,
    action: event.action,
    documentId: event.document_id,
    targetUserId: event.target_user_id,
    outcome: event.outcome,
    details: canonicalize(event.details),
    previousHash: event.previous_hash,
    occurredAt,
  };

  return createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
}

export interface AuditEventParams {
  actorId?: string | null;
  action: string;
  documentId?: string | null;
  targetUserId?: string | null;
  outcome?: "success" | "denied" | "failure";
  details?: Record<string, unknown>;
}

export async function writeAuditEvent({
  actorId = null,
  action,
  documentId = null,
  targetUserId = null,
  outcome = "success",
  details = {},
}: AuditEventParams): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Acquire PostgreSQL advisory transaction lock to serialize hash chaining
    await client.query("SELECT pg_advisory_xact_lock(742019, 1)");

    const previousResult = await client.query(
      `SELECT event_hash
       FROM audit_events
       ORDER BY id DESC
       LIMIT 1`
    );

    const previousHash: string | null =
      previousResult.rows[0]?.event_hash ?? null;

    const occurredAt = new Date().toISOString();
    const canonicalDetails = canonicalize(details);

    const eventData = {
      actorId,
      action,
      documentId,
      targetUserId,
      outcome,
      details: canonicalDetails,
      previousHash,
      occurredAt,
    };

    const eventHash = createHash("sha256")
      .update(JSON.stringify(eventData), "utf8")
      .digest("hex");

    await client.query(
      `INSERT INTO audit_events
        (actor_id, action, document_id, target_user_id,
         outcome, details, occurred_at, previous_hash, event_hash)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
      [
        actorId,
        action,
        documentId,
        targetUserId,
        outcome,
        JSON.stringify(canonicalDetails),
        occurredAt,
        previousHash,
        eventHash,
      ]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Audit event insert failed:", error);
  } finally {
    client.release();
  }
}

export interface VerificationCheck {
  id: number | string;
  previousEventId: number | string | null;
  linkValid: boolean;
  hashRecalculated: boolean;
  hashValid: boolean;
  hashError?: string;
}

export interface AuditVerificationResult {
  status: "ok" | "integrity_failed";
  totalEvents: number;
  linksValid: boolean;
  hashRecalculationImplemented: boolean;
  hashesValid: boolean;
  integrityValid: boolean;
  events: VerificationCheck[];
}

export async function verifyAuditChain(): Promise<AuditVerificationResult> {
  const result = await pool.query(
    `SELECT
       id,
       actor_id,
       action,
       document_id,
       target_user_id,
       outcome,
       details,
       occurred_at,
       previous_hash,
       event_hash
     FROM audit_events
     ORDER BY id ASC`
  );

  const events = result.rows;

  const checks: VerificationCheck[] = events.map((event, index) => {
    const previous = index > 0 ? events[index - 1] : null;
    const expectedPreviousHash = previous?.event_hash ?? null;
    const linkValid = event.previous_hash === expectedPreviousHash;

    let calculatedHash: string | null = null;
    let hashValid = false;
    let hashError: string | null = null;

    try {
      calculatedHash = calculateEventHash(event);
      hashValid = calculatedHash === event.event_hash;
    } catch {
      hashError = "Could not recalculate this event hash.";
    }

    return {
      id: event.id,
      previousEventId: previous?.id ?? null,
      linkValid,
      hashRecalculated: calculatedHash !== null,
      hashValid,
      ...(hashError ? { hashError } : {}),
    };
  });

  const linksValid = checks.length === 0 || checks.every((c) => c.linkValid);
  const hashesValid = checks.length === 0 || checks.every((c) => c.hashValid);

  return {
    status: linksValid && hashesValid ? "ok" : "integrity_failed",
    totalEvents: checks.length,
    linksValid,
    hashRecalculationImplemented: true,
    hashesValid,
    integrityValid: linksValid && hashesValid,
    events: checks,
  };
}
