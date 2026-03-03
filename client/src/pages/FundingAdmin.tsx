/**
 * 펀딩 관리자 승인 페이지
 * /funding/admin
 * - 승인 대기 목록
 * - 신뢰 등급 확인
 * - 승인/반려 처리
 * - 강제 환불 / 자금 집행
 */
import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FundingGauge } from "@/components/FundingGauge";
import { usePendingCampaigns, useApproveCampaign, useRejectCampaign, useAdminAlerts } from "@/hooks/use-funding";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle, XCircle, AlertTriangle, Shield, Users,
  TrendingUp, Clock, Star, Loader2, ArrowLeft, DollarSign
} from "lucide-react";

const STATUS_COLOR: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-600",
  pending:   "bg-yellow-100 text-yellow-700",
  active:    "bg-emerald-100 text-emerald-700",
  success:   "bg-green-100 text-green-700",
  failed:    "bg-red-100 text-red-600",
  refunding: "bg-orange-100 text-orange-700",
  completed: "bg-gray-100 text-gray-500",
};

const FUNDING_TYPE_KO: Record<string, string> = {
  reward:       "🎁 리워드형",
  donation:     "💚 기부형",
  profit_share: "📈 수익공유형",
  milestone:    "🏁 마일스톤형",
};

const VISIBILITY_KO: Record<string, string> = {
  org_only: "🔒 조직 내부",
  region:   "🏘️ 지역 공개",
  public:   "🌐 전체 공개",
};

function TrustStars({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={`w-3 h-3 ${i <= level ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`} />
      ))}
    </div>
  );
}

// ─── 캠페인 승인 카드 ─────────────────────────────────────────
function PendingCampaignCard({ campaign, onAction }: { campaign: any; onAction: () => void }) {
  const { toast } = useToast();
  const approve = useApproveCampaign();
  const reject  = useRejectCampaign();
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  // 개설자 프로필 조회
  const { data: profileData } = useQuery({
    queryKey: ["/api/funding/creator", campaign.creatorId],
    queryFn: () => fetch(`/api/funding/creator/${campaign.creatorId}/profile`).then(r => r.json()),
  });
  const profile = profileData?.profile;

  async function handleApprove() {
    await approve.mutateAsync(campaign.id);
    toast({ title: "✅ 캠페인이 승인되었습니다." });
    onAction();
  }

  async function handleReject() {
    if (!rejectReason.trim()) return toast({ title: "반려 사유를 입력해주세요.", variant: "destructive" });
    await reject.mutateAsync({ id: campaign.id, reason: rejectReason });
    toast({ title: "반려 처리되었습니다." });
    onAction();
  }

  const completionRate = profile && profile.totalCampaigns > 0
    ? Math.round((profile.completedCampaigns / profile.totalCampaigns) * 100)
    : null;

  // 신뢰도 높은 개설자는 자동 승인 가능 표시
  const canAutoApprove = profile && profile.trustBadge >= 3 && campaign.visibility === "org_only";

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden mb-4">
      <div className="p-4">
        {/* 헤더 */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 mr-3">
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">승인 대기</span>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{FUNDING_TYPE_KO[campaign.fundingType]}</span>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{VISIBILITY_KO[campaign.visibility]}</span>
              {canAutoApprove && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                  <Shield className="w-3 h-3" />신뢰 등급 우수
                </span>
              )}
            </div>
            <Link href={`/funding/${campaign.id}`}>
              <h3 className="font-semibold text-gray-900 hover:text-indigo-600 transition-colors">{campaign.title}</h3>
            </Link>
            {campaign.summary && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{campaign.summary}</p>}
          </div>
        </div>

        {/* 개설자 신뢰 정보 */}
        {profile && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl mb-3">
            <Shield className="w-4 h-4 text-indigo-400" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <TrustStars level={profile.trustBadge} />
                <span className="text-xs text-gray-500">신뢰 등급 {profile.trustBadge}/5</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                총 {profile.totalCampaigns}회 개설 · 완료율 {completionRate ?? 0}% · 실패 {profile.failedCampaigns}회
              </p>
            </div>
            {canAutoApprove && (
              <span className="text-xs text-green-600 font-medium">즉시 승인 가능</span>
            )}
          </div>
        )}

        {/* 캠페인 정보 */}
        <div className="grid grid-cols-3 gap-2 mb-3 text-center">
          <div className="bg-gray-50 rounded-lg p-2">
            <p className="text-xs text-gray-400">목표</p>
            <p className="text-sm font-semibold text-gray-800">{Number(campaign.targetAmount).toLocaleString()}</p>
            <p className="text-xs text-gray-400">코인</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <p className="text-xs text-gray-400">최소 참여</p>
            <p className="text-sm font-semibold text-gray-800">{Number(campaign.minFunding).toLocaleString()}</p>
            <p className="text-xs text-gray-400">코인</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <p className="text-xs text-gray-400">마감일</p>
            <p className="text-sm font-semibold text-gray-800">{new Date(campaign.endDate).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}</p>
          </div>
        </div>

        {campaign.story && (
          <div className="bg-gray-50 rounded-xl p-3 mb-3">
            <p className="text-xs text-gray-500 line-clamp-3">{campaign.story}</p>
          </div>
        )}

        {/* 반려 사유 입력 */}
        {showReject && (
          <div className="mb-3">
            <Textarea
              placeholder="반려 사유를 입력해주세요. 개설자에게 전달됩니다."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={2} className="text-sm resize-none mb-2"
            />
          </div>
        )}

        {/* 승인/반려 버튼 */}
        <div className="flex gap-2">
          {showReject ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setShowReject(false)} className="flex-1 text-xs">취소</Button>
              <Button size="sm" onClick={handleReject} disabled={reject.isPending}
                className="flex-1 text-xs bg-red-500 hover:bg-red-600 text-white">
                {reject.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><XCircle className="w-3.5 h-3.5 mr-1" />반려 확정</>}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setShowReject(true)}
                className="flex-1 text-xs text-red-600 border-red-200 hover:bg-red-50">
                <XCircle className="w-3.5 h-3.5 mr-1" />반려
              </Button>
              <Button size="sm" onClick={handleApprove} disabled={approve.isPending}
                className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
                {approve.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><CheckCircle className="w-3.5 h-3.5 mr-1" />승인</>}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 진행 중 캠페인 관리 카드 (자금 집행 / 강제 환불) ─────────
