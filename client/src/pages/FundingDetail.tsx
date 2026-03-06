/**
 * 캠페인 상세 페이지
 * /funding/:id
 */
import { useState } from "react";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { RealtimeFundingGauge, FundingGauge } from "@/components/FundingGauge";
import { useCampaign, useParticipate, useMilestoneVote, useSocialProof, useWriteReview } from "@/hooks/use-funding";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Users, Clock, Star, CheckCircle, ChevronRight,
  MessageCircle, TrendingUp, Award, AlertCircle, Loader2, Coins
} from "lucide-react";

function daysLeft(endDate: string) {
  const diff = new Date(endDate).getTime() - Date.now();
  const d = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (d < 0) return "마감됨";
  if (d === 0) return "오늘 마감";
  return `${d}일 남음`;
}

function TrustBadge({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={`w-3.5 h-3.5 ${i <= level ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`} />
      ))}
    </div>
  );
}

const TYPE_DESC: Record<string, string> = {
  reward:       "🎁 목표 달성 시 리워드를 받을 수 있어요",
  donation:     "💚 순수 기부 목적 캠페인입니다",
  profit_share: "📈 수익 발생 시 투자 비율대로 배분됩니다",
  milestone:    "🏁 단계별로 자금이 집행되는 캠페인입니다",
};

