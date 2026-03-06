/**
 * 개설자 대시보드 + 마이 펀딩 페이지
 * /funding/my
 */
import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FundingGauge } from "@/components/FundingGauge";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useCampaigns, useSubmitCampaign, usePostUpdate } from "@/hooks/use-funding";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Plus, Send, Users, MessageSquare, TrendingUp,
  CheckCircle, Clock, AlertCircle, ChevronRight, Loader2, Star, ArrowLeft
} from "lucide-react";

const STATUS_INFO: Record<string, { label: string; color: string; icon: any }> = {
  draft:     { label: "작성 중",   color: "bg-gray-100 text-gray-600",    icon: Clock },
  pending:   { label: "승인 대기", color: "bg-yellow-100 text-yellow-700", icon: Clock },
  active:    { label: "진행 중",   color: "bg-emerald-100 text-emerald-700", icon: TrendingUp },
  success:   { label: "목표 달성", color: "bg-green-100 text-green-700",   icon: CheckCircle },
  failed:    { label: "종료",      color: "bg-red-100 text-red-600",       icon: AlertCircle },
  refunding: { label: "환불 중",   color: "bg-orange-100 text-orange-700", icon: AlertCircle },
  completed: { label: "완료",      color: "bg-gray-100 text-gray-500",     icon: CheckCircle },
};

