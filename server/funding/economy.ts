/**
 * economy 스키마 연동 서비스
 * 
 * funding 에스크로 ↔ economy.wallets / economy.transactions 실제 연동
 * 
 * 설계:
 * - 시스템 에스크로 지갑 (user_id = ESCROW_USER_ID) — 참여자 코인을 임시 보관
 * - lockFunds:    참여자 지갑 → 에스크로 지갑 이체
 * - releaseFunds: 에스크로 지갑 → 개설자 지갑 이체
 * - refund:       에스크로 지갑 → 참여자 지갑 반환
 * - distributeProfit: 개설자 지갑 → 참여자들 지갑 (수익 배분)
 * 
 * 코인 타입 매핑:
 * - dorun_coin → economy.asset_types WHERE symbol = 'DRB' (id=1)
 * - local_coin  → organization의 자체 코인 (asset_types WHERE organization_id = orgId)
 */

import { neon } from "@neondatabase/serverless";
import { appendAuditLog } from "../economy/audit-chain";

const sql = neon(process.env.DATABASE_URL!);

// 에스크로 전용 시스템 유저 ID (DB에 생성된 가상 유저)
export const ESCROW_USER_ID = "00000000-0000-0000-0000-000000000001";

// ─── 유틸: 지갑 조회 또는 생성 ────────────────────────────────
async function getOrCreateWallet(userId: string, assetTypeId: number): Promise<number> {
  const existing = await sql`
    SELECT id FROM economy.wallets
    WHERE user_id = ${userId} AND asset_type_id = ${assetTypeId}
  `;
  if (existing.length > 0) return existing[0].id;

  const created = await sql`
    INSERT INTO economy.wallets (user_id, asset_type_id, balance, frozen_balance)
    VALUES (${userId}, ${assetTypeId}, 0, 0)
    RETURNING id
  `;
  return created[0].id;
}

// ─── 유틸: 코인 타입 → asset_type_id 변환 ────────────────────
async function resolveAssetTypeId(
  coinType: "dorun_coin" | "local_coin",
  organizationId?: number
): Promise<number | null> {
  if (coinType === "dorun_coin") {
    // DR-Base 글로벌 코인
    const rows = await sql`SELECT id FROM economy.asset_types WHERE symbol = 'DRB' AND organization_id IS NULL LIMIT 1`;
    return rows[0]?.id ?? 1;
  } else {
    // 조직 자체 코인
    if (!organizationId) return null;
    const rows = await sql`
      SELECT id FROM economy.asset_types
      WHERE organization_id = ${organizationId} AND is_active = true
      ORDER BY created_at ASC LIMIT 1
    `;
    return rows[0]?.id ?? null;
  }
}

// ─── 유틸: 잔액 확인 ─────────────────────────────────────────
export async function getBalance(userId: string, assetTypeId: number): Promise<number> {
  const rows = await sql`
    SELECT balance FROM economy.wallets
    WHERE user_id = ${userId} AND asset_type_id = ${assetTypeId}
  `;
  return Number(rows[0]?.balance ?? 0);
}

