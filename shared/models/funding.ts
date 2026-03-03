import { sql } from "drizzle-orm";
import {
  pgTable, pgSchema,
  serial, integer, text, varchar, boolean,
  decimal, timestamp, jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─────────────────────────────────────────
// funding 스키마 (별도 네임스페이스)
// ─────────────────────────────────────────
export const fundingSchema = pgSchema("funding");

// ─── 상수 타입 ───────────────────────────
export const FUNDING_TYPES = ["reward", "donation", "profit_share", "milestone"] as const;
export type FundingType = typeof FUNDING_TYPES[number];

export const CAMPAIGN_STATUSES = [
  "draft",       // 작성 중
  "pending",     // 승인 대기
  "active",      // 진행 중
  "success",     // 목표 달성
  "failed",      // 기간 종료 / 미달
  "refunding",   // 환불 처리 중
  "completed",   // 완전 종료
] as const;
export type CampaignStatus = typeof CAMPAIGN_STATUSES[number];

export const CAMPAIGN_VISIBILITY = ["org_only", "region", "public"] as const;
export type CampaignVisibility = typeof CAMPAIGN_VISIBILITY[number];

export const CATEGORIES = [
  "agriculture",   // 농업/농산물
  "startup",       // 청년창업
  "culture",       // 문화/행사
  "welfare",       // 복지
  "education",     // 교육
  "environment",   // 환경
  "community",     // 마을공동체
  "other",         // 기타
] as const;
export type Category = typeof CATEGORIES[number];

export const COIN_TYPES = ["dorun_coin", "local_coin"] as const;
export type CoinType = typeof COIN_TYPES[number];

// ─── 1. 캠페인 ────────────────────────────
export const campaigns = fundingSchema.table("campaigns", {
  id:             serial("id").primaryKey(),
  creatorId:      varchar("creator_id").notNull(),       // users.id
  organizationId: integer("organization_id").notNull(),  // schools.id
  regionId:       integer("region_id"),                  // 추후 지역 테이블 참조
  category:       text("category", { enum: CATEGORIES }).notNull().default("other"),
  fundingType:    text("funding_type", { enum: FUNDING_TYPES }).notNull().default("reward"),
  visibility:     text("visibility", { enum: CAMPAIGN_VISIBILITY }).notNull().default("org_only"),

  title:          varchar("title", { length: 200 }).notNull(),
  summary:        text("summary"),                       // 한 줄 요약
  story:          text("story"),                         // 스토리텔링 본문 (마크다운)
  coverImageUrl:  text("cover_image_url"),

  targetAmount:   decimal("target_amount", { precision: 12, scale: 2 }).notNull(),
  currentAmount:  decimal("current_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  minFunding:     decimal("min_funding", { precision: 10, scale: 2 }).default("1"),
  escrowBalance:  decimal("escrow_balance", { precision: 12, scale: 2 }).notNull().default("0"),

  // 수익공유형: 배분 비율 (0.05 = 5%)
  profitShareRatio: decimal("profit_share_ratio", { precision: 4, scale: 2 }),

  // 허용 코인 타입 (JSON 배열: ["dorun_coin", "local_coin"])
  acceptedCoinTypes: jsonb("accepted_coin_types").$type<CoinType[]>().default(["dorun_coin"]),

  startDate:      timestamp("start_date"),
  endDate:        timestamp("end_date").notNull(),
  status:         text("status", { enum: CAMPAIGN_STATUSES }).notNull().default("draft"),

  // 승인 관련
  approvedBy:     varchar("approved_by"),                // 승인한 관리자 users.id
  approvedAt:     timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),

  // 신뢰/참여 통계 (캐시)
  participantCount: integer("participant_count").notNull().default(0),

  // 업데이트 의무화 — 마지막 업데이트 시각
  lastUpdateAt:   timestamp("last_update_at"),
  updateWarnings: integer("update_warnings").notNull().default(0), // 경고 횟수

  createdAt:      timestamp("created_at").defaultNow(),
  updatedAt:      timestamp("updated_at").defaultNow(),
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true, currentAmount: true, escrowBalance: true,
  participantCount: true, updateWarnings: true,
  approvedBy: true, approvedAt: true, createdAt: true, updatedAt: true,
});
export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;

// ─── 2. 리워드 ────────────────────────────
export const rewards = fundingSchema.table("rewards", {
  id:             serial("id").primaryKey(),
  campaignId:     integer("campaign_id").notNull(),
  title:          varchar("title", { length: 100 }).notNull(),  // "마늘 5kg + 농장 체험권"
  description:    text("description"),
  minAmount:      decimal("min_amount", { precision: 10, scale: 2 }).notNull(),
  quantityLimit:  integer("quantity_limit"),                   // NULL = 무제한
  quantityUsed:   integer("quantity_used").notNull().default(0),
  imageUrl:       text("image_url"),
  createdAt:      timestamp("created_at").defaultNow(),
});

export const insertRewardSchema = createInsertSchema(rewards).omit({ id: true, quantityUsed: true, createdAt: true });
export type Reward = typeof rewards.$inferSelect;
export type InsertReward = z.infer<typeof insertRewardSchema>;

// ─── 3. 참여 (에스크로 보관) ──────────────
export const PARTICIPATION_STATUSES = ["held", "released", "refunded"] as const;

export const participations = fundingSchema.table("participations", {
  id:              serial("id").primaryKey(),
  campaignId:      integer("campaign_id").notNull(),
  participantId:   varchar("participant_id").notNull(),  // users.id
  amount:          decimal("amount", { precision: 10, scale: 2 }).notNull(),
  coinType:        text("coin_type", { enum: COIN_TYPES }).notNull().default("dorun_coin"),
  rewardId:        integer("reward_id"),                  // 선택한 리워드 (리워드형)
  status:          text("status", { enum: PARTICIPATION_STATUSES }).notNull().default("held"),
  message:         text("message"),                       // 응원 메시지
  isAnonymous:     boolean("is_anonymous").notNull().default(false),
  participatedAt:  timestamp("participated_at").defaultNow(),
  releasedAt:      timestamp("released_at"),
  refundedAt:      timestamp("refunded_at"),
});

export const insertParticipationSchema = createInsertSchema(participations).omit({
  id: true, status: true, participatedAt: true, releasedAt: true, refundedAt: true,
});
export type Participation = typeof participations.$inferSelect;
export type InsertParticipation = z.infer<typeof insertParticipationSchema>;

// ─── 4. 마일스톤 ──────────────────────────
export const MILESTONE_STATUSES = ["pending", "voting", "approved", "rejected"] as const;

export const milestones = fundingSchema.table("milestones", {
  id:             serial("id").primaryKey(),
  campaignId:     integer("campaign_id").notNull(),
  stepNumber:     integer("step_number").notNull(),
  title:          varchar("title", { length: 100 }).notNull(),
  description:    text("description"),
  releaseRatio:   decimal("release_ratio", { precision: 4, scale: 2 }).notNull(), // 0.30 = 30%
  proofImageUrl:  text("proof_image_url"),
  proofNote:      text("proof_note"),
  voteDeadline:   timestamp("vote_deadline"),
  status:         text("status", { enum: MILESTONE_STATUSES }).notNull().default("pending"),
  approvedAt:     timestamp("approved_at"),
  createdAt:      timestamp("created_at").defaultNow(),
});

export const insertMilestoneSchema = createInsertSchema(milestones).omit({
  id: true, proofImageUrl: true, proofNote: true, voteDeadline: true,
  status: true, approvedAt: true, createdAt: true,
});
export type Milestone = typeof milestones.$inferSelect;
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;

// ─── 5. 마일스톤 투표 ─────────────────────
export const milestoneVotes = fundingSchema.table("milestone_votes", {
  id:           serial("id").primaryKey(),
  milestoneId:  integer("milestone_id").notNull(),
  voterId:      varchar("voter_id").notNull(),  // users.id
  vote:         boolean("vote").notNull(),       // true=승인, false=거부
  reason:       text("reason"),
  votedAt:      timestamp("voted_at").defaultNow(),
});

export type MilestoneVote = typeof milestoneVotes.$inferSelect;

// ─── 6. 캠페인 업데이트 (공지) ────────────
export const campaignUpdates = fundingSchema.table("campaign_updates", {
  id:          serial("id").primaryKey(),
  campaignId:  integer("campaign_id").notNull(),
  authorId:    varchar("author_id").notNull(),
  title:       varchar("title", { length: 200 }).notNull(),
  content:     text("content").notNull(),
  imageUrl:    text("image_url"),
  createdAt:   timestamp("created_at").defaultNow(),
});

export const insertCampaignUpdateSchema = createInsertSchema(campaignUpdates).omit({ id: true, createdAt: true });
export type CampaignUpdate = typeof campaignUpdates.$inferSelect;
export type InsertCampaignUpdate = z.infer<typeof insertCampaignUpdateSchema>;

// ─── 7. 수익 배분 내역 ────────────────────
export const profitDistributions = fundingSchema.table("profit_distributions", {
  id:             serial("id").primaryKey(),
  campaignId:     integer("campaign_id").notNull(),
  participantId:  varchar("participant_id").notNull(),
  amount:         decimal("amount", { precision: 10, scale: 2 }).notNull(),
  coinType:       text("coin_type", { enum: COIN_TYPES }).notNull().default("dorun_coin"),
  note:           text("note"),
  distributedAt:  timestamp("distributed_at").defaultNow(),
});

export type ProfitDistribution = typeof profitDistributions.$inferSelect;

// ─── 8. 개설자 신뢰 등급 ──────────────────
export const creatorProfiles = fundingSchema.table("creator_profiles", {
  userId:           varchar("user_id").primaryKey(),
  totalCampaigns:   integer("total_campaigns").notNull().default(0),
  completedCampaigns: integer("completed_campaigns").notNull().default(0),
  failedCampaigns:  integer("failed_campaigns").notNull().default(0),
  averageRating:    decimal("average_rating", { precision: 3, scale: 2 }).default("0"),
  ratingCount:      integer("rating_count").notNull().default(0),
  trustBadge:       integer("trust_badge").notNull().default(0), // 0~5 (별점)
  updatedAt:        timestamp("updated_at").defaultNow(),
});

export type CreatorProfile = typeof creatorProfiles.$inferSelect;

// ─── 9. 참여자 후기 ───────────────────────
export const campaignReviews = fundingSchema.table("campaign_reviews", {
  id:          serial("id").primaryKey(),
  campaignId:  integer("campaign_id").notNull(),
  reviewerId:  varchar("reviewer_id").notNull(),
  rating:      integer("rating").notNull(),  // 1~5
  content:     text("content"),
  createdAt:   timestamp("created_at").defaultNow(),
});

export type CampaignReview = typeof campaignReviews.$inferSelect;

// ─── Relations ────────────────────────────
export const campaignsRelations = relations(campaigns, ({ many }) => ({
  rewards:      many(rewards),
  participations: many(participations),
  milestones:   many(milestones),
  updates:      many(campaignUpdates),
  reviews:      many(campaignReviews),
  distributions: many(profitDistributions),
}));

export const participationsRelations = relations(participations, ({ one }) => ({
  campaign: one(campaigns, { fields: [participations.campaignId], references: [campaigns.id] }),
  reward:   one(rewards,   { fields: [participations.rewardId],   references: [rewards.id] }),
}));

export const milestonesRelations = relations(milestones, ({ one, many }) => ({
  campaign: one(campaigns, { fields: [milestones.campaignId], references: [campaigns.id] }),
  votes:    many(milestoneVotes),
}));
