/**
 * 펀딩 메인 — 캠페인 목록
 * /funding
 */
import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampaignCard } from "@/components/CampaignCard";
import { useCampaigns } from "@/hooks/use-funding";
import { useAuth } from "@/hooks/use-auth";
import { Plus, Search, Filter, Loader2, TrendingUp } from "lucide-react";

const CATEGORIES = [
  { value: "", label: "전체" },
  { value: "agriculture", label: "🌾 농업" },
  { value: "startup",     label: "🚀 창업" },
  { value: "culture",     label: "🎭 문화" },
  { value: "welfare",     label: "💙 복지" },
  { value: "education",   label: "📚 교육" },
  { value: "environment", label: "🌿 환경" },
  { value: "community",   label: "🏘️ 마을" },
  { value: "other",       label: "📌 기타" },
];

const TYPES = [
  { value: "", label: "전체 유형" },
  { value: "reward",       label: "리워드형" },
  { value: "donation",     label: "기부형" },
  { value: "profit_share", label: "수익공유형" },
  { value: "milestone",    label: "마일스톤형" },
];

const STATUSES = [
  { value: "active",  label: "진행 중" },
  { value: "success", label: "달성 완료" },
  { value: "pending", label: "승인 대기" },
];

export default function FundingList() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("active");

  const { data, isLoading } = useCampaigns({
    category: selectedCategory || undefined,
    type: selectedType || undefined,
    status: selectedStatus || undefined,
  });

  const campaigns = (data?.campaigns ?? []).filter(c =>
    !search || c.title.includes(search) || (c.summary ?? "").includes(search)
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🌱 지역 펀딩</h1>
          <p className="text-sm text-gray-500 mt-0.5">우리 지역 아이디어에 함께 투자해요</p>
        </div>
        <div className="flex gap-2">
          <Link href="/funding/my">
            <Button variant="outline" size="sm" className="text-xs">내 펀딩</Button>
          </Link>
          <Link href="/funding/admin">
            <Button variant="outline" size="sm" className="text-xs">관리</Button>
          </Link>
          <Link href="/funding/new">
            <Button className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700" size="sm">
              <Plus className="w-4 h-4" />펀딩 시작
            </Button>
          </Link>
        </div>
      </div>

      {/* 상태 탭 */}
      <div className="flex gap-2 mb-4">
        {STATUSES.map(s => (
          <button
            key={s.value}
            onClick={() => setSelectedStatus(s.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedStatus === s.value
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 검색 */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="캠페인 검색..."
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* 카테고리 필터 */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 no-scrollbar">
        {CATEGORIES.map(c => (
          <button
            key={c.value}
            onClick={() => setSelectedCategory(c.value)}
            className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              selectedCategory === c.value
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* 유형 필터 */}
      <div className="flex gap-2 mb-6">
        {TYPES.map(t => (
          <button
            key={t.value}
            onClick={() => setSelectedType(t.value)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              selectedType === t.value
                ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                : "bg-gray-50 text-gray-500 border border-gray-100 hover:border-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 목록 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">캠페인이 없습니다</p>
          <p className="text-sm mt-1">첫 번째 펀딩을 시작해보세요!</p>
          <Link href="/funding/new">
            <Button variant="outline" className="mt-4">펀딩 시작하기</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campaigns.map(campaign => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}
    </div>
  );
}
