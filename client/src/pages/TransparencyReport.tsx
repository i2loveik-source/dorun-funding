/**
 * 두런코인 투명성 리포트 페이지 /coin/transparency
 * 
 * - 전체 코인 유통량 현황
 * - 감사 로그 해시 체인 무결성 상태
 * - 코인별 발행/소각/거래 통계
 * - 분기별 리포트 요약
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCircle2, AlertTriangle, ShieldCheck, Coins, TrendingUp, Hash, ExternalLink, RefreshCw, GitCommit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── API 훅 ───────────────────────────────────────────────────
function usePublicSupply() {
  return useQuery({
    queryKey: ["/api/public/supply"],
    queryFn: () => fetch("/api/public/supply").then(r => r.json()),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

function usePublicIntegrity() {
  return useQuery({
    queryKey: ["/api/public/integrity"],
    queryFn: () => fetch("/api/public/integrity").then(r => r.json()),
    staleTime: 60_000,
  });
}

function usePublicStats(symbol: string) {
  return useQuery({
    queryKey: ["/api/public/stats", symbol],
    queryFn: () => fetch(`/api/public/stats/${symbol}`).then(r => r.json()),
    staleTime: 60_000,
  });
}

function useAnchorHistory() {
  return useQuery({
    queryKey: ["/api/public/anchors"],
    queryFn: () => fetch("/api/public/anchors").then(r => r.json()),
    staleTime: 60_000,
  });
}

// ─── 숫자 포맷 ────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function fmtShort(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────
export default function TransparencyReport() {
  const { data: supply, isLoading: supplyLoading, refetch: refetchSupply } = usePublicSupply();
  const { data: integrity, isLoading: integrityLoading } = usePublicIntegrity();
  const { data: drbStats } = usePublicStats("DRB");
  const { data: anchors } = useAnchorHistory();

  const chainOk = integrity?.valid === true;
  const now = new Date();
  const quarter = `${now.getFullYear()} Q${Math.ceil((now.getMonth() + 1) / 3)}`;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="text-green-500" size={28} />
            두런코인 투명성 리포트
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {quarter} — 누구나 이 페이지에서 코인의 발행량·거래·무결성을 검증할 수 있습니다.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchSupply()}>
          <RefreshCw size={14} className="mr-1" /> 새로고침
        </Button>
      </div>

      {/* 무결성 상태 배너 */}
      <div className={`rounded-xl border p-4 flex items-center gap-4 ${
        integrityLoading ? "bg-muted" :
        chainOk ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800" :
                  "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800"
      }`}>
        {integrityLoading ? (
          <div className="w-6 h-6 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
        ) : chainOk ? (
          <CheckCircle2 className="text-green-600 shrink-0" size={24} />
        ) : (
          <AlertTriangle className="text-red-600 shrink-0" size={24} />
        )}
        <div className="flex-1">
          <div className="font-semibold text-sm">
            {integrityLoading ? "무결성 검증 중..." :
             chainOk ? "감사 로그 해시 체인 무결성 검증 통과" :
                       "⚠️ 감사 로그 이상 감지 — 즉각 조사 중"}
          </div>
          {integrity && (
            <div className="text-xs text-muted-foreground mt-0.5 font-mono">
              체인 검증 행 수: {integrity.totalRows?.toLocaleString()}개 ·
              최신 해시: {integrity.chainTip?.slice(0, 20)}...
            </div>
          )}
        </div>
        {chainOk && (
          <Badge variant="outline" className="text-green-700 border-green-300 shrink-0 hidden sm:flex">
            ✓ 검증됨
          </Badge>
        )}
      </div>

      {/* DR-Base 코인 주요 지표 */}
      {drbStats && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Coins size={18} /> DR-Base (DRB) 주요 지표
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "총 발행량", value: fmtShort(drbStats.totalMinted), sub: fmt(drbStats.totalMinted) + " DRB" },
              { label: "총 소각량", value: fmtShort(drbStats.totalBurned), sub: fmt(drbStats.totalBurned) + " DRB" },
              { label: "유통량", value: fmtShort(drbStats.circulatingSupply), sub: fmt(drbStats.circulatingSupply) + " DRB" },
              { label: "최대 발행 한도", value: drbStats.maxSupply ? fmtShort(drbStats.maxSupply) : "∞", sub: drbStats.maxSupply ? fmt(drbStats.maxSupply) + " DRB" : "무제한" },
            ].map(item => (
              <div key={item.label} className="bg-card border rounded-xl p-4">
                <div className="text-xs text-muted-foreground">{item.label}</div>
                <div className="text-2xl font-bold mt-1">{item.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{item.sub}</div>
              </div>
            ))}
          </div>

          {/* 거래 활동 */}
          <div className="mt-3 grid grid-cols-3 gap-3">
            {[
              { label: "24시간 거래량", txs: drbStats.activity?.transactions24h, vol: drbStats.activity?.volume24h },
              { label: "7일 거래량",   txs: drbStats.activity?.transactions7d,  vol: drbStats.activity?.volume7d  },
              { label: "30일 거래량",  txs: drbStats.activity?.transactions30d, vol: drbStats.activity?.volume30d },
            ].map(item => (
              <div key={item.label} className="bg-card border rounded-xl p-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <TrendingUp size={12} /> {item.label}
                </div>
                <div className="text-xl font-bold mt-1">{fmt(item.txs ?? 0)}<span className="text-xs text-muted-foreground ml-1">건</span></div>
                <div className="text-xs text-muted-foreground">{fmtShort(item.vol ?? 0)} DRB</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 전체 코인 목록 */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Coins size={18} /> 전체 코인 현황
        </h2>
        {supplyLoading ? (
          <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>
        ) : (
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">코인</th>
                  <th className="text-right p-3 font-medium">유통량</th>
                  <th className="text-right p-3 font-medium hidden sm:table-cell">발행량</th>
                  <th className="text-right p-3 font-medium">보유자</th>
                  <th className="text-center p-3 font-medium">무결성</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {supply?.coins?.map((coin: any) => (
                  <tr key={coin.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <div className="font-medium">{coin.name}</div>
                      <div className="text-xs text-muted-foreground">{coin.symbol} · {coin.scope === "global" ? "전체" : "조직"}</div>
                    </td>
                    <td className="p-3 text-right font-mono text-xs">{fmt(coin.circulatingSupply)}</td>
                    <td className="p-3 text-right font-mono text-xs hidden sm:table-cell">{fmt(coin.totalMinted)}</td>
                    <td className="p-3 text-right">{fmt(coin.holderCount)}명</td>
                    <td className="p-3 text-center">
                      {coin.balanceIntegrityOk
                        ? <CheckCircle2 size={16} className="text-green-500 mx-auto" />
                        : <AlertTriangle size={16} className="text-red-500 mx-auto" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 감사 해시 정보 */}
      <div className="bg-muted/30 rounded-xl p-4 space-y-2">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Hash size={16} /> 감사 로그 해시 체인
        </h3>
        <p className="text-xs text-muted-foreground">
          모든 코인 이체는 SHA-256 해시로 연결된 체인에 기록됩니다.
          과거 기록을 1건이라도 수정하면 이후 모든 해시가 불일치하여 즉시 감지됩니다.
        </p>
        {integrity?.chainTip && (
          <div className="font-mono text-xs bg-background border rounded p-2 break-all">
            최신 해시: {integrity.chainTip}
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <a href="/api/public/chain-tip" target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" className="text-xs gap-1">
              <ExternalLink size={12} /> chain-tip API
            </Button>
          </a>
          <a href="/api/public/integrity" target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" className="text-xs gap-1">
              <ExternalLink size={12} /> 무결성 검증 API
            </Button>
          </a>
          <a href="/api/public/supply" target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" className="text-xs gap-1">
              <ExternalLink size={12} /> 유통량 API
            </Button>
          </a>
        </div>
      </div>

      {/* GitHub 앵커링 기록 */}
      {anchors && anchors.count > 0 && (
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
            <GitCommit size={16} /> GitHub 앵커링 기록
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            매일 새벽 감사 로그 해시가 GitHub에 자동 커밋됩니다.
            누구나 GitHub에서 타임스탬프와 해시를 검증할 수 있습니다.
          </p>
          <a href={anchors.repo} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline mb-3">
            <ExternalLink size={12} /> GitHub에서 전체 기록 보기
          </a>
          <div className="space-y-2">
            {anchors.anchors?.slice(0, 5).map((a: any) => (
              <div key={a.chainTip} className="border rounded-lg p-3 flex items-center gap-3 text-xs">
                <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-mono truncate text-muted-foreground">{a.chainTip}</div>
                  <div className="text-muted-foreground mt-0.5">
                    {new Date(a.anchoredAt).toLocaleString("ko-KR")} · {a.rowCount.toLocaleString()}개 행
                  </div>
                </div>
                <a href={a.fileUrl} target="_blank" rel="noreferrer"
                  className="shrink-0 text-primary hover:underline flex items-center gap-0.5">
                  <ExternalLink size={11} /> 파일
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 분기 기록 */}
      <div className="text-xs text-muted-foreground text-center pb-4">
        이 페이지는 실시간 데이터를 기반으로 합니다 (1분 캐시) · {quarter} 두런코인 투명성 리포트 ·{" "}
        <Link href="/coin/wallet" className="underline">내 지갑</Link>
      </div>
    </div>
  );
}
