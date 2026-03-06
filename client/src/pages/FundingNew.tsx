/**
 * 캠페인 개설 폼
 * /funding/new
 */
import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateCampaign } from "@/hooks/use-funding";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Loader2, Image, Type, X, GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { Link } from "wouter";

const CATEGORIES = [
  { value: "agriculture", label: "🌾 농업/농산물" },
  { value: "startup",     label: "🚀 청년창업" },
  { value: "culture",     label: "🎭 문화/행사" },
  { value: "welfare",     label: "💙 복지" },
  { value: "education",   label: "📚 교육" },
  { value: "environment", label: "🌿 환경" },
  { value: "community",   label: "🏘️ 마을공동체" },
  { value: "other",       label: "📌 기타" },
];

const FUNDING_TYPES = [
  {
    value: "reward",
    label: "🎁 리워드형",
    desc: "펀딩 달성 시 참여자에게 물건/서비스를 제공합니다. 실패 시 자동 환불.",
  },
  {
    value: "donation",
    label: "💚 기부형",
    desc: "사회적 활동/선의 목적 모금입니다. 달성 후 집행, 환불 없음.",
  },
  {
    value: "profit_share",
    label: "📈 수익공유형",
    desc: "투자 개념. 수익 발생 시 참여 비율대로 배분됩니다.",
  },
  {
    value: "milestone",
    label: "🏁 마일스톤형",
    desc: "단계별로 자금을 집행합니다. 참여자 투표로 다음 단계가 진행됩니다.",
  },
];

const VISIBILITY = [
  { value: "org_only", label: "🔒 우리 조직만",  desc: "조직 구성원만 볼 수 있음" },
  { value: "region",   label: "🏘️ 지역 공개",   desc: "같은 지역 모든 사람" },
  { value: "public",   label: "🌐 전체 공개",    desc: "두런허브 전체 공개" },
];

interface RewardInput { title: string; description: string; minAmount: string; quantityLimit: string; }
interface MilestoneInput { title: string; description: string; releaseRatio: string; }
type StoryBlock = { type: "text"; content: string; level?: "h2" | "h3" | "body" } | { type: "image"; url: string; caption: string };