export default function FundingDetail() {
  const [, params] = useRoute("/funding/:id");
  const id = Number(params?.id);
  const { user } = useAuth();
  const { toast } = useToast();
  const { data, isLoading } = useCampaign(id);
  const participate = useParticipate();
  const milestoneVote = useMilestoneVote();
  const writeReview = useWriteReview();
  const { data: socialProof } = useSocialProof(id);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewContent, setReviewContent] = useState("");

  const [amount, setAmount] = useState("");
  const [selectedCoinType, setSelectedCoinType] = useState<"dorun_coin" | "local_coin">("dorun_coin");
  const [selectedRewardId, setSelectedRewardId] = useState<number | null>(null);

  // 지갑 잔액 조회
  const { data: walletData } = useQuery<{ wallets: Array<{ assetTypeId: number; symbol: string; name: string; coinType: "dorun_coin" | "local_coin"; balance: string; availableBalance: string; orgName?: string }> }>({
    queryKey: ["/api/funding/campaigns", id, "wallets"],
    queryFn: () => fetch(`/api/funding/campaigns/${id}/wallets`, { credentials: "include" }).then(r => r.json()),
    enabled: !!id,
  });
  const wallets = walletData?.wallets ?? [];
  const selectedWallet = wallets.find(w => w.coinType === selectedCoinType) ?? wallets[0];
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"story" | "updates" | "milestones" | "reviews">("story");

  if (isLoading) return (
    <div className="flex items-center justify-center h-full py-20">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
    </div>
  );

  if (!data?.campaign) return (
    <div className="text-center py-20 text-gray-400">캠페인을 찾을 수 없습니다.</div>
  );

  const { campaign, rewards, milestones, updates, creatorProfile } = data;
  const current = Number(campaign.currentAmount);
  const target = Number(campaign.targetAmount);
  const canParticipate = campaign.status === "active";

  async function handleParticipate() {
    if (!amount || Number(amount) < Number(campaign.minFunding)) {
      toast({ title: `최소 ${campaign.minFunding} 코인 이상 입력해주세요.`, variant: "destructive" });
      return;
    }
    const available = Number(selectedWallet?.availableBalance ?? 0);
    if (Number(amount) > available) {
      toast({ title: `잔액 부족: ${selectedWallet?.symbol ?? "코인"} 잔액이 ${available.toLocaleString()} 입니다.`, variant: "destructive" });
      return;
    }
    const result = await participate.mutateAsync({
      campaignId: id,
      amount: Number(amount),
      coinType: selectedCoinType,
      rewardId: selectedRewardId ?? undefined,
      message: message || undefined,
      organizationId: campaign.organizationId ? Number(campaign.organizationId) : undefined,
    });
    toast({ title: "✅ 펀딩 참여 완료!", description: `${Number(amount).toLocaleString()} ${selectedWallet?.symbol ?? "코인"}이 에스크로에 보관됩니다.` });
    setAmount("");
    setMessage("");
  }

  async function handleVote(milestoneId: number, vote: boolean) {
    await milestoneVote.mutateAsync({ milestoneId, vote });
    toast({ title: vote ? "✅ 승인 투표 완료" : "❌ 거부 투표 완료" });
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* 뒤로가기 */}
      <Link href="/funding">
        <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> 목록으로
        </button>
      </Link>

      {/* 커버 이미지 */}
      <div className="rounded-2xl overflow-hidden mb-5 bg-gradient-to-br from-indigo-100 to-purple-100 h-52 flex items-center justify-center">
        {campaign.coverImageUrl ? (
          <img src={campaign.coverImageUrl} alt={campaign.title} className="w-full h-full object-cover" />
        ) : (
          <span className="text-6xl">🌱</span>
        )}
      </div>

      {/* 제목 + 배지 */}
      <div className="mb-4">
        <div className="flex gap-2 mb-2 flex-wrap">
          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
            {TYPE_DESC[campaign.fundingType]?.split(" ")[0]}
          </span>
          {campaign.status === "active" && (
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
              진행 중
            </span>
          )}
          {campaign.status === "success" && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              🎉 목표 달성!
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold text-gray-900">{campaign.title}</h1>
        {campaign.summary && <p className="text-sm text-gray-500 mt-1">{campaign.summary}</p>}
      </div>

      {/* 개설자 정보 */}
      {creatorProfile && (
        <div className="flex items-center gap-2 mb-4 p-3 bg-gray-50 rounded-xl">
          <Award className="w-4 h-4 text-indigo-500" />
          <div>
            <p className="text-xs text-gray-500">개설자 신뢰 등급</p>
            <TrustBadge level={creatorProfile.trustBadge} />
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-400">완료율</p>
            <p className="text-sm font-semibold text-gray-700">
              {creatorProfile.totalCampaigns > 0
                ? Math.round((creatorProfile.completedCampaigns / creatorProfile.totalCampaigns) * 100)
                : 0}%
            </p>
          </div>
        </div>
      )}

      {/* 실시간 게이지 */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-4 shadow-sm">
        <div className="flex justify-between items-end mb-3">
          <div>
            <p className="text-2xl font-bold text-gray-900">{current.toLocaleString()}<span className="text-base font-normal text-gray-400 ml-1">코인</span></p>
            <p className="text-xs text-gray-400">목표 {target.toLocaleString()} 코인</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-indigo-600 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />{daysLeft(campaign.endDate)}
            </p>
            <p className="text-xs text-gray-400 flex items-center gap-1 justify-end">
              <Users className="w-3 h-3" />{campaign.participantCount}명 참여
            </p>
          </div>
        </div>

        {/* 두 종류 게이지 동시 표시 */}
        <div className="flex gap-4 items-center">
          <div className="flex-1">
            <RealtimeFundingGauge
              campaignId={id}
              initialCurrent={current}
              target={target}
              variant="bar"
              size="md"
            />
          </div>
          <FundingGauge current={current} target={target} variant="circle" size="sm" showLabel={false} />
        </div>

        <p className="text-xs text-indigo-600 mt-2 bg-indigo-50 rounded-lg px-3 py-1.5">
          {TYPE_DESC[campaign.fundingType]}
        </p>
      </div>

      {/* 3-4: 소셜 증거 — 지인 참여 여부 */}
      {socialProof && socialProof.totalFriends > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 mb-4 flex items-start gap-2">
          <span className="text-lg">👥</span>
          <div>
            <p className="text-sm font-medium text-amber-800">
              {socialProof.friendsParticipated.slice(0, 3).map((f: any) => f.name).join(", ")}
              {socialProof.totalFriends > 3 ? ` 외 ${socialProof.totalFriends - 3}명` : ""}이 참여했어요!
            </p>
            <p className="text-xs text-amber-600 mt-0.5">같은 조직 동료들이 이 캠페인을 응원하고 있습니다</p>
          </div>
        </div>
      )}

      {/* 참여 폼 */}
      {canParticipate && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-4">
          <h3 className="font-semibold text-gray-800 mb-3">💳 펀딩 참여</h3>

          {/* 리워드 선택 (리워드형) */}
          {campaign.fundingType === "reward" && rewards.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-2">리워드 선택 (선택사항)</p>
              <div className="flex flex-col gap-2">
                {rewards.map(r => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setSelectedRewardId(selectedRewardId === r.id ? null : r.id);
                      setAmount(String(r.minAmount));
                    }}
                    className={`text-left p-3 rounded-xl border text-sm transition-colors ${
                      selectedRewardId === r.id
                        ? "border-indigo-400 bg-white shadow-sm"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <div className="flex justify-between">
                      <span className="font-medium">{r.title}</span>
                      <span className="text-indigo-600 font-semibold">{Number(r.minAmount).toLocaleString()}코인~</span>
                    </div>
                    {r.description && <p className="text-xs text-gray-400 mt-0.5">{r.description}</p>}
                    {r.quantityLimit && (
                      <p className="text-xs text-orange-500 mt-0.5">
                        잔여 {r.quantityLimit - r.quantityUsed}/{r.quantityLimit}개
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 코인 선택 */}
          {wallets.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1"><Coins className="w-3 h-3" /> 결제 코인 선택</p>
              <div className="flex gap-2 flex-wrap">
                {wallets.map(w => (
                  <button
                    key={w.coinType}
                    onClick={() => setSelectedCoinType(w.coinType)}
                    className={`flex-1 min-w-[120px] px-3 py-2 rounded-xl border text-sm text-left transition-all ${
                      selectedCoinType === w.coinType
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <div className="font-semibold">{w.symbol}</div>
                    <div className="text-xs text-gray-400">{w.coinType === "dorun_coin" ? "두런 메인코인" : `지역코인${w.orgName ? ` · ${w.orgName}` : ""}`}</div>
                    <div className={`text-xs font-medium mt-0.5 ${Number(w.availableBalance) <= 0 ? "text-red-400" : "text-emerald-600"}`}>
                      잔액 {Number(w.availableBalance).toLocaleString()}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 mb-2">
            <Input
              type="number"
              placeholder={`최소 ${campaign.minFunding} ${selectedWallet?.symbol ?? "코인"}`}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="bg-white"
            />
          </div>
          <Textarea
            placeholder="응원 메시지 (선택사항)"
            value={message}
            onChange={e => setMessage(e.target.value)}
            className="bg-white mb-2 text-sm resize-none"
            rows={2}
          />
          <Button
            onClick={handleParticipate}
            disabled={participate.isPending}
            className="w-full bg-indigo-600 hover:bg-indigo-700"
          >
            {participate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : `🌱 ${selectedWallet?.symbol ?? "코인"}으로 펀딩 참여`}
          </Button>
          <p className="text-xs text-gray-400 text-center mt-2">
            목표 미달 시 전액 자동 환불됩니다
          </p>
        </div>
      )}

      {/* 탭 */}
      <div className="flex border-b mb-4">
        {[
          { key: "story", label: "스토리" },
          { key: "updates", label: `업데이트 ${updates.length}` },
          { key: "milestones", label: `마일스톤 ${milestones.length}` },
          { key: "reviews", label: `후기 ${(data?.reviews ?? []).length}` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 스토리 */}
      {activeTab === "story" && (
        <div className="flex flex-col gap-4">
          {campaign.story ? (
            (() => {
              try {
                const blocks = JSON.parse(campaign.story);
                if (Array.isArray(blocks)) {
                  return blocks.map((block: any, i: number) =>
                    block.type === "image" ? (
                      <figure key={i} className="my-6">
                        <img src={block.url} alt={block.caption} className="w-full rounded-2xl object-cover" />
                        {block.caption && <figcaption className="text-xs text-gray-400 text-center mt-2">{block.caption}</figcaption>}
                      </figure>
                    ) : block.level === "h2" ? (
                      <h2 key={i} className="text-xl font-bold text-gray-900 mt-8 mb-3">{block.content}</h2>
                    ) : block.level === "h3" ? (
                      <h3 key={i} className="text-lg font-semibold text-gray-800 mt-6 mb-2">{block.content}</h3>
                    ) : (
                      <p key={i} className="text-sm text-gray-700 leading-relaxed mb-4 whitespace-pre-wrap">{block.content}</p>
                    )
                  );
                }
              } catch {}
              // fallback: 일반 텍스트
              return <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{campaign.story}</p>;
            })()
          ) : (
            <p className="text-gray-400">스토리가 없습니다.</p>
          )}
        </div>
      )}

      {/* 업데이트 */}
      {activeTab === "updates" && (
        <div className="flex flex-col gap-3">
          {updates.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">아직 업데이트가 없습니다.</p>
          ) : updates.map(u => (
            <div key={u.id} className="border border-gray-100 rounded-xl p-4">
              <h4 className="font-semibold text-sm text-gray-800">{u.title}</h4>
              <p className="text-xs text-gray-400 mt-0.5 mb-2">
                {new Date(u.createdAt).toLocaleDateString("ko-KR")}
              </p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{u.content}</p>
            </div>
          ))}
          {campaign.updateWarnings > 0 && (
            <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-700">
              <AlertCircle className="w-4 h-4" />
              업데이트 경고 {campaign.updateWarnings}회 — 2주마다 업데이트가 필요합니다
            </div>
          )}
        </div>
      )}

      {/* 마일스톤 */}
      {activeTab === "milestones" && (
        <div className="flex flex-col gap-3">
          {milestones.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">마일스톤이 없습니다.</p>
          ) : milestones.map(m => (
            <div key={m.id} className={`border rounded-xl p-4 ${
              m.status === "approved" ? "border-green-200 bg-green-50" :
              m.status === "voting"   ? "border-blue-200 bg-blue-50" :
              m.status === "rejected" ? "border-red-200 bg-red-50" : "border-gray-100"
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">단계 {m.stepNumber}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  m.status === "approved" ? "bg-green-100 text-green-700" :
                  m.status === "voting"   ? "bg-blue-100 text-blue-700" :
                  m.status === "rejected" ? "bg-red-100 text-red-600" :
                  "bg-gray-100 text-gray-500"
                }`}>
                  {m.status === "approved" ? "✅ 승인됨" :
                   m.status === "voting"   ? "🗳️ 투표 중" :
                   m.status === "rejected" ? "❌ 거부됨" : "대기 중"}
                </span>
              </div>
              <h4 className="font-semibold text-sm">{m.title}</h4>
              <p className="text-xs text-gray-500 mt-0.5">자금 집행 비율: {Math.round(Number(m.releaseRatio) * 100)}%</p>
              {m.description && <p className="text-xs text-gray-500 mt-1">{m.description}</p>}

              {/* 투표 버튼 */}
              {m.status === "voting" && (
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm" variant="outline"
                    onClick={() => handleVote(m.id, true)}
                    className="flex-1 text-green-700 border-green-300 hover:bg-green-50"
                  >
                    ✅ 승인
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => handleVote(m.id, false)}
                    className="flex-1 text-red-600 border-red-300 hover:bg-red-50"
                  >
                    ❌ 거부
                  </Button>
                </div>
              )}
              {m.voteDeadline && m.status === "voting" && (
                <p className="text-xs text-gray-400 mt-1">
                  투표 마감: {new Date(m.voteDeadline).toLocaleDateString("ko-KR")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 후기 탭 */}
      {activeTab === "reviews" && (
        <div>
          {/* 후기 작성 */}
          {campaign.status === "completed" && (
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">후기 작성</p>
              <div className="flex gap-1 mb-2">
                {[1,2,3,4,5].map(i => (
                  <button key={i} onClick={() => setReviewRating(i)}>
                    <Star className={`w-6 h-6 ${i <= reviewRating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
                  </button>
                ))}
              </div>
              <Textarea placeholder="이 캠페인에 대한 후기를 남겨주세요..." value={reviewContent}
                onChange={e => setReviewContent(e.target.value)} rows={3} className="text-sm resize-none mb-2" />
              <Button size="sm" onClick={async () => {
                if (!reviewRating) return toast({ title: "별점을 선택해주세요.", variant: "destructive" });
                await writeReview.mutateAsync({ campaignId: id, rating: reviewRating, content: reviewContent });
                toast({ title: "✅ 후기가 등록되었습니다!" });
                setReviewRating(0); setReviewContent("");
              }} disabled={writeReview.isPending} className="w-full bg-indigo-600 hover:bg-indigo-700">
                {writeReview.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "후기 등록"}
              </Button>
            </div>
          )}

          {/* 후기 목록 */}
          {(data?.reviews ?? []).length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">아직 후기가 없습니다.</p>
          ) : (data?.reviews ?? []).map((r: any) => (
            <div key={r.id} className="border border-gray-100 rounded-xl p-4 mb-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map(i => (
                    <Star key={i} className={`w-3.5 h-3.5 ${i <= r.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`} />
                  ))}
                </div>
                <span className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString("ko-KR")}</span>
              </div>
              {r.content && <p className="text-sm text-gray-600">{r.content}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
