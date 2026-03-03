import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Bell, Clock, Save, User, Mail, Phone, Lock, Camera, Trash2, PenTool, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// 전자 서명 캔버스 컴포넌트
function SignatureCard({ user }: { user: any }) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [existingSignature, setExistingSignature] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user?.signatureUrl) setExistingSignature(user.signatureUrl);
  }, [user]);

  // 캔버스 초기화
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const endDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const saveSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;
    setIsSaving(true);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      const blob = await fetch(dataUrl).then(r => r.blob());
      const formData = new FormData();
      formData.append("file", blob, "signature.png");
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData, credentials: "include" });
      const uploadData = await uploadRes.json();
      await apiRequest("PATCH", "/api/users/me", { signatureUrl: uploadData.url });
      setExistingSignature(uploadData.url);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({ title: "서명이 저장되었습니다" });
    } catch {
      toast({ title: "서명 저장 실패", variant: "destructive" });
    }
    setIsSaving(false);
  };

  const deleteSignature = async () => {
    try {
      await apiRequest("PATCH", "/api/users/me", { signatureUrl: null });
      setExistingSignature(null);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({ title: "서명이 삭제되었습니다" });
    } catch {
      toast({ title: "서명 삭제 실패", variant: "destructive" });
    }
  };

  return (
    <Card className="rounded-3xl border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-black">
          <PenTool className="w-5 h-5" />
          전자 서명
        </CardTitle>
        <CardDescription>결재 문서에 사용할 서명을 등록하세요</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {existingSignature && (
          <div className="space-y-2">
            <Label className="font-semibold text-sm">현재 등록된 서명</Label>
            <div className="bg-slate-50 rounded-xl p-4 flex items-center justify-center border border-dashed border-slate-300">
              <img src={existingSignature} alt="서명" className="max-h-[80px]" style={{ background: "repeating-conic-gradient(#f0f0f0 0% 25%, white 0% 50%) 50% / 16px 16px" }} />
            </div>
            <Button variant="destructive" size="sm" onClick={deleteSignature} className="font-bold">
              <Trash2 className="w-3 h-3 mr-1" /> 서명 삭제
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <Label className="font-semibold text-sm">{existingSignature ? "새 서명 등록" : "서명하기"}</Label>
          <div className="relative border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden" style={{ touchAction: "none" }}>
            <canvas
              ref={canvasRef}
              className="w-full cursor-crosshair"
              style={{ height: "160px", display: "block" }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
            {!hasSignature && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-slate-300 text-sm font-bold">여기에 서명하세요</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={clearCanvas} className="font-bold">지우기</Button>
            <Button size="sm" onClick={saveSignature} disabled={!hasSignature || isSaving} className="font-bold">
              <Save className="w-3 h-3 mr-1" />
              {isSaving ? "저장 중..." : "서명 저장"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { allOrgs, setActiveOrg, activeOrgId } = useAuth();
  const [leavingOrg, setLeavingOrg] = useState<number | null>(null);
  
  // Fetch current user data
  const { data: user } = useQuery<any>({
    queryKey: ["/api/user"],
  });

  const { data: settings, isLoading } = useQuery<{
    doNotDisturbEnabled: boolean;
    doNotDisturbStart: string | null;
    doNotDisturbEnd: string | null;
  }>({
    queryKey: ["/api/settings"]
  });

  // Notification settings
  const [doNotDisturbEnabled, setDoNotDisturbEnabled] = useState(false);
  const [doNotDisturbStart, setDoNotDisturbStart] = useState("22:00");
  const [doNotDisturbEnd, setDoNotDisturbEnd] = useState("07:00");

  // Profile settings
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("");

  // 조직 참여
  const [inviteCode, setInviteCode] = useState("");
  const [joinOrgLoading, setJoinOrgLoading] = useState(false);

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  useEffect(() => {
    if (settings) {
      setDoNotDisturbEnabled(settings.doNotDisturbEnabled || false);
      setDoNotDisturbStart(settings.doNotDisturbStart || "22:00");
      setDoNotDisturbEnd(settings.doNotDisturbEnd || "07:00");
    }
  }, [settings]);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || "");
      setEmail(user.email || "");
      setPhone(user.phone || ""); // DB 스키마에 phone 칼럼 추가 필요
      setProfileImageUrl(user.profileImageUrl || "");
    }
  }, [user]);

  const saveSettings = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "설정 저장됨",
        description: "알림 설정이 저장되었습니다."
      });
    },
    onError: () => {
      toast({
        title: "오류",
        description: "설정 저장 중 오류가 발생했습니다.",
        variant: "destructive"
      });
    }
  });

  const updateProfile = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PATCH", "/api/users/me", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: () => {
      toast({
        title: "오류",
        description: "프로필 업데이트 중 오류가 발생했습니다.",
        variant: "destructive"
      });
    }
  });

  const uploadProfileImage = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include"
      });
      
      if (!response.ok) throw new Error("Upload failed");
      
      const data = await response.json();
      return data.url;
    },
    onSuccess: async (imageUrl: string) => {
      // Update user profile with new image URL
      await apiRequest("PATCH", "/api/users/me", { profileImageUrl: imageUrl });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setProfileImageUrl(imageUrl);
      toast({
        title: "프로필 사진 업데이트",
        description: "프로필 사진이 성공적으로 업데이트되었습니다."
      });
    },
    onError: () => {
      toast({
        title: "오류",
        description: "프로필 사진 업로드 중 오류가 발생했습니다.",
        variant: "destructive"
      });
    }
  });

  const changePassword = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      return apiRequest("POST", "/api/users/me/change-password", data);
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: "비밀번호 변경 완료",
        description: "비밀번호가 성공적으로 변경되었습니다."
      });
    },
    onError: (error: any) => {
      toast({
        title: "오류",
        description: error.message || "비밀번호 변경 중 오류가 발생했습니다.",
        variant: "destructive"
      });
    }
  });

  const handleNotificationSave = () => {
    saveSettings.mutate({
      doNotDisturbEnabled,
      doNotDisturbStart: doNotDisturbEnabled ? doNotDisturbStart : null,
      doNotDisturbEnd: doNotDisturbEnabled ? doNotDisturbEnd : null
    });
  };

  const handleProfileSave = () => {
    updateProfile.mutate({
      firstName,
      email,
      phone // DB 스키마에 phone 칼럼 추가 필요
    });
  };

  const handlePasswordChange = () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: "오류",
        description: "새 비밀번호가 일치하지 않습니다.",
        variant: "destructive"
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "오류",
        description: "비밀번호는 최소 6자 이상이어야 합니다.",
        variant: "destructive"
      });
      return;
    }

    changePassword.mutate({
      currentPassword,
      newPassword
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadProfileImage.mutate(file);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  const getInitials = (name: string) => {
    return name ? name.charAt(0).toUpperCase() : "?";
  };

  return (
    <div className="p-6 max-w-3xl mx-auto h-full overflow-y-auto pb-20">

      <div className="space-y-6">
        {/* Profile Settings Card */}
        <Card className="rounded-3xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-black">
              <User className="w-5 h-5" />
              프로필 설정
            </CardTitle>
            <CardDescription>
              프로필 사진, 이름, 연락처 정보를 관리합니다
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Profile Image */}
            <div className="flex items-center gap-6">
              <Avatar className="w-24 h-24">
                <AvatarImage src={profileImageUrl} alt={firstName} />
                <AvatarFallback className="text-2xl font-bold bg-slate-200">
                  {getInitials(firstName)}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <p className="text-sm text-slate-600">프로필 사진</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  size="sm"
                  disabled={uploadProfileImage.isPending}
                  className="rounded-xl"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  {uploadProfileImage.isPending ? "업로드 중..." : "사진 변경"}
                </Button>
              </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="firstName" className="font-semibold">이름</Label>
              <Input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="이름을 입력하세요"
                className="rounded-xl"
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="font-semibold flex items-center gap-2">
                <Mail className="w-4 h-4" />
                이메일
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="이메일을 입력하세요"
                className="rounded-xl"
              />
            </div>

            {/* Phone - DB 스키마에 phone 칼럼 추가 필요 */}
            <div className="space-y-2">
              <Label htmlFor="phone" className="font-semibold flex items-center gap-2">
                <Phone className="w-4 h-4" />
                전화번호
              </Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="전화번호를 입력하세요"
                className="rounded-xl"
              />
              <p className="text-xs text-slate-500">
                * DB 스키마에 phone 칼럼 추가 필요
              </p>
            </div>

            <Button 
              onClick={handleProfileSave} 
              disabled={updateProfile.isPending}
              className="w-full rounded-xl font-bold"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateProfile.isPending ? "저장 중..." : "프로필 저장"}
            </Button>
          </CardContent>
        </Card>

        {/* 전자 서명 등록 카드 */}
        <SignatureCard user={user} />

        {/* 언어 설정 */}
        <Card className="rounded-3xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-black">
              🌐 언어 / Language
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={i18n.language}
              onValueChange={(val) => { i18n.changeLanguage(val); localStorage.setItem('lang', val); }}
            >
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ko">🇰🇷 한국어</SelectItem>
                <SelectItem value="en">🇺🇸 English</SelectItem>
                <SelectItem value="fr">🇫🇷 Français</SelectItem>
                <SelectItem value="sw">🇰🇪 Kiswahili</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* ── 소속 조직 목록 ── */}
        <Card className="rounded-3xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-black text-base">
              🏫 소속 조직
            </CardTitle>
            <CardDescription>현재 가입된 조직 목록입니다</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {(allOrgs || []).length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">소속된 조직이 없습니다</p>
            ) : (
              (allOrgs || []).map((org: any) => (
                <div key={org.organizationId} className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 border transition-colors ${org.organizationId === activeOrgId ? "bg-primary/5 border-primary/20" : "bg-slate-50 border-slate-100"}`}>
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-primary text-sm flex-shrink-0">
                    {org.orgName?.charAt(0) || "O"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{org.orgName}</p>
                    <p className="text-xs text-slate-400">{{ student: "학생", parent: "학부모", teacher: "교직원", admin: "관리자", member: "일반" }[org.role as string] || org.role}</p>
                  </div>
                  {org.organizationId === activeOrgId && (
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full flex-shrink-0">현재</span>
                  )}
                  <button
                    disabled={leavingOrg === org.organizationId}
                    onClick={async () => {
                      if (!confirm(`"${org.orgName}" 조직에서 탈퇴하시겠습니까?\n\n⚠️ 탈퇴 시 해당 조직에서 받은 코인은 유지되지만, 조직 전용 코인을 사용할 수 없게 될 수 있습니다.`)) return;
                      setLeavingOrg(org.organizationId);
                      try {
                        const res = await fetch(`/api/organizations/${org.organizationId}/leave`, { method: "DELETE", credentials: "include" });
                        const d = await res.json();
                        if (res.ok) {
                          toast({ title: `"${org.orgName}" 탈퇴 완료` });
                          queryClient.invalidateQueries({ queryKey: ["/api/user"] });
                          if (org.organizationId === activeOrgId) setActiveOrg(null);
                        } else {
                          toast({ title: d.message || "탈퇴 실패", variant: "destructive" });
                        }
                      } catch {
                        toast({ title: "네트워크 오류", variant: "destructive" });
                      } finally {
                        setLeavingOrg(null);
                      }
                    }}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 disabled:opacity-40"
                    title="조직 탈퇴"
                  >
                    {leavingOrg === org.organizationId ? "..." : <LogOut className="w-4 h-4" />}
                  </button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* 조직 참여 (초대 코드) */}
        <Card className="rounded-3xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-black">
              🔗 조직 참여
            </CardTitle>
            <CardDescription>초대 코드를 입력하여 새로운 조직에 참여하세요</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="초대 코드 입력 (예: ABC123)"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                className="rounded-xl flex-1"
                maxLength={8}
              />
              <Button
                className="rounded-xl px-6 font-bold"
                disabled={!inviteCode || joinOrgLoading}
                onClick={async () => {
                  setJoinOrgLoading(true);
                  try {
                    const res = await fetch('/api/organizations/join', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ inviteCode })
                    });
                    const data = await res.json();
                    if (res.ok) {
                      toast({
                        title: `"${data.organizationName}" 조직에 참여했습니다!`,
                        description: data.needsApproval ? "관리자 승인 후 이용 가능합니다." : "바로 이용 가능합니다."
                      });
                      setInviteCode("");
                    } else {
                      toast({ title: data.message || "참여 실패", variant: "destructive" });
                    }
                  } catch {
                    toast({ title: "네트워크 오류", variant: "destructive" });
                  } finally {
                    setJoinOrgLoading(false);
                  }
                }}
              >
                {joinOrgLoading ? "참여 중..." : "참여"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Password Change Card */}
        <Card className="rounded-3xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-black">
              <Lock className="w-5 h-5" />
              비밀번호 변경
            </CardTitle>
            <CardDescription>
              계정 보안을 위해 주기적으로 비밀번호를 변경하세요
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword" className="font-semibold">현재 비밀번호</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="현재 비밀번호를 입력하세요"
                className="rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword" className="font-semibold">새 비밀번호</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="새 비밀번호를 입력하세요"
                className="rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="font-semibold">새 비밀번호 확인</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="새 비밀번호를 다시 입력하세요"
                className="rounded-xl"
              />
            </div>

            <Button 
              onClick={handlePasswordChange} 
              disabled={changePassword.isPending || !currentPassword || !newPassword || !confirmPassword}
              className="w-full rounded-xl font-bold"
            >
              <Lock className="w-4 h-4 mr-2" />
              {changePassword.isPending ? "변경 중..." : "비밀번호 변경"}
            </Button>
          </CardContent>
        </Card>

        {/* Notification Settings Card */}
        <Card className="rounded-3xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-black">
              <Bell className="w-5 h-5" />
              알림 설정
            </CardTitle>
            <CardDescription>
              방해 금지 시간을 설정하면 해당 시간 동안 알림이 울리지 않습니다
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="dnd-toggle" className="font-semibold">방해 금지 모드</Label>
                <p className="text-sm text-slate-600">
                  지정된 시간 동안 알림을 무음으로 설정합니다
                </p>
              </div>
              <Switch
                id="dnd-toggle"
                checked={doNotDisturbEnabled}
                onCheckedChange={setDoNotDisturbEnabled}
                data-testid="switch-dnd-toggle"
              />
            </div>

            {doNotDisturbEnabled && (
              <div className="grid gap-4 p-4 border rounded-2xl bg-slate-50">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Clock className="w-4 h-4" />
                  <span className="font-semibold">방해 금지 시간 설정</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start-time" className="font-semibold">시작 시간</Label>
                    <Input
                      id="start-time"
                      type="time"
                      value={doNotDisturbStart}
                      onChange={(e) => setDoNotDisturbStart(e.target.value)}
                      data-testid="input-dnd-start"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end-time" className="font-semibold">종료 시간</Label>
                    <Input
                      id="end-time"
                      type="time"
                      value={doNotDisturbEnd}
                      onChange={(e) => setDoNotDisturbEnd(e.target.value)}
                      data-testid="input-dnd-end"
                      className="rounded-xl"
                    />
                  </div>
                </div>
                
                <p className="text-xs text-slate-500">
                  예: 22:00 ~ 07:00 사이에는 알림이 울리지 않습니다
                </p>
              </div>
            )}

            <Button 
              onClick={handleNotificationSave} 
              disabled={saveSettings.isPending}
              className="w-full rounded-xl font-bold"
              data-testid="button-save-settings"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveSettings.isPending ? "저장 중..." : "알림 설정 저장"}
            </Button>
          </CardContent>
        </Card>

        {/* Withdrawal Card */}
        <Card className="rounded-3xl border-destructive/20 shadow-sm bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-black text-destructive">
              <Trash2 className="w-5 h-5" />
              계정 탈퇴
            </CardTitle>
            <CardDescription>
              탈퇴 시 모든 정보가 삭제되며 복구할 수 없습니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              variant="destructive"
              className="w-full rounded-xl font-bold"
              onClick={() => {
                if (confirm("정말로 탈퇴하시겠습니까? 모든 데이터가 영구적으로 삭제됩니다.")) {
                  apiRequest("DELETE", "/api/users/me").then(() => {
                    window.location.href = "/login";
                  });
                }
              }}
            >
              회원 탈퇴하기
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
