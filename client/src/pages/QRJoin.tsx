import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";

export default function QRJoin() {
  const [, setLocation] = useLocation();
  const [code, setCode] = useState("");
  const [qrInfo, setQrInfo] = useState<any>(null);
  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  // URL 파라미터에서 코드 추출
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get("code");
    if (c) { setCode(c); lookupCode(c); }
  }, []);

  const lookupCode = async (c: string) => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/org-qr/${c}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setQrInfo(data);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleJoin = async () => {
    if (!name) return setError("이름을 입력하세요");
    if (!userId && !phone) return setError("아이디 또는 전화번호를 입력하세요");
    if (!password) return setError("비밀번호를 설정하세요");
    if (password.length < 4) return setError("비밀번호는 4자 이상이어야 합니다");
    if (password !== passwordConfirm) return setError("비밀번호가 일치하지 않습니다");
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/org-qr/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code, name, password,
          userId: userId || undefined,
          phone: phone || undefined,
          email: email || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setResult(data);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  // 가입 완료 화면
  if (result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="text-5xl">🎉</div>
            <h2 className="text-xl font-bold text-green-600">가입 완료!</h2>
            <p className="text-gray-600">{result.orgName}에 등록되었습니다</p>
            <div className="bg-gray-50 rounded-lg p-4 text-left space-y-2">
              <p className="text-sm"><span className="text-gray-500">로그인 정보:</span></p>
              <p className="font-mono font-bold text-lg text-center text-indigo-600">{result.message}</p>
              <p className="text-xs text-amber-600 text-center">⚠️ 아이디와 비밀번호를 꼭 기억해주세요!</p>
            </div>
            <Button onClick={() => setLocation("/login")} className="w-full bg-indigo-500 hover:bg-indigo-600 text-white">
              로그인하러 가기
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="text-4xl mb-2">📱</div>
          <CardTitle>조직 참여</CardTitle>
          <p className="text-sm text-gray-500">QR 코드를 스캔했거나 초대 코드를 받으셨나요?</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 코드 입력 (URL에서 자동 입력 안 된 경우) */}
          {!qrInfo && (
            <div className="space-y-2">
              <Input placeholder="초대 코드 입력" value={code} onChange={e => setCode(e.target.value.toUpperCase())} />
              <Button onClick={() => lookupCode(code)} disabled={!code || loading} className="w-full">
                {loading ? "확인 중..." : "코드 확인"}
              </Button>
            </div>
          )}

          {/* 조직 정보 + 가입 폼 */}
          {qrInfo && (
            <div className="space-y-4">
              <div className="bg-indigo-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-indigo-700">{qrInfo.orgName}</p>
                <p className="text-xs text-gray-500">{qrInfo.orgType === 'school' ? '학교' : qrInfo.orgType === 'cooperative' ? '단체' : '기관'}</p>
                {qrInfo.description && <p className="text-sm text-gray-600 mt-1">{qrInfo.description}</p>}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이름 <span className="text-red-500">*</span></label>
                  <Input placeholder="실명 입력" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">아이디 <span className="text-red-500">*</span> <span className="text-xs text-gray-400">(또는 전화번호로 대체 가능)</span></label>
                  <Input placeholder="사용할 아이디" value={userId} onChange={e => setUserId(e.target.value)} disabled={!!phone} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">전화번호 <span className="text-xs text-gray-400">(입력하면 전화번호로 로그인)</span></label>
                  <Input type="tel" placeholder="010-1234-5678" value={phone} onChange={e => setPhone(e.target.value)} />
                  {phone && <p className="text-xs text-blue-500 mt-1">✓ 전화번호가 아이디 대신 사용됩니다</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이메일 <span className="text-xs text-gray-400">(선택)</span></label>
                  <Input type="email" placeholder="example@email.com" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 <span className="text-red-500">*</span></label>
                  <Input type="password" placeholder="비밀번호 설정 (4자 이상)" value={password} onChange={e => setPassword(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인 <span className="text-red-500">*</span></label>
                  <Input type="password" placeholder="비밀번호 다시 입력" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} />
                  {passwordConfirm && password !== passwordConfirm && <p className="text-xs text-red-500 mt-1">비밀번호가 일치하지 않습니다</p>}
                </div>
              </div>

              <Button onClick={handleJoin} disabled={loading || !name}
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white">
                {loading ? "가입 중..." : `${qrInfo.orgName} 참여하기`}
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <div className="text-center">
            <button onClick={() => setLocation("/login")} className="text-sm text-gray-500 hover:text-gray-700 underline">
              이미 계정이 있으신가요? 로그인
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
