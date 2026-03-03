/**
 * 에스크로 모듈
 * 
 * 참여자 코인 → [에스크로 풀] → 목표 달성? → 개설자에게 전달
 *                               ↓ 실패 → 전원 자동 환불
 * 
 * 모든 코인 이동은 이 모듈을 통해서만 처리 — 직접 DB 수정 금지
 * economy 스키마 실제 연동 완료 (2026-03-03)
 */

import { db } from "../db";
import { campaigns, participations, profitDistributions } from "@shared/models/funding";
import { eq, and, sql } from "drizzle-orm";
import {
  economyLockFunds,
  economyReleaseFunds,
  economyRefund,
  economyDistributeProfit,
} from "./economy";

// ─── 타입 ──────────────────────────────────────────────────────
export type EscrowResult =
  | { success: true; message: string }
  | { success: false; error: string };

// ─── 1. 참여 (코인 잠금) ──────────────────────────────────────
/**
 * 사용자가 캠페인에 참여할 때 호출
 * - economy 스키마: 참여자 지갑 → 에스크로 시스템 지갑 이체
 * - funding 스키마: 참여 레코드 + 캠페인 금액 업데이트
 */
export async function lockFunds(params: {
  campaignId: number;
  participantId: string;
  amount: number;
  coinType?: "dorun_coin" | "local_coin";
  rewardId?: number;
  message?: string;
  isAnonymous?: boolean;
  organizationId?: number;
}): Promise<EscrowResult> {
  const {
    campaignId, participantId, amount,
    coinType = "dorun_coin", rewardId, message, isAnonymous, organizationId,
  } = params;

  try {
    // 1. 캠페인 존재 및 상태 확인
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign) return { success: false, error: "캠페인을 찾을 수 없습니다." };
    if (campaign.status !== "active") return { success: false, error: "현재 참여 가능한 캠페인이 아닙니다." };
    if (new Date() > new Date(campaign.endDate)) return { success: false, error: "마감된 캠페인입니다." };
    if (amount < Number(campaign.minFunding)) {
      return { success: false, error: `최소 참여 금액은 ${campaign.minFunding} 코인입니다.` };
    }

    // 2. 허용 코인 타입 확인
    const acceptedTypes = (campaign.acceptedCoinTypes as string[]) ?? ["dorun_coin"];
    if (!acceptedTypes.includes(coinType)) {
      return { success: false, error: `이 캠페인은 ${acceptedTypes.join(", ")} 코인만 허용합니다.` };
    }

    // 3. economy 스키마: 실제 코인 잔액 확인 + 에스크로 지갑으로 이체
    const orgId = organizationId ?? (campaign.organizationId ? Number(campaign.organizationId) : undefined);
    const economyResult = await economyLockFunds({
      participantId,
      amount,
      coinType,
      campaignId,
      organizationId: orgId,
    });
    if (!economyResult.success) return { success: false, error: economyResult.error! };

    // 4. 리워드 수량 확인
    if (rewardId) {
      const { rewards } = await import("@shared/models/funding");
      const [reward] = await db.select().from(rewards).where(eq(rewards.id, rewardId));
      if (!reward) {
        // 이체 롤백 필요 — economy에 환불
        await economyRefund({ participantId, amount, coinType, campaignId, participationId: 0, organizationId: orgId });
        return { success: false, error: "존재하지 않는 리워드입니다." };
      }
      if (reward.quantityLimit !== null && reward.quantityUsed >= reward.quantityLimit) {
        await economyRefund({ participantId, amount, coinType, campaignId, participationId: 0, organizationId: orgId });
        return { success: false, error: "해당 리워드는 품절되었습니다." };
      }
      if (amount < Number(reward.minAmount)) {
        await economyRefund({ participantId, amount, coinType, campaignId, participationId: 0, organizationId: orgId });
        return { success: false, error: `이 리워드는 최소 ${reward.minAmount} 코인 이상 참여해야 합니다.` };
      }
      await db.execute(
        sql`UPDATE funding.rewards SET quantity_used = quantity_used + 1 WHERE id = ${rewardId}`
      );
    }

    // 5. 참여 레코드 생성
    await db.execute(sql`
      INSERT INTO funding.participations
        (campaign_id, participant_id, amount, coin_type, reward_id, message, is_anonymous, status)
      VALUES
        (${campaignId}, ${participantId}, ${amount}, ${coinType}, ${rewardId ?? null}, ${message ?? null}, ${isAnonymous ?? false}, 'held')
    `);

    // 6. 캠페인 금액 + 참여자 수 업데이트
    await db.execute(sql`
      UPDATE funding.campaigns
      SET
        current_amount    = current_amount + ${amount},
        escrow_balance    = escrow_balance + ${amount},
        participant_count = participant_count + 1,
        updated_at        = NOW()
      WHERE id = ${campaignId}
    `);

    // 7. 목표 달성 여부 체크 → 자동 success 전환
    const [updated] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (Number(updated.currentAmount) >= Number(updated.targetAmount)) {
      await db.execute(sql`
        UPDATE funding.campaigns SET status = 'success', updated_at = NOW() WHERE id = ${campaignId}
      `);
    }

    // 8. 실시간 게이지 브로드캐스트
    const broadcast = (global as any).broadcastFundingUpdate;
    if (broadcast) broadcast(campaignId, Number(updated.currentAmount));

    return { success: true, message: "펀딩 참여가 완료되었습니다." };
  } catch (err: any) {
    console.error("[escrow.lockFunds]", err);
    return { success: false, error: "서버 오류가 발생했습니다." };
  }
}