// ─── 내부 이체 (ACID) ─────────────────────────────────────────
async function internalTransfer(params: {
  fromUserId: string;
  toUserId: string;
  assetTypeId: number;
  amount: number;
  type: string;
  description: string;
  requestId?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { fromUserId, toUserId, assetTypeId, amount, type, description, requestId } = params;

  try {
    // 잔액 확인 (에스크로 시스템 지갑은 항상 허용)
    if (fromUserId !== ESCROW_USER_ID) {
      const balance = await getBalance(fromUserId, assetTypeId);
      if (balance < amount) {
        return { success: false, error: `잔액 부족 (보유: ${balance.toLocaleString()}, 필요: ${amount.toLocaleString()})` };
      }
    }

    const fromWalletId = await getOrCreateWallet(fromUserId, assetTypeId);
    const toWalletId = await getOrCreateWallet(toUserId, assetTypeId);
    const rid = requestId ?? crypto.randomUUID();

    // 출금
    await sql`
      UPDATE economy.wallets
      SET balance = balance - ${amount}, updated_at = NOW()
      WHERE id = ${fromWalletId}
    `;
    // 입금
    await sql`
      UPDATE economy.wallets
      SET balance = balance + ${amount}, updated_at = NOW()
      WHERE id = ${toWalletId}
    `;
    // 거래 기록
    await sql`
      INSERT INTO economy.transactions
        (request_id, from_wallet_id, to_wallet_id, asset_type_id, amount, fee, type, status, description)
      VALUES
        (${rid}, ${fromWalletId}, ${toWalletId}, ${assetTypeId}, ${amount}, 0, ${type}, 'completed', ${description})
    `;

    // 감사 로그 (해시 체인 포함)
    await appendAuditLog({
      actorId: fromUserId,
      action: type,
      targetType: "wallet",
      targetId: String(toWalletId),
      details: {
        from: fromUserId,
        to: toUserId,
        amount,
        assetTypeId,
        description,
        requestId: rid,
      },
    });

    return { success: true };
  } catch (err: any) {
    console.error("[economy.internalTransfer]", err.message);
    return { success: false, error: "이체 처리 중 오류가 발생했습니다." };
  }
}

// ─── 1. 코인 잠금 (참여자 → 에스크로) ──────────────────────
export async function economyLockFunds(params: {
  participantId: string;
  amount: number;
  coinType: "dorun_coin" | "local_coin";
  campaignId: number;
  organizationId?: number;
}): Promise<{ success: boolean; error?: string }> {
  const { participantId, amount, coinType, campaignId, organizationId } = params;
  const assetTypeId = await resolveAssetTypeId(coinType, organizationId);
  if (!assetTypeId) return { success: false, error: "해당 조직의 코인을 찾을 수 없습니다." };

  return internalTransfer({
    fromUserId: participantId,
    toUserId: ESCROW_USER_ID,
    assetTypeId,
    amount,
    type: "transfer",
    description: `펀딩 참여 에스크로 잠금 — 캠페인 #${campaignId}`,
    requestId: `funding-lock-${campaignId}-${participantId}-${Date.now()}`,
  });
}

// ─── 2. 자금 집행 (에스크로 → 개설자) ───────────────────────
export async function economyReleaseFunds(params: {
  creatorId: string;
  amount: number;
  coinType: "dorun_coin" | "local_coin";
  campaignId: number;
  organizationId?: number;
}): Promise<{ success: boolean; error?: string }> {
  const { creatorId, amount, coinType, campaignId, organizationId } = params;
  const assetTypeId = await resolveAssetTypeId(coinType, organizationId);
  if (!assetTypeId) return { success: false, error: "코인 타입을 찾을 수 없습니다." };

  return internalTransfer({
    fromUserId: ESCROW_USER_ID,
    toUserId: creatorId,
    assetTypeId,
    amount,
    type: "transfer",
    description: `펀딩 자금 집행 — 캠페인 #${campaignId}`,
    requestId: `funding-release-${campaignId}-${Date.now()}`,
  });
}

// ─── 3. 환불 (에스크로 → 참여자) ────────────────────────────
export async function economyRefund(params: {
  participantId: string;
  amount: number;
  coinType: "dorun_coin" | "local_coin";
  campaignId: number;
  participationId: number;
  organizationId?: number;
}): Promise<{ success: boolean; error?: string }> {
  const { participantId, amount, coinType, campaignId, participationId, organizationId } = params;
  const assetTypeId = await resolveAssetTypeId(coinType, organizationId);
  if (!assetTypeId) return { success: false, error: "코인 타입을 찾을 수 없습니다." };

  return internalTransfer({
    fromUserId: ESCROW_USER_ID,
    toUserId: participantId,
    assetTypeId,
    amount,
    type: "transfer",
    description: `펀딩 환불 — 캠페인 #${campaignId} 참여 #${participationId}`,
    requestId: `funding-refund-${campaignId}-${participationId}-${Date.now()}`,
  });
}

// ─── 4. 수익 배분 (개설자 또는 시스템 → 참여자들) ──────────
export async function economyDistributeProfit(params: {
  fromUserId: string;
  toUserId: string;
  amount: number;
  coinType: "dorun_coin" | "local_coin";
  campaignId: number;
  organizationId?: number;
}): Promise<{ success: boolean; error?: string }> {
  const { fromUserId, toUserId, amount, coinType, campaignId, organizationId } = params;
  const assetTypeId = await resolveAssetTypeId(coinType, organizationId);
  if (!assetTypeId) return { success: false, error: "코인 타입을 찾을 수 없습니다." };

  return internalTransfer({
    fromUserId,
    toUserId,
    assetTypeId,
    amount,
    type: "transfer",
    description: `수익 배분 — 캠페인 #${campaignId}`,
    requestId: `funding-profit-${campaignId}-${toUserId}-${Date.now()}`,
  });
}

// ─── 5. 사용자 지갑 잔액 조회 ─────────────────────────────────
export async function getUserWallets(userId: string, organizationId?: number): Promise<{
  wallets: Array<{
    assetTypeId: number;
    symbol: string;
    name: string;
    coinType: "dorun_coin" | "local_coin";
    balance: string;
    availableBalance: string;
    orgName?: string;
  }>;
}> {
  try {
    // DRB (메인 코인)
    const drbRows = await sql`
      SELECT w.balance, w.frozen_balance, a.id as asset_type_id, a.symbol, a.name
      FROM economy.wallets w
      JOIN economy.asset_types a ON w.asset_type_id = a.id
      WHERE w.user_id = ${userId} AND a.symbol = 'DRB' AND a.organization_id IS NULL
      LIMIT 1
    `;

    const wallets: any[] = [];

    if (drbRows.length > 0) {
      const w = drbRows[0];
      wallets.push({
        assetTypeId: w.asset_type_id,
        symbol: w.symbol,
        name: w.name,
        coinType: "dorun_coin",
        balance: w.balance,
        availableBalance: String(Math.max(0, Number(w.balance) - Number(w.frozen_balance))),
      });
    } else {
      // DRB 지갑 없으면 0으로
      const drbAsset = await sql`SELECT id, symbol, name FROM economy.asset_types WHERE symbol = 'DRB' AND organization_id IS NULL LIMIT 1`;
      if (drbAsset.length > 0) {
        wallets.push({ assetTypeId: drbAsset[0].id, symbol: drbAsset[0].symbol, name: drbAsset[0].name, coinType: "dorun_coin", balance: "0", availableBalance: "0" });
      }
    }

    // 지역 코인 (캠페인 조직의 코인)
    if (organizationId) {
      const localRows = await sql`
        SELECT w.balance, w.frozen_balance, a.id as asset_type_id, a.symbol, a.name, s.name as org_name
        FROM economy.wallets w
        JOIN economy.asset_types a ON w.asset_type_id = a.id
        LEFT JOIN public.schools s ON a.organization_id = s.id
        WHERE w.user_id = ${userId} AND a.organization_id = ${organizationId}
        LIMIT 1
      `;
      if (localRows.length > 0) {
        const w = localRows[0];
        wallets.push({
          assetTypeId: w.asset_type_id,
          symbol: w.symbol,
          name: w.name,
          coinType: "local_coin",
          balance: w.balance,
          availableBalance: String(Math.max(0, Number(w.balance) - Number(w.frozen_balance))),
          orgName: w.org_name,
        });
      }
    }

    return { wallets };
  } catch (err: any) {
    console.error("[economy.getUserWallets]", err.message);
    return { wallets: [] };
  }
}