// ─── 개설자 대시보드 패널 ─────────────────────────────────────
function CreatorPanel({ campaign }: { campaign: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const submitCampaign = useSubmitCampaign();
  const postUpdate = usePostUpdate();

  const [tab, setTab] = useState<"overview" | "broadcast" | "participants" | "milestone">("overview");
  const [updateTitle, setUpdateTitle] = useState("");
  const [updateContent, setUpdateContent] = useState("");
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastContent, setBroadcastContent] = useState("");
  const [proofNote, setProofNote] = useState("");
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<number | null>(null);

  // 참여자 목록
  const { data: participantsData } = useQuery({
    queryKey: ["/api/funding/participants", campaign.id],
    queryFn: () => fetch(`/api/funding/campaigns/${campaign.id}/participants`).then(r => r.json()),
    enabled: tab === "participants",
  });

  // 일괄 메시지 발송
  const broadcast = useMutation({
    mutationFn: (data: { title: string; content: string }) =>
      apiRequest("POST", `/api/funding/campaigns/${campaign.id}/broadcast`, data),
    onSuccess: (data: any) => {
      toast({ title: `✅ ${data.recipientCount}명에게 발송 완료` });
      setBroadcastTitle(""); setBroadcastContent("");
      qc.invalidateQueries({ queryKey: ["/api/funding/campaigns", campaign.id] });
    },
  });

  // 마일스톤 인증샷 업로드 (투표 시작)
  const startVote = useMutation({
    mutationFn: ({ milestoneId, proofNote }: { milestoneId: number; proofNote: string }) =>
      apiRequest("POST", `/api/funding/milestones/${milestoneId}/proof`, { proofNote }),
    onSuccess: () => {
      toast({ title: "✅ 투표가 시작되었습니다!" });
      setProofNote(""); setSelectedMilestoneId(null);
      qc.invalidateQueries({ queryKey: ["/api/funding/campaigns", campaign.id] });
    },
  });

  const statusInfo = STATUS_INFO[campaign.status] ?? STATUS_INFO.draft;
  const StatusIcon = statusInfo.icon;
  const current = Number(campaign.currentAmount);
  const target = Number(campaign.targetAmount);

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden mb-4">
      {/* 헤더 */}
      <div className="p-4 border-b border-gray-50">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 mr-3">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${statusInfo.color}`}>
                <StatusIcon className="w-3 h-3" />{statusInfo.label}
              </span>
              {campaign.updateWarnings > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />업데이트 경고 {campaign.updateWarnings}회
                </span>
              )}
            </div>
            <Link href={`/funding/${campaign.id}`}>
              <h3 className="font-semibold text-gray-900 hover:text-indigo-600 transition-colors line-clamp-1">
                {campaign.title}
              </h3>
            </Link>
          </div>
          {campaign.status === "draft" && (
            <Button size="sm" onClick={() => submitCampaign.mutate(campaign.id)}
              disabled={submitCampaign.isPending} className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-xs">
              승인 요청
            </Button>
          )}
        </div>

        {/* 게이지 */}
        <div className="mt-3">
          <FundingGauge current={current} target={target} variant="bar" size="sm" />
        </div>
        <div className="flex gap-4 mt-2 text-xs text-gray-500">
          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{campaign.participantCount}명</span>
          <span>{current.toLocaleString()} / {target.toLocaleString()} 코인</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(campaign.endDate).toLocaleDateString("ko-KR")} 마감</span>
        </div>
      </div>

      {/* 탭 (active/success 상태일 때만) */}
      {["active", "success", "completed"].includes(campaign.status) && (
        <>
          <div className="flex border-b border-gray-50">
            {[
              { key: "overview",     label: "개요" },
              { key: "broadcast",    label: "📣 일괄 메시지" },
              { key: "participants", label: "👥 참여자" },
              { key: "milestone",    label: "🏁 마일스톤" },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key as any)}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors ${tab === t.key ? "text-indigo-600 border-b-2 border-indigo-600" : "text-gray-400 hover:text-gray-600"}`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {/* 개요: 업데이트 작성 */}
            {tab === "overview" && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">진행 상황 업데이트 작성</p>
                <Input placeholder="업데이트 제목" value={updateTitle} onChange={e => setUpdateTitle(e.target.value)} className="mb-2 text-sm" />
                <Textarea placeholder="참여자들에게 진행 상황을 알려주세요..." value={updateContent}
                  onChange={e => setUpdateContent(e.target.value)} rows={3} className="text-sm resize-none mb-2" />
                <Button size="sm" onClick={async () => {
                  if (!updateTitle || !updateContent) return toast({ title: "제목과 내용을 입력해주세요.", variant: "destructive" });
                  await postUpdate.mutateAsync({ campaignId: campaign.id, title: updateTitle, content: updateContent });
                  toast({ title: "✅ 업데이트가 게시되었습니다!" });
                  setUpdateTitle(""); setUpdateContent("");
                }} disabled={postUpdate.isPending} className="w-full bg-indigo-600 hover:bg-indigo-700">
                  {postUpdate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "업데이트 게시"}
                </Button>
              </div>
            )}

            {/* 일괄 메시지 발송 */}
            {tab === "broadcast" && (
              <div>
                <p className="text-xs text-gray-500 mb-3">
                  📣 모든 참여자({campaign.participantCount}명)에게 메시지를 일괄 발송합니다
                </p>
                <Input placeholder="메시지 제목" value={broadcastTitle} onChange={e => setBroadcastTitle(e.target.value)} className="mb-2 text-sm" />
                <Textarea placeholder="참여자들에게 전달할 내용을 입력하세요..." value={broadcastContent}
                  onChange={e => setBroadcastContent(e.target.value)} rows={4} className="text-sm resize-none mb-2" />
                <Button size="sm" onClick={() => broadcast.mutate({ title: broadcastTitle, content: broadcastContent })}
                  disabled={broadcast.isPending || !broadcastTitle || !broadcastContent}
                  className="w-full bg-indigo-600 hover:bg-indigo-700">
                  {broadcast.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <><Send className="w-3.5 h-3.5 mr-1.5" />{campaign.participantCount}명에게 발송</>}
                </Button>
                <p className="text-xs text-gray-400 text-center mt-1.5">
                  ※ 발송된 메시지는 캠페인 업데이트에 자동 저장됩니다
                </p>
              </div>
            )}

            {/* 참여자 목록 */}
            {tab === "participants" && (
              <div>
                {!participantsData ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" /></div>
                ) : participantsData.participants?.length === 0 ? (
                  <p className="text-center text-xs text-gray-400 py-4">아직 참여자가 없습니다</p>
                ) : (
                  <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                    {participantsData.participants?.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{p.participantName}</p>
                          <p className="text-xs text-gray-400">{new Date(p.participatedAt).toLocaleDateString("ko-KR")}</p>
                          {p.message && <p className="text-xs text-gray-500 mt-0.5 italic">"{p.message}"</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-indigo-600">{Number(p.amount).toLocaleString()}</p>
                          <p className="text-xs text-gray-400">코인</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-gray-50 flex justify-between text-xs text-gray-500">
                  <span>총 {participantsData?.total ?? 0}명</span>
                  <span>총 {current.toLocaleString()} 코인 모집</span>
                </div>
              </div>
            )}

            {/* 마일스톤 인증 */}
            {tab === "milestone" && (
              <div>
                {!campaign.milestones || campaign.milestones?.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">마일스톤이 없습니다</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {campaign.milestones?.filter((m: any) => m.status === "pending").map((m: any) => (
                      <div key={m.id} className="border border-gray-200 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500">단계 {m.stepNumber}</span>
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">대기 중</span>
                        </div>
                        <p className="text-sm font-medium text-gray-800">{m.title}</p>
                        {selectedMilestoneId === m.id ? (
                          <div className="mt-2">
                            <Textarea placeholder="완료 증빙 내용을 작성해주세요..." value={proofNote}
                              onChange={e => setProofNote(e.target.value)} rows={2} className="text-sm resize-none mb-2" />
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => setSelectedMilestoneId(null)} className="flex-1 text-xs">취소</Button>
                              <Button size="sm" onClick={() => startVote.mutate({ milestoneId: m.id, proofNote })}
                                disabled={startVote.isPending} className="flex-1 text-xs bg-indigo-600 hover:bg-indigo-700">
                                {startVote.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "투표 시작"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setSelectedMilestoneId(m.id)}
                            className="mt-2 w-full text-xs">
                            완료 인증 및 투표 시작
                          </Button>
                        )}
                      </div>
                    ))}
                    {campaign.milestones?.filter((m: any) => m.status !== "pending").map((m: any) => (
                      <div key={m.id} className={`border rounded-xl p-3 ${m.status === "approved" ? "border-green-200 bg-green-50" : m.status === "voting" ? "border-blue-200 bg-blue-50" : "border-red-200 bg-red-50"}`}>
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{m.title}</p>
                          <span className="text-xs">{m.status === "approved" ? "✅ 승인" : m.status === "voting" ? "🗳️ 투표중" : "❌ 거부"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────
export default function FundingMy() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"created" | "participated">("created");

  const { data: myData, isLoading } = useQuery({
    queryKey: ["/api/funding/my"],
    queryFn: () => fetch("/api/funding/my").then(r => r.json()),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-full py-20">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
    </div>
  );

  const created = myData?.created ?? [];
  const participated = myData?.participated ?? [];
  const myParticipations = myData?.participations ?? [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* 뒤로가기 */}
      <Link href="/funding">
        <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> 펀딩 목록으로
        </button>
      </Link>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">내 펀딩</h1>
          <p className="text-sm text-gray-400 mt-0.5">개설한 캠페인과 참여한 캠페인을 관리하세요</p>
        </div>
        <Link href="/funding/new">
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-3.5 h-3.5 mr-1" />새 캠페인
          </Button>
        </Link>
      </div>

      {/* 통계 요약 */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-indigo-50 rounded-2xl p-3 text-center">
          <p className="text-2xl font-black text-indigo-700">{created.length}</p>
          <p className="text-xs text-indigo-400 mt-0.5">개설 캠페인</p>
        </div>
        <div className="bg-emerald-50 rounded-2xl p-3 text-center">
          <p className="text-2xl font-black text-emerald-700">{created.filter((c: any) => c.status === "active").length}</p>
          <p className="text-xs text-emerald-400 mt-0.5">진행 중</p>
        </div>
        <div className="bg-amber-50 rounded-2xl p-3 text-center">
          <p className="text-2xl font-black text-amber-700">{created.reduce((sum: number, c: any) => sum + Number(c.currentAmount || 0), 0).toLocaleString()}</p>
          <p className="text-xs text-amber-400 mt-0.5">누적 달성</p>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
        {[
          { key: "created",     label: `개설한 캠페인 ${created.length}` },
          { key: "participated", label: `참여한 캠페인 ${participated.length}` },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 개설한 캠페인 */}
      {activeTab === "created" && (
        created.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">아직 개설한 캠페인이 없습니다</p>
            <Link href="/funding/new">
              <Button variant="outline" className="mt-4">첫 펀딩 시작하기</Button>
            </Link>
          </div>
        ) : (
          created.map((c: any) => <CreatorPanel key={c.id} campaign={c} />)
        )
      )}

      {/* 참여한 캠페인 */}
      {activeTab === "participated" && (
        participated.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">아직 참여한 캠페인이 없습니다</p>
            <Link href="/funding">
              <Button variant="outline" className="mt-4">캠페인 둘러보기</Button>
            </Link>
          </div>
        ) : (
          participated.map((c: any) => {
            const myParts = myParticipations.filter((p: any) => p.campaignId === c.id);
            const totalAmount = myParts.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
            const statusInfo = STATUS_INFO[c.status] ?? STATUS_INFO.draft;
            return (
              <Link key={c.id} href={`/funding/${c.id}`}>
                <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-3 shadow-sm hover:shadow-md transition-all cursor-pointer">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 text-sm flex-1 mr-2 line-clamp-1">{c.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <FundingGauge current={Number(c.currentAmount)} target={Number(c.targetAmount)} variant="bar" size="sm" />
                  <div className="flex justify-between mt-2 text-xs text-gray-400">
                    <span>내 참여금액: <span className="text-indigo-600 font-semibold">{totalAmount.toLocaleString()} 코인</span></span>
                    <span className={`font-medium ${myParts[0]?.status === "refunded" ? "text-red-500" : myParts[0]?.status === "released" ? "text-green-600" : "text-gray-500"}`}>
                      {myParts[0]?.status === "held" ? "에스크로 보관 중" : myParts[0]?.status === "released" ? "지급 완료" : myParts[0]?.status === "refunded" ? "환불 완료" : ""}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })
        )
      )}
    </div>
  );
}
