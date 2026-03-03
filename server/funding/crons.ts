/**
 * 펀딩 자동화 크론 모듈
 * - 4-1: 기간 만료 캠페인 자동 환불
 * - 4-4: 업데이트 의무화 경고 (2주 미업데이트 → 경고, 3회 → 관리자 알림)
 * 
 * server/routes.ts registerRoutes 마지막에서 startFundingCrons() 호출
 */

import { db } from "../db";
import { campaigns, creatorProfiles } from "@shared/models/funding";
import { eq, and, inArray, sql } from "drizzle-orm";
import { refundAll } from "./escrow";

// ─── 4-1: 기간 만료 자동 처리 ────────────────────────────────
export async function processExpiredCampaigns(): Promise<void> {
  try {
    const now = new Date().toISOString();

    // 기간 종료 + active 상태 캠페인 조회
    const expired = await db.execute(sql`
      SELECT id, current_amount, target_amount, title, creator_id
      FROM funding.campaigns
      WHERE status = 'active' AND end_date < ${now}
    `);

    const rows = (expired as any).rows ?? [];
    if (rows.length === 0) return;

    console.log(`[funding-cron] 만료 캠페인 ${rows.length}개 처리 중...`);

    for (const row of rows) {
      if (Number(row.current_amount) >= Number(row.target_amount)) {
        // 이미 달성 — success 전환 (안전망)
        await db.execute(sql`
          UPDATE funding.campaigns SET status = 'success', updated_at = NOW() WHERE id = ${row.id}
        `);
        console.log(`[funding-cron] 달성 처리: #${row.id} "${row.title}"`);
      } else {
        // 미달 → 자동 전액 환불
        await refundAll(row.id);
        console.log(`[funding-cron] 환불 처리: #${row.id} "${row.title}" (${row.current_amount}/${row.target_amount})`);

        // 개설자 failed 카운트 증가
        await db.execute(sql`
          UPDATE funding.creator_profiles
          SET failed_campaigns = failed_campaigns + 1, updated_at = NOW()
          WHERE user_id = ${row.creator_id}
        `);
      }
    }
  } catch (err) {
    console.error("[funding-cron] processExpiredCampaigns 오류:", err);
  }
}

// ─── 4-4: 업데이트 의무화 경고 ───────────────────────────────
export async function checkUpdateWarnings(): Promise<void> {
  try {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    // 2주 이상 업데이트 없는 active/success 캠페인에 경고 누적
    await db.execute(sql`
      UPDATE funding.campaigns
      SET update_warnings = update_warnings + 1, updated_at = NOW()
      WHERE status IN ('active', 'success')
        AND (last_update_at IS NULL OR last_update_at < ${twoWeeksAgo})
        AND created_at < ${twoWeeksAgo}
    `);

    // 경고 3회 이상 캠페인 — 관리자 알림 대상
    const warned = await db.execute(sql`
      SELECT id, title, creator_id, update_warnings, current_amount, target_amount
      FROM funding.campaigns
      WHERE update_warnings >= 3
        AND status NOT IN ('refunding', 'failed', 'completed', 'draft', 'pending')
      ORDER BY update_warnings DESC
    `);

    const warnedRows = (warned as any).rows ?? [];
    if (warnedRows.length > 0) {
      console.warn(`[funding-cron] 업데이트 경고 3회+ 캠페인 ${warnedRows.length}개:`);
      for (const row of warnedRows) {
        console.warn(`  - #${row.id} "${row.title}" (경고 ${row.update_warnings}회)`);
        // 관리자 WebSocket 알림 발송
        const broadcastAdminAlert = (global as any).broadcastAdminAlert;
        if (broadcastAdminAlert) {
          broadcastAdminAlert({
            type: "funding_warning",
            campaignId: row.id,
            title: row.title,
            message: `캠페인 "${row.title}" 업데이트 경고 ${row.update_warnings}회 — 강제 환불 조치가 필요할 수 있습니다.`,
            severity: row.update_warnings >= 5 ? "error" : "warning",
          });
        }
      }
    }
  } catch (err) {
    console.error("[funding-cron] checkUpdateWarnings 오류:", err);
  }
}

// ─── 4-3: 신뢰 등급 일괄 재계산 ─────────────────────────────
// 완료된 캠페인 기반으로 개설자 완료율 + 신뢰 뱃지 업데이트
export async function recalculateTrustBadges(): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE funding.creator_profiles cp
      SET
        completed_campaigns = (
          SELECT COUNT(*) FROM funding.campaigns
          WHERE creator_id = cp.user_id AND status = 'completed'
        ),
        total_campaigns = (
          SELECT COUNT(*) FROM funding.campaigns
          WHERE creator_id = cp.user_id AND status NOT IN ('draft', 'pending')
        ),
        failed_campaigns = (
          SELECT COUNT(*) FROM funding.campaigns
          WHERE creator_id = cp.user_id AND status = 'failed'
        ),
        trust_badge = LEAST(5, GREATEST(0,
          CASE
            WHEN (SELECT COUNT(*) FROM funding.campaigns WHERE creator_id = cp.user_id AND status NOT IN ('draft','pending')) = 0
              THEN 0
            ELSE FLOOR(
              (SELECT COUNT(*) FROM funding.campaigns WHERE creator_id = cp.user_id AND status = 'completed')::FLOAT
              / NULLIF((SELECT COUNT(*) FROM funding.campaigns WHERE creator_id = cp.user_id AND status NOT IN ('draft','pending')), 0)
              * 4
              + LEAST(1, cp.average_rating / 5.0)
            )
          END
        )),
        updated_at = NOW()
    `);
    console.log("[funding-cron] 신뢰 등급 재계산 완료");
  } catch (err) {
    console.error("[funding-cron] recalculateTrustBadges 오류:", err);
  }
}

// ─── 크론 시작 ────────────────────────────────────────────────
export function startFundingCrons(): void {
  // 1시간마다: 만료 캠페인 자동 처리
  setInterval(processExpiredCampaigns, 60 * 60 * 1000);
  // 1일마다: 업데이트 경고 체크
  setInterval(checkUpdateWarnings, 24 * 60 * 60 * 1000);
  // 1일마다: 신뢰 등급 재계산
  setInterval(recalculateTrustBadges, 24 * 60 * 60 * 1000);

  // 서버 시작 시 즉시 1회 실행
  processExpiredCampaigns();

  console.log("✅ Funding crons initialized (expired: 1h, warnings: 24h, trust: 24h)");
}
