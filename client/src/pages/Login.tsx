import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { School, LogIn, UserPlus, KeyRound, Mail, ArrowLeft } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type LoginMode = "select" | "local" | "findId" | "findPassword" | null;

export default function Login() {
  const [mode, setMode] = useState<LoginMode>("select");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [rememberUsername, setRememberUsername] = useState(false);
  
  // 아이디/비밀번호 찾기 상태
  const [findName, setFindName] = useState("");
  const [findEmail, setFindEmail] = useState("");
  const [findPhone, setFindPhone] = useState("");
  const [findUsernameInput, setFindUsernameInput] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [foundUsername, setFoundUsername] = useState("");
  
  const { toast } = useToast();

  // 페이지 로드 시 저장된 아이디 로드
  useEffect(() => {
    const savedUsername = localStorage.getItem("rememberedUsername");
    if (savedUsername) {
      setUsername(savedUsername);
      setRememberUsername(true);
    }
  }, []);

  const handleGoogleLogin = () => {
    window.location.href = "/api/login";
  };

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setIsLoggingIn(true);
    try {
      await apiRequest("POST", "/api/auth/login", { 
        username, 
        password,
        rememberMe
      });
      
      if (rememberUsername) {
        localStorage.setItem("rememberedUsername", username);
      } else {
        localStorage.removeItem("rememberedUsername");
      }
      
      if (rememberMe) {
        localStorage.setItem("loginExpiry", String(Date.now() + 7 * 24 * 60 * 60 * 1000));
      }

      // super_admin이면 바로 /admin으로, 아니면 /로
      try {
        const meRes = await fetch("/api/auth/user", { credentials: "include" });
        const me = await meRes.json();
        window.location.href = me?.role === "super_admin" ? "/admin" : "/";
      } catch {
        window.location.href = "/";
      }
    } catch (error: any) {
      toast({
        title: "로그인 실패",
        description: error.message || "아이디 또는 비밀번호를 확인해주세요.",
        variant: "destructive",
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  // 아이디 찾기
  const handleFindId = async () => {
    if (!findName || (!findEmail && !findPhone)) {
      toast({ title: "이름과 이메일 또는 전화번호를 입력해주세요.", variant: "destructive" });
      return;
    }
    
    try {
      const res = await apiRequest("POST", "/api/auth/find-username", {
        name: findName,
        email: findEmail || undefined,
        phone: findPhone || undefined
      });
      setFoundUsername((res as any).username || "사용자를 찾을 수 없습니다");
      toast({ title: "아이디를 찾았습니다!" });
    } catch (error: any) {
      toast({ title: "아이디 찾기 실패", description: error.message, variant: "destructive" });
    }
  };

  // 비밀번호 찾기 - 인증 코드 전송
  const handleSendVerificationCode = async () => {
    if (!findUsernameInput || !findEmail) {
      toast({ title: "아이디와 이메일을 입력해주세요.", variant: "destructive" });
      return;
    }
    
    setIsSendingCode(true);
    try {
      await apiRequest("POST", "/api/auth/send-password-reset-code", {
        username: findUsernameInput,
        email: findEmail
      });
      toast({ title: "인증 코드가 이메일로 발송되었습니다." });
    } catch (error: any) {
      toast({ title: "발송 실패", description: error.message, variant: "destructive" });
    } finally {
      setIsSendingCode(false);
    }
  };

  // 비밀번호 찾기 - 인증 후 비밀번호 재설정
  const handleResetPassword = async () => {
    if (!findUsernameInput || !verificationCode || !newPassword) {
      toast({ title: "모든 항목을 입력해주세요.", variant: "destructive" });
      return;
    }
    
    setIsVerifying(true);
    try {
      await apiRequest("POST", "/api/auth/reset-password", {
        username: findUsernameInput,
        code: verificationCode,
        newPassword
      });
      toast({ title: "비밀번호가 성공적으로 재설정되었습니다." });
      setMode("local");
    } catch (error: any) {
      toast({ title: "비밀번호 재설정 실패", description: error.message, variant: "destructive" });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-lg shadow-xl border-slate-200">
        <CardHeader className="text-center pb-6">
          <div className="w-20 h-20 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary/30">
            <School className="w-10 h-10 text-white" />
          </div>
          <CardTitle className="text-3xl font-display font-bold">스마트 허브</CardTitle>
          <CardDescription className="text-base">
            도란 도란
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {mode === "select" ? (
            <>
              <p className="text-center text-sm text-muted-foreground">
                로그인 방식을 선택하세요
              </p>

              <div className="grid gap-4">
                <Button
                  variant="outline"
                  className="h-16 w-full text-left justify-start gap-4 hover:border-primary transition-all"
                  onClick={handleGoogleLogin}
                >
                  <div className="bg-blue-500 p-2.5 rounded-lg text-white">
                    <School className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="font-semibold">간편 로그인 (Google)</span>
                    <span className="text-[11px] text-muted-foreground">Google 계정으로 로그인</span>
                  </div>
                </Button>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t"></span></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-muted-foreground font-medium">또는</span></div>
                </div>

                <Button
                  variant="secondary"
                  className="h-12 w-full font-semibold gap-2"
                  onClick={() => setMode("local")}
                >
                  <LogIn className="w-4 h-4" />
                  회원 로그인
                </Button>

                <Link href="/signup">
                  <Button
                    variant="ghost"
                    className="h-12 w-full font-semibold gap-2 text-primary hover:text-primary hover:bg-primary/5"
                  >
                    <UserPlus className="w-4 h-4" />
                    회원가입
                  </Button>
                </Link>
              </div>
            </>
          ) : mode === "findId" ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <div className="text-center mb-4">
                <h3 className="text-xl font-bold">아이디 찾기</h3>
                <p className="text-sm text-slate-500">가입 시 등록한 정보로 찾기</p>
              </div>
              
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>이름</Label>
                  <Input 
                    placeholder="이름을 입력하세요" 
                    value={findName}
                    onChange={(e) => setFindName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>이메일</Label>
                  <Input 
                    type="email"
                    placeholder="이메일을 입력하세요 (선택)" 
                    value={findEmail}
                    onChange={(e) => setFindEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>전화번호</Label>
                  <Input 
                    type="tel"
                    placeholder="전화번호를 입력하세요 (선택)" 
                    value={findPhone}
                    onChange={(e) => setFindPhone(e.target.value)}
                  />
                </div>
                
                {foundUsername && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-center">
                    <p className="text-sm text-green-700">찾은 아이디:</p>
                    <p className="font-bold text-green-800">{foundUsername}</p>
                  </div>
                )}
              </div>

              <Button className="w-full" onClick={handleFindId}>
                <Mail className="w-4 h-4 mr-2" />
                아이디 찾기
              </Button>
              
              <Button variant="ghost" className="w-full" onClick={() => { setMode("select"); setFoundUsername(""); }}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                뒤로 가기
              </Button>
            </div>
          ) : mode === "findPassword" ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <div className="text-center mb-4">
                <h3 className="text-xl font-bold">비밀번호 찾기</h3>
                <p className="text-sm text-slate-500">이메일 인증 후 재설정</p>
              </div>
              
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>아이디</Label>
                  <Input 
                    placeholder="아이디, 전화번호 또는 이메일" 
                    value={findUsernameInput}
                    onChange={(e) => setFindUsernameInput(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>이메일</Label>
                  <Input 
                    type="email"
                    placeholder="이메일을 입력하세요" 
                    value={findEmail}
                    onChange={(e) => setFindEmail(e.target.value)}
                  />
                </div>
                
                {!verificationCode && !newPassword && (
                  <Button className="w-full" onClick={handleSendVerificationCode} disabled={isSendingCode}>
                    <Mail className="w-4 h-4 mr-2" />
                    {isSendingCode ? "발송 중..." : "인증 코드 받기"}
                  </Button>
                )}
                
                {isSendingCode && (
                  <p className="text-center text-sm text-slate-500">인증 코드 전송 중...</p>
                )}
                
                {findEmail && !newPassword && (
                  <>
                    <div className="space-y-2">
                      <Label>인증 코드</Label>
                      <Input 
                        placeholder="이메일로 받은 인증 코드" 
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                      />
                    </div>
                    <Button 
                      className="w-full" 
                      onClick={handleSendVerificationCode} 
                      variant="outline"
                      disabled={isSendingCode}
                    >
                      인증 코드 재발송
                    </Button>
                  </>
                )}
                
                {verificationCode && (
                  <div className="space-y-2">
                    <Label>새 비밀번호</Label>
                    <Input 
                      type="password"
                      placeholder="새 비밀번호를 입력하세요" 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <Button className="w-full" onClick={handleResetPassword} disabled={isVerifying}>
                      {isVerifying ? "처리 중..." : "비밀번호 재설정"}
                    </Button>
                  </div>
                )}
              </div>

              <Button variant="ghost" className="w-full" onClick={() => { setMode("select"); setVerificationCode(""); setNewPassword(""); }}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                뒤로 가기
              </Button>
            </div>
          ) : (
            <form onSubmit={handleLocalLogin} className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-semibold">아이디</Label>
                <Input
                  id="username"
                  placeholder="아이디 또는 전화번호"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold">비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="비밀번호를 입력하세요"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="rememberMe" 
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(!!checked)}
                  />
                  <Label htmlFor="rememberMe" className="text-xs cursor-pointer">로그인 유지</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="rememberUsername" 
                    checked={rememberUsername}
                    onCheckedChange={(checked) => setRememberUsername(!!checked)}
                  />
                  <Label htmlFor="rememberUsername" className="text-xs cursor-pointer">아이디 기억</Label>
                </div>
              </div>
              
              <div className="flex justify-center gap-4 text-sm">
                <Button 
                  type="button"
                  variant="ghost" 
                  className="text-xs text-slate-500 h-auto p-0"
                  onClick={() => setMode("findId")}
                >
                  <KeyRound className="w-3 h-3 mr-1" />
                  아이디 찾기
                </Button>
                <span className="text-slate-300">|</span>
                <Button 
                  type="button"
                  variant="ghost" 
                  className="text-xs text-slate-500 h-auto p-0"
                  onClick={() => setMode("findPassword")}
                >
                  <KeyRound className="w-3 h-3 mr-1" />
                  비밀번호 찾기
                </Button>
              </div>
              
              <div className="pt-2 space-y-3">
                <Button
                  type="submit"
                  className="w-full h-11 text-base font-bold shadow-lg shadow-primary/20"
                  disabled={isLoggingIn}
                >
                  {isLoggingIn ? "로그인 중..." : "로그인"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-slate-500"
                  onClick={() => setMode("select")}
                >
                  뒤로 가기
                </Button>
              </div>
            </form>
          )}

          <div className="pt-4 border-t">
            <p className="text-[10px] text-center text-slate-400 leading-relaxed">
              © 2026 스마트 허브.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
