/**
 * 환전 페이지 /coin/exchange
 * 
 * 두런코인(DRB) ↔ 지역코인 양방향 환전
 * - 실시간 미리보기 (수수료, 예상 수령량)
 * - 환전 내역
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, RefreshCw, History, TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

// ─── 타입 ─────────────────────────────────────────────────────
interface ExchangeRate {
  id: number;
  from: { id: number; name: string; symbol: string };
  to:   { id: number; name: string; symbol: string };
  rate: number;
  feePercent: number;
}

interface Preview {
  inputAmount: number;
  fee: number;
  feePercent: number;
  afterFee: number;
  rate: number;
  outputAmount: number;
  myBalance: number;
  sufficient: boolean;
}

// ─── 훅 ───────────────────────────────────────────────────────
function useExchangeRates() {
  return useQuery<ExchangeRate[]>({
    queryKey: ["/api/economy/exchange/rates"],
    queryFn: () => fetch("/api/economy/exchange/rates").then(r => r.json()),
  });
}

function useExchangeHistory() {
  return useQuery<any[]>({
    queryKey: ["/api/economy/exchange/history"],
    queryFn: () => apiRequest("GET", "/api/economy/exchange/history").then(r => r.json()),
  });
}

function useExchangePreview(fromId: number, toId: number, amount: number) {
  return useQuery<Preview>({
    queryKey: ["/api/economy/exchange/preview", fromId, toId, amount],
    queryFn: () =>
      fetch(`/api/economy/exchange/preview?fromAssetId=${fromId}&toAssetId=${toId}&amount=${amount}`)
        .then(r => r.json()),
    enabled: fromId > 0 && toId > 0 && amount > 0,
    staleTime: 10_000,
  });
}

function fmt(n: number) { return n.toLocaleString("ko-KR"); }
function fmtDate(d: string) {
  return new Date(d).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────
export default function ExchangePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: rates = [], isLoading: ratesLoading } = useExchangeRates();
  const { data: history = [], isLoading: histLoading } = useExchangeHistory();

  const [selectedRateId, setSelectedRateId] = useState<number>(0);
  const [amount, setAmount] = useState("");
  const [tab, setTab] = useState<"exchange" | "history">("exchange");

  const selectedRate = rates.find(r => r.id === selectedRateId) ?? rates[0];

  // 방향 전환
  const [reversed, setReversed] = useState(false);
  const fromCoin = reversed ? selectedRate?.to   : selectedRate?.from;
  const toCoin   = reversed ? selectedRate?.from : selectedRate?.to;
  const reverseRate = reversed && selectedRate
    ? rates.find(r => r.from.id === selectedRate.to.id && r.to.id === selectedRate.from.id)
    : selectedRate;

  const numAmount = parseFloat(amount) || 0;
  const { data: preview } = useExchangePreview(
    fromCoin?.id ?? 0,
    toCoin?.id ?? 0,
    numAmount,
  );

  const exchangeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/economy/exchange", {
      fromAssetId: fromCoin?.id,
      toAssetId: toCoin?.id,
      amount: numAmount,
    }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "실패", description: data.error, variant: "destructive" }); return; }
      toast({ title: "환전 완료 ✅", description: data.message });
      setAmount("");
      qc.invalidateQueries({ queryKey: ["/api/economy/exchange/history"] });
      qc.invalidateQueries({ queryKey: ["/api/coin/wallets"] });
    },
    onError: () => toast({ title: "오류", description: "환전 처리 중 오류가 발생했습니다.", variant: "destructive" }),
  });

  if (!user) return <div className="p-6 text-muted-foreground">로그인이 필요합니다.</div>;

  return (
    <div className="max-w-xl mx-auto p-4 sm:p-6 space-y-4">
      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ArrowLeftRight size={20} /> 코인 환전
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">두런코인 ↔ 지역코인 양방향 환전</p>
      </div>

      {/* 탭 */}
      <div className="flex border-b">
        {(["exchange", "history"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}>
            {t === "exchange" ? "환전하기" : <span className="flex items-center gap-1"><History size={14} />내역</span>}
          </button>
        ))}
      </div>

      {/* 환전 폼 */}
      {tab === "exchange" && (
        <div className="space-y-4">
          {/* 환전 쌍 선택 */}
          {!ratesLoading && rates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {[...new Set(rates.map(r => r.from.symbol + "↔" + r.to.symbol))].map((pair, i) => {
                const r = rates[i];
                if (!r) return null;
                return (
                  <button key={r.id}
                    onClick={() => { setSelectedRateId(r.id); setReversed(false); setAmount(""); }}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      selectedRate?.id === r.id && !reversed
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:bg-muted border-border"
                    }`}>
                    {r.from.symbol} → {r.to.symbol}
                  </button>
                );
              })}
            </div>
          )}

          {selectedRate && (
            <>
              {/* 방향 전환 */}
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{fromCoin?.name} ({fromCoin?.symbol}) → {toCoin?.name} ({toCoin?.symbol})</span>
                <button onClick={() => setReversed(r => !r)}
                  className="flex items-center gap-1 text-xs hover:text-primary transition-colors">
                  <RefreshCw size={12} /> 방향 전환
                </button>
              </div>

              {/* 금액 입력 */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {fromCoin?.symbol} 입력 금액
                  {preview && (
                    <span className="ml-2 text-foreground">
                      내 잔액: <strong>{fmt(preview.myBalance)}</strong> {fromCoin?.symbol}
                    </span>
                  )}
                </label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="text-right font-mono"
                  />
                  <span className="flex items-center text-sm font-medium text-muted-foreground w-16 shrink-0">
                    {fromCoin?.symbol}
                  </span>
                </div>
                {preview && numAmount > 0 && !preview.sufficient && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> 잔액이 부족합니다
                  </p>
                )}
              </div>

              {/* 미리보기 */}
              {preview && numAmount > 0 && (
                <div className="bg-muted/40 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">환전 비율</span>
                    <span className="font-mono">1 {fromCoin?.symbol} = {preview.rate} {toCoin?.symbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">수수료 ({preview.feePercent}%)</span>
                    <span className="font-mono text-orange-500">- {fmt(preview.fee)} {fromCoin?.symbol}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between font-semibold">
                    <span>예상 수령</span>
                    <span className="font-mono text-green-600">{fmt(preview.outputAmount)} {toCoin?.symbol}</span>
                  </div>
                </div>
              )}

              {/* 환전 버튼 */}
              <Button
                className="w-full"
                disabled={
                  !preview || numAmount <= 0 || !preview.sufficient || exchangeMutation.isPending
                }
                onClick={() => exchangeMutation.mutate()}
              >
                {exchangeMutation.isPending
                  ? "처리 중..."
                  : `${fmt(numAmount)} ${fromCoin?.symbol} → ${fmt(preview?.outputAmount ?? 0)} ${toCoin?.symbol} 환전`}
              </Button>
            </>
          )}

          {ratesLoading && <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>}
          {!ratesLoading && rates.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp size={32} className="mx-auto mb-2 opacity-30" />
              <p>현재 환전 가능한 코인 쌍이 없습니다.</p>
            </div>
          )}
        </div>
      )}

      {/* 환전 내역 */}
      {tab === "history" && (
        <div>
          {histLoading ? (
            <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History size={32} className="mx-auto mb-2 opacity-30" />
              <p>환전 내역이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((h: any) => (
                <div key={h.id} className="border rounded-xl p-3 flex items-center gap-3">
                  <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {fmt(h.amount)} {h.from_symbol} → {h.to_symbol}
                    </div>
                    <div className="text-xs text-muted-foreground">{fmtDate(h.created_at)}</div>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    수수료 {fmt(h.fee)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
