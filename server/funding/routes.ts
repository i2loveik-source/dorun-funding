/**
 * 펀딩 캠페인 CRUD API (Phase 3 업데이트)
 */

import { Router, Request, Response } from "express";
import { db } from "../db";
import {
  campaigns, rewards, participations, milestones, milestoneVotes,
  campaignUpdates, creatorProfiles, campaignReviews,
  insertCampaignSchema,
} from "@shared/models/funding";
import { users, userOrganizations } from "@shared/schema";
import { eq, and, desc, sql, inArray, ne } from "drizzle-orm";
import { lockFunds, releaseFunds, refundAll, distributeProfit } from "./escrow";
import { getUserWallets } from "./economy";

const router = Router();

function requireAuth(req: Request, res: Response): string | null {
  const user = (req as any).user;
  if (!user?.id) { res.status(401).json({ error: "로그인이 필요합니다." }); return null; }
  return user.id;
}

// ─── 캠페인 목록 ──────────────────────────────────────────────
router.get("/campaigns", async (req, res) => {
  try {
    const { status, category, type, orgId, visibility, limit = "20", offset = "0" } = req.query;
    const conditions: any[] = [];
    if (status)     conditions.push(eq(campaigns.status, status as any));
    if (category)   conditions.push(eq(campaigns.category, category as any));
    if (type)       conditions.push(eq(campaigns.fundingType, type as any));
    if (orgId)      conditions.push(eq(campaigns.organizationId, Number(orgId)));
    if (visibility) conditions.push(eq(campaigns.visibility, visibility as any));

    const rows = await db.select().from(campaigns)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(campaigns.createdAt))
      .limit(Number(limit)).offset(Number(offset));

    res.json({ campaigns: rows, total: rows.length });
  } catch (err) { console.error(err); res.status(500).json({ error: "서버 오류" }); }
});

// ─── 내 목록 (참여 + 개설) ────────────────────────────────────
router.get("/my", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const created = await db.select().from(campaigns)
      .where(eq(campaigns.creatorId, userId)).orderBy(desc(campaigns.createdAt));

    const myParticipations = await db.select().from(participations)
      .where(eq(participations.participantId, userId)).orderBy(desc(participations.participatedAt));

    const participatedIds = [...new Set(myParticipations.map(p => p.campaignId))];
    const participated = participatedIds.length > 0
      ? await db.select().from(campaigns).where(inArray(campaigns.id, participatedIds))
      : [];

    res.json({ created, participated, participations: myParticipations });
  } catch (err) { console.error(err); res.status(500).json({ error: "서버 오류" }); }
});

// ─── 관리자 승인 대기 목록 ────────────────────────────────────
router.get("/admin/pending", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const { orgId } = req.query;
    const conditions: any[] = [eq(campaigns.status, "pending")];
    if (orgId) conditions.push(eq(campaigns.organizationId, Number(orgId)));
    const rows = await db.select().from(campaigns).where(and(...conditions)).orderBy(campaigns.createdAt);
    res.json({ campaigns: rows });
  } catch (err) { console.error(err); res.status(500).json({ error: "서버 오류" }); }
});

// ─── 캠페인 상세 ──────────────────────────────────────────────
router.get("/campaigns/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!campaign) return res.status(404).json({ error: "캠페인을 찾을 수 없습니다." });

    const rewardList    = await db.select().from(rewards).where(eq(rewards.campaignId, id));
    const milestoneList = await db.select().from(milestones).where(eq(milestones.campaignId, id)).orderBy(milestones.stepNumber);
    const updateList    = await db.select().from(campaignUpdates).where(eq(campaignUpdates.campaignId, id)).orderBy(desc(campaignUpdates.createdAt));
    const reviewList    = await db.select().from(campaignReviews).where(eq(campaignReviews.campaignId, id)).orderBy(desc(campaignReviews.createdAt)).limit(10);
    const [creatorProfile] = await db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, campaign.creatorId));

    res.json({ campaign, rewards: rewardList, milestones: milestoneList, updates: updateList, reviews: reviewList, creatorProfile });
  } catch (err) { console.error(err); res.status(500).json({ error: "서버 오류" }); }
});

