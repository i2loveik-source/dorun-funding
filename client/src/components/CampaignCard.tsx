/**
 * 캠페인 카드 컴포넌트
 */
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { FundingGauge } from "./FundingGauge";
import { Clock, Users, Star } from "lucide-react";
import type { Campaign } from "@/hooks/use-funding";

const CATEGORY_LABELS: Record<string, string> = {
  agriculture: "🌾 농업",
  startup:     "🚀 청년창업",
  culture:     "🎭 문화",
  welfare:     "💙 복지",
  education:   "📚 교육",
  environment: "🌿 환경",
  community:   "🏘️ 마을",
  other:       "📌 기타",
};

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  reward:       { label: "리워드형", color: "bg-blue-100 text-blue-700" },
  donation:     { label: "기부형",   color: "bg-green-100 text-green-700" },
  profit_share: { label: "수익공유형", color: "bg-purple-100 text-purple-700" },
  milestone:    { label: "마일스톤형", color: "bg-orange-100 text-orange-700" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:      { label: "작성 중",    color: "bg-gray-100 text-gray-600" },
  pending:    { label: "승인 대기",  color: "bg-yellow-100 text-yellow-700" },
  active:     { label: "진행 중",    color: "bg-emerald-100 text-emerald-700" },
  success:    { label: "목표 달성",  color: "bg-green-100 text-green-700" },
  failed:     { label: "종료",       color: "bg-red-100 text-red-600" },
  refunding:  { label: "환불 중",    color: "bg-orange-100 text-orange-700" },
  completed:  { label: "완료",       color: "bg-gray-100 text-gray-600" },
};

function daysLeft(endDate: string) {
  const diff = new Date(endDate).getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return "마감";
  if (days === 0) return "오늘 마감";
  return `D-${days}`;
}

interface CampaignCardProps {
  campaign: Campaign;
}

export function CampaignCard({ campaign }: CampaignCardProps) {
  const typeInfo = TYPE_LABELS[campaign.fundingType];
  const statusInfo = STATUS_LABELS[campaign.status];
  const current = Number(campaign.currentAmount);
  const target = Number(campaign.targetAmount);

  return (
    <Link href={`/funding/${campaign.id}`}>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden group">
        {/* 커버 이미지 */}
        <div className="relative h-40 bg-gradient-to-br from-indigo-100 to-purple-100 overflow-hidden">
          {campaign.coverImageUrl ? (
            <img
              src={campaign.coverImageUrl}
              alt={campaign.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl">
              {CATEGORY_LABELS[campaign.category]?.split(" ")[0] ?? "📌"}
            </div>
          )}
          {/* 상단 배지들 */}
          <div className="absolute top-2 left-2 flex gap-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeInfo?.color}`}>
              {typeInfo?.label}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo?.color}`}>
              {statusInfo?.label}
            </span>
          </div>
          {/* 마감 D-day */}
          <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
            {daysLeft(campaign.endDate)}
          </div>
        </div>

        {/* 본문 */}
        <div className="p-4">
          <p className="text-xs text-gray-400 mb-1">{CATEGORY_LABELS[campaign.category]}</p>
          <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-1 line-clamp-2">
            {campaign.title}
          </h3>
          {campaign.summary && (
            <p className="text-xs text-gray-500 mb-3 line-clamp-2">{campaign.summary}</p>
          )}

          {/* 게이지 */}
          <FundingGauge
            current={current}
            target={target}
            variant="bar"
            size="sm"
            showLabel={true}
          />

          {/* 하단 정보 */}
          <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {campaign.participantCount.toLocaleString()}명 참여
            </span>
            <span className="font-medium text-gray-600">
              목표 {Number(campaign.targetAmount).toLocaleString()} 코인
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
