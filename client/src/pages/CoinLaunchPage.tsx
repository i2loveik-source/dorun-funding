/**
 * 지역코인 런치패드 /coin/launch
 * 
 * - 지역코인 발행 신청 폼
 * - 내 신청 현황
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Rocket, CheckCircle2, Clock, XCircle, Coins, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

const STATUS_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  pending:  { label: "검토 중",  icon: Clock,        color: "text-yellow-500" },
  approved: { label: "승인됨",   icon: CheckCircle2, color: "text-blue-500"   },
  rejected: { label: "반려됨",   icon: XCircle,      color: "text-red-500"    },
  launched: { label: "발행 완료", icon: Rocket,       color: "text-green-500"  },
};

export default function CoinLaunchPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"apply" | "my">("apply");

  const [form, setForm] = useState({
    name: "", symbol: "", description: "", maxSupply: "", initialSupply: "", useCase: "",
  });

  const { data: myList = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/economy/launch"],
    queryFn: () => apiRequest("GET", "/api/economy/launch").then(r => r.json()),
    enabled: !!user,
  });

  const { data: orgList = [] } = useQuery<any[]>({
    queryKey: ["/api/organizations"],
    queryFn: () => apiRequest("GET", "/api/organizations").then(r => r.json()),
    enabled: !!user,
  });

  const submitMutation = useMutation({
    mutationFn: (orgId: number) => apiRequest("POST", "/api/economy/launch", {
      organizationId: orgId,
      name: form.name,
      symbol: form.symbol.toUpperCase(),
      description: form.description || null,
      maxSupply: form.maxSupply ? Number(form.maxSupply) : null,
      initialSupply: Number(form.initialSupply) || 0,
      useCase: form.useCase || null,
    }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "오류", description: data.error, variant: "destructive" }); return; }
      toast({ title: "신청 완료 🚀", description: data.message });
      setForm({ name: "", symbol: "", description: "", maxSupply: "", initialSupply: "", useCase: "" });
      qc.invalidateQueries({ queryKey: ["/api/economy/launch"] });
      setTab("my");
    },
    onError: () => toast({ title: "오류", description: "신청 중 오류가 발생했습니다.", variant: "destructive" }),
  });

  const myOrg = orgList[0]; // 첫 번째 소속 조직 사용 (다중 조직 지원 확장 가능)

  if (!user) return <div className="p-6 text-muted-foreground">로그인이 필요합니다.</div>;

  return (
    <div className="max-w-xl mx-auto p-4 sm:p-6 space-y-4">
      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Rocket size={20} /> 지역코인 런치패드
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          우리 조직만의 코인을 발행하세요. 관리자 승인 후 즉시 사용 가능합니다.
        </p>
      </div>

      {/* 탭 */}
      <div className="flex border-b">
        {(["apply", "my"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}>
            {t === "apply" ? "신청하기" : `내 신청 (${myList.length})`}
          </button>
        ))}
      </div>

      {/* 신청 폼 */}
      {tab === "apply" && (
        <div className="space-y-3">
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm space-y-1">
            <div className="font-medium flex items-center gap-1.5">
              <AlertCircle size={14} className="text-blue-500" /> 안내
            </div>
            <ul className="text-muted-foreground space-y-0.5 ml-4 list-disc text-xs">
              <li>승인 후 DR-Base(DRB) ↔ 지역코인 환전이 자동 등록됩니다</li>
              <li>초기 물량은 신청자 지갑으로 즉시 지급됩니다</li>
              <li>심볼은 2~8자 영문 대문자 (예: YICC, SCHOOL)</li>
            </ul>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">코인 이름 *</label>
            <Input placeholder="예: 영인마을코인" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">심볼 * (2~8자 영문)</label>
            <Input placeholder="예: YICC" value={form.symbol} maxLength={8}
              onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
              className="uppercase font-mono" />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">용도 설명</label>
            <Textarea placeholder="이 코인을 어디에 사용할 계획인가요?" value={form.useCase} rows={2}
              onChange={e => setForm(f => ({ ...f, useCase: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">초기 발행량</label>
              <Input type="number" min="0" placeholder="0" value={form.initialSupply}
                onChange={e => setForm(f => ({ ...f, initialSupply: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">최대 발행 한도 (빈칸=무제한)</label>
              <Input type="number" min="0" placeholder="무제한" value={form.maxSupply}
                onChange={e => setForm(f => ({ ...f, maxSupply: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">부가 설명</label>
            <Textarea placeholder="추가 설명이 있다면 입력하세요." value={form.description} rows={2}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>

          <Button
            className="w-full"
            disabled={!form.name || !form.symbol || submitMutation.isPending || !myOrg}
            onClick={() => myOrg && submitMutation.mutate(myOrg.id)}
          >
            <Rocket size={16} className="mr-2" />
            {submitMutation.isPending ? "신청 중..." : "지역코인 발행 신청"}
          </Button>

          {!myOrg && (
            <p className="text-xs text-muted-foreground text-center">
              소속 조직이 있어야 신청할 수 있습니다.
            </p>
          )}
        </div>
      )}

      {/* 내 신청 현황 */}
      {tab === "my" && (
        <div>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>
          ) : myList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Coins size={32} className="mx-auto mb-2 opacity-30" />
              <p>신청 내역이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myList.map((item: any) => {
                const s = STATUS_LABELS[item.status] ?? STATUS_LABELS.pending;
                const Icon = s.icon;
                return (
                  <div key={item.id} className="border rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold">{item.name}</span>
                        <span className="ml-2 font-mono text-sm text-muted-foreground">{item.symbol}</span>
                      </div>
                      <span className={`flex items-center gap-1 text-sm font-medium ${s.color}`}>
                        <Icon size={14} /> {s.label}
                      </span>
                    </div>
                    {item.org_name && (
                      <div className="text-xs text-muted-foreground mt-1">{item.org_name}</div>
                    )}
                    {item.review_note && (
                      <div className="mt-2 text-xs bg-muted/50 rounded p-2 text-muted-foreground">
                        검토 의견: {item.review_note}
                      </div>
                    )}
                    {item.status === "launched" && (
                      <div className="mt-2 text-xs text-green-600 font-medium">
                        ✅ 코인 발행 완료 — 지갑에서 확인하세요
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-2">
                      신청일: {new Date(item.created_at).toLocaleDateString("ko-KR")}
                      {item.initial_supply > 0 && ` · 초기물량: ${Number(item.initial_supply).toLocaleString()}`}
                      {item.max_supply && ` · 한도: ${Number(item.max_supply).toLocaleString()}`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