// ─── 캠페인 개설 ──────────────────────────────────────────────
router.post("/campaigns", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const parsed = insertCampaignSchema.safeParse({ ...req.body, creatorId: userId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { rewards: rewardData, milestones: milestoneData, ...campaignData } = parsed.data as any;
    const [created] = await db.insert(campaigns).values(campaignData).returning();

    if (rewardData?.length) {
      await db.insert(rewards).values(rewardData.map((r: any) => ({ ...r, campaignId: created.id })));
    }
    if (milestoneData?.length && created.fundingType === "milestone") {
      await db.insert(milestones).values(milestoneData.map((m: any, i: number) => ({ ...m, campaignId: created.id, stepNumber: i + 1 })));
    }

    await db.execute(sql`
      INSERT INTO funding.creator_profiles (user_id) VALUES (${userId})
      ON CONFLICT (user_id) DO NOTHING
    `);
    await db.execute(sql`
      UPDATE funding.creator_profiles SET total_campaigns = total_campaigns + 1, updated_at = NOW() WHERE user_id = ${userId}
    `);

    res.status(201).json({ campaign: created });
  } catch (err) { console.error(err); res.status(500).json({ error: "서버 오류" }); }
});

// ─── 캠페인 수정 ──────────────────────────────────────────────
router.patch("/campaigns/:id", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = Number(req.params.id);
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!campaign) return res.status(404).json({ error: "캠페인을 찾을 수 없습니다." });
    if (campaign.creatorId !== userId) return res.status(403).json({ error: "권한이 없습니다." });
    if (campaign.status !== "draft") return res.status(400).json({ error: "draft 상태에서만 수정 가능합니다." });

    const [updated] = await db.update(campaigns).set({ ...req.body, updatedAt: new Date() }).where(eq(campaigns.id, id)).returning();
    res.json({ campaign: updated });
  } catch (err) { console.error(err); res.status(500).json({ error: "서버 오류" }); }
});

// ─── 승인 요청 ────────────────────────────────────────────────
router.post("/campaigns/:id/submit", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = Number(req.params.id);
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!campaign) return res.status(404).json({ error: "캠페인을 찾을 수 없습니다." });
    if (campaign.creatorId !== userId) return res.status(403).json({ error: "권한이 없습니다." });
    if (campaign.status !== "draft") return res.status(400).json({ error: "draft 상태에서만 승인 요청 가능합니다." });

    const [updated] = await db.update(campaigns).set({ status: "pending", updatedAt: new Date() }).where(eq(campaigns.id, id)).returning();
    res.json({ campaign: updated, message: "승인 요청이 완료되었습니다." });
  } catch (err) { console.error(err); res.status(500).json({ error: "서버 오류" }); }
});

// ─── 승인 (관리자) ────────────────────────────────────────────
router.post("/campaigns/:id/approve", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = Number(req.params.id);
    const [updated] = await db.update(campaigns)
      .set({ status: "active", approvedBy: userId, approvedAt: new Date(), startDate: new Date(), updatedAt: new Date() })
      .where(and(eq(campaigns.id, id), eq(campaigns.status, "pending"))).returning();
    if (!updated) return res.status(400).json({ error: "승인 가능한 상태가 아닙니다." });
    res.json({ campaign: updated, message: "캠페인이 승인되었습니다." });
  } catch (err) { console.error(err); res.status(500).json({ error: "서버 오류" }); }
});

// ─── 반려 (관리자) ────────────────────────────────────────────
router.post("/campaigns/:id/reject", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = Number(req.params.id);
    const { reason } = req.body;
    const [updated] = await db.update(campaigns)
      .set({ status: "draft", rejectionReason: reason, updatedAt: new Date() })
      .where(and(eq(campaigns.id, id), eq(campaigns.status, "pending"))).returning();
    if (!updated) return res.status(400).json({ error: "반려 가능한 상태가 아닙니다." });
    res.json({ campaign: updated, message: "캠페인이 반려되었습니다." });
  } catch (err) { console.error(err); res.status(500).json({ error: "서버 오류" }); }
});