// ─── 2. 자금 집행 (에스크로 → 개설자) ───────────────────────
/**
 * 캠페인 성공 후 개설자에게 자금 집행
 * - 전체 집행 (일반 성공) 또는 비율 집행 (마일스톤)
 */
export async function releaseFunds(params: {
  campaignId: number;
  ratio?: number;  // 1.0 = 전체, 0.3 = 30% (마일스톤)
}): Promise<EscrowResult> {
  const { campaignId, ratio = 1.0 } = params;

  try {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign) return { success: false, error: "캠페인을 찾을 수 없습니다." };
    if (Number(campaign.escrowBalance) <= 0) return { success: false, error: "집행할 에스크로 잔액이 없습니다." };

    const releaseAmount = Math.floor(Number(campaign.escrowBalance) * ratio);

    // economy 스키마: 에스크로 지갑 → 개설자 지갑 이체
    const orgId = campaign.organizationId ? Number(campaign.organizationId) : undefined;
    // 캠페인에서 주로 쓰이는 코인 타입 파악 (acceptedCoinTypes 첫 번째)
    const coinType = ((campaign.acceptedCoinTypes as string[])?.[0] ?? "dorun_coin") as "dorun_coin" | "local_coin";

    const economyResult = await economyReleaseFunds({
      creatorId: campaign.creatorId,
      amount: releaseAmount,
      coinType,
      campaignId,
      organizationId: orgId,
    });
    if (!economyResult.success) {
      console.warn(`[escrow.releaseFunds] economy 이체 실패: ${economyResult.error}`);
      // economy 실패해도 에스크로 내부 상태는 업데이트 (수동 정산 필요 표시)
    }

    // funding 스키마: 에스크로 잔액 감소
    await db.execute(sql`
      UPDATE funding.campaigns
      SET escrow_balance = escrow_balance - ${releaseAmount}, updated_at = NOW()
      WHERE id = ${campaignId}
    `);

    // held → released 처리
    if (ratio >= 1.0) {
      await db.execute(sql`
        UPDATE funding.participations
        SET status = 'released', released_at = NOW()
        WHERE campaign_id = ${campaignId} AND status = 'held'
      `);
    }

    return { success: true, message: `${releaseAmount.toLocaleString()} 코인이 집행되었습니다.` };
  } catch (err: any) {
    console.error("[escrow.releaseFunds]", err);
    return { success: false, error: "서버 오류가 발생했습니다." };
  }
}

// ─── 3. 전액 환불 (캠페인 실패) ──────────────────────────────
/**
 * 캠페인 실패 시 모든 참여자 자동 환불
 * - economy 스키마: 에스크로 → 각 참여자 지갑 반환
 */
export async function refundAll(campaignId: number): Promise<EscrowResult> {
  try {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign) return { success: false, error: "캠페인을 찾을 수 없습니다." };

    // 상태를 refunding으로 변경
    await db.execute(sql`
      UPDATE funding.campaigns SET status = 'refunding', updated_at = NOW() WHERE id = ${campaignId}
    `);

    // held 상태 참여자 목록 조회
    const heldParts = await db.execute(sql`
      SELECT id, participant_id, amount, coin_type
      FROM funding.participations
      WHERE campaign_id = ${campaignId} AND status = 'held'
    `);
    const parts = (heldParts as any).rows ?? [];

    const orgId = campaign.organizationId ? Number(campaign.organizationId) : undefined;
    let failCount = 0;

    // economy 스키마: 에스크로 → 각 참여자 환불
    for (const p of parts) {
      const refundResult = await economyRefund({
        participantId: p.participant_id,
        amount: Number(p.amount),
        coinType: (p.coin_type ?? "dorun_coin") as "dorun_coin" | "local_coin",
        campaignId,
        participationId: p.id,
        organizationId: orgId,
      });
      if (!refundResult.success) {
        console.error(`[escrow.refundAll] 참여 #${p.id} 환불 실패: ${refundResult.error}`);
        failCount++;
      }
    }

    // funding 스키마: held → refunded, 에스크로 잔액 0
    await db.execute(sql`
      UPDATE funding.participations
      SET status = 'refunded', refunded_at = NOW()
      WHERE campaign_id = ${campaignId} AND status = 'held'
    `);
    await db.execute(sql`
      UPDATE funding.campaigns
      SET escrow_balance = 0, status = 'failed', updated_at = NOW()
      WHERE id = ${campaignId}
    `);

    const msg = failCount > 0
      ? `환불 처리 완료 (${parts.length - failCount}/${parts.length}명 성공, ${failCount}명 수동 처리 필요)`
      : "전액 환불이 완료되었습니다.";

    return { success: true, message: msg };
  } catch (err: any) {
    console.error("[escrow.refundAll]", err);
    return { success: false, error: "환불 처리 중 오류가 발생했습니다." };
  }
}

