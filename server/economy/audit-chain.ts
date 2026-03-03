/**
 * 불변 감사 로그 해시 체인 (Immutable Audit Trail)
 * 
 * 구조:
 *   entry_hash = SHA-256( id | actor_id | action | target_id | details | created_at | prev_hash )
 *   prev_hash  = 이전 행의 entry_hash (첫 행은 "GENESIS")
 * 
 * 이렇게 하면:
 *   - 과거 로그 1건이라도 수정되면 이후 모든 해시가 연쇄적으로 불일치
 *   - DB 권한자가 조작해도 해시 체인으로 발각됨
 * 
 * 제공 기능:
 *   appendAuditLog()   — 로그 추가 (해시 자동 계산)
 *   verifyChain()      — 전체 체인 무결성 검증
 *   getChainTip()      — 최신 해시 (온체인 앵커링용)
 */

import { createHash } from "crypto";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// ─── 해시 계산 ────────────────────────────────────────────────
function computeEntryHash(row: {
  id: number;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: any;
  created_at: string;
  prev_hash: string;
}): string {
  const payload = [
    String(row.id),
    row.actor_id ?? "",
    row.action,
    row.target_type ?? "",
    row.target_id ?? "",
    JSON.stringify(row.details ?? {}),
    row.created_at,
    row.prev_hash,
  ].join("|");

  return createHash("sha256").update(payload, "utf8").digest("hex");
}

// ─── 로그 추가 (해시 체인 포함) ──────────────────────────────
export async function appendAuditLog(params: {
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, any>;
}): Promise<void> {
  const { actorId, action, targetType, targetId, ipAddress, userAgent, details } = params;

  try {
    // 직전 행의 해시 조회 (체인 연결)
    const prev = await sql`
      SELECT entry_hash FROM economy.audit_logs
      WHERE entry_hash IS NOT NULL
      ORDER BY id DESC LIMIT 1
    `;
    const prevHash = prev[0]?.entry_hash ?? "GENESIS";

    // 로그 삽입 (entry_hash 없이 먼저 — id 확보)
    const inserted = await sql`
      INSERT INTO economy.audit_logs
        (actor_id, action, target_type, target_id, ip_address, user_agent, details, prev_hash)
      VALUES
        (${actorId ?? null}, ${action}, ${targetType ?? null}, ${targetId ?? null},
         ${ipAddress ?? null}, ${userAgent ?? null}, ${JSON.stringify(details ?? {})}, ${prevHash})
      RETURNING id, actor_id, action, target_type, target_id, details, created_at, prev_hash
    `;
    const row = inserted[0];

    // entry_hash 계산 후 업데이트
    const entryHash = computeEntryHash({
      id: row.id as number,
      actor_id: row.actor_id as string | null,
      action: row.action as string,
      target_type: row.target_type as string | null,
      target_id: row.target_id as string | null,
      details: row.details,
      created_at: row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
      prev_hash: prevHash,
    });

    await sql`
      UPDATE economy.audit_logs SET entry_hash = ${entryHash} WHERE id = ${row.id}
    `;
  } catch (err) {
    // 감사 로그 실패는 메인 흐름을 막지 않음 — 에러 로그만
    console.error("[audit-chain] appendAuditLog 실패:", err);
  }
}

// ─── 체인 무결성 전체 검증 ────────────────────────────────────
export async function verifyChain(): Promise<{
  valid: boolean;
  totalRows: number;
  firstInvalidId?: number;
  checkedAt: string;
}> {
  const rows = await sql`
    SELECT id, actor_id, action, target_type, target_id, details, created_at, prev_hash, entry_hash
    FROM economy.audit_logs
    WHERE entry_hash IS NOT NULL
    ORDER BY id ASC
  `;

  let prevHash = "GENESIS";
  for (const row of rows) {
    // 이전 체인과 연결 확인
    if (row.prev_hash !== prevHash) {
      console.error(`[audit-chain] prev_hash 불일치: row #${row.id}`);
      return { valid: false, totalRows: rows.length, firstInvalidId: row.id, checkedAt: new Date().toISOString() };
    }

    // entry_hash 재계산 비교
    const expected = computeEntryHash({
      id: row.id,
      actor_id: row.actor_id,
      action: row.action,
      target_type: row.target_type,
      target_id: row.target_id,
      details: row.details,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      prev_hash: row.prev_hash,
    });

    if (expected !== row.entry_hash) {
      console.error(`[audit-chain] entry_hash 불일치: row #${row.id}`);
      return { valid: false, totalRows: rows.length, firstInvalidId: row.id, checkedAt: new Date().toISOString() };
    }

    prevHash = row.entry_hash;
  }

  return { valid: true, totalRows: rows.length, checkedAt: new Date().toISOString() };
}

// ─── 체인 최신 해시 (온체인 앵커링용) ────────────────────────
export async function getChainTip(): Promise<{ hash: string; rowCount: number; asOf: string } | null> {
  const tip = await sql`
    SELECT entry_hash, id FROM economy.audit_logs
    WHERE entry_hash IS NOT NULL ORDER BY id DESC LIMIT 1
  `;
  if (!tip[0]) return null;
  const count = await sql`SELECT COUNT(*) as n FROM economy.audit_logs WHERE entry_hash IS NOT NULL`;
  return {
    hash: tip[0].entry_hash,
    rowCount: Number(count[0].n),
    asOf: new Date().toISOString(),
  };
}

// ─── 기존 로그 해시 백필 (최초 1회) ─────────────────────────
export async function backfillHashes(): Promise<void> {
  const rows = await sql`
    SELECT id, actor_id, action, target_type, target_id, details, created_at
    FROM economy.audit_logs
    WHERE entry_hash IS NULL
    ORDER BY id ASC
  `;
  if (rows.length === 0) return;
  console.log(`[audit-chain] 백필 시작: ${rows.length}개 행`);

  // 첫 번째 이전 해시: 기존에 해시된 가장 마지막 행
  const lastHashed = await sql`
    SELECT entry_hash FROM economy.audit_logs
    WHERE entry_hash IS NOT NULL ORDER BY id DESC LIMIT 1
  `;
  let prevHash = lastHashed[0]?.entry_hash ?? "GENESIS";

  for (const row of rows) {
    const entryHash = computeEntryHash({
      id: row.id,
      actor_id: row.actor_id,
      action: row.action,
      target_type: row.target_type,
      target_id: row.target_id,
      details: row.details,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      prev_hash: prevHash,
    });
    await sql`
      UPDATE economy.audit_logs
      SET prev_hash = ${prevHash}, entry_hash = ${entryHash}
      WHERE id = ${row.id}
    `;
    prevHash = entryHash;
  }
  console.log(`[audit-chain] 백필 완료: ${rows.length}개`);
}