// ─── 캠페인 삭제 ──────────────────────────────────────────────
router.delete("/campaigns/:id", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = Number(req.params.id);
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!campaign) return res.status(404).json({ error: "캠페인을 찾을 수 없습니다." });
    if (campaign.creatorId !== userId) return res.status(403).json({ error: "권한이 없습니다." });
    if (campaign.status !== "draft") return res.status(400).json({ error: "draft 상태에서만 삭제 가능합니다." });
    await db.delete(campaigns).where(eq(campaigns.id, id));
    res.json({ message: "삭제되었습니다." });
  } catch (err) { console.error(err); res.status(500).json({ error: "서버 오류" }); }
});

// ═══ 참여 / 환불 / 집행 / 배분 ═══════════════════════════════

// 사용자 지갑 잔액 조회 (캠페인의 조직 코인 포함)
router.get("/campaigns/:id/wallets", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const campaign = await db.query.campaigns?.findFirst?.({ where: eq(campaigns.id, Number(req.params.id)) })
      ?? (await db.select().from(campaigns).where(eq(campaigns.id, Number(req.params.id))))[0];
    if (!campaign) return res.status(404).json({ error: "캠페인을 찾을 수 없습니다." });
    const orgId = campaign.organizationId ? Number(campaign.organizationId) : undefined;
    const result = await getUserWallets(userId, orgId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: "지갑 조회 실패" });
  }
});

router.post("/campaigns/:id/participate", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { amount, coinType, rewardId, message, isAnonymous } = req.body;
  // organizationId: 요청에서 전달되거나, 없으면 캠페인의 organizationId 사용
  const organizationId = req.body.organizationId ? Number(req.body.organizationId) : undefined;
  const result = await lockFunds({
    campaignId: Number(req.params.id),
    participantId: userId,
    amount: Number(amount),
    coinType,
    rewardId: rewardId ? Number(rewardId) : undefined,
    message,
    isAnonymous,
    organizationId,
  });
  if (!result.success) return res.status(400).json({ error: result.error });
  res.json({ message: result.message });
});

router.post("/campaigns/:id/release", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { ratio } = req.body;
  const result = await releaseFunds({ campaignId: Number(req.params.id), ratio: ratio ? Number(ratio) : 1.0 });
  if (!result.success) return res.status(400).json({ error: result.error });
  res.json({ message: result.message });
});

router.post("/campaigns/:id/refund", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const result = await refundAll(Number(req.params.id));
  if (!result.success) return res.status(400).json({ error: result.error });
  res.json({ message: result.message });
});

router.post("/campaigns/:id/distribute", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { totalProfit, note } = req.body;
  const result = await distributeProfit({ campaignId: Number(req.params.id), totalProfit: Number(totalProfit), note });
  if (!result.success) return res.status(400).json({ error: result.error });
  res.json({ message: result.message });
});

// ─── 참여자 목록 (개설자용) ───────────────────────────────────
router.get("/campaigns/:id/participants", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = Number(req.params.id);
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!campaign) return res.status(404).json({ error: "캠페인을 찾을 수 없습니다." });
    if (campaign.creatorId !== userId) return res.status(403).json({ error: "개설자만 조회 가능합니다." });

    const parts = await db.select().from(participations)
      .where(eq(participations.campaignId, id)).orderBy(desc(participations.participatedAt));

    const result = await Promise.all(parts.map(async p => {
      if (p.isAnonymous) return { ...p, participantName: "익명", participantUsername: "익명" };
      const [u] = await db.select({ firstName: users.firstName, lastName: users.lastName, username: users.username }).from(users).where(eq(users.id, p.participantId));
      return { ...p, participantName: u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.username || "알 수 없음" : "알 수 없음", participantUsername: u?.username ?? "" };
    }));

    res.json({ participants: result, total: result.length });
  } catch (err) { console.error(err); res.status(500).json({ error: "서버 오류" }); }
});