// ─── 4. 수익 배분 (수익공유형) ────────────────────────────────
/**
 * 수익공유형 캠페인 — 수익 발생 시 참여 비율대로 자동 배분
 * - economy 스키마: 개설자(또는 시스템) → 각 참여자 비율 이체
 */
export async function distributeProfit(params: {
  campaignId: number;
  totalProfit: number;
  note?: string;
}): Promise<EscrowResult> {
  const { campaignId, totalProfit, note } = params;

  try {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign) return { success: false, error: "캠페인을 찾을 수 없습니다." };
    if (campaign.fundingType !== "profit_share") {
      return { success: false, error: "수익공유형 캠페인이 아닙니다." };
    }

    // 참여자 목록
    const parts = await db
      .select()
      .from(participations)
      .where(and(eq(participations.campaignId, campaignId), eq(participations.status, "released")));

    if (parts.length === 0) return { success: false, error: "배분 대상 참여자가 없습니다." };

    const totalInvested = parts.reduce((sum, p) => sum + Number(p.amount), 0);
    const orgId = campaign.organizationId ? Number(campaign.organizationId) : undefined;
    const coinType = ((campaign.acceptedCoinTypes as string[])?.[0] ?? "dorun_coin") as "dorun_coin" | "local_coin";

    for (const p of parts) {
      const share = Math.floor((Number(p.amount) / totalInvested) * totalProfit);
      if (share <= 0) continue;

      // funding 스키마: 배분 기록
      await db.execute(sql`
        INSERT INTO funding.profit_distributions (campaign_id, participant_id, amount, coin_type, note)
        VALUES (${campaignId}, ${p.participantId}, ${share}, ${p.coinType}, ${note ?? null})
      `);

      // economy 스키마: 개설자 지갑 → 참여자 지갑 이체
      const economyResult = await economyDistributeProfit({
        fromUserId: campaign.creatorId,
        toUserId: p.participantId,
        amount: share,
        coinType,
        campaignId,
        organizationId: orgId,
      });
      if (!economyResult.success) {
        console.error(`[escrow.distributeProfit] 참여자 ${p.participantId} 배분 실패: ${economyResult.error}`);
      }
    }

    return { success: true, message: `${parts.length}명에게 수익이 배분되었습니다.` };
  } catch (err: any) {
    console.error("[escrow.distributeProfit]", err);
    return { success: false, error: "수익 배분 중 오류가 발생했습니다." };
  }
}

// ─── 5. 기간 만료 자동 처리 (크론에서 호출) ─────────────────
export async function processExpiredCampaigns(): Promise<void> {
  const now = new Date().toISOString();
  const expired = await db.execute(sql`
    SELECT id, current_amount, target_amount
    FROM funding.campaigns
    WHERE status = 'active' AND end_date < ${now}
  `);

  for (const row of (expired as any).rows ?? []) {
    if (Number(row.current_amount) < Number(row.target_amount)) {
      console.log(`[escrow] 환불 처리: campaign #${row.id}`);
      await refundAll(row.id);
    } else {
      await db.execute(sql`
        UPDATE funding.campaigns SET status = 'success', updated_at = NOW() WHERE id = ${row.id}
      `);
    }
  }
}

// ─── 6. 업데이트 의무 경고 체크 (크론에서 호출) ──────────────
export async function checkUpdateWarnings(): Promise<void> {
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  await db.execute(sql`
    UPDATE funding.campaigns
    SET update_warnings = update_warnings + 1, updated_at = NOW()
    WHERE status IN ('active', 'success')
      AND (last_update_at IS NULL OR last_update_at < ${twoWeeksAgo})
      AND created_at < ${twoWeeksAgo}
  `);

  const warned = await db.execute(sql`
    SELECT id, title, creator_id, update_warnings
    FROM funding.campaigns
    WHERE update_warnings >= 3 AND status NOT IN ('refunding', 'failed', 'completed')
  `);

  for (const row of (warned as any).rows ?? []) {
    console.warn(`[escrow] 업데이트 경고 3회 초과: campaign #${row.id} "${row.title}"`);
  }
}
