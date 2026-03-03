import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { School as SchoolIcon, ArrowLeft, Mail, User, Lock, Building2, Phone } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Organization {
  id: number;
  name: string;
  type: string;
}

type OrgType = '학교' | '일반';

// DB type 값 → UI 탭 매핑
function matchesTab(orgType: string | undefined, tab: OrgType): boolean {
  const t = (orgType || '').toLowerCase();
  if (tab === '학교') return ['school', '학교', 'elementary', 'middle', 'high', ''].includes(t) || t === '';
  // '일반' = 학교가 아닌 모든 조직
  return !['school', '학교', 'elementary', 'middle', 'high'].includes(t);
}

// 역할 정의
const SCHOOL_ROLES = [
  { value: "student", label: "학생" },
  { value: "parent",  label: "학부모" },
  { value: "teacher", label: "교직원" },
  { value: "admin",   label: "관리자" },
];

const ORG_ROLES = [
  { value: "member", label: "일반" },
  { value: "admin",  label: "관리자" },
];

export default function SignUp() {
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    firstName: "",
    username: "",
    password: "",
    passwordConfirm: "",
    email: "",
    phone: "",
    organizationId: "",
    organizationType: '학교' as OrgType,
    role: "student" as string,
  });
  const [allOrganizations, setAllOrganizations] = useState<Organization[]>([]);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const { toast } = useToast();

  // 최초 1회 전체 기관 목록 fetch
  useEffect(() => {
    const fetchOrganizations = async () => {
      setIsLoadingOrgs(true);
      try {
        const response = await fetch("/api/schools");
        if (response.ok) {
          const data = await response.json();
          setAllOrganizations(data.map((org: any) => ({
            ...org,
            type: org.type || 'school',
          })));
        }
      } catch (error) {
        console.error("Failed to fetch organizations:", error);
      } finally {
        setIsLoadingOrgs(false);
      }
    };
    fetchOrganizations();
  }, []);

  // 탭(조직 유형) 변경 시 → organizationId + 역할 초기화
  const handleTypeChange = (type: OrgType) => {
    setFormData(prev => ({
      ...prev,
      organizationType: type,
      organizationId: '',
      role: type === '학교' ? 'student' : 'member',
    }));
  };

  // 현재 탭에 맞는 기관 목록
  const filteredOrganizations = allOrganizations.filter(org =>
    matchesTab(org.type, formData.organizationType)
  );

  const roleOptions = formData.organizationType === '학교' ? SCHOOL_ROLES : ORG_ROLES;

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.firstName || !formData.username || !formData.password || !formData.organizationId) {
      toast({ title: "필수 입력", description: "이름, 아이디, 비밀번호, 기관 선택은 필수입니다.", variant: "destructive" });
      return;
    }
    if (formData.password !== formData.passwordConfirm) {
      toast({ title: "비밀번호 불일치", description: "비밀번호와 비밀번호 확인이 일치하지 않습니다.", variant: "destructive" });
      return;
    }

    // role 매핑: member(일반) = 두런 허브 DB에서 'member'로 저장
    const dbRole = formData.role;

    setIsSigningUp(true);
    try {
      await apiRequest("POST", "/api/auth/register", {
        username: formData.username,
        password: formData.password,
        firstName: formData.firstName,
        email: formData.email || null,
        phone: formData.phone || null,
        schoolId: Number(formData.organizationId),
        organizationType: formData.organizationType,
        role: dbRole,
      });

      const needsApproval = ["teacher", "admin"].includes(formData.role);
      toast({
        title: "회원가입 완료",
        description: needsApproval
          ? "회원가입이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다."
          : "회원가입이 완료되었습니다. 로그인해주세요.",
      });
      setLocation("/login");
    } catch (error: any) {
      toast({ title: "회원가입 실패", description: error.message || "회원가입에 실패했습니다.", variant: "destructive" });
    } finally {
      setIsSigningUp(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4 overflow-y-auto fixed inset-0 z-[100]">
      <Card className="w-full max-w-lg shadow-xl border-slate-200 my-8 bg-white text-slate-900">
        <CardHeader className="text-center pb-6">
          <div className="w-20 h-20 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary/30">
            <SchoolIcon className="w-10 h-10 text-white" />
          </div>
          <CardTitle className="text-3xl font-display font-bold">회원가입</CardTitle>
          <CardDescription className="text-base">두런 허브에 가입하세요</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pb-8">
          <form onSubmit={handleSignUp} className="space-y-4">

            {/* 조직 유형 선택 — 학교 / 일반 */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                조직 선택 *
              </Label>
              <Tabs
                value={formData.organizationType}
                onValueChange={(value) => handleTypeChange(value as OrgType)}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="학교">🏫 학교</TabsTrigger>
                  <TabsTrigger value="일반">🏢 일반</TabsTrigger>
                </TabsList>

                <div className="mt-3">
                  <Select
                    value={formData.organizationId}
                    onValueChange={(value) => updateFormData("organizationId", value)}
                    required
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder={
                        isLoadingOrgs ? "불러오는 중..." : `${formData.organizationType} 조직을 선택하세요`
                      } />
                    </SelectTrigger>
                    <SelectContent className="z-[110] bg-white text-slate-900">
                      {isLoadingOrgs ? (
                        <SelectItem value="loading" disabled>불러오는 중...</SelectItem>
                      ) : filteredOrganizations.length > 0 ? (
                        filteredOrganizations.map(org => (
                          <SelectItem key={org.id} value={String(org.id)}>{org.name}</SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>등록된 {formData.organizationType} 조직이 없습니다</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </Tabs>
            </div>

            {/* 역할 선택 */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <User className="w-4 h-4" />
                역할 *
              </Label>
              <Select value={formData.role} onValueChange={(value) => updateFormData("role", value)}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="역할을 선택하세요" />
                </SelectTrigger>
                <SelectContent className="z-[110] bg-white text-slate-900">
                  {roleOptions.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(formData.role === "admin" || formData.role === "teacher") && (
                <p className="text-[11px] text-amber-600 font-medium">
                  ※ 관리자·교직원 역할은 관리자 승인 후 사용 가능합니다.
                </p>
              )}
            </div>

            {/* 이름 */}
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-sm font-semibold flex items-center gap-2">
                <User className="w-4 h-4" /> 이름 *
              </Label>
              <Input id="firstName" placeholder="이름을 입력하세요" value={formData.firstName}
                onChange={(e) => updateFormData("firstName", e.target.value)} className="h-11" required />
            </div>

            {/* 아이디 */}
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-semibold flex items-center gap-2">
                <User className="w-4 h-4" /> 아이디 *
              </Label>
              <Input id="username" placeholder="로그인에 사용할 아이디" value={formData.username}
                onChange={(e) => updateFormData("username", e.target.value)} className="h-11" required />
            </div>

            {/* 비밀번호 */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold flex items-center gap-2">
                <Lock className="w-4 h-4" /> 비밀번호 *
              </Label>
              <Input id="password" type="password" placeholder="비밀번호를 입력하세요" value={formData.password}
                onChange={(e) => updateFormData("password", e.target.value)} className="h-11" required />
            </div>

            {/* 비밀번호 확인 */}
            <div className="space-y-2">
              <Label htmlFor="passwordConfirm" className="text-sm font-semibold flex items-center gap-2">
                <Lock className="w-4 h-4" /> 비밀번호 확인 *
              </Label>
              <Input id="passwordConfirm" type="password" placeholder="비밀번호를 다시 입력하세요" value={formData.passwordConfirm}
                onChange={(e) => updateFormData("passwordConfirm", e.target.value)} className="h-11" required />
            </div>

            {/* 이메일 */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold flex items-center gap-2">
                <Mail className="w-4 h-4" /> 이메일 (선택)
              </Label>
              <Input id="email" type="email" placeholder="이메일을 입력하세요 (선택)" value={formData.email}
                onChange={(e) => updateFormData("email", e.target.value)} className="h-11" />
            </div>

            {/* 전화번호 */}
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-semibold flex items-center gap-2">
                <Phone className="w-4 h-4" /> 전화번호 (선택)
              </Label>
              <Input id="phone" type="tel" placeholder="전화번호를 입력하세요 (선택)" value={formData.phone}
                onChange={(e) => updateFormData("phone", e.target.value)} className="h-11" />
            </div>

            <div className="pt-2">
              <Button type="submit" className="w-full h-11 text-base font-bold shadow-lg shadow-primary/20 bg-primary text-white" disabled={isSigningUp}>
                {isSigningUp ? "회원가입 중..." : "회원가입"}
              </Button>
            </div>
          </form>

          <div className="pt-4 border-t space-y-3">
            <Link href="/login">
              <Button variant="ghost" className="w-full gap-2">
                <ArrowLeft className="w-4 h-4" /> 로그인으로 돌아가기
              </Button>
            </Link>
            <p className="text-[10px] text-center text-slate-400 leading-relaxed">
              * 표시된 항목은 필수 입력입니다.<br/>© 2026 두런 허브.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