// ─── 3-3: 일괄 메시지 발송 ───────────────────────────────────
router.post("/campaigns/:id/broadcast", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = Number(req.params.id);
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: "제목과 내용을 입력해주세요." });

    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!campaign) return res.status(404).json({ error: "캠페인을 찾을 수 없습니다." });
    if (campaign.creatorId !== userId) return res.status(403).json({ error: "개설자만 메시지를 보낼 수 있습니다." });

    // 참여자 수집
    const parts = await db.select({ participantId: participations.participantId }).from(participations)
      .where(and(eq(participations.campaignId, id), ne(participations.status, "refunded")));
    const uniqueIds = [...new Set(parts.map(p => p.participantId))];

    // 업데이트로 저장 (모든 참여자에게 알림 역할)
    const [update] = await db.insert(campaignUpdates)
      .values({ campaignId: id, authorId: userId, title, content }).returning();

    await db.execute(sql`
      UPDATE funding.campaigns SET last_update_at = NOW(), update_warnings = 0, updated_at = NOW() WHERE id = ${id}
    `);

    // WebSocket 실시간 알림 (펀딩 게이지 구독 중인 사용자)
    (global as any).broadcastFundingUpdate?.(id, Number(campaign.currentAmount));

    res.json({ message: `${uniqueIds.length}명의 참여자에게 메시지가 발송되었습니다.`, update, recipientCount: uniqueIds.length });
  } catch (err) { console.error(err); res.status(500).json({ error: "서버 오류" }); }
});

// ─── 3-4: 소셜 증거 ──────────────────────────────────────────
router.get("/campaigns/:id/social-proof", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = Number(req.params.id);

    const myOrgs = await db.select({ organizationId: userOrganizations.organizationId })
      .from(userOrganizations).where(eq(userOrganizations.userId, userId));
    const orgIds = myOrgs.map(o => o.organizationId);
    if (orgIds.length === 0) return res.json({ friendsParticipated: [], totalFriends: 0 });

    const colleagues = await db.select({ userId: userOrganizations.userId }).from(userOrganizations)
      .where(and(inArray(userOrganizations.organizationId, orgIds), ne(userOrganizations.userId, userId)));
    const colleagueIds = colleagues.map(c => c.userId);
    if (colleagueIds.length === 0) return res.json({ friendsParticipated: [], totalFriends: 0 });

    const friendParts = await db.select({
      participantId: participations.participantId,
      amount: participations.amount,
      participatedAt: participations.participatedAt,
    }).from(participations).where(and(
      eq(participations.campaignId, id),
      inArray(participations.participantId, colleagueIds),
      eq(participations.isAnonymous, false),
      ne(participations.status, "refunded")
    )).limit(5);

    const withNames = await Promise.all(friendParts.map(async p => {
      const [u] = await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, p.participantId));
      return { ...p, name: u ? (`${u.firstName ?? ""} ${u.lastName ?? ""}`).trim() || "알 수 없음" : "알 수 없음" };
    }));

    res.json({ friendsParticipated: withNames, totalFriends: withNames.length });
  } catch (err) { console.error(err); res.status(500).json({ error: "서버 오류" }); }
});

// ═══ 업데이트 ════════════════════════════════════════════════

router.get("/campaigns/:id/updates", async (req, res) => {
  const id = Number(req.params.id);
  const updates = await db.select().from(campaignUpdates)
    .where(eq(campaignUpdates.campaignId, id)).orderBy(desc(campaignUpdates.createdAt));
  res.json({ updates });
});

router.post("/campaigns/:id/updates", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = Number(req.params.id);
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!campaign) return res.status(404).json({ error: "캠페인을 찾을 수 없습니다." });
    if (campaign.creatorId !== userId) return res.status(403).json({ error: "개설자만 업데이트 가능합니다." });

    const [update] = await db.insert(campaignUpdates).values({ campaignId: id, authorId: userId, ...req.body }).returning();
    await db.execute(sql`UPDATE funding.campaigns SET last_update_at = NOW(), update_warnings = 0, updated_at = NOW() WHERE id = ${id}`);
    res.status(201).json({ update });
  } catch (err) { console.error(err); res.status(500).json({ error: "서버 오류" }); }
});