export default function FundingNew() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const createCampaign = useCreateCampaign();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const blockImageRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  const [step, setStep] = useState(1);
  const [coverImage, setCoverImage] = useState<string>("");
  const [coverUploading, setCoverUploading] = useState(false);
  const [storyBlocks, setStoryBlocks] = useState<StoryBlock[]>([{ type: "text", content: "" }]);
  const [blockUploading, setBlockUploading] = useState<number | null>(null);

  const [form, setForm] = useState({
    title: "",
    summary: "",
    category: "startup",
    fundingType: "reward",
    visibility: "org_only",
    targetAmount: "",
    minFunding: "1",
    endDate: "",
    profitShareRatio: "",
    acceptedCoinTypes: ["dorun_coin"] as string[],
  });
  const [rewards, setRewards] = useState<RewardInput[]>([
    { title: "", description: "", minAmount: "", quantityLimit: "" }
  ]);
  const [milestones, setMilestones] = useState<MilestoneInput[]>([
    { title: "", description: "", releaseRatio: "0.5" }
  ]);

  function updateForm(key: string, value: any) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function toggleCoinType(type: string) {
    setForm(prev => ({
      ...prev,
      acceptedCoinTypes: prev.acceptedCoinTypes.includes(type)
        ? prev.acceptedCoinTypes.filter(t => t !== type)
        : [...prev.acceptedCoinTypes, type],
    }));
  }

  // 대표 이미지 업로드
  async function uploadCoverImage(file: File) {
    setCoverUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
      const data = await res.json();
      setCoverImage(data.url || data.fileUrl || "");
    } catch {
      toast({ title: "이미지 업로드 실패", variant: "destructive" });
    } finally {
      setCoverUploading(false);
    }
  }

  // 블록 이미지 업로드
  async function uploadBlockImage(index: number, file: File) {
    setBlockUploading(index);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
      const data = await res.json();
      const url = data.url || data.fileUrl || "";
      setStoryBlocks(prev => prev.map((b, i) => i === index ? { ...b, url } as StoryBlock : b));
    } catch {
      toast({ title: "이미지 업로드 실패", variant: "destructive" });
    } finally {
      setBlockUploading(null);
    }
  }

  function addBlock(type: "text" | "image") {
    setStoryBlocks(prev => [...prev, type === "text" ? { type: "text", content: "", level: "body" as const } : { type: "image", url: "", caption: "" }]);
  }

  function removeBlock(index: number) {
    setStoryBlocks(prev => prev.filter((_, i) => i !== index));
  }

  function updateBlock(index: number, updates: Partial<StoryBlock>) {
    setStoryBlocks(prev => prev.map((b, i) => i === index ? { ...b, ...updates } as StoryBlock : b));
  }

  function moveBlock(index: number, dir: "up" | "down") {
    setStoryBlocks(prev => {
      const next = [...prev];
      const swapIdx = dir === "up" ? index - 1 : index + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
      return next;
    });
  }

  // 스토리 블록 → JSON 직렬화
  function serializeStory() {
    return JSON.stringify(storyBlocks);
  }

  async function handleSubmit(asDraft = false) {
    if (!form.title || !form.targetAmount || !form.endDate) {
      toast({ title: "제목, 목표 금액, 마감일을 입력해주세요.", variant: "destructive" });
      return;
    }

    const payload: any = {
      ...form,
      story: serializeStory(),
      coverImage,
      organizationId: (user as any)?.schoolId ?? 1,
      targetAmount: form.targetAmount,
      minFunding: form.minFunding,
      endDate: new Date(form.endDate).toISOString(),
      status: asDraft ? "draft" : "draft", // 항상 draft로 생성, submit은 별도
      rewards: form.fundingType === "reward" ? rewards.filter(r => r.title) : [],
      milestones: form.fundingType === "milestone" ? milestones.filter(m => m.title) : [],
    };

    if (form.fundingType !== "profit_share") delete payload.profitShareRatio;

    const result = await createCampaign.mutateAsync(payload);
    toast({ title: "✅ 캠페인이 저장되었습니다!", description: "승인 요청을 하면 검토 후 게시됩니다." });
    navigate(`/funding/${(result as any).campaign?.id ?? ""}`);
  }

  const progress = (step / 3) * 100;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/funding">
        <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> 돌아가기
        </button>
      </Link>

      <h1 className="text-xl font-bold text-gray-900 mb-1">🌱 새 펀딩 개설</h1>
      <p className="text-sm text-gray-400 mb-5">아이디어를 지역 사람들과 함께 실현해보세요</p>

      {/* 진행률 */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>기본 정보</span><span>유형 설정</span><span>상세 내용</span>
        </div>
        <div className="w-full h-1.5 bg-gray-100 rounded-full">
          <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* ───── Step 1: 기본 정보 ───── */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">제목 *</label>
            <Input placeholder="예: 영인 마늘 선주문 펀딩" value={form.title} onChange={e => updateForm("title", e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">한 줄 요약</label>
            <Input placeholder="캠페인을 한 문장으로 설명해주세요" value={form.summary} onChange={e => updateForm("summary", e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">카테고리</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CATEGORIES.map(c => (
                <button key={c.value} onClick={() => updateForm("category", c.value)}
                  className={`p-2 rounded-xl border text-xs font-medium transition-colors ${form.category === c.value ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-gray-200 hover:border-gray-300"}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">공개 범위</label>
            <div className="flex flex-col gap-2">
              {VISIBILITY.map(v => (
                <button key={v.value} onClick={() => updateForm("visibility", v.value)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${form.visibility === v.value ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-gray-300"}`}>
                  <div>
                    <p className="text-sm font-medium">{v.label}</p>
                    <p className="text-xs text-gray-400">{v.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <Button onClick={() => setStep(2)} className="bg-indigo-600 hover:bg-indigo-700">다음 →</Button>
        </div>
      )}

      {/* ───── Step 2: 유형 설정 ───── */}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">펀딩 유형 *</label>
            <div className="flex flex-col gap-2">
              {FUNDING_TYPES.map(t => (
                <button key={t.value} onClick={() => updateForm("fundingType", t.value)}
                  className={`p-4 rounded-xl border text-left transition-colors ${form.fundingType === t.value ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-gray-300"}`}>
                  <p className="font-medium text-sm">{t.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">목표 금액 (코인) *</label>
            <Input type="number" placeholder="예: 50000" value={form.targetAmount} onChange={e => updateForm("targetAmount", e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">최소 참여 금액 (코인)</label>
            <Input type="number" placeholder="1" value={form.minFunding} onChange={e => updateForm("minFunding", e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">펀딩 마감일 *</label>
            <Input type="date" value={form.endDate} onChange={e => updateForm("endDate", e.target.value)} />
          </div>

          {/* 수익공유형 추가 설정 */}
          {form.fundingType === "profit_share" && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">수익 배분 비율 (%)</label>
              <Input type="number" placeholder="예: 30 (30% 배분)" value={form.profitShareRatio}
                onChange={e => updateForm("profitShareRatio", String(Number(e.target.value) / 100))} />
            </div>
          )}

          {/* 허용 코인 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">허용 코인 유형</label>
            <div className="flex gap-2">
              {[
                { value: "dorun_coin", label: "💰 두런코인" },
                { value: "local_coin", label: "🏘️ 지역코인" },
              ].map(c => (
                <button key={c.value} onClick={() => toggleCoinType(c.value)}
                  className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${form.acceptedCoinTypes.includes(c.value) ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)} className="flex-1">← 이전</Button>
            <Button onClick={() => setStep(3)} className="flex-1 bg-indigo-600 hover:bg-indigo-700">다음 →</Button>
          </div>
        </div>
      )}

      {/* ───── Step 3: 상세 내용 ───── */}
      {step === 3 && (
        <div className="flex flex-col gap-5">

          {/* 대표 이미지 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">🖼️ 대표 이미지</label>
            <input type="file" accept="image/*" ref={coverInputRef} className="hidden"
              onChange={e => e.target.files?.[0] && uploadCoverImage(e.target.files[0])} />
            {coverImage ? (
              <div className="relative rounded-2xl overflow-hidden border border-gray-200 bg-gray-50">
                <img src={coverImage} alt="대표 이미지" className="w-full h-48 object-cover" />
                <button onClick={() => setCoverImage("")}
                  className="absolute top-2 right-2 bg-white rounded-full p-1 shadow text-gray-500 hover:text-red-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button onClick={() => coverInputRef.current?.click()}
                className="w-full h-40 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-indigo-400 hover:text-indigo-400 transition-colors">
                {coverUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Image className="w-8 h-8" /><span className="text-sm">클릭해서 대표 이미지 업로드</span></>}
              </button>
            )}
          </div>

          {/* 스토리 블록 에디터 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">📝 스토리 (본문)</label>
            <div className="flex flex-col gap-3">
              {storyBlocks.map((block, index) => (
                <div key={index} className="relative group border border-gray-200 rounded-2xl bg-white hover:border-indigo-300 transition-colors overflow-hidden">
                  {/* 블록 헤더 */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />
                    <div className="flex gap-1 flex-1">
                      {block.type === "text" && (
                        <>
                          {(["h2", "h3", "body"] as const).map(level => (
                            <button
                              key={level}
                              onClick={() => updateBlock(index, { level })}
                              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                                (block as any).level === level || (!((block as any).level) && level === "body")
                                  ? "bg-indigo-100 text-indigo-700"
                                  : "text-gray-400 hover:bg-gray-100"
                              }`}
                            >
                              {level === "h2" ? "H2" : level === "h3" ? "H3" : "본문"}
                            </button>
                          ))}
                        </>
                      )}
                      {block.type === "image" && (
                        <span className="text-xs text-gray-400">🖼️ 이미지 블록</span>
                      )}
                    </div>
                    <div className="flex gap-1 items-center">
                      <button onClick={() => moveBlock(index, "up")} disabled={index === 0}
                        className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30 transition-colors">
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => moveBlock(index, "down")} disabled={index === storyBlocks.length - 1}
                        className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30 transition-colors">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => removeBlock(index)}
                        className="p-0.5 text-gray-300 hover:text-red-400 transition-colors ml-1">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {/* 블록 본문 */}
                  <div className="p-3">
                    {block.type === "text" ? (
                      <Textarea
                        placeholder="내용을 입력하세요..."
                        value={block.content}
                        onChange={e => updateBlock(index, { content: e.target.value })}
                        rows={5}
                        className={`resize-none border-0 p-0 focus-visible:ring-0 text-sm text-gray-700 ${
                          (block as any).level === "h2" ? "text-xl font-bold" :
                          (block as any).level === "h3" ? "text-lg font-semibold" : ""
                        }`}
                      />
                    ) : (
                      <div className="flex flex-col gap-2">
                        <input type="file" accept="image/*"
                          ref={el => { blockImageRefs.current[index] = el; }}
                          className="hidden"
                          onChange={e => e.target.files?.[0] && uploadBlockImage(index, e.target.files[0])} />
                        {block.url ? (
                          <div className="relative">
                            <img src={block.url} alt="" className="w-full rounded-xl object-cover max-h-64" />
                            <button onClick={() => updateBlock(index, { url: "" } as any)}
                              className="absolute top-2 right-2 bg-white rounded-full p-1 shadow text-gray-500 hover:text-red-500">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => blockImageRefs.current[index]?.click()}
                            className="w-full h-40 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-indigo-300 hover:text-indigo-400 transition-colors text-sm">
                            {blockUploading === index ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Image className="w-7 h-7" /> <span>클릭해서 이미지 업로드</span></>}
                          </button>
                        )}
                        <Input placeholder="이미지 설명 (선택)" value={block.caption}
                          onChange={e => updateBlock(index, { caption: e.target.value })}
                          className="text-xs text-gray-500 border-0 border-b rounded-none focus-visible:ring-0 px-0" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => addBlock("text")}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-dashed border-indigo-200 text-sm text-indigo-500 hover:bg-indigo-50 transition-colors font-medium">
                <Type className="w-4 h-4" /> 텍스트 추가
              </button>
              <button onClick={() => addBlock("image")}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-dashed border-purple-200 text-sm text-purple-500 hover:bg-purple-50 transition-colors font-medium">
                <Image className="w-4 h-4" /> 이미지 추가
              </button>
            </div>
          </div>

          {/* 리워드형: 리워드 추가 */}
          {form.fundingType === "reward" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">🎁 리워드 설정</label>
                <Button size="sm" variant="outline" onClick={() => setRewards(prev => [...prev, { title: "", description: "", minAmount: "", quantityLimit: "" }])}>
                  <Plus className="w-3.5 h-3.5 mr-1" />추가
                </Button>
              </div>
              {rewards.map((r, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-3 mb-2">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-500">리워드 {i + 1}</span>
                    {rewards.length > 1 && (
                      <button onClick={() => setRewards(prev => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    )}
                  </div>
                  <Input placeholder="리워드 이름 (예: 마늘 5kg + 농장 체험)" value={r.title}
                    onChange={e => setRewards(prev => prev.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x))} className="mb-2 text-sm" />
                  <Input placeholder="리워드 설명" value={r.description}
                    onChange={e => setRewards(prev => prev.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))} className="mb-2 text-sm" />
                  <div className="flex gap-2">
                    <Input type="number" placeholder="최소 금액" value={r.minAmount}
                      onChange={e => setRewards(prev => prev.map((x, idx) => idx === i ? { ...x, minAmount: e.target.value } : x))} className="text-sm" />
                    <Input type="number" placeholder="수량 제한 (빈칸=무제한)" value={r.quantityLimit}
                      onChange={e => setRewards(prev => prev.map((x, idx) => idx === i ? { ...x, quantityLimit: e.target.value } : x))} className="text-sm" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 마일스톤형: 단계 추가 */}
          {form.fundingType === "milestone" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">🏁 마일스톤 단계</label>
                <Button size="sm" variant="outline" onClick={() => setMilestones(prev => [...prev, { title: "", description: "", releaseRatio: "" }])}>
                  <Plus className="w-3.5 h-3.5 mr-1" />추가
                </Button>
              </div>
              {milestones.map((m, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-3 mb-2">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-500">단계 {i + 1}</span>
                    {milestones.length > 1 && (
                      <button onClick={() => setMilestones(prev => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    )}
                  </div>
                  <Input placeholder="단계 이름 (예: MVP 개발 완료)" value={m.title}
                    onChange={e => setMilestones(prev => prev.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x))} className="mb-2 text-sm" />
                  <Input placeholder="설명" value={m.description}
                    onChange={e => setMilestones(prev => prev.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))} className="mb-2 text-sm" />
                  <Input type="number" placeholder="집행 비율 (예: 30 → 30%)" value={m.releaseRatio}
                    onChange={e => setMilestones(prev => prev.map((x, idx) => idx === i ? { ...x, releaseRatio: String(Number(e.target.value) / 100) } : x))} className="text-sm" />
                </div>
              ))}
              <p className="text-xs text-gray-400">※ 전체 비율 합계가 100%가 되어야 합니다</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)} className="flex-1">← 이전</Button>
            <Button onClick={() => handleSubmit(true)} variant="outline" className="flex-1" disabled={createCampaign.isPending}>
              임시저장
            </Button>
            <Button onClick={() => handleSubmit(false)} className="flex-1 bg-indigo-600 hover:bg-indigo-700" disabled={createCampaign.isPending}>
              {createCampaign.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "저장 완료"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