function ActiveCampaignManageCard({ campaign, onAction }: { campaign: any; onAction: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [profit, setProfit] = useState("");

  const releaseMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/funding/campaigns/${campaign.id}/release`, { ratio: 1.0 }),
    onSuccess: () => { toast({ title: "✅ 자금이 집행되었습니다." }); onAction(); qc.invalidateQueries({ queryKey: ["/api/funding/campaigns"] }); },
  });

  const refundMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/funding/campaigns/${campaign.id}/refund`),
    onSuccess: () => { toast({ title: "✅ 환불 처리가 완료되었습니다." }); onAction(); qc.invalidateQueries({ queryKey: ["/api/funding/campaigns"] }); },
  });

  const distributeMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/funding/campaigns/${campaign.id}/distribute`, { totalProfit: Number(profit), note: "관리자 수익 배분" }),
    onSuccess: () => { toast({ title: "✅ 수익이 배분되었습니다." }); setProfit(""); qc.invalidateQueries({ queryKey: ["/api/funding/campaigns"] }); },
  });

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 mb-3">
      <div className="flex items-start justify-between mb-2">
        <div>
          <Link href={`/funding/${campaign.id}`}>
            <h3 className="font-semibold text-gray-900 hover:text-indigo-600 text-sm">{campaign.title}</h3>
          </Link>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${STATUS_COLOR[campaign.status]}`}>
            {campaign.status === "active" ? "진행 중" : campaign.status === "success" ? "🎉 달성" : campaign.status}
          </span>
        </div>
        {campaign.updateWarnings >= 3 && (
          <span className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-lg">
            <AlertTriangle className="w-3.5 h-3.5" />경고 {campaign.updateWarnings}회
          </span>
        )}
      </div>

      <FundingGauge current={Number(campaign.currentAmount)} target={Number(campaign.targetAmount)} variant="bar" size="sm" />

      <div className="flex gap-2 mt-3">
        {campaign.status === "success" && (
          <Button size="sm" onClick={() => releaseMutation.mutate()} disabled={releaseMutation.isPending}
            className="flex-1 text-xs bg-green-600 hover:bg-green-700 text-white">
            {releaseMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <><DollarSign className="w-3.5 h-3.5 mr-1" />자금 집행</>}
          </Button>
        )}
        {campaign.fundingType === "profit_share" && campaign.status === "completed" && (
          <div className="flex gap-1 flex-1">
            <Input type="number" placeholder="수익 금액" value={profit} onChange={e => setProfit(e.target.value)} className="text-xs h-8" />
            <Button size="sm" onClick={() => distributeMutation.mutate()} disabled={distributeMutation.isPending || !profit}
              className="text-xs bg-purple-600 hover:bg-purple-700 text-white whitespace-nowrap">
              {distributeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "배분"}
            </Button>
          </div>
        )}
        {["active", "success"].includes(campaign.status) && (
          <Button size="sm" variant="outline" onClick={() => {
            if (confirm("정말 강제 환불 처리하시겠습니까?")) refundMutation.mutate();
          }} disabled={refundMutation.isPending}
            className="text-xs text-red-600 border-red-200 hover:bg-red-50">
            {refundMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "강제 환불"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── 메인 관리자 페이지 ───────────────────────────────────────
export default function FundingAdmin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"pending" | "active" | "warnings">("pending");
  const [refresh, setRefresh] = useState(0);
  const [liveAlerts, setLiveAlerts] = useState<Array<{
    type: string; message: string; severity?: string; ts: number; campaignId?: number;
  }>>([]);
  const onAction = () => setRefresh(r => r + 1);

  // 실시간 관리자 알림 (크론에서 경고 발생 시)
  useAdminAlerts((event) => {
    if (event.type === "connected") return; // 연결 확인 메시지 무시
    // 알림 배너에 추가
    setLiveAlerts(prev => [event, ...prev].slice(0, 10)); // 최대 10개 유지
    if (event.type === "funding_warning" || event.type === "coin_launch_request") {
      toast({
        title: event.severity === "error" ? "🚨 긴급 알림" : "⚠️ 관리자 알림",
        description: event.message,
        variant: event.severity === "error" ? "destructive" : "default",
      });
      onAction(); // 목록 갱신
    }
  });

  const { data: pendingData, isLoading: pendingLoading } = usePendingCampaigns();

  const { data: activeData } = useQuery({
    queryKey: ["/api/funding/campaigns", "active", refresh],
    queryFn: () => fetch("/api/funding/campaigns?status=active").then(r => r.json()),
  });

  const { data: successData } = useQuery({
    queryKey: ["/api/funding/campaigns", "success", refresh],
    queryFn: () => fetch("/api/funding/campaigns?status=success").then(r => r.json()),
  });

  const { data: warningData } = useQuery({
    queryKey: ["/api/funding/campaigns", "warnings", refresh],
    queryFn: async () => {
      const r = await fetch("/api/funding/campaigns?status=active");
      const data = await r.json();
      return { campaigns: (data.campaigns ?? []).filter((c: any) => c.updateWarnings > 0) };
    },
  });

  const activeCampaigns = [...(activeData?.campaigns ?? []), ...(successData?.campaigns ?? [])];
  const pendingCampaigns = pendingData?.campaigns ?? [];
  const warningCampaigns = warningData?.campaigns ?? [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/funding">
        <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" />펀딩 목록
        </button>
      </Link>

      {/* 실시간 알림 배너 */}
      {liveAlerts.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {liveAlerts.map((alert, i) => (
            <div key={alert.ts + i}
              className={`flex items-start gap-2 px-4 py-2.5 rounded-xl text-sm border ${
                alert.severity === "error"
                  ? "bg-red-50 border-red-200 text-red-800"
                  : alert.severity === "warning"
                  ? "bg-orange-50 border-orange-200 text-orange-800"
                  : "bg-blue-50 border-blue-200 text-blue-800"
              }`}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span>{alert.message}</span>
                {alert.campaignId && (
                  <Link href={`/funding/${alert.campaignId}`}>
                    <span className="ml-2 underline cursor-pointer">캠페인 보기 →</span>
                  </Link>
                )}
              </div>
              <span className="text-xs opacity-50 shrink-0">
                {new Date(alert.ts).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <button onClick={() => setLiveAlerts(prev => prev.filter((_, j) => j !== i))}
                className="shrink-0 opacity-40 hover:opacity-80">✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">⚙️ 펀딩 관리</h1>
          <p className="text-sm text-gray-400 mt-0.5">캠페인 승인 및 정산 관리</p>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-yellow-700">{pendingCampaigns.length}</p>
          <p className="text-xs text-yellow-600">승인 대기</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-emerald-700">{activeCampaigns.length}</p>
          <p className="text-xs text-emerald-600">진행 중</p>
        </div>
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-orange-700">{warningCampaigns.length}</p>
          <p className="text-xs text-orange-600">경고 캠페인</p>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
        {[
          { key: "pending",  label: `승인 대기 ${pendingCampaigns.length}` },
          { key: "active",   label: `진행 관리 ${activeCampaigns.length}` },
          { key: "warnings", label: `경고 ${warningCampaigns.length}` },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${activeTab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 승인 대기 */}
      {activeTab === "pending" && (
        pendingLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-7 h-7 animate-spin text-indigo-400" /></div>
        ) : pendingCampaigns.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <CheckCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">대기 중인 캠페인이 없습니다</p>
          </div>
        ) : (
          pendingCampaigns.map((c: any) => <PendingCampaignCard key={c.id} campaign={c} onAction={onAction} />)
        )
      )}

      {/* 진행 관리 */}
      {activeTab === "active" && (
        activeCampaigns.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <TrendingUp className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">진행 중인 캠페인이 없습니다</p>
          </div>
        ) : (
          activeCampaigns.map((c: any) => <ActiveCampaignManageCard key={c.id} campaign={c} onAction={onAction} />)
        )
      )}

      {/* 경고 캠페인 */}
      {activeTab === "warnings" && (
        warningCampaigns.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <AlertTriangle className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">경고 캠페인이 없습니다</p>
          </div>
        ) : (
          warningCampaigns.map((c: any) => (
            <div key={c.id} className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-3">
              <div className="flex items-center justify-between mb-2">
                <Link href={`/funding/${c.id}`}>
                  <h3 className="font-semibold text-gray-900 text-sm hover:text-indigo-600">{c.title}</h3>
                </Link>
                <span className="text-xs text-orange-700 font-semibold bg-orange-100 px-2 py-0.5 rounded-full">
                  경고 {c.updateWarnings}회
                </span>
              </div>
              <p className="text-xs text-orange-600 mb-3">
                {c.updateWarnings >= 3 ? "⚠️ 3회 이상 경고 — 강제 환불 가능 상태" : "2주 이상 업데이트 없음"}
              </p>
              <FundingGauge current={Number(c.currentAmount)} target={Number(c.targetAmount)} variant="bar" size="sm" />
              {c.updateWarnings >= 3 && (
                <Button size="sm" variant="outline" className="w-full mt-2 text-xs text-red-600 border-red-200 hover:bg-red-50"
                  onClick={async () => {
                    if (confirm(`"${c.title}" 캠페인을 강제 환불 처리하시겠습니까?`)) {
                      await apiRequest("POST", `/api/funding/campaigns/${c.id}/refund`);
                      onAction();
                    }
                  }}>
                  강제 환불 처리
                </Button>
              )}
            </div>
          ))
        )
      )}
    </div>
  );
}