// ═══ 마일스톤 ════════════════════════════════════════════════

router.get("/campaigns/:id/milestones", async (req, res) => {
  const id = Number(req.params.id);
  const list = await db.select().from(milestones).where(eq(milestones.campaignId, id)).orderBy(milestones.stepNumber);
  res.json({ milestones: list });
});

router.post("/milestones/:milestoneId/proof", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const mid = Number(req.params.milestoneId);
    const { proofImageUrl, proofNote } = req.body;
    const voteDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const [updated] = await db.update(milestones)
      .set({ proofImageUrl, proofNote, status: "voting", voteDeadline })
      .where(and(eq(milestones.id, mid), eq(milestones.status, "pending"))).returning();
    if (!updated) return res.status(400).json({ error: "투표 시작 불가 상태입니다." });
    res.json({ milestone: updated });
  } catch (err) { console.error(err); res.status(500).json({ error: "서버 오류" }); }
});

router.post("/milestones/:milestoneId/vote", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const mid = Number(req.params.milestoneId);
    const { vote, reason } = req.body;

    const existing = await db.select().from(milestoneVotes)
      .where(and(eq(milestoneVotes.milestoneId, mid), eq(milestoneVotes.voterId, userId)));
    if (existing.length > 0) return res.status(400).json({ error: "이미 투표하셨습니다." });

    await db.insert(milestoneVotes).values({ milestoneId: mid, voterId: userId, vote, reason });

    const counts = await db.execute(sql`
      SELECT COUNT(*) FILTER (WHERE vote = true) AS approve_count, COUNT(*) FILTER (WHERE vote = false) AS reject_count, COUNT(*) AS total_count
      FROM funding.milestone_votes WHERE milestone_id = ${mid}
    `);
    const { approve_count, total_count } = (counts as any).rows[0];

    if (Number(approve_count) > Number(total_count) / 2 && Number(total_count) >= 3) {
      const [milestone] = await db.select().from(milestones).where(eq(milestones.id, mid));
      await db.update(milestones).set({ status: "approved", approvedAt: new Date() }).where(eq(milestones.id, mid));
      await releaseFunds({ campaignId: milestone.campaignId, ratio: Number(milestone.releaseRatio) });
    }

    res.json({ message: "투표가 완료되었습니다.", counts: (counts as any).rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ error: "서버 오류" }); }
});

// ─── 후기 작성 ────────────────────────────────────────────────
router.post("/campaigns/:id/review", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const id = Number(req.params.id);
    const { rating, content } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: "1~5점 사이의 평점을 입력해주세요." });

    const [myPart] = await db.select().from(participations)
      .where(and(eq(participations.campaignId, id), eq(participations.participantId, userId)));
    if (!myPart) return res.status(403).json({ error: "참여한 캠페인만 후기를 작성할 수 있습니다." });

    const [review] = await db.insert(campaignReviews).values({ campaignId: id, reviewerId: userId, rating, content }).returning();

    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    await db.execute(sql`
      UPDATE funding.creator_profiles
      SET
        average_rating = (average_rating * rating_count + ${rating}) / (rating_count + 1),
        rating_count   = rating_count + 1,
        trust_badge    = LEAST(5, FLOOR((average_rating * rating_count + ${rating}) / (rating_count + 1))),
        updated_at     = NOW()
      WHERE user_id = ${campaign.creatorId}
    `);

    res.status(201).json({ review });
  } catch (err) { console.error(err); res.status(500).json({ error: "서버 오류" }); }
});

// ─── 개설자 신뢰 프로필 ───────────────────────────────────────
router.get("/creator/:userId/profile", async (req, res) => {
  const [profile] = await db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, req.params.userId));
  res.json({ profile: profile ?? null });
});

export default router;
