/**
 * 펀딩 API 훅 모음
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useEffect } from "react";

// ─── 타입 ─────────────────────────────────────────────────────
export interface Campaign {
  id: number;
  creatorId: string;
  organizationId: number;
  category: string;
  fundingType: "reward" | "donation" | "profit_share" | "milestone";
  visibility: "org_only" | "region" | "public";
  title: string;
  summary: string | null;
  story: string | null;
  coverImageUrl: string | null;
  targetAmount: string;
  currentAmount: string;
  minFunding: string;
  escrowBalance: string;
  profitShareRatio: string | null;
  acceptedCoinTypes: string[];
  startDate: string | null;
  endDate: string;
  status: "draft" | "pending" | "active" | "success" | "failed" | "refunding" | "completed";
  participantCount: number;
  lastUpdateAt: string | null;
  updateWarnings: number;
  createdAt: string;
}

export interface Reward {
  id: number;
  campaignId: number;
  title: string;
  description: string | null;
  minAmount: string;
  quantityLimit: number | null;
  quantityUsed: number;
  imageUrl: string | null;
}

export interface Milestone {
  id: number;
  campaignId: number;
  stepNumber: number;
  title: string;
  description: string | null;
  releaseRatio: string;
  proofImageUrl: string | null;
  status: "pending" | "voting" | "approved" | "rejected";
  voteDeadline: string | null;
}

export interface CampaignUpdate {
  id: number;
  campaignId: number;
  authorId: string;
  title: string;
  content: string;
  imageUrl: string | null;
  createdAt: string;
}

export interface CreatorProfile {
  userId: string;
  totalCampaigns: number;
  completedCampaigns: number;
  failedCampaigns: number;
  averageRating: string;
  trustBadge: number;
}

// ─── 목록 ─────────────────────────────────────────────────────
export function useCampaigns(filters?: {
  status?: string;
  category?: string;
  type?: string;
  orgId?: number;
  visibility?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status)     params.set("status", filters.status);
  if (filters?.category)   params.set("category", filters.category);
  if (filters?.type)       params.set("type", filters.type);
  if (filters?.orgId)      params.set("orgId", String(filters.orgId));
  if (filters?.visibility) params.set("visibility", filters.visibility);

  return useQuery<{ campaigns: Campaign[] }>({
    queryKey: ["/api/funding/campaigns", filters],
    queryFn: () => fetch(`/api/funding/campaigns?${params}`).then(r => r.json()),
  });
}

// ─── 상세 ─────────────────────────────────────────────────────
export function useCampaign(id: number) {
  return useQuery<{ campaign: Campaign; rewards: Reward[]; milestones: Milestone[]; updates: CampaignUpdate[]; reviews: any[]; creatorProfile: CreatorProfile | null }>({
    queryKey: ["/api/funding/campaigns", id],
    queryFn: () => fetch(`/api/funding/campaigns/${id}`).then(r => r.json()),
    enabled: !!id,
  });
}

// ─── 개설 ─────────────────────────────────────────────────────
export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/funding/campaigns", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/funding/campaigns"] }),
  });
}

// ─── 승인 요청 ────────────────────────────────────────────────
export function useSubmitCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/funding/campaigns/${id}/submit`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/funding/campaigns"] }),
  });
}

// ─── 관리자 승인/반려 ─────────────────────────────────────────
export function useApproveCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/funding/campaigns/${id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/funding/campaigns"] }),
  });
}

export function useRejectCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest("POST", `/api/funding/campaigns/${id}/reject`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/funding/campaigns"] }),
  });
}

// ─── 펀딩 참여 ────────────────────────────────────────────────
export function useParticipate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ campaignId, ...data }: { campaignId: number; amount: number; coinType?: string; rewardId?: number; message?: string; isAnonymous?: boolean; organizationId?: number }) =>
      apiRequest("POST", `/api/funding/campaigns/${campaignId}/participate`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/funding/campaigns", vars.campaignId] });
      qc.invalidateQueries({ queryKey: ["/api/funding/campaigns"] });
    },
  });
}

// ─── 업데이트 작성 ────────────────────────────────────────────
export function usePostUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ campaignId, ...data }: { campaignId: number; title: string; content: string }) =>
      apiRequest("POST", `/api/funding/campaigns/${campaignId}/updates`, data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["/api/funding/campaigns", vars.campaignId] }),
  });
}

// ─── 소셜 증거 ────────────────────────────────────────────────
export function useSocialProof(campaignId: number) {
  return useQuery<{ friendsParticipated: { name: string; amount: string; participatedAt: string }[]; totalFriends: number }>({
    queryKey: ["/api/funding/social-proof", campaignId],
    queryFn: () => fetch(`/api/funding/campaigns/${campaignId}/social-proof`).then(r => r.json()),
    enabled: !!campaignId,
  });
}

// ─── 내 목록 ──────────────────────────────────────────────────
export function useMyFunding() {
  return useQuery<{ created: Campaign[]; participated: Campaign[]; participations: any[] }>({
    queryKey: ["/api/funding/my"],
    queryFn: () => fetch("/api/funding/my").then(r => r.json()),
  });
}

// ─── 관리자 승인 대기 ─────────────────────────────────────────
export function usePendingCampaigns(orgId?: number) {
  const params = orgId ? `?orgId=${orgId}` : "";
  return useQuery<{ campaigns: Campaign[] }>({
    queryKey: ["/api/funding/admin/pending", orgId],
    queryFn: () => fetch(`/api/funding/admin/pending${params}`).then(r => r.json()),
  });
}

// ─── 후기 작성 ────────────────────────────────────────────────
export function useWriteReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ campaignId, rating, content }: { campaignId: number; rating: number; content?: string }) =>
      apiRequest("POST", `/api/funding/campaigns/${campaignId}/review`, { rating, content }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["/api/funding/campaigns", vars.campaignId] }),
  });
}

// ─── 마일스톤 투표 ────────────────────────────────────────────
export function useMilestoneVote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ milestoneId, vote, reason }: { milestoneId: number; vote: boolean; reason?: string }) =>
      apiRequest("POST", `/api/funding/milestones/${milestoneId}/vote`, { vote, reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/funding/campaigns"] }),
  });
}

// ─── 관리자 알림 WebSocket ────────────────────────────────────
export function useAdminAlerts(onAlert: (event: {
  type: string;
  campaignId?: number;
  title?: string;
  message: string;
  severity?: "info" | "warning" | "error";
  ts: number;
}) => void) {
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/admin`);
    ws.onmessage = (e) => {
      try { onAlert(JSON.parse(e.data)); } catch {}
    };
    return () => ws.close();
  }, []);
}
