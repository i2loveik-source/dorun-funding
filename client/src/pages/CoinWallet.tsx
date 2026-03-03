import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

const COIN_API = import.meta.env.VITE_COIN_API_URL || (window.location.hostname === "localhost" ? "http://localhost:4000" : "https://coin.dorunhub.com");
const PASS_API = import.meta.env.VITE_PASS_API_URL || (window.location.hostname === "localhost" ? "http://localhost:4200" : "https://pass.dorunhub.com");
const STOCK_URL = "https://stock.dorunhub.com";

interface WalletItem {
  id: number;
  availableBalance: string;
  asset: { id: number; name: string; symbol: string; decimals: number; type?: string; orgName?: string };
  orgName?: string;
}

interface TxItem {
  id: number;
  type: string;
  amount: string;
  direction: "in" | "out";
  asset: { symbol: string };
  createdAt: string;
}

export default function CoinWallet() {
  const { user, allOrgs, activeOrgId } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [wallets, setWallets] = useState<WalletItem[]>([]);
  const [txs, setTxs] = useState<TxItem[]>([]);
  const [txsAll, setTxsAll] = useState<TxItem[]>([]);
  const [txPage, setTxPage] = useState(0);
  const [txLoading, setTxLoading] = useState(false);
  const [txHasMore, setTxHasMore] = useState(true);
  const [showAllTxs, setShowAllTxs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 탭: wallet | transfer | qr-receive | qr-scan
  const [tab, setTab] = useState<"wallet" | "transfer" | "qr-receive" | "qr-scan">("wallet");

  // 송금 폼
  const [toUser, setToUser] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<string>("");
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferResult, setTransferResult] = useState("");

  // QR 받기 (내가 QR 생성)
  const [qrAmount, setQrAmount] = useState("");
  const [qrAsset, setQrAsset] = useState<string>("");
  const [qrDesc, setQrDesc] = useState("");
  const [qrImage, setQrImage] = useState("");
  const [qrExpires, setQrExpires] = useState("");
  const [qrGenerating, setQrGenerating] = useState(false);

  // QR 스캔 (내가 결제)
  const [scanInput, setScanInput] = useState("");
  const [scannedQr, setScannedQr] = useState<any>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  const coinFetch = async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(`${COIN_API}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers },
    });
    return res.json();
  };

  // SSO 로그인
  useEffect(() => {
    if (!user) return;
    const cached = localStorage.getItem("coin_token");
    if (cached) {
      try {
        const payload = JSON.parse(atob(cached.split(".")[1]));
        if (payload.exp * 1000 > Date.now()) { setToken(cached); setLoading(false); return; }
      } catch {}
      const rt = localStorage.getItem("coin_refresh");
      if (rt) {
        fetch(`${COIN_API}/api/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: rt }) })
          .then(r => r.json())
          .then(d => { if (d.token) { setToken(d.token); localStorage.setItem("coin_token", d.token); if (d.refreshToken) localStorage.setItem("coin_refresh", d.refreshToken); } else loginFresh(); })
          .catch(() => loginFresh())
          .finally(() => setLoading(false));
        return;
      }
    }
    loginFresh();
    function loginFresh() {
      fetch(`${COIN_API}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user!.username, password: "__hub_sso__" }) })
        .then(r => r.json())
        .then(d => { if (d.token) { setToken(d.token); localStorage.setItem("coin_token", d.token); if (d.refreshToken) localStorage.setItem("coin_refresh", d.refreshToken); } else setError("코인 서비스 연결 실패"); })
        .catch(() => setError("코인 서비스에 연결할 수 없습니다"))
        .finally(() => setLoading(false));
    }
  }, [user]);

  // 지갑 데이터
  const refreshWallets = async () => {
    if (!token) return;
    const h = { Authorization: `Bearer ${token}` };
    const [w, t] = await Promise.all([
      fetch(`${COIN_API}/api/wallets`, { headers: h }).then(r => r.json()),
      fetch(`${COIN_API}/api/transactions?limit=5`, { headers: h }).then(r => r.json()),
    ]);
    setWallets(w.wallets || []);
    setTxs((t.transactions || []).slice(0, 5));
    setTxsAll([]);
    setTxPage(0);
    setTxHasMore(true);
    setShowAllTxs(false);
  };

  // 거래 내역 추가 로드 (txPage = 현재까지 로드된 총 건수 기준 offset)
  const loadMoreTxs = async (startOffset?: number) => {
    if (!token || txLoading || !txHasMore) return;
    setTxLoading(true);
    const h = { Authorization: `Bearer ${token}` };
    const limit = 20;
    // startOffset이 주어지면 그것부터 시작 (첫 전체 보기 = 5건 이후)
    const offset = startOffset !== undefined ? startOffset : txPage;
    const t = await fetch(`${COIN_API}/api/transactions?limit=${limit}&offset=${offset}`, { headers: h }).then(r => r.json()).catch(() => ({ transactions: [] }));
    const newTxs = t.transactions || [];
    setTxsAll(prev => [...prev, ...newTxs]);
    setTxPage(offset + newTxs.length); // 다음 로드 시작점
    setTxHasMore(newTxs.length === limit);
    setTxLoading(false);
  };

  useEffect(() => { refreshWallets(); }, [token]);

  // 송금
  const handleTransfer = async () => {
    if (!toUser || !amount || !token) return;
    setTransferLoading(true); setTransferResult("");
    try {
      const assetId = selectedAsset ? parseInt(selectedAsset) : wallets[0]?.asset.id || 1;
      const res = await fetch(`${COIN_API}/api/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ toUserId: toUser, assetTypeId: assetId, amount, requestId: `hub-${Date.now()}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTransferResult("✅ 송금 완료!"); setToUser(""); setAmount("");
      await refreshWallets();
    } catch (e: any) { setTransferResult(`❌ ${e.message}`); }
    finally { setTransferLoading(false); }
  };

  // QR 생성 (받기)
  const generateQR = async () => {
    if (!qrAmount || !token) return;
    setQrGenerating(true); setQrImage("");
    try {
      const assetId = qrAsset ? parseInt(qrAsset) : wallets[0]?.asset.id || 1;
      const d = await coinFetch("/api/qr/generate", {
        method: "POST",
        body: JSON.stringify({ assetTypeId: assetId, amount: qrAmount, description: qrDesc }),
      });
      if (d.qrImage) { setQrImage(d.qrImage); setQrExpires(d.expiresAt); }
      else throw new Error(d.error || "QR 생성 실패");
    } catch (e: any) { setError(e.message); }
    finally { setQrGenerating(false); }
  };

  // QR 스캔 — 토큰으로 조회
  const lookupQR = async (qrToken: string) => {
    setScanLoading(true); setScannedQr(null); setScanResult("");
    try {
      const d = await coinFetch(`/api/qr/${qrToken}`);
      if (d.error) throw new Error(d.error);
      setScannedQr({ ...d, token: qrToken });
    } catch (e: any) { setScanResult(`❌ ${e.message}`); }
    finally { setScanLoading(false); }
  };

  // QR 결제 실행
  const payQR = async () => {
    if (!scannedQr) return;
    setPayLoading(true); setScanResult("");
    try {
      const d = await coinFetch("/api/qr/pay", {
        method: "POST",
        body: JSON.stringify({ qrToken: scannedQr.token }),
      });
      if (d.success) { setScanResult(`✅ ${d.amount} ${scannedQr.assetSymbol} 결제 완료!`); setScannedQr(null); await refreshWallets(); }
      else throw new Error(d.error);
    } catch (e: any) { setScanResult(`❌ ${e.message}`); }
    finally { setPayLoading(false); }
  };

  // 카메라 QR 스캔
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      setCameraActive(true);

      // 캔버스로 프레임 캡처 + QR 디코딩 시도
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      scanIntervalRef.current = window.setInterval(() => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);
        // BarcodeDetector API (Chrome/Edge/Android)
        if ("BarcodeDetector" in window) {
          const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
          detector.detect(canvas).then((barcodes: any[]) => {
            if (barcodes.length > 0) {
              const raw = barcodes[0].rawValue;
              try {
                const parsed = JSON.parse(raw);
                if (parsed.t) { stopCamera(); lookupQR(parsed.t); }
              } catch { /* not our QR */ }
            }
          }).catch(() => {});
        }
      }, 500);
    } catch {
      setScanResult("❌ 카메라 접근 권한이 필요합니다");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    setCameraActive(false);
  };

  useEffect(() => { return () => { stopCamera(); }; }, []);

  // 수동 QR 입력 파싱
  const handleManualScan = () => {
    try {
      const parsed = JSON.parse(scanInput);
      if (parsed.t) lookupQR(parsed.t);
      else setScanResult("❌ 올바른 QR 데이터가 아닙니다");
    } catch {
      // 토큰 직접 입력으로 간주
      if (scanInput.length > 10) lookupQR(scanInput);
      else setScanResult("❌ QR 코드를 스캔하거나 토큰을 입력하세요");
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin h-8 w-8" /></div>;

  const totalBalance = wallets.reduce((s, w) => s + parseFloat(w.availableBalance), 0);
  const primarySymbol = wallets[0]?.asset.symbol || "코인";

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-8">
      {error && <div className="bg-red-50 text-red-600 rounded-lg p-3 text-sm">{error}</div>}

      {/* 잔액 카드 */}
      <Card className="bg-gradient-to-r from-amber-400 to-orange-500 text-white border-0">
        <CardContent className="pt-5 pb-4">
          {/* 사용자 정보 */}
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-white/20">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-bold">{(user?.firstName || user?.username || "?").charAt(0)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base leading-tight">{user?.firstName || user?.username}</p>
              <p className="text-xs opacity-75">@{user?.username}</p>
            </div>
          </div>
          {/* 소속 조직 태그 */}
          {allOrgs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {allOrgs.map((org: any) => (
                <span key={org.organizationId} className="text-[11px] bg-white/20 px-2 py-0.5 rounded-full font-medium">
                  {org.orgName}
                </span>
              ))}
            </div>
          )}
          {/* 잔액 — DRB 맨 위, 현재 조직 코인만 표시 */}
          <p className="text-xs opacity-75 mb-2">보유 코인</p>
          <div className="space-y-1">
            {(() => {
              // 현재 활성 조직 이름
              const activeOrg = allOrgs.find((o: any) => o.organizationId === activeOrgId);
              const activeOrgName = activeOrg?.orgName;
              // DRB(hub) + 현재 조직 코인만 표시
              const drb = wallets.filter(w => w.asset.type === "hub");
              const myOrg = wallets.filter(w =>
                w.asset.type !== "hub" && (
                  // organization_id 기반 매칭 (asset에 있으면)
                  (w.asset.organizationId != null && w.asset.organizationId === activeOrgId) ||
                  // orgName 기반 폴백
                  (activeOrgName && w.asset.orgName === activeOrgName)
                )
              );
              const visible = [...drb, ...myOrg];
              return visible.map(w => (
                <div key={w.id} className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold leading-tight">
                    {parseFloat(w.availableBalance).toFixed(w.asset.decimals || 0)}
                  </span>
                  <span className="text-sm font-medium opacity-90">{w.asset.symbol}</span>
                  {w.asset.orgName && (
                    <span className="text-[10px] bg-white/20 rounded-full px-1.5 py-0.5 font-medium">{w.asset.orgName}</span>
                  )}
                </div>
              ));
            })()}
            {wallets.length === 0 && <p className="text-2xl font-bold">0.00 <span className="text-sm font-medium opacity-90">코인</span></p>}
          </div>
        </CardContent>
      </Card>

      {/* 탭 네비게이션 */}
      <div className="grid grid-cols-4 gap-1 bg-gray-100 rounded-xl p-1">
        {([
          ["wallet", "💰 자산"],
          ["transfer", "💸 송금"],
          ["qr-receive", "📥 QR받기"],
          ["qr-scan", "📷 QR결제"],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); if (key !== "qr-scan") stopCamera(); }}
            className={`py-2 rounded-lg text-sm font-medium transition-all ${tab === key ? "bg-white shadow-sm text-amber-600" : "text-gray-500"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* 자산 탭 */}
      {tab === "wallet" && (
        <>
          {/* 거래 내역 — 전체 보기 모드 vs 최근 5건 */}
          {showAllTxs ? (
            /* 전체 거래 내역 뷰 */
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between sticky top-0 bg-white z-10">
                <CardTitle className="text-base">전체 거래 내역</CardTitle>
                <button
                  onClick={() => { setShowAllTxs(false); setTxsAll([]); setTxPage(0); setTxHasMore(true); setTxLoading(false); }}
                  className="text-xs text-gray-500 font-medium border rounded-full px-2.5 py-1 hover:bg-gray-50"
                >
                  ← 최근 거래로
                </button>
              </CardHeader>
              <CardContent className="space-y-0 p-0">
                {/* 처음 로딩한 5건 먼저 */}
                {txs.map(tx => <TxRow key={`r-${tx.id}`} tx={tx} />)}
                {/* 추가 로드된 것들 (offset 기반이므로 중복 없음) */}
                {txsAll.map(tx => <TxRow key={`a-${tx.id}`} tx={tx} />)}
                {txHasMore ? (
                  <div className="flex justify-center py-3">
                    <button
                      onClick={loadMoreTxs}
                      disabled={txLoading}
                      className="text-sm text-amber-600 font-medium border border-amber-200 rounded-full px-4 py-1.5 hover:bg-amber-50 disabled:opacity-50"
                    >
                      {txLoading ? "불러오는 중..." : "더 보기"}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 text-center py-3">모든 거래 내역을 불러왔습니다</p>
                )}
              </CardContent>
            </Card>
          ) : (
            /* 최근 5건 뷰 */
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base">최근 거래</CardTitle>
                <button
                  onClick={() => { setShowAllTxs(true); loadMoreTxs(5); }}
                  className="text-xs text-amber-600 font-medium"
                >
                  전체 보기 →
                </button>
              </CardHeader>
              <CardContent className="space-y-0 p-0">
                {txs.length === 0 && <p className="text-gray-400 text-center py-6 text-sm">거래 없음</p>}
                {txs.map(tx => <TxRow key={tx.id} tx={tx} />)}
              </CardContent>
            </Card>
          )}
          <Button variant="outline" className="w-full" onClick={async () => {
            // SSO 토큰을 URL에 담아서 두런코인 앱 자동 로그인
            const coinToken = localStorage.getItem("coin_token");
            if (coinToken) {
              window.open(`${COIN_API}?sso_token=${encodeURIComponent(coinToken)}`, "_blank");
            } else {
              window.open(`${COIN_API}`, "_blank");
            }
          }}>
            🪙 두런 지갑 열기
          </Button>
          <Button variant="outline" className="w-full" onClick={() => {
            // 두런 패스 SSO — 코인 토큰을 그대로 전달 (두런 패스 서버에서 검증)
            const coinToken = localStorage.getItem("coin_token");
            if (coinToken) {
              window.open(`${PASS_API}?sso_token=${encodeURIComponent(coinToken)}`, "_blank");
            } else {
              window.open(`${PASS_API}`, "_blank");
            }
          }}>
            🗺️ 두런 패스 열기
          </Button>
          <Button variant="outline" className="w-full" onClick={() => {
            // 두런 스탁 SSO — 코인 토큰을 그대로 전달
            const coinToken = localStorage.getItem("coin_token");
            if (coinToken) {
              window.open(`${STOCK_URL}?sso_token=${encodeURIComponent(coinToken)}`, "_blank");
            } else {
              window.open(STOCK_URL, "_blank");
            }
          }}>
            📈 두런 스탁 열기
          </Button>
        </>
      )}

      {/* 송금 탭 */}
      {tab === "transfer" && (
        <Card>
          <CardHeader><CardTitle className="text-base">💸 송금하기</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="받는 사람 (아이디)" value={toUser} onChange={e => setToUser(e.target.value)} />
            {wallets.length > 1 && (
              <Select value={selectedAsset || wallets[0]?.asset.id.toString()} onValueChange={setSelectedAsset}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {wallets.map(w => (
                    <SelectItem key={w.asset.id} value={w.asset.id.toString()}>
                      {w.asset.name} ({w.asset.symbol}) — 잔액: {parseFloat(w.availableBalance).toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input type="number" step="0.01" placeholder="금액" value={amount} onChange={e => setAmount(e.target.value)} />
            <Button onClick={handleTransfer} disabled={transferLoading || !toUser || !amount}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white">
              {transferLoading ? "처리 중..." : "송금하기"}
            </Button>
            {transferResult && <p className="text-sm text-center">{transferResult}</p>}
          </CardContent>
        </Card>
      )}

      {/* QR 받기 탭 */}
      {tab === "qr-receive" && (
        <Card>
          <CardHeader><CardTitle className="text-base">📥 QR코드로 받기</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-gray-500">받을 금액의 QR코드를 생성하면, 상대방이 스캔하여 결제합니다.</p>
            {wallets.length > 1 && (
              <Select value={qrAsset || wallets[0]?.asset.id.toString()} onValueChange={setQrAsset}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {wallets.map(w => (
                    <SelectItem key={w.asset.id} value={w.asset.id.toString()}>
                      {w.asset.name} ({w.asset.symbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input type="number" step="0.01" placeholder="받을 금액" value={qrAmount} onChange={e => setQrAmount(e.target.value)} />
            <Input placeholder="설명 (선택)" value={qrDesc} onChange={e => setQrDesc(e.target.value)} />
            <Button onClick={generateQR} disabled={qrGenerating || !qrAmount}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white">
              {qrGenerating ? "생성 중..." : "QR코드 생성"}
            </Button>
            {qrImage && (
              <div className="text-center space-y-2">
                <img src={qrImage} alt="QR" className="mx-auto w-64 h-64 rounded-lg border" />
                <p className="text-lg font-bold text-amber-600">{qrAmount} {wallets.find(w => w.asset.id.toString() === (qrAsset || wallets[0]?.asset.id.toString()))?.asset.symbol}</p>
                {qrDesc && <p className="text-sm text-gray-500">{qrDesc}</p>}
                <p className="text-xs text-gray-400">유효시간: 5분 ({new Date(qrExpires).toLocaleTimeString("ko-KR")}까지)</p>
                <Button variant="outline" size="sm" onClick={() => { setQrImage(""); setQrAmount(""); setQrDesc(""); }}>
                  새 QR 생성
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* QR 스캔/결제 탭 */}
      {tab === "qr-scan" && (
        <Card>
          <CardHeader><CardTitle className="text-base">📷 QR코드 결제</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!scannedQr && (
              <>
                {/* 카메라 스캔 */}
                <div className="space-y-2">
                  {!cameraActive ? (
                    <Button onClick={startCamera} className="w-full bg-indigo-500 hover:bg-indigo-600 text-white">
                      📷 카메라로 QR 스캔
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <video ref={videoRef} className="w-full rounded-lg border" playsInline muted />
                      <Button variant="outline" className="w-full" onClick={stopCamera}>스캔 중지</Button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 text-gray-400 text-xs">
                  <div className="flex-1 border-t" /><span>또는</span><div className="flex-1 border-t" />
                </div>

                {/* 수동 입력 */}
                <div className="flex gap-2">
                  <Input placeholder="QR 토큰 붙여넣기" value={scanInput} onChange={e => setScanInput(e.target.value)}
                    className="flex-1" />
                  <Button onClick={handleManualScan} disabled={scanLoading || !scanInput}
                    className="bg-amber-500 hover:bg-amber-600 text-white">
                    {scanLoading ? "..." : "조회"}
                  </Button>
                </div>
              </>
            )}

            {/* 결제 확인 */}
            {scannedQr && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                <h3 className="font-bold text-center text-lg">결제 확인</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">코인</span><span className="font-medium">{scannedQr.assetName} ({scannedQr.assetSymbol})</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">금액</span><span className="font-bold text-xl text-amber-600">{parseFloat(scannedQr.amount).toFixed(2)} {scannedQr.assetSymbol}</span></div>
                  {scannedQr.description && <div className="flex justify-between"><span className="text-gray-500">설명</span><span>{scannedQr.description}</span></div>}
                  <div className="flex justify-between"><span className="text-gray-500">만료</span><span className="text-xs">{new Date(scannedQr.expiresAt).toLocaleTimeString("ko-KR")}</span></div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setScannedQr(null)}>취소</Button>
                  <Button onClick={payQR} disabled={payLoading} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white">
                    {payLoading ? "결제 중..." : "결제하기"}
                  </Button>
                </div>
              </div>
            )}

            {scanResult && <p className="text-sm text-center">{scanResult}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const TX_TYPE_LABEL: Record<string, string> = {
  transfer: "송금", reward: "보상", qr_payment: "QR결제",
  mint: "발행", burn: "소각", swap: "환전",
};

function TxRow({ tx }: { tx: any }) {
  return (
    <div className="flex justify-between items-center px-4 py-3 border-b last:border-0 hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-2.5">
        <span className={`text-base ${tx.direction === "in" ? "text-green-500" : "text-red-400"}`}>
          {tx.direction === "in" ? "↓" : "↑"}
        </span>
        <div>
          <p className="text-sm font-medium">{TX_TYPE_LABEL[tx.type] || tx.type}</p>
          <p className="text-[11px] text-gray-400">
            {new Date(tx.createdAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>
      <p className={`font-bold text-sm ${tx.direction === "in" ? "text-green-600" : "text-red-500"}`}>
        {tx.direction === "in" ? "+" : "-"}{parseFloat(tx.amount).toFixed(2)} {tx.asset.symbol}
      </p>
    </div>
  );
}
