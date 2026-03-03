import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Users, Shield, Trash2, Edit, Plus, GitBranch, CalendarDays, UserPlus, Lock, Loader2, Save, Settings, ChevronUp, ChevronDown, Search } from "lucide-react";
import type { User } from "@shared/schema";
import QRCode from "qrcode";

const ROLES = [
  { value: "teacher",    label: "교직원" },
  { value: "student",    label: "학생" },
  { value: "parent",     label: "학부모" },
  { value: "member",     label: "일반" },
  { value: "admin",      label: "관리자" },
  { value: "super_admin", label: "최고관리자" },
];

// 조직 타입에 맞는 역할 목록만 반환
const SCHOOL_ROLES_LIST = ROLES.filter(r => ["teacher", "student", "parent", "admin"].includes(r.value));
const GENERAL_ROLES_LIST = ROLES.filter(r => ["member", "admin"].includes(r.value));

function getRolesForOrgType(orgType?: string): typeof ROLES {
  if (!orgType) return SCHOOL_ROLES_LIST; // 기본값: 학교
  const t = orgType.toLowerCase();
  const isSchool = ["school", "학교", "elementary", "middle", "high", ""].includes(t);
  return isSchool ? SCHOOL_ROLES_LIST : GENERAL_ROLES_LIST;
}

const APPROVAL_TYPES = [
  { value: "field_trip", label: "현장체험학습" },
  { value: "absence", label: "결석계" },
  { value: "transfer", label: "전학 신청" },
  { value: "report", label: "보고서" },
  { value: "purchase", label: "물품 구매" },
  { value: "leave", label: "휴가 신청" },
  { value: "expense", label: "경비 청구" },
];

function ApprovalLineSettings({ schoolId, allUsers }: { schoolId: number | null | undefined; allUsers: any[] }) {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState("field_trip");
  const [steps, setSteps] = useState<{ approverId: string; stepOrder: number }[]>([]);
  const [stepCount, setStepCount] = useState(2); // 2~4단

  // 교직원 그룹 (teacher, admin)
  const teachers = allUsers.filter(u => 
    ["teacher", "admin"].includes(u.role) && u.schoolId === schoolId
  );

  // 기존 결재 라인 불러오기
  const { data: existingRoutes = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/approval-routes"],
    enabled: !!schoolId,
  });

  // 타입 변경 시 기존 라인 로드
  useEffect(() => {
    const routes = existingRoutes.filter((r: any) => r.approvalType === selectedType);
    if (routes.length > 0) {
      setStepCount(routes.length);
      setSteps(routes.map((r: any) => ({ approverId: r.approverId || "", stepOrder: r.stepOrder })));
    } else {
      setSteps(Array.from({ length: stepCount }, (_, i) => ({ approverId: "", stepOrder: i + 1 })));
    }
  }, [selectedType, existingRoutes]);

  // 단수 변경 시 steps 배열 조정
  useEffect(() => {
    setSteps(prev => {
      const newSteps = Array.from({ length: stepCount }, (_, i) => (
        prev[i] || { approverId: "", stepOrder: i + 1 }
      ));
      return newSteps.map((s, i) => ({ ...s, stepOrder: i + 1 }));
    });
  }, [stepCount]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const validSteps = steps.filter(s => s.approverId);
      if (validSteps.length === 0) throw new Error("결재자를 선택해주세요");
      return apiRequest("PUT", "/api/admin/approval-routes/bulk", {
        approvalType: selectedType,
        steps: validSteps,
      });
    },
    onSuccess: () => {
      toast({ title: "결재 라인이 저장되었습니다" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/approval-routes"] });
    },
    onError: (err: any) => {
      toast({ title: err.message || "저장 실패", variant: "destructive" });
    },
  });

  const getRoleName = (role: string) => {
    const map: Record<string, string> = { teacher: "교직원", student: "학생", parent: "학부모", member: "일반", admin: "관리자", super_admin: "최고관리자" };
    return map[role] || role;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-black text-lg">결재 라인 설정</CardTitle>
        <CardDescription>문서 종류별 결재 단계와 결재자를 설정합니다</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 문서 종류 선택 */}
        <div className="space-y-2">
          <Label className="font-bold text-sm">문서 종류</Label>
          <div className="flex gap-2 flex-wrap">
            {APPROVAL_TYPES.map(t => (
              <Button
                key={t.value}
                variant={selectedType === t.value ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedType(t.value)}
                className="font-bold"
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>

        {/* 결재 단수 */}
        <div className="space-y-2">
          <Label className="font-bold text-sm">결재 단수</Label>
          <div className="flex gap-2">
            {[2, 3, 4].map(n => (
              <Button
                key={n}
                variant={stepCount === n ? "default" : "outline"}
                size="sm"
                onClick={() => setStepCount(n)}
                className="font-bold"
              >
                {n}단 결재
              </Button>
            ))}
          </div>
        </div>

        {/* 결재 라인 */}
        <div className="space-y-3">
          <Label className="font-bold text-sm">결재자 지정</Label>
          <div className="flex items-center gap-2 flex-wrap">
            {steps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="bg-slate-50 border rounded-xl p-3 min-w-[140px] space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-400 text-center">{idx + 1}단계 결재자</div>
                  <Select
                    value={step.approverId}
                    onValueChange={(val) => {
                      const newSteps = [...steps];
                      newSteps[idx] = { ...newSteps[idx], approverId: val };
                      setSteps(newSteps);
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs font-bold">
                      <SelectValue placeholder="결재자 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers.map(u => (
                        <SelectItem key={u.id} value={u.id}>
                          <span className="font-bold">{u.firstName || u.username}</span>
                          <span className="text-slate-400 ml-1 text-[10px]">({getRoleName(u.role)})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {idx < steps.length - 1 && (
                  <span className="text-slate-300 text-lg font-bold">→</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 미리보기 */}
        <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
          <div className="text-xs font-bold text-blue-600 mb-2">미리보기</div>
          <div className="flex items-center gap-1 text-xs">
            <span className="bg-white px-2 py-1 rounded-lg font-bold border">신청자</span>
            {steps.map((step, idx) => {
              const user = teachers.find(u => u.id === step.approverId);
              return (
                <div key={idx} className="flex items-center gap-1">
                  <span className="text-blue-400">→</span>
                  <span className={`px-2 py-1 rounded-lg font-bold border ${user ? 'bg-white' : 'bg-red-50 border-red-200 text-red-400'}`}>
                    {user ? `${user.firstName || user.username} (${getRoleName(user.role)})` : "미지정"}
                  </span>
                </div>
              );
            })}
            <span className="text-blue-400">→</span>
            <span className="bg-green-50 px-2 py-1 rounded-lg font-bold border border-green-200 text-green-600">완료</span>
          </div>
        </div>

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || steps.every(s => !s.approverId)}
          className="w-full font-bold"
        >
          {saveMutation.isPending ? "저장 중..." : "결재 라인 저장"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Admin() {
  const { toast } = useToast();
  const { user, activeOrg } = useAuth();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addUserDialogOpen, setAddUserDialogOpen] = useState(false);
  const [batchUpdateDialogOpen, setBatchUpdateDialogOpen] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState("");
  const [newOrgType, setNewOrgType] = useState("school");
  const [newOrgCountry, setNewOrgCountry] = useState("KR");
  const [newOrgLanguage, setNewOrgLanguage] = useState("ko");
  const [newSchoolAdminId, setNewSchoolAdminId] = useState("");
  const [newSchoolAdminPw, setNewSchoolAdminPw] = useState("");
  const [newSchoolAdminName, setNewSchoolAdminName] = useState("");
  const [newUser, setNewUser] = useState({ username: "", password: "", email: "", fullName: "", role: "teacher", department: "", position: "" });
  const [batchText, setBatchText] = useState("");
  const [editForm, setEditForm] = useState({ firstName: "", email: "", phone: "", role: "teacher", department: "", position: "", newPassword: "" });
  const [batchForm, setBatchForm] = useState({ role: "SKIP", department: "", position: "" });
  const [userSearch, setUserSearch] = useState("");
  const [userSort, setUserSort] = useState<"name" | "username" | "role">("name");
  
  const [selectedSchool, setSelectedSchool] = useState<any | null>(null);
  const [schoolSettingsOpen, setSchoolSettingsOpen] = useState(false);
  const [schoolMembersOpen, setSchoolMembersOpen] = useState(false);
  const [selectedSchoolMembers, setSelectedSchoolMembers] = useState<any[]>([]);
  const [selectedSchoolForMembers, setSelectedSchoolForMembers] = useState<any>(null);
  const [schoolSettings, setSchoolSettings] = useState({ maxUploadSizeMb: 10, fileRetentionDays: 365, timezone: 'Asia/Seoul' });
  
  // 구글 캘린더 연동 상태
  const [googleCalendarAcademic, setGoogleCalendarAcademic] = useState("");
  const [googleCalendarDuty, setGoogleCalendarDuty] = useState("");
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);
  const [googleCalendarList, setGoogleCalendarList] = useState<any[]>([]);
  const [googleAcademicCalId, setGoogleAcademicCalId] = useState("none");
  const [googleDutyCalId, setGoogleDutyCalId] = useState("none");
  
  const isSuperAdmin = user?.role === "super_admin";

  // 그룹 관리 상태
  const [groupSettings, setGroupSettings] = useState<{ id: string; memo?: string }[]>([]);
  const [groupManageSearch, setGroupManageSearch] = useState("");

  const { data: serverGroupSettings } = useQuery<{ id: string; memo?: string }[]>({
    queryKey: ["/api/settings/chat-groups"],
    enabled: !isSuperAdmin,
  });

  useEffect(() => {
    if (serverGroupSettings) {
      setGroupSettings(serverGroupSettings);
    }
  }, [serverGroupSettings]);

  const saveGroupSettingsMutation = useMutation({
    mutationFn: async (settings: { id: string; memo?: string }[]) => {
      await apiRequest("POST", "/api/settings/chat-groups", { chatGroupSettings: settings });
    },
  });

  const saveGroupSettings = (settings: { id: string; memo?: string }[]) => {
    setGroupSettings(settings);
    saveGroupSettingsMutation.mutate(settings);
  };
  const saveMemoTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveGroupSettingsDebounced = (settings: { id: string; memo?: string }[]) => {
    setGroupSettings(settings);
    if (saveMemoTimeoutRef.current) clearTimeout(saveMemoTimeoutRef.current);
    saveMemoTimeoutRef.current = setTimeout(() => saveGroupSettingsMutation.mutate(settings), 500);
  };

  // 전체 유저 목록 (그룹 관리용)
  const { data: allChatUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: !isSuperAdmin,
  });

  const { data: users = [], isLoading: loadingUsers } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: schools = [], isLoading: loadingSchools } = useQuery<any[]>({
    queryKey: ["/api/admin/schools"],
    enabled: isSuperAdmin,
  });

  // admin 역할일 때는 /api/schools에서 학교 목록 가져오기
  const { data: publicSchools = [] } = useQuery<any[]>({
    queryKey: ["/api/schools"],
    enabled: !isSuperAdmin,
  });

  const allSchools = isSuperAdmin ? schools : publicSchools;

  // 학교별 통계
  const { data: schoolStats = {} } = useQuery<Record<number, { userCount: number; channelCount: number; totalMessages: number; todayMessages: number; monthMessages: number; totalFiles: number; estimatedStorageKB: number }>>({
    queryKey: ["/api/admin/schools/stats"],
    enabled: isSuperAdmin,
    refetchInterval: 60000,
  });

  // 학교 활성/비활성 토글
  const toggleSchoolStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/schools/${id}/status`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/schools"] });
      toast({ title: "학교 상태가 변경되었습니다." });
    },
  });

  const createSchoolMutation = useMutation({
    mutationFn: async (name: string) => {
      // 1. 조직 생성
      const response = await apiRequest("POST", "/api/admin/schools", {
        name,
        type: newOrgType,
        country: newOrgCountry,
        language: newOrgLanguage,
      });
      const data = await response.json();
      const schoolId = data.id;

      // 2. 관리자 계정 동시 생성 (입력된 경우만)
      if (schoolId && newSchoolAdminId && newSchoolAdminPw) {
        await apiRequest("POST", "/api/admin/users", {
          username: newSchoolAdminId,
          password: newSchoolAdminPw,
          firstName: newSchoolAdminName || newSchoolAdminId,
          schoolId,
          role: "admin",
        });
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/schools"] });
      const adminMsg = newSchoolAdminId ? ` 관리자 계정(${newSchoolAdminId})도 생성되었습니다.` : "";
      toast({ title: "조직 등록 완료", description: data.name + " 조직이 추가되었습니다." + adminMsg });
      setNewSchoolName("");
      setNewSchoolAdminId("");
      setNewSchoolAdminPw("");
      setNewSchoolAdminName("");
    },
    onError: (e: any) => {
      toast({ title: "등록 실패", description: e.message, variant: "destructive" });
    },
  });

  const deleteSchoolMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/schools/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "삭제 실패" }));
        throw new Error(err.message || "삭제 실패");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/schools"] });
      toast({ title: "조직 삭제 완료" });
    },
    onError: (e: any) => {
      toast({ title: "삭제 실패", description: e.message || "외래키 제약 또는 권한 문제입니다.", variant: "destructive" });
    },
  });

  const updateSchoolSettingsMutation = useMutation({
    mutationFn: async (data: { id: number; settings: any }) => {
      return apiRequest("PATCH", `/api/admin/schools/${data.id}/settings`, { settings: data.settings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/schools"] });
      toast({ title: "학교 설정 저장 완료" });
      setSchoolSettingsOpen(false);
    }
  });

  // 구글 캘린더 설정 저장 mutation
  const saveGoogleCalendarMutation = useMutation({
    mutationFn: async (data: { academicUrl: string; dutyUrl: string; schoolId: number }) => {
      return apiRequest("PATCH", `/api/admin/schools/${data.schoolId}/settings`, {
        settings: {
          maxUploadSizeMb: schoolSettings.maxUploadSizeMb,
          fileRetentionDays: schoolSettings.fileRetentionDays,
          timezone: schoolSettings.timezone,
          googleCalendarAcademicUrl: data.academicUrl,
          googleCalendarDutyUrl: data.dutyUrl,
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/schools"] });
      toast({ title: "구글 캘린더 설정이 저장되었습니다." });
    },
    onError: (error: any) => {
      toast({ title: "설정 저장 실패", description: error.message, variant: "destructive" });
    }
  });

  const handleSaveGoogleCalendarSettings = () => {
    // 현재 사용자의 학교로 자동 선택
    const targetSchoolId = selectedSchool?.id || user?.schoolId;
    if (!targetSchoolId) {
      toast({ title: "소속 학교를 찾을 수 없습니다. 관리자에게 문의해주세요.", variant: "destructive" });
      return;
    }
    saveGoogleCalendarMutation.mutate({
      academicUrl: googleCalendarAcademic,
      dutyUrl: googleCalendarDuty,
      schoolId: targetSchoolId
    });
  };

  // 구글 캘린더 동기화 mutation
  const syncCalendarMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/calendar/sync-from-settings", {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-plan"] });
      toast({ 
        title: "캘린더 동기화 완료", 
        description: `학사 일정: ${data.imported?.academic || 0}개, 업무 일정: ${data.imported?.duty || 0}개 가져왔습니다.` 
      });
    },
    onError: (error: any) => {
      toast({ title: "동기화 실패", description: error.message, variant: "destructive" });
    }
  });

  const handleSyncGoogleCalendar = () => {
    syncCalendarMutation.mutate();
  };

  // 학교 선택 또는 자동 선택 시 구글 캘린더 설정 로드
  const loadGoogleCalendarSettings = (school: any) => {
    setSelectedSchool(school);
    setSchoolSettings(school.settings || { maxUploadSizeMb: 10, fileRetentionDays: 365, timezone: 'Asia/Seoul' });
    setGoogleCalendarAcademic(school.settings?.googleCalendarAcademicUrl || "");
    setGoogleCalendarDuty(school.settings?.googleCalendarDutyUrl || "");
    // Google OAuth2 연동 상태 로드
    if (school.settings?.googleCalendarTokens) {
      setGoogleCalendarConnected(true);
      setGoogleAcademicCalId(school.settings?.googleCalendarAcademicId || "none");
      setGoogleDutyCalId(school.settings?.googleCalendarDutyId || "none");
    } else {
      setGoogleCalendarConnected(false);
    }
  };

  // Google Calendar 연동 상태 및 캘린더 목록 조회
  const { data: googleCalData } = useQuery<any>({
    queryKey: ["/api/calendar/google/calendars"],
    enabled: !isSuperAdmin,
  });

  useEffect(() => {
    if (googleCalData) {
      setGoogleCalendarConnected(googleCalData.connected);
      if (googleCalData.calendars) setGoogleCalendarList(googleCalData.calendars);
    }
  }, [googleCalData]);

  // 캘린더 매핑 저장
  const saveCalendarMapMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/calendar/google/map", {
        academicCalendarId: googleAcademicCalId === "none" ? null : googleAcademicCalId,
        dutyCalendarId: googleDutyCalId === "none" ? null : googleDutyCalId,
      });
    },
    onSuccess: () => {
      toast({ title: "캘린더 매핑이 저장되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/schools"] });
      queryClient.invalidateQueries({ queryKey: ["/api/schools"] });
    },
    onError: (err: any) => toast({ title: "저장 실패", description: err.message, variant: "destructive" }),
  });

  // 양방향 동기화 실행
  const googleSyncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/calendar/google/sync", {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-plan"] });
      toast({ title: "동기화 완료", description: data.message });
    },
    onError: (err: any) => toast({ title: "동기화 실패", description: err.message, variant: "destructive" }),
  });

  // Google 연동 해제
  const disconnectGoogleMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/calendar/google/disconnect", {});
    },
    onSuccess: () => {
      setGoogleCalendarConnected(false);
      setGoogleCalendarList([]);
      setGoogleAcademicCalId("none");
      setGoogleDutyCalId("none");
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/google/calendars"] });
      toast({ title: "구글 캘린더 연동이 해제되었습니다." });
    },
    onError: (err: any) => toast({ title: "연동 해제 실패", description: err.message, variant: "destructive" }),
  });

  // 관리자 페이지 로드 시 자신의 학교 자동 선택 (최초 1회만)
  const [calendarSettingsLoaded, setCalendarSettingsLoaded] = useState(false);
  useEffect(() => {
    if (calendarSettingsLoaded) return;
    if (user?.schoolId && allSchools.length > 0) {
      const mySchool = allSchools.find((s: any) => s.id === user.schoolId);
      if (mySchool) {
        loadGoogleCalendarSettings(mySchool);
        setCalendarSettingsLoaded(true);
      }
    }
  }, [user?.schoolId, schools, publicSchools]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(users.map(u => u.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (userId: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(userId);
    else next.delete(userId);
    setSelectedIds(next);
  };

  const addUserMutation = useMutation({
    mutationFn: async (userData: typeof newUser) => {
      const payload = {
        username: userData.username,
        password: userData.password,
        email: userData.email,
        firstName: userData.fullName || "",
        lastName: "",
        role: userData.role,
        department: userData.department,
        position: userData.position,
      };
      return apiRequest("POST", "/api/admin/users/batch", { users: [payload] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "사용자 등록 완료" });
      setAddUserDialogOpen(false);
      setNewUser({ username: "", password: "", email: "", fullName: "", role: "teacher", department: "", position: "" });
    }
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: { id: string; updates: any }) => {
      return apiRequest("PATCH", `/api/admin/users/${data.id}`, data.updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "수정 완료" });
      setEditDialogOpen(false);
    }
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: { id: string; newPassword: string }) => {
      return apiRequest("POST", `/api/admin/users/${data.id}/reset-password`, { newPassword: data.newPassword });
    },
    onSuccess: () => {
      toast({ title: "비밀번호 초기화 완료" });
    }
  });

  const batchUpdateMutation = useMutation({
    mutationFn: async (data: { userIds: string[]; updates: any }) => {
      return apiRequest("POST", "/api/admin/users/batch-update", data);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: `일괄 수정 완료 (${(res as any).count}명)` });
      setBatchUpdateDialogOpen(false);
      setSelectedIds(new Set());
    }
  });

  const batchDeleteMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      return apiRequest("POST", "/api/admin/users/batch-delete", { userIds });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: `일괄 삭제 완료 (${(res as any).count}명)` });
      setSelectedIds(new Set());
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "삭제 완료" });
    },
  });

  const approveUserMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/admin/users/${id}`, { isApproved: true });
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      // selectedSchoolMembers 즉시 갱신 (다이얼로그 닫지 않고 반영)
      setSelectedSchoolMembers(prev =>
        prev.map(u => u.id === id ? { ...u, isApproved: true } : u)
      );
      toast({ title: "승인 완료" });
    },
  });

  const setAdminMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${id}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "역할 변경 완료" });
    },
  });

  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setEditForm({
      firstName: user.firstName || "",
      email: user.email || "",
      phone: (user as any).phone || "",
      role: user.role || "teacher",
      department: user.department || "",
      position: user.position || "",
      newPassword: ""
    });
    setEditDialogOpen(true);
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin": return "destructive";
      case "teacher": return "default";
      case "student": case "parent": return "outline";
      default: return "secondary";
    }
  };

  const getRoleLabel = (val: string) => ROLES.find(r => r.value === val)?.label || val;

  return (
    <div className="h-full overflow-y-auto p-6 pt-12 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2 tracking-tight">
            <Shield className="h-6 w-6 text-primary" />
            관리자 센터
          </h1>
        </div>
        <Dialog open={addUserDialogOpen} onOpenChange={setAddUserDialogOpen}>
          <DialogTrigger asChild>
            <Button className="font-bold rounded-xl shadow-lg">
              <UserPlus className="h-4 w-4 mr-2" />
              구성원 추가
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md rounded-3xl">
            <DialogHeader><DialogTitle className="font-black">사용자 등록</DialogTitle></DialogHeader>
            <Tabs defaultValue="single" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="single">개별 등록</TabsTrigger>
                <TabsTrigger value="batch">일괄 등록</TabsTrigger>
              </TabsList>
              <TabsContent value="single">
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase ml-1">이름</Label>
                    <Input value={newUser.fullName} onChange={(e) => setNewUser({...newUser, fullName: e.target.value})} placeholder="홍길동" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase ml-1">아이디</Label>
                    <Input value={newUser.username} onChange={(e) => setNewUser({...newUser, username: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase ml-1">비밀번호</Label>
                    <Input type="password" value={newUser.password} onChange={(e) => setNewUser({...newUser, password: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase ml-1">역할</Label>
                    <Select value={newUser.role} onValueChange={(v) => setNewUser({...newUser, role: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{getRolesForOrgType(selectedSchoolForMembers?.type).map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full h-12 rounded-2xl font-black text-lg mt-2" onClick={() => addUserMutation.mutate(newUser)} disabled={!newUser.username || !newUser.password || addUserMutation.isPending}>
                    {addUserMutation.isPending ? "처리 중..." : "등록하기"}
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value="batch">
                <div className="space-y-4 py-4">
                  <textarea
                    className="w-full h-40 p-3 border rounded-xl text-sm font-mono bg-slate-50 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={`아이디 비밀번호 이름 역할(선택)`}
                    value={batchText}
                    onChange={(e) => setBatchText(e.target.value)}
                  />
                  <Button 
                    className="w-full h-12 rounded-2xl font-black text-lg mt-2" 
                    onClick={() => addUserMutation.mutate(newUser)} 
                    disabled={!batchText.trim() || addUserMutation.isPending}
                  >
                    일괄 등록하기
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue={isSuperAdmin ? "schools" : "settings"} className="space-y-4">
        <TabsList className="bg-slate-100 p-1 rounded-xl">
          {/* 시스템 설정 — 항상 가장 왼쪽 */}
          {isSuperAdmin && (
            <TabsTrigger value="system" className="rounded-lg font-bold">시스템 설정</TabsTrigger>
          )}
          {!isSuperAdmin && (
            <TabsTrigger value="settings" className="rounded-lg font-bold">시스템 설정</TabsTrigger>
          )}
          {isSuperAdmin && (
            <TabsTrigger value="schools" className="rounded-lg font-bold">학교 관리</TabsTrigger>
          )}
          {!isSuperAdmin && (
            <TabsTrigger value="users" className="rounded-lg font-bold">구성원 명단</TabsTrigger>
          )}
          {!isSuperAdmin && (
            <TabsTrigger value="invite" className="rounded-lg font-bold">초대 코드</TabsTrigger>
          )}
          {!isSuperAdmin && (
            <TabsTrigger value="groups" className="rounded-lg font-bold">그룹 관리</TabsTrigger>
          )}
          {!isSuperAdmin && (
            <TabsTrigger value="approval-lines" className="rounded-lg font-bold">결재 라인</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="schools" className="space-y-4">
          {/* 전체 현황 요약 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-black text-primary">{allSchools.length}</div>
                <div className="text-[11px] font-bold text-slate-500 mt-1">등록 학교</div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-black text-blue-600">{users.length}</div>
                <div className="text-[11px] font-bold text-slate-500 mt-1">전체 사용자</div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-black text-green-600">{users.filter(u => (u.role === "admin")).length}</div>
                <div className="text-[11px] font-bold text-slate-500 mt-1">학교 관리자</div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-black text-orange-600">{users.filter(u => !u.schoolId && u.role !== 'super_admin').length}</div>
                <div className="text-[11px] font-bold text-slate-500 mt-1">미소속 사용자</div>
              </CardContent>
            </Card>
          </div>

          {/* 조직 추가 */}
          <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-base font-black flex items-center gap-2">
                <Plus className="w-4 h-4" /> 새 조직 추가
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {/* 기본 정보 */}
              <div className="flex gap-2 flex-wrap">
                <Input
                  placeholder="조직 이름 (예: 시범초등학교, ABC Corp)"
                  value={newSchoolName}
                  onChange={(e) => setNewSchoolName(e.target.value)}
                  className="rounded-xl flex-1 min-w-[200px]"
                />
                <Select value={newOrgType} onValueChange={setNewOrgType}>
                  <SelectTrigger className="w-[120px] rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="school">🏫 학교</SelectItem>
                    <SelectItem value="general">🏢 일반</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={newOrgCountry} onValueChange={setNewOrgCountry}>
                  <SelectTrigger className="w-[110px] rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KR">🇰🇷 한국</SelectItem>
                    <SelectItem value="US">🇺🇸 미국</SelectItem>
                    <SelectItem value="GB">🇬🇧 영국</SelectItem>
                    <SelectItem value="JP">🇯🇵 일본</SelectItem>
                    <SelectItem value="CN">🇨🇳 중국</SelectItem>
                    <SelectItem value="IN">🇮🇳 인도</SelectItem>
                    <SelectItem value="KE">🇰🇪 케냐</SelectItem>
                    <SelectItem value="NG">🇳🇬 나이지리아</SelectItem>
                    <SelectItem value="ZA">🇿🇦 남아공</SelectItem>
                    <SelectItem value="GH">🇬🇭 가나</SelectItem>
                    <SelectItem value="ET">🇪🇹 에티오피아</SelectItem>
                    <SelectItem value="TZ">🇹🇿 탄자니아</SelectItem>
                    <SelectItem value="RW">🇷🇼 르완다</SelectItem>
                    <SelectItem value="SN">🇸🇳 세네갈</SelectItem>
                    <SelectItem value="PH">🇵🇭 필리핀</SelectItem>
                    <SelectItem value="VN">🇻🇳 베트남</SelectItem>
                    <SelectItem value="ID">🇮🇩 인도네시아</SelectItem>
                    <SelectItem value="BR">🇧🇷 브라질</SelectItem>
                    <SelectItem value="MX">🇲🇽 멕시코</SelectItem>
                    <SelectItem value="FR">🇫🇷 프랑스</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={newOrgLanguage} onValueChange={setNewOrgLanguage}>
                  <SelectTrigger className="w-[100px] rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ko">한국어</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="sw">Kiswahili</SelectItem>
                    <SelectItem value="am">አማርኛ</SelectItem>
                    <SelectItem value="ja">日本語</SelectItem>
                    <SelectItem value="zh">中文</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="pt">Português</SelectItem>
                    <SelectItem value="vi">Tiếng Việt</SelectItem>
                    <SelectItem value="hi">हिन्दी</SelectItem>
                    <SelectItem value="ar">العربية</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 관리자 계정 동시 생성 (선택) */}
              <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 space-y-2">
                <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" /> 관리자 계정 생성 (선택 — 비워두면 나중에 추가 가능)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Input
                    placeholder="관리자 이름"
                    value={newSchoolAdminName}
                    onChange={(e) => setNewSchoolAdminName(e.target.value)}
                    className="rounded-xl text-sm"
                  />
                  <Input
                    placeholder="관리자 아이디"
                    value={newSchoolAdminId}
                    onChange={(e) => setNewSchoolAdminId(e.target.value)}
                    className="rounded-xl text-sm font-mono"
                  />
                  <Input
                    placeholder="초기 비밀번호"
                    type="password"
                    value={newSchoolAdminPw}
                    onChange={(e) => setNewSchoolAdminPw(e.target.value)}
                    className="rounded-xl text-sm"
                  />
                </div>
                {newSchoolAdminId && !newSchoolAdminPw && (
                  <p className="text-[11px] text-amber-600">⚠️ 아이디 입력 시 비밀번호도 함께 입력해야 합니다.</p>
                )}
              </div>

              <Button
                onClick={() => createSchoolMutation.mutate(newSchoolName)}
                disabled={!newSchoolName || (!!newSchoolAdminId && !newSchoolAdminPw) || createSchoolMutation.isPending}
                className="rounded-xl px-6 w-full font-bold"
              >
                {createSchoolMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "조직 추가"}
              </Button>
            </CardContent>
          </Card>

          {/* 학교별 카드 */}
          <div className="grid gap-4">
            {allSchools.map((school) => {
              const schoolUsers = users.filter(u => u.schoolId === school.id);
              const schoolAdmins = schoolUsers.filter(u => u.role === "admin");
              const schoolTeachers = schoolUsers.filter(u => u.role === "teacher");
              const schoolStaff = schoolUsers.filter(u => u.role === "member");
              const maxUpload = school.settings?.maxUploadSizeMb || 10;
              const retentionDays = school.settings?.fileRetentionDays || 365;
              const hasCalendar = !!(school.settings?.googleCalendarAcademicUrl || school.settings?.googleCalendarDutyUrl);
              const isActive = school.settings?.isActive !== false;
              const stats = schoolStats[school.id];
              
              const formatStorage = (kb: number) => {
                if (kb < 1024) return `${kb} KB`;
                if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)} MB`;
                return `${(kb / (1024 * 1024)).toFixed(2)} GB`;
              };
              
              return (
                <Card key={school.id} className={`rounded-2xl border-slate-200 shadow-sm hover:shadow-md transition-shadow ${!isActive ? 'opacity-60 bg-slate-50' : ''}`}>
                  <CardContent className="p-4">
                    {/* 한 줄: 학교명 + 통계 태그 + 버튼 */}
                    <div className="flex items-center gap-3 flex-wrap">
                      {/* 학교명 */}
                      <div className="flex items-center gap-2 min-w-0 shrink-0">
                        <h3 className="text-lg font-black text-slate-900 whitespace-nowrap">{school.name}</h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 whitespace-nowrap">
                          {({ school: '🏫', company: '🏢', cooperative: '🤝', ngo: '🌍', community: '👥' } as Record<string,string>)[(school as any).type || 'school'] || '🏫'} {({ school: '학교', company: '기업', cooperative: '조합', ngo: 'NGO', community: '커뮤니티' } as Record<string,string>)[(school as any).type || 'school'] || '학교'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {isActive ? '🟢 활성' : '🔴 비활성'}
                        </span>
                      </div>

                      {/* 통계 태그들 */}
                      <div className="flex items-center gap-1.5 flex-wrap flex-1">
                        <span className="px-2.5 py-1 bg-blue-50 rounded-lg text-xs font-bold text-blue-700 whitespace-nowrap">👥 {schoolUsers.length}명</span>
                        <span className="px-2.5 py-1 bg-purple-50 rounded-lg text-xs font-bold text-purple-600 whitespace-nowrap">🛡️ {schoolAdmins.length}</span>
                        <span className="px-2.5 py-1 bg-green-50 rounded-lg text-xs font-bold text-green-600 whitespace-nowrap">👨‍🏫 {schoolTeachers.length}</span>
                        {stats && (
                          <>
                            <span className="px-2.5 py-1 bg-indigo-50 rounded-lg text-xs font-bold text-indigo-600 whitespace-nowrap">💾 {formatStorage(stats.estimatedStorageKB)}</span>
                            <span className="px-2.5 py-1 bg-cyan-50 rounded-lg text-xs font-bold text-cyan-600 whitespace-nowrap">💬 오늘 {stats.todayMessages} · 월 {stats.monthMessages} · 총 {stats.totalMessages.toLocaleString()}</span>
                            <span className="px-2.5 py-1 bg-pink-50 rounded-lg text-xs font-bold text-pink-600 whitespace-nowrap">📎 {stats.totalFiles} · 채널 {stats.channelCount}</span>
                          </>
                        )}
                        <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-xs font-bold text-slate-500 whitespace-nowrap">📁 {maxUpload}MB · {retentionDays}일</span>
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap ${hasCalendar ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>📅 {hasCalendar ? '연동' : '미연동'}</span>
                        {schoolAdmins.map(a => (
                          <span key={a.id} className="px-2 py-1 bg-primary/10 text-primary rounded-lg text-xs font-bold whitespace-nowrap">👤 {a.firstName}</span>
                        ))}
                      </div>

                      {/* 버튼 */}
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs font-bold px-3"
                          onClick={() => {
                            setSelectedSchoolMembers(schoolUsers);
                            setSelectedSchoolForMembers(school);
                            setSchoolMembersOpen(true);
                          }}
                        >
                          👥 구성원
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs font-bold px-3"
                          onClick={async () => {
                            try {
                              if ((school as any).inviteCode) {
                                navigator.clipboard.writeText((school as any).inviteCode);
                                toast({ title: `초대 코드: ${(school as any).inviteCode}`, description: "클립보드에 복사되었습니다" });
                              } else {
                                const res = await fetch(`/api/admin/schools/${school.id}/invite-code`, { method: 'POST', credentials: 'include' });
                                const data = await res.json();
                                navigator.clipboard.writeText(data.inviteCode);
                                toast({ title: `초대 코드: ${data.inviteCode}`, description: "생성 후 클립보드에 복사되었습니다" });
                                queryClient.invalidateQueries({ queryKey: ["/api/admin/schools"] });
                                queryClient.invalidateQueries({ queryKey: ["/api/schools"] });
                              }
                            } catch { toast({ title: "초대 코드 오류", variant: "destructive" }); }
                          }}
                        >
                          🔗 {(school as any).inviteCode || '초대 코드 생성'}
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs font-bold px-3"
                          onClick={() => {
                            setSelectedSchool(school);
                            setSchoolSettings(school.settings || { maxUploadSizeMb: 10, fileRetentionDays: 365, timezone: 'Asia/Seoul' });
                            setGoogleCalendarAcademic(school.settings?.googleCalendarAcademicUrl || "");
                            setGoogleCalendarDuty(school.settings?.googleCalendarDutyUrl || "");
                            setSchoolSettingsOpen(true);
                          }}
                        >
                          <Settings className="h-3.5 w-3.5 mr-1" />설정
                        </Button>
                        <Button size="sm" variant={isActive ? "outline" : "default"}
                          className={`h-8 rounded-lg text-xs font-bold px-3 ${isActive ? 'text-orange-600 border-orange-300 hover:bg-orange-50' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                          onClick={() => toggleSchoolStatusMutation.mutate({ id: school.id, isActive: !isActive })}
                          disabled={toggleSchoolStatusMutation.isPending}
                        >
                          {isActive ? "비활성화" : "활성화"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-lg"
                          onClick={() => confirm(`"${school.name}"을(를) 정말 삭제하시겠습니까?`) && deleteSchoolMutation.mutate(school.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          {/* ── 승인 대기자 섹션 ── */}
          <PendingMembersSection schoolId={user?.schoolId} />

          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-xl border border-primary/10 animate-in fade-in slide-in-from-left-2">
                <span className="text-xs font-bold px-2">{selectedIds.size}명 선택됨</span>
                <Button size="sm" variant="outline" className="h-8 rounded-lg font-bold" onClick={() => setBatchUpdateDialogOpen(true)}>
                  일괄 변경
                </Button>
                <Button size="sm" variant="destructive" className="h-8 rounded-lg font-bold" onClick={() => confirm("선택한 사용자를 삭제하시겠습니까?") && batchDeleteMutation.mutate(Array.from(selectedIds))}>
                  일괄 삭제
                </Button>
              </div>
            )}
          </div>

          <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm">
            <CardContent className="p-0">
              <div className="flex items-center gap-2 p-3 border-b border-slate-100">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input placeholder="이름, 아이디 검색" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} className="pl-9 rounded-xl h-9 text-sm" />
                </div>
                <Select value={userSort} onValueChange={(v: any) => setUserSort(v)}>
                  <SelectTrigger className="w-28 rounded-xl h-9 text-xs font-bold"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">이름순</SelectItem>
                    <SelectItem value="username">아이디순</SelectItem>
                    <SelectItem value="role">역할순</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {loadingUsers ? (
                <div className="text-center py-20"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox 
                          checked={selectedIds.size === users.length && users.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="font-bold">아이디</TableHead>
                      <TableHead className="font-bold">이름</TableHead>
                      <TableHead className="font-bold">역할</TableHead>
                      <TableHead className="font-bold">부서/직책</TableHead>
                      <TableHead className="font-bold">연락처</TableHead>
                      <TableHead className="text-right font-bold">관리</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const q = userSearch.toLowerCase();
                      const roleOrder: Record<string, number> = { admin: 0, teacher: 1, student: 2 };
                      return users
                        .filter((u: any) => !q || (u.firstName || "").toLowerCase().includes(q) || (u.username || "").toLowerCase().includes(q))
                        .sort((a: any, b: any) => {
                          if (userSort === "name") return (a.firstName || "").localeCompare(b.firstName || "", "ko");
                          if (userSort === "username") return (a.username || "").localeCompare(b.username || "");
                          return (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
                        })
                        .map((u) => (
                      <TableRow key={u.id} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell>
                          <Checkbox 
                            checked={selectedIds.has(u.id)}
                            onCheckedChange={(checked) => handleSelectOne(u.id, !!checked)}
                          />
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">{(u as any).username}</TableCell>
                        <TableCell className="font-bold">{u.firstName || "-"} {u.lastName ? u.lastName : ""}</TableCell>
                        <TableCell><Badge variant={getRoleBadgeVariant(u.role || "teacher")} className="text-[10px] font-black">{getRoleLabel(u.role || "teacher")}</Badge></TableCell>
                        <TableCell className="text-sm font-medium text-slate-500">{u.department || "-"} / {u.position || "-"}</TableCell>
                        <TableCell className="text-sm font-medium text-slate-500">{(u as any).phone || "-"}</TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-slate-100" onClick={() => openEditDialog(u)}><Edit className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => confirm("삭제?") && deleteUserMutation.mutate(u.id)}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))})()}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 그룹 관리 탭 - 학교 단위 채팅 그룹 설정 */}
        <TabsContent value="groups" className="space-y-4">
          <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm">
            <CardHeader>
              <CardTitle className="font-black text-lg flex items-center gap-2">
                <Users className="w-5 h-5" />
                메신저 그룹 설정
              </CardTitle>
              <CardDescription>메신저 '그룹' 탭에 표시될 구성원 순서와 메모를 설정합니다. 모든 구성원에게 동일하게 적용됩니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="구성원 이름 검색" 
                  className="h-10 rounded-xl bg-slate-50 border-slate-200 pl-10 text-xs font-bold" 
                  value={groupManageSearch} 
                  onChange={(e) => setGroupManageSearch(e.target.value)} 
                />
              </div>
              
              <div className="max-h-[60vh] overflow-y-auto space-y-1 scrollbar-hide">
                {(() => {
                  const allUsersList = (allChatUsers.length > 0 ? allChatUsers : users).filter(u => 
                    !groupManageSearch || 
                    (u.firstName || "").includes(groupManageSearch) || 
                    (u.username || "").includes(groupManageSearch)
                  );
                  
                  const selectedUsers = groupSettings
                    .map(gs => allUsersList.find(u => u.id === gs.id))
                    .filter(Boolean) as User[];
                  
                  const unselectedUsers = allUsersList.filter(u => !groupSettings.some(gs => gs.id === u.id));
                  const sortedUsers = [...selectedUsers, ...unselectedUsers];
                  
                  return sortedUsers.map(u => {
                    const isSelected = groupSettings.some(gs => gs.id === u.id);
                    const order = groupSettings.findIndex(gs => gs.id === u.id);

                    return (
                      <div 
                        key={u.id}
                        className={`flex flex-col p-2.5 rounded-xl transition-all border ${isSelected ? 'bg-primary/5 border-primary/20' : 'hover:bg-slate-50 border-transparent'}`}
                      >
                        <div className="flex items-center justify-between cursor-pointer"
                          onClick={() => {
                            if (isSelected) {
                              saveGroupSettings(groupSettings.filter(gs => gs.id !== u.id));
                            } else {
                              saveGroupSettings([...groupSettings, { id: u.id }]);
                            }
                          }}
                        >
                          <div className="flex items-center gap-3">
                            {isSelected && (
                              <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center shrink-0">
                                {order + 1}
                              </span>
                            )}
                            <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center font-black text-slate-500 text-[10px]">
                              {(u.firstName || u.username || "?").slice(0, 1)}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs font-black">{u.firstName || u.username}</span>
                              <span className="text-[9px] text-slate-400 font-bold">{u.department || ""} {u.position || u.role}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isSelected && (
                              <div className="flex flex-col gap-0.5">
                                <button 
                                  disabled={order === 0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const next = [...groupSettings];
                                    [next[order], next[order-1]] = [next[order-1], next[order]];
                                    saveGroupSettings(next);
                                  }}
                                  className="p-0.5 hover:bg-white rounded border disabled:opacity-30 transition-colors"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  disabled={order === groupSettings.length - 1}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const next = [...groupSettings];
                                    [next[order], next[order+1]] = [next[order+1], next[order]];
                                    saveGroupSettings(next);
                                  }}
                                  className="p-0.5 hover:bg-white rounded border disabled:opacity-30 transition-colors"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                            <Checkbox checked={isSelected} onCheckedChange={(val) => { if (val) saveGroupSettings([...groupSettings, { id: u.id }]); else saveGroupSettings(groupSettings.filter(gs => gs.id !== u.id)); }} />
                          </div>
                        </div>
                        {isSelected && (
                          <div className="mt-1.5 ml-8">
                            <Input
                              placeholder="메모 입력 (예: 교무부장, 1학년 담임)"
                              className="h-7 text-[11px] rounded-lg bg-white border-slate-200 px-2"
                              value={groupSettings.find(gs => gs.id === u.id)?.memo || ""}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const next = groupSettings.map(gs => 
                                  gs.id === u.id ? { ...gs, memo: e.target.value } : gs
                                );
                                saveGroupSettingsDebounced(next);
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>

              <div className="pt-2 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 font-medium">
                  * 선택된 구성원 <span className="font-black text-primary">{groupSettings.length}</span>명이 메신저 '그룹' 탭에 설정된 순서대로 표시됩니다.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 시스템 설정 탭 - 구글 캘린더 연동 */}
        {/* ── 초대 코드 탭 ── */}
        <TabsContent value="invite" className="space-y-4">
          <InviteCodeManager schoolId={user?.schoolId} />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          {/* ── 조직 프로필 설정 ── */}
          <OrgProfileSettings schoolId={user?.schoolId} />

          {/* ── 메뉴 활성화 설정 ── */}
          <MenuVisibilitySettings schoolId={user?.schoolId} orgType={activeOrg?.orgType || (user as any)?.orgType} />

          {/* ── 문서 신청 양식 관리 ── */}
          <DocumentTypeManager schoolId={user?.schoolId} />

          {/* Google Calendar OAuth2 양방향 연동 */}
          <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm">
            <CardHeader>
              <CardTitle className="font-black text-lg flex items-center gap-2">
                <CalendarDays className="w-5 h-5" />
                구글 캘린더 연동
              </CardTitle>
              <CardDescription>구글 캘린더와 양방향 동기화합니다. 앱에서 만든 일정이 구글에, 구글 일정이 앱에 반영됩니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 연동 상태 표시 */}
              {googleCalendarConnected ? (
                <>
                  <div className="p-4 bg-green-50 rounded-2xl border border-green-200">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                      <h4 className="font-bold text-green-900">구글 캘린더 연동됨</h4>
                    </div>
                    <p className="text-sm text-green-700">양방향 동기화가 활성화되어 있습니다. (1시간마다 자동 동기화)</p>
                  </div>

                  {/* 캘린더 매핑 */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-primary" />
                        학사 일정 캘린더
                      </Label>
                      <Select value={googleAcademicCalId} onValueChange={setGoogleAcademicCalId}>
                        <SelectTrigger className="rounded-xl"><SelectValue placeholder="캘린더를 선택하세요" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">선택 안함</SelectItem>
                          {googleCalendarList.map((cal: any) => (
                            <SelectItem key={cal.id} value={cal.id}>{cal.summary}{cal.primary ? ' (기본)' : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-bold flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-orange-500" />
                        업무 일정 캘린더
                      </Label>
                      <Select value={googleDutyCalId} onValueChange={setGoogleDutyCalId}>
                        <SelectTrigger className="rounded-xl"><SelectValue placeholder="캘린더를 선택하세요" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">선택 안함</SelectItem>
                          {googleCalendarList.map((cal: any) => (
                            <SelectItem key={cal.id} value={cal.id}>{cal.summary}{cal.primary ? ' (기본)' : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button 
                    className="w-full h-12 rounded-2xl font-black text-lg" 
                    onClick={() => saveCalendarMapMutation.mutate()}
                    disabled={saveCalendarMapMutation.isPending}
                  >
                    {saveCalendarMapMutation.isPending ? (
                      <><Loader2 className="h-5 w-5 animate-spin mr-2" /> 저장 중...</>
                    ) : (
                      <><Save className="h-5 w-5 mr-2" /> 캘린더 매핑 저장</>
                    )}
                  </Button>

                  <div className="flex gap-2">
                    <Button 
                      className="flex-1 h-12 rounded-2xl font-black text-lg bg-green-600 hover:bg-green-700"
                      onClick={() => googleSyncMutation.mutate()}
                      disabled={googleSyncMutation.isPending}
                    >
                      {googleSyncMutation.isPending ? (
                        <><Loader2 className="h-5 w-5 animate-spin mr-2" /> 동기화 중...</>
                      ) : (
                        <><CalendarDays className="h-5 w-5 mr-2" /> 지금 동기화</>
                      )}
                    </Button>
                    <Button 
                      variant="outline"
                      className="h-12 rounded-2xl font-bold text-red-500 border-red-200 hover:bg-red-50"
                      onClick={() => disconnectGoogleMutation.mutate()}
                      disabled={disconnectGoogleMutation.isPending}
                    >
                      연동 해제
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                    <h4 className="font-bold text-blue-900 mb-2">양방향 동기화 (권장)</h4>
                    <p className="text-sm text-blue-800 mb-3">구글 계정으로 로그인하면 앱↔구글 캘린더 간 양방향 동기화가 가능합니다.</p>
                    <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                      <li>앱에서 만든 일정 → 구글 캘린더에 자동 등록</li>
                      <li>구글에서 만든 일정 → 앱에 자동 반영</li>
                      <li>수정/삭제도 양쪽에 반영</li>
                      <li>1시간마다 자동 동기화</li>
                    </ul>
                  </div>
                  <Button 
                    className="w-full h-12 rounded-2xl font-black text-lg"
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/auth/google/calendar', { credentials: 'include' });
                        const data = await res.json();
                        if (data.url) {
                          const popup = window.open(data.url, 'google-auth', 'width=500,height=600');
                          const handler = (e: MessageEvent) => {
                            if (e.data?.type === 'GOOGLE_CALENDAR_CONNECTED') {
                              window.removeEventListener('message', handler);
                              queryClient.invalidateQueries({ queryKey: ["/api/calendar/google/calendars"] });
                              queryClient.invalidateQueries({ queryKey: ["/api/schools"] });
                              queryClient.invalidateQueries({ queryKey: ["/api/admin/schools"] });
                              toast({ title: "구글 캘린더 연동 완료!" });
                              setGoogleCalendarConnected(true);
                            }
                          };
                          window.addEventListener('message', handler);
                        }
                      } catch (err) {
                        toast({ title: "구글 인증 시작 실패", variant: "destructive" });
                      }
                    }}
                  >
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                    구글 캘린더 연동하기
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* QR 초대 코드 관리 */}
          <QRInviteManager schoolId={user?.schoolId} />
        </TabsContent>

        {/* 최고관리자 전용 시스템 설정 */}
        <TabsContent value="system" className="space-y-4">
          <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm">
            <CardHeader>
              <CardTitle className="font-black text-lg flex items-center gap-2">
                ⚙️ 시스템 전체 설정
              </CardTitle>
              <CardDescription>최고관리자 전용 시스템 관리 설정입니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200">
                <h4 className="font-bold text-amber-900 mb-1">최고관리자 정보</h4>
                <div className="text-sm text-amber-800 space-y-1">
                  <p>아이디: <span className="font-mono font-bold">{user?.username}</span></p>
                  <p>이름: <span className="font-bold">{user?.firstName}</span></p>
                  <p>이메일: <span className="font-mono">{user?.email || "미설정"}</span></p>
                  <p>등록일: <span>{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}</span></p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="font-bold text-slate-800">등록된 학교 현황</h4>
                <div className="text-sm text-slate-600">
                  <p>총 <span className="font-black text-primary">{schools.length}</span>개 학교 등록됨</p>
                  <p>총 <span className="font-black text-primary">{users.length}</span>명 사용자 등록됨</p>
                </div>
              </div>

              <div className="p-4 bg-red-50 rounded-2xl border border-red-200 space-y-3">
                <h4 className="font-bold text-red-800">⚠️ 위험 영역</h4>
                <p className="text-xs text-red-600">시스템 전체에 영향을 미치는 설정입니다. 신중하게 변경하세요.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 결재 라인 설정 탭 */}
        <TabsContent value="approval-lines" className="space-y-4">
          <ApprovalLineSettings schoolId={user?.schoolId} allUsers={users} />
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader><DialogTitle className="font-black">구성원 정보 수정</DialogTitle></DialogHeader>
          {/* 프로필 & 아이디 */}
          <div className="flex items-center gap-4 py-3 px-2 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="w-16 h-16 rounded-2xl border-2 border-slate-200 bg-white flex items-center justify-center text-2xl font-black text-slate-400 overflow-hidden">
              {selectedUser?.profileImageUrl ? (
                <img src={selectedUser.profileImageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                selectedUser?.firstName?.slice(0, 1) || "?"
              )}
            </div>
            <div className="flex-1">
              <div className="text-lg font-black">{selectedUser?.firstName}</div>
              <div className="text-sm text-slate-500 font-mono">@{selectedUser?.username}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {ROLES.find(r => r.value === selectedUser?.role)?.label || selectedUser?.role}
                {selectedUser?.department ? ` · ${selectedUser.department}` : ""}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase ml-1">이름</Label>
              <Input value={editForm.firstName} onChange={(e) => setEditForm({...editForm, firstName: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase ml-1">역할</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({...editForm, role: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{getRolesForOrgType(selectedSchoolForMembers?.type).map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase ml-1">부서</Label>
              <Input value={editForm.department} onChange={(e) => setEditForm({...editForm, department: e.target.value})} placeholder="예: 교무부" />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase ml-1">직책</Label>
              <Input value={editForm.position} onChange={(e) => setEditForm({...editForm, position: e.target.value})} placeholder="예: 부장" />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase ml-1">이메일</Label>
              <Input value={editForm.email} onChange={(e) => setEditForm({...editForm, email: e.target.value})} type="email" />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-black uppercase ml-1">전화번호</Label>
              <Input value={editForm.phone} onChange={(e) => setEditForm({...editForm, phone: e.target.value})} type="tel" />
            </div>
            <div className="col-span-2 p-4 bg-slate-50 rounded-2xl space-y-4 border border-slate-100">
               <div className="flex items-center gap-2 text-primary">
                 <Lock className="w-4 h-4" />
                 <span className="text-xs font-black">비밀번호 강제 변경</span>
               </div>
               <div className="flex gap-2">
                 <Input 
                   type="password" 
                   placeholder="새 비밀번호" 
                   value={editForm.newPassword}
                   onChange={(e) => setEditForm({...editForm, newPassword: e.target.value})}
                   className="bg-white"
                 />
                 <Button 
                   variant="outline" 
                   disabled={!editForm.newPassword || resetPasswordMutation.isPending}
                   onClick={() => selectedUser && resetPasswordMutation.mutate({ id: selectedUser.id, newPassword: editForm.newPassword })}
                 >
                   초기화
                 </Button>
               </div>
               <p className="text-[10px] text-slate-400 font-medium">* 관리자 권한으로 사용자의 비밀번호를 즉시 변경합니다.</p>
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full h-12 rounded-2xl font-black text-lg" onClick={() => selectedUser && updateUserMutation.mutate({ id: selectedUser.id, updates: editForm })}>
              <Save className="w-4 h-4 mr-2" />
              변경사항 저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Update Dialog */}
      <Dialog open={batchUpdateDialogOpen} onOpenChange={setBatchUpdateDialogOpen}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-black">일괄 변경 ({selectedIds.size}명)</DialogTitle>
            <CardDescription>변경하지 않을 항목은 비워두세요.</CardDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-black">역할</Label>
              <Select value={batchForm.role} onValueChange={(v) => setBatchForm({...batchForm, role: v})}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SKIP">변경 안함</SelectItem>
                  <SelectItem value="teacher">교직원</SelectItem>
                  <SelectItem value="student">학생</SelectItem>
                  <SelectItem value="parent">학부모</SelectItem>
                  <SelectItem value="member">일반</SelectItem>
                  <SelectItem value="admin">관리자</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-black">부서</Label>
              <Input placeholder="변경 안함" value={batchForm.department} onChange={(e) => setBatchForm({...batchForm, department: e.target.value})} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-black">직책</Label>
              <Input placeholder="변경 안함" value={batchForm.position} onChange={(e) => setBatchForm({...batchForm, position: e.target.value})} className="rounded-xl" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setBatchUpdateDialogOpen(false)}>취소</Button>
            <Button className="rounded-xl font-bold" onClick={() => {
              const updates: any = {};
              if (batchForm.role !== "SKIP") updates.role = batchForm.role;
              if (batchForm.department) updates.department = batchForm.department;
              if (batchForm.position) updates.position = batchForm.position;
              if (Object.keys(updates).length === 0) { toast({ title: "변경할 항목이 없습니다" }); return; }
              batchUpdateMutation.mutate({ userIds: Array.from(selectedIds), updates });
            }}>적용</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 학교 구성원 관리 다이얼로그 */}
      <Dialog open={schoolMembersOpen} onOpenChange={setSchoolMembersOpen}>
        <DialogContent className="max-w-2xl rounded-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-black text-lg">
              {selectedSchoolForMembers?.name} — 구성원 명단
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {/* 승인 대기 */}
            {selectedSchoolMembers.filter((u: any) => u.isApproved === false).length > 0 && (
              <div className="mb-4">
                <Label className="text-xs font-bold text-amber-600 mb-2 block">⏳ 승인 대기 ({selectedSchoolMembers.filter((u: any) => u.isApproved === false).length}명)</Label>
                {selectedSchoolMembers.filter((u: any) => u.isApproved === false).map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between p-2 bg-amber-50 rounded-xl mb-1 border border-amber-100">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{u.firstName || u.username}</span>
                      <span className="text-xs text-slate-400">@{u.username}</span>
                      <Badge variant="outline" className="text-[10px]">{getRoleLabel(u.role)}</Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" className="h-7 text-xs font-bold rounded-lg" onClick={() => approveUserMutation.mutate(u.id)}>
                        승인
                      </Button>
                      <Button size="sm" variant="destructive" className="h-7 text-xs font-bold rounded-lg" onClick={() => confirm(`${u.firstName}님을 삭제하시겠습니까?`) && deleteUserMutation.mutate(u.id)}>
                        삭제
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 전체 명단 */}
            <Label className="text-xs font-bold text-slate-500 block">전체 구성원 ({selectedSchoolMembers.filter((u: any) => u.isApproved !== false).length}명)</Label>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-bold">이름</TableHead>
                  <TableHead className="text-xs font-bold">아이디</TableHead>
                  <TableHead className="text-xs font-bold">역할</TableHead>
                  <TableHead className="text-xs font-bold w-[120px]">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedSchoolMembers.filter((u: any) => u.isApproved !== false).map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-bold text-sm">{u.firstName || u.username}</TableCell>
                    <TableCell className="text-xs text-slate-400">@{u.username}</TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeVariant(u.role)} className="text-[10px]">{getRoleLabel(u.role)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {u.role !== "admin" ? (
                          <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold rounded-lg" 
                            onClick={() => confirm(`${u.firstName}님을 학교관리자로 지정하시겠습니까?`) && setAdminMutation.mutate({ id: u.id, role: "admin" })}>
                            관리자 지정
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold rounded-lg text-orange-600"
                            onClick={() => confirm(`${u.firstName}님의 관리자 권한을 해제하시겠습니까?`) && setAdminMutation.mutate({ id: u.id, role: "teacher" })}>
                            관리자 해제
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          onClick={() => confirm(`${u.firstName}님을 삭제하시겠습니까?`) && deleteUserMutation.mutate(u.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* School Settings Dialog */}
      <Dialog open={schoolSettingsOpen} onOpenChange={setSchoolSettingsOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-black">학교 정책 설정</DialogTitle>
            <CardDescription>{selectedSchool?.name}의 운영 정책을 설정합니다.</CardDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-black">1회 최대 업로드 용량 (MB)</Label>
              <div className="flex items-center gap-4">
                <Input 
                  type="number" 
                  value={schoolSettings.maxUploadSizeMb} 
                  onChange={(e) => setSchoolSettings({...schoolSettings, maxUploadSizeMb: Number(e.target.value)})}
                  className="rounded-xl"
                />
                <span className="text-sm font-bold text-slate-500 shrink-0">MB</span>
              </div>
              <p className="text-[10px] text-slate-400">* 학교별로 업로드 가능한 파일 크기를 제한합니다.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-black">첨부파일 유지 기간 (일)</Label>
              <div className="flex items-center gap-4">
                <Input 
                  type="number" 
                  value={schoolSettings.fileRetentionDays} 
                  onChange={(e) => setSchoolSettings({...schoolSettings, fileRetentionDays: Number(e.target.value)})}
                  className="rounded-xl"
                />
                <span className="text-sm font-bold text-slate-500 shrink-0">일</span>
              </div>
              <p className="text-[10px] text-slate-400">* 설정된 기간이 지난 첨부파일은 서버에서 자동 삭제 대상이 됩니다.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-black">사용 국가 (시간대)</Label>
              <select
                value={schoolSettings.timezone || 'Asia/Seoul'}
                onChange={(e) => setSchoolSettings({...schoolSettings, timezone: e.target.value})}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="Asia/Seoul">🇰🇷 대한민국 (KST, UTC+9)</option>
                <option value="Asia/Tokyo">🇯🇵 일본 (JST, UTC+9)</option>
                <option value="Asia/Shanghai">🇨🇳 중국 (CST, UTC+8)</option>
                <option value="Asia/Singapore">🇸🇬 싱가포르 (SGT, UTC+8)</option>
                <option value="Asia/Ho_Chi_Minh">🇻🇳 베트남 (ICT, UTC+7)</option>
                <option value="Asia/Bangkok">🇹🇭 태국 (ICT, UTC+7)</option>
                <option value="Asia/Kolkata">🇮🇳 인도 (IST, UTC+5:30)</option>
                <option value="Asia/Dubai">🇦🇪 UAE (GST, UTC+4)</option>
                <option value="Europe/London">🇬🇧 영국 (GMT/BST)</option>
                <option value="Europe/Paris">🇫🇷 프랑스 (CET, UTC+1)</option>
                <option value="Europe/Berlin">🇩🇪 독일 (CET, UTC+1)</option>
                <option value="America/New_York">🇺🇸 미국 동부 (EST, UTC-5)</option>
                <option value="America/Chicago">🇺🇸 미국 중부 (CST, UTC-6)</option>
                <option value="America/Denver">🇺🇸 미국 산악 (MST, UTC-7)</option>
                <option value="America/Los_Angeles">🇺🇸 미국 서부 (PST, UTC-8)</option>
                <option value="America/Anchorage">🇺🇸 알래스카 (AKST, UTC-9)</option>
                <option value="Pacific/Honolulu">🇺🇸 하와이 (HST, UTC-10)</option>
                <option value="America/Sao_Paulo">🇧🇷 브라질 (BRT, UTC-3)</option>
                <option value="Australia/Sydney">🇦🇺 호주 시드니 (AEST, UTC+10)</option>
                <option value="Pacific/Auckland">🇳🇿 뉴질랜드 (NZST, UTC+12)</option>
              </select>
              <p className="text-[10px] text-slate-400">* 캘린더 일정과 시간 표시에 적용됩니다.</p>
            </div>
          </div>
          <DialogFooter>
            <Button 
              className="w-full h-12 rounded-2xl font-black text-lg" 
              onClick={() => selectedSchool && updateSchoolSettingsMutation.mutate({ id: selectedSchool.id, settings: schoolSettings })}
              disabled={updateSchoolSettingsMutation.isPending}
            >
              {updateSchoolSettingsMutation.isPending ? "저장 중..." : "설정 적용하기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// QR 초대 코드 관리 컴포넌트
function QRInviteManager({ schoolId }: { schoolId?: number }) {
  const { toast } = useToast();
  const [qrList, setQrList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [description, setDescription] = useState("");
  const [defaultRole, setDefaultRole] = useState("student");
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [maxUses, setMaxUses] = useState(0);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);

  const fetchQRList = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/org-qr/${schoolId}`, { credentials: 'include' });
      if (res.ok) setQrList(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchQRList(); }, [schoolId]);

  const createQR = async () => {
    if (!schoolId) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/org-qr/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          organizationId: schoolId,
          description: description || "QR 가입 링크",
          defaultRole,
          expiresInDays,
          maxUses: maxUses > 0 ? maxUses : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const joinUrl = `${window.location.origin}/join?code=${data.code}`;
        navigator.clipboard.writeText(joinUrl);
        toast({ title: "📱 QR 초대 코드 생성!", description: `${joinUrl} — 클립보드에 복사됨` });
        setDescription("");
        fetchQRList();
      } else {
        toast({ title: "생성 실패", description: data.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "생성 오류", variant: "destructive" });
    }
    setCreating(false);
  };

  return (
    <>
    <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm">
      <CardHeader>
        <CardTitle className="font-black text-lg flex items-center gap-2">
          📱 QR 초대 코드 관리
        </CardTitle>
        <CardDescription>QR 코드를 생성하여 학생/학부모가 스캔만으로 가입할 수 있게 합니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 생성 폼 */}
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <h4 className="font-bold text-sm">새 QR 초대 코드 생성</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">설명</Label>
              <Input placeholder="예: 1학년 학생 가입용" value={description} onChange={e => setDescription(e.target.value)} className="rounded-xl text-sm" />
            </div>
            <div>
              <Label className="text-xs">기본 역할</Label>
              <Select value={defaultRole} onValueChange={setDefaultRole}>
                <SelectTrigger className="rounded-xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">학생</SelectItem>
                  <SelectItem value="parent">학부모</SelectItem>
                  <SelectItem value="teacher">교직원</SelectItem>
                  <SelectItem value="member">일반</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">유효 기간 (일)</Label>
              <Input type="number" value={expiresInDays} onChange={e => setExpiresInDays(parseInt(e.target.value) || 30)} className="rounded-xl text-sm" />
            </div>
            <div>
              <Label className="text-xs">최대 사용 횟수 (0=무제한)</Label>
              <Input type="number" value={maxUses} onChange={e => setMaxUses(parseInt(e.target.value) || 0)} className="rounded-xl text-sm" />
            </div>
          </div>
          <Button onClick={createQR} disabled={creating} className="w-full rounded-xl font-bold">
            {creating ? "생성 중..." : "📱 QR 초대 코드 생성"}
          </Button>
        </div>

        {/* 목록 */}
        {loading ? (
          <p className="text-center text-sm text-gray-400">불러오는 중...</p>
        ) : qrList.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-4">생성된 QR 초대 코드가 없습니다</p>
        ) : (
          <div className="space-y-2">
            <h4 className="font-bold text-sm">생성된 초대 코드</h4>
            {qrList.map((qr: any) => {
              const joinUrl = `${window.location.origin}/join?code=${qr.code}`;
              const expired = qr.expires_at && new Date(qr.expires_at) < new Date();
              const maxReached = qr.max_uses && qr.used_count >= qr.max_uses;
              return (
                <div key={qr.id} className={`p-3 rounded-xl border ${expired || maxReached ? 'bg-gray-50 opacity-60' : 'bg-white'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono font-bold text-sm text-indigo-600">{qr.code}</p>
                      <p className="text-xs text-gray-500">{qr.description || '설명 없음'}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        역할: {qr.default_role} · 사용: {qr.used_count}{qr.max_uses ? `/${qr.max_uses}` : '회'}
                        {expired && ' · ⚠️ 만료'}
                        {maxReached && ' · ⚠️ 사용 초과'}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="rounded-lg text-xs"
                        onClick={() => setQrPreviewUrl(joinUrl)}>
                        📱 QR
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-lg text-xs"
                        onClick={() => { navigator.clipboard.writeText(joinUrl); toast({ title: "링크 복사됨", description: joinUrl }); }}>
                        📋 복사
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
    {qrPreviewUrl && (
      <QRPreviewModal url={qrPreviewUrl} title="초대 QR 코드" onClose={() => setQrPreviewUrl(null)} />
    )}
    </>
  );
}

// ── 메뉴 활성화/비활성화 설정 컴포넌트 ──
// 모든 가능한 메뉴 항목 (AppSidebar allNavItems와 key 일치)
const ALL_MENUS: { key: string; label: string; desc: string }[] = [
  { key: "messenger",   label: "메신저",       desc: "실시간 메시지" },
  { key: "dashboard",   label: "대시보드",      desc: "업무 현황 요약" },
  { key: "approvals",   label: "결재 관리",     desc: "전자결재·승인" },
  { key: "documents",   label: "문서 신청",     desc: "각종 서류 신청" },
  { key: "calendar",    label: "일정 관리",     desc: "학사·업무 일정" },
  { key: "monthlyPlan", label: "월중 계획",     desc: "월별 업무 계획" },
  { key: "aiTools",     label: "AI 업무 지원",  desc: "AI 도구 모음" },
  { key: "news",        label: "소식",          desc: "공지·소식" },
  { key: "portfolio",   label: "피드백/포트폴리오", desc: "성과·포트폴리오" },
  { key: "coinWallet",  label: "두런코인",      desc: "코인 지갑" },
  { key: "aiAssist",    label: "AI 비서 (일반 조직)", desc: "일반 조직용 AI 비서" },
  { key: "orgNews",     label: "단체 소식 (일반 조직)", desc: "일반 조직 소식" },
];
// 하위 호환
const SCHOOL_MENUS = ALL_MENUS;
const ORG_MENUS = ALL_MENUS;

// ── 조직 프로필 설정 컴포넌트 ──
function OrgProfileSettings({ schoolId }: { schoolId?: number }) {
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [orgType, setOrgType] = useState("school");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    fetch(`/api/schools/${schoolId}/settings`)
      .then(r => r.json())
      .then(d => {
        setDisplayName(d.name || "");
        setLogoUrl(d.logoUrl || "");
        setOrgType(d.orgType || "school");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [schoolId]);

  const save = async () => {
    if (!schoolId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/schools/${schoolId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          settings: {
            displayName: displayName.trim() || undefined,
            logoUrl: logoUrl.trim() || undefined,
            orgType,
          },
        }),
      });
      if (res.ok) {
        toast({ title: "저장 완료", description: "조직 프로필이 업데이트되었습니다." });
        // 사이드바 갱신을 위해 settings 쿼리 무효화
        window.dispatchEvent(new CustomEvent("org-profile-updated"));
      } else {
        toast({ title: "저장 실패", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          🏫 조직 프로필 설정
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-5 space-y-4">
        {/* 아이콘 미리보기 */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center overflow-hidden border border-blue-200">
            {logoUrl ? (
              <img src={logoUrl} alt="조직 아이콘" className="w-full h-full object-cover" onError={() => setLogoUrl("")} />
            ) : (
              <span className="text-2xl font-bold text-blue-600">{(displayName || "조직").charAt(0)}</span>
            )}
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold text-slate-700">아이콘 미리보기</p>
            <p className="text-xs text-slate-400">아이콘 URL을 입력하면 사이드바에 표시됩니다</p>
          </div>
        </div>

        {/* 조직 이름 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">조직 표시 이름</label>
          <input
            className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"
            placeholder="사이드바에 표시될 조직 이름"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
          />
          <p className="text-xs text-slate-400">비우면 등록된 조직 이름이 표시됩니다</p>
        </div>

        {/* 아이콘 URL */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">아이콘 이미지 URL</label>
          <input
            className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"
            placeholder="https://example.com/logo.png"
            value={logoUrl}
            onChange={e => setLogoUrl(e.target.value)}
          />
        </div>

        {/* 조직 유형 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">조직 유형</label>
          <select
            className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 bg-white"
            value={orgType}
            onChange={e => setOrgType(e.target.value)}
          >
            <option value="school">🏫 학교</option>
            <option value="general">🏢 일반 단체/기관</option>
          </select>
          <p className="text-xs text-slate-400">조직 유형에 따라 메뉴 이름과 역할이 달라집니다</p>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {saving ? "저장 중..." : "💾 저장"}
        </button>
      </CardContent>
    </Card>
  );
}

function MenuVisibilitySettings({ schoolId, orgType }: { schoolId?: number; orgType?: string }) {
  const { toast } = useToast();
  const [disabledMenus, setDisabledMenus] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 조직 타입에 따라 다른 메뉴 목록 사용
  const isSchool = !orgType || orgType === 'school' || orgType === '학교';

  useEffect(() => {
    if (!schoolId) return;
    fetch(`/api/schools/${schoolId}/settings`)
      .then(r => r.json())
      .then(d => { setDisabledMenus(d.disabledMenus || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [schoolId]);

  const toggle = (key: string) => {
    setDisabledMenus(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const save = async () => {
    if (!schoolId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/schools/${schoolId}/menu-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabledMenus }),
      });
      if (res.ok) {
        toast({ title: "저장 완료", description: "메뉴 설정이 저장되었습니다." });
      } else {
        toast({ title: "저장 실패", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm">
      <CardHeader>
        <CardTitle className="font-black text-lg flex items-center gap-2">
          <Settings className="w-5 h-5" />
          메뉴 표시 설정
        </CardTitle>
        <CardDescription>좌측 메뉴에서 표시할 항목을 선택하세요. 체크 해제 시 해당 메뉴가 숨겨집니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {ALL_MENUS.map(menu => {
            const enabled = !disabledMenus.includes(menu.key);
            return (
              <div
                key={menu.key}
                onClick={() => toggle(menu.key)}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer border transition-all select-none ${
                  enabled
                    ? "bg-primary/5 border-primary/20 hover:bg-primary/10"
                    : "bg-slate-50 border-slate-200 opacity-50 hover:opacity-70"
                }`}
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  enabled ? "bg-primary border-primary" : "border-slate-300"
                }`}>
                  {enabled && <span className="text-white text-xs font-bold">✓</span>}
                </div>
                <div>
                  <p className="text-sm font-semibold">{menu.label}</p>
                  <p className="text-xs text-muted-foreground">{menu.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? "저장 중..." : "메뉴 설정 저장"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── 문서 신청 양식 관리 컴포넌트 ──
const ICON_OPTIONS = [
  "FileText", "Briefcase", "FileCheck", "GraduationCap", "FileBadge",
  "ClipboardList", "BookOpen", "Scroll", "BadgeCheck", "Building2",
];
const COLOR_OPTIONS = [
  { value: "bg-blue-500",   label: "파랑" },
  { value: "bg-orange-500", label: "주황" },
  { value: "bg-green-500",  label: "초록" },
  { value: "bg-purple-500", label: "보라" },
  { value: "bg-red-500",    label: "빨강" },
  { value: "bg-pink-500",   label: "핑크" },
  { value: "bg-yellow-500", label: "노랑" },
  { value: "bg-teal-500",   label: "청록" },
  { value: "bg-indigo-500", label: "남색" },
  { value: "bg-slate-500",  label: "회색" },
];

function DocumentTypeManager({ schoolId }: { schoolId?: number }) {
  const { toast } = useToast();
  const [docTypes, setDocTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newForm, setNewForm] = useState({ name: "", description: "", icon: "FileText", color: "bg-blue-500" });
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const load = () => {
    if (!schoolId) return;
    setLoading(true);
    fetch(`/api/admin/document-types?schoolId=${schoolId}`)
      .then(r => r.json())
      .then(d => { setDocTypes(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, [schoolId]);

  const initDefaults = async () => {
    if (!schoolId) return;
    const res = await fetch("/api/admin/document-types/init-defaults", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schoolId }),
    });
    const data = await res.json();
    toast({ title: data.message || "완료" });
    load();
  };

  const addDocType = async () => {
    if (!schoolId || !newForm.name) return;
    setAdding(true);
    try {
      const res = await fetch("/api/admin/document-types", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newForm, schoolId }),
      });
      if (res.ok) {
        toast({ title: "양식 추가 완료" });
        setNewForm({ name: "", description: "", icon: "FileText", color: "bg-blue-500" });
        load();
      } else {
        const err = await res.json();
        toast({ title: "추가 실패", description: err.message, variant: "destructive" });
      }
    } finally { setAdding(false); }
  };

  const toggleActive = async (id: number, current: boolean) => {
    await fetch(`/api/admin/document-types/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !current }),
    });
    load();
  };

  const saveEdit = async (id: number) => {
    await fetch(`/api/admin/document-types/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    toast({ title: "수정 완료" });
    setEditingId(null);
    load();
  };

  const deleteDocType = async (id: number) => {
    if (!confirm("이 양식을 삭제하시겠습니까?")) return;
    await fetch(`/api/admin/document-types/${id}`, { method: "DELETE" });
    toast({ title: "삭제 완료" });
    load();
  };

  return (
    <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="font-black text-lg flex items-center gap-2">
          <span>📄</span> 문서 신청 양식 관리
        </CardTitle>
        <CardDescription>구성원이 문서 신청 페이지에서 볼 수 있는 양식을 추가·수정·삭제합니다. 학교·기업·단체 모두 커스텀 가능.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 기본 양식 초기화 버튼 */}
        {docTypes.length === 0 && !loading && (
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
            <p className="text-sm text-slate-500 flex-1">등록된 양식이 없습니다. 학교 기본 양식(4종)으로 시작할 수 있습니다.</p>
            <Button size="sm" variant="outline" className="rounded-xl text-xs font-bold shrink-0" onClick={initDefaults}>
              기본 양식 등록
            </Button>
          </div>
        )}

        {/* 현재 양식 목록 */}
        {loading ? (
          <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
        ) : (
          <div className="space-y-2">
            {docTypes.map((doc: any) => (
              <div key={doc.id} className={`rounded-2xl border p-3 ${doc.is_active ? 'bg-white' : 'bg-slate-50 opacity-60'}`}>
                {editingId === doc.id ? (
                  <div className="space-y-2">
                    <input
                      className="w-full border rounded-xl px-3 py-2 text-sm font-bold"
                      value={editForm.name ?? doc.name}
                      onChange={e => setEditForm((p: any) => ({ ...p, name: e.target.value }))}
                      placeholder="양식명"
                    />
                    <input
                      className="w-full border rounded-xl px-3 py-2 text-sm"
                      value={editForm.description ?? doc.description}
                      onChange={e => setEditForm((p: any) => ({ ...p, description: e.target.value }))}
                      placeholder="설명"
                    />
                    <div className="flex gap-2">
                      <select
                        className="border rounded-xl px-2 py-1.5 text-xs flex-1"
                        value={editForm.icon ?? doc.icon}
                        onChange={e => setEditForm((p: any) => ({ ...p, icon: e.target.value }))}
                      >
                        {ICON_OPTIONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
                      </select>
                      <select
                        className="border rounded-xl px-2 py-1.5 text-xs flex-1"
                        value={editForm.color ?? doc.color}
                        onChange={e => setEditForm((p: any) => ({ ...p, color: e.target.value }))}
                      >
                        {COLOR_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="rounded-xl text-xs flex-1 font-bold" onClick={() => saveEdit(doc.id)}>저장</Button>
                      <Button size="sm" variant="outline" className="rounded-xl text-xs" onClick={() => setEditingId(null)}>취소</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className={`${doc.color || 'bg-blue-500'} w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                      {(doc.sort_order || 0) + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{doc.name}</p>
                      <p className="text-xs text-slate-400 truncate">{doc.description}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggleActive(doc.id, doc.is_active)}
                        className={`text-[10px] font-bold px-2 py-1 rounded-full border transition-all ${doc.is_active ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-100 border-slate-200 text-slate-500'}`}
                      >
                        {doc.is_active ? "활성" : "비활성"}
                      </button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={() => { setEditingId(doc.id); setEditForm({}); }}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-destructive hover:bg-destructive/10" onClick={() => deleteDocType(doc.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 새 양식 추가 */}
        <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 space-y-2">
          <p className="text-xs font-bold text-slate-500">+ 새 양식 추가</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              className="border rounded-xl px-3 py-2 text-sm font-bold bg-white"
              placeholder="양식명 (예: 연차 신청)"
              value={newForm.name}
              onChange={e => setNewForm(p => ({ ...p, name: e.target.value }))}
            />
            <input
              className="border rounded-xl px-3 py-2 text-sm bg-white"
              placeholder="설명 (예: 연차휴가 신청서)"
              value={newForm.description}
              onChange={e => setNewForm(p => ({ ...p, description: e.target.value }))}
            />
            <select
              className="border rounded-xl px-3 py-2 text-sm bg-white"
              value={newForm.icon}
              onChange={e => setNewForm(p => ({ ...p, icon: e.target.value }))}
            >
              {ICON_OPTIONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
            </select>
            <select
              className="border rounded-xl px-3 py-2 text-sm bg-white"
              value={newForm.color}
              onChange={e => setNewForm(p => ({ ...p, color: e.target.value }))}
            >
              {COLOR_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <Button
            className="w-full rounded-xl font-bold"
            disabled={!newForm.name || adding}
            onClick={addDocType}
          >
            {adding ? "추가 중..." : "양식 추가"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── 승인 대기자 섹션 ──
function PendingMembersSection({ schoolId }: { schoolId?: number }) {
  const { toast } = useToast();
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/organizations/${schoolId}/pending-members`, { credentials: "include" });
      const d = await res.json();
      setPending(d.members || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [schoolId]);

  const approve = async (userId: string) => {
    await fetch(`/api/admin/organizations/${schoolId}/approve-member/${userId}`, { method: "POST", credentials: "include" });
    toast({ title: "승인 완료", description: "구성원 명단에 추가되었습니다" });
    setPending(p => p.filter(m => m.id !== userId));
    // 구성원 목록 즉시 갱신
    queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    queryClient.invalidateQueries({ queryKey: ["/api/user"] });
  };

  const reject = async (userId: string) => {
    if (!confirm("거절하시겠습니까?")) return;
    await fetch(`/api/admin/organizations/${schoolId}/reject-member/${userId}`, { method: "DELETE", credentials: "include" });
    toast({ title: "거절 완료" });
    setPending(p => p.filter(m => m.id !== userId));
    queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
  };

  const ROLE_LABELS: Record<string, string> = { student: "학생", parent: "학부모", teacher: "교직원", admin: "관리자", member: "일반" };

  if (loading || pending.length === 0) return null;

  return (
    <Card className="rounded-3xl border-amber-200 bg-amber-50 overflow-hidden shadow-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
          ⏳ 가입 승인 대기 <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pending.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 space-y-2">
        {pending.map(m => (
          <div key={m.id} className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 shadow-sm">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-sm font-bold text-amber-700 flex-shrink-0">
              {(m.first_name || m.username || "?").charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{m.first_name || m.username}</p>
              <p className="text-xs text-slate-400">@{m.username} · {ROLE_LABELS[m.org_role || m.role] || m.org_role}</p>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <button onClick={() => approve(m.id)} className="px-3 py-1 text-xs font-bold bg-green-500 text-white rounded-lg hover:bg-green-600">승인</button>
              <button onClick={() => reject(m.id)} className="px-3 py-1 text-xs font-bold bg-red-100 text-red-600 rounded-lg hover:bg-red-200">거절</button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── QR 코드 미리보기/다운로드 모달 ──
function QRPreviewModal({ url, title, onClose }: { url: string; title?: string; onClose: () => void }) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: "#1e293b", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [url]);

  const download = () => {
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `qr-invite-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl p-6 max-w-xs w-full space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">📱 QR 코드</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        {title && <p className="text-sm text-gray-500 text-center">{title}</p>}
        {qrDataUrl ? (
          <div className="flex justify-center">
            <img src={qrDataUrl} alt="QR Code" className="w-56 h-56 rounded-xl border border-gray-100" />
          </div>
        ) : (
          <div className="h-56 flex items-center justify-center text-gray-300 text-4xl">⏳</div>
        )}
        <p className="text-xs text-gray-400 text-center break-all">{url}</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => navigator.clipboard.writeText(url)}
            className="py-2 text-sm font-bold border border-gray-200 rounded-xl hover:bg-gray-50">
            📋 링크 복사
          </button>
          <button onClick={download} disabled={!qrDataUrl}
            className="py-2 text-sm font-bold bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-50">
            ⬇️ 다운로드
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 초대 코드 관리 ──
function InviteCodeManager({ schoolId }: { schoolId?: number }) {
  const { toast } = useToast();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [requireApproval, setRequireApproval] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    // 현재 초대 코드 + 승인 설정 조회
    Promise.all([
      fetch(`/api/schools/${schoolId}/settings`).then(r => r.json()),
      fetch(`/api/organizations/invite-code?orgId=${schoolId}`, { credentials: "include" }).then(r => r.json()).catch(() => ({})),
    ]).then(([settings, codeData]) => {
      setRequireApproval(settings.requireApproval || false);
      setInviteCode(codeData.inviteCode || null);
    }).finally(() => setLoading(false));
  }, [schoolId]);

  const generateCode = async () => {
    if (!schoolId) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/admin/schools/${schoolId}/invite-code`, { method: "POST", credentials: "include" });
      const d = await res.json();
      setInviteCode(d.inviteCode);
      toast({ title: "새 초대 코드 생성됨" });
    } finally { setGenerating(false); }
  };

  const saveApprovalSetting = async () => {
    if (!schoolId) return;
    setSaving(true);
    try {
      const settingsRes = await fetch(`/api/schools/${schoolId}/settings`).then(r => r.json());
      await fetch(`/api/admin/schools/${schoolId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ settings: { ...settingsRes, requireApproval } }),
      });
      toast({ title: "저장 완료", description: requireApproval ? "가입 시 관리자 승인이 필요합니다" : "가입 즉시 승인됩니다" });
    } finally { setSaving(false); }
  };

  const copyCode = () => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const shareUrl = inviteCode ? `${window.location.origin}/join?code=${inviteCode}` : "";

  if (loading) return <div className="py-8 text-center"><Loader2 className="animate-spin h-6 w-6 mx-auto text-primary" /></div>;

  return (
    <>
    <div className="space-y-4">
      {/* 초대 코드 카드 */}
      <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 pb-3">
          <CardTitle className="text-base flex items-center gap-2">🔗 초대 코드</CardTitle>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          {inviteCode ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3 border border-slate-200">
                <span className="text-2xl font-black tracking-[0.3em] text-primary flex-1">{inviteCode}</span>
                <div className="flex gap-2">
                  <button onClick={() => setShowQR(true)}
                    className="text-xs font-bold px-3 py-1.5 bg-white border rounded-lg hover:bg-slate-50 transition">
                    📱 QR
                  </button>
                  <button onClick={copyCode} className="text-xs font-bold px-3 py-1.5 bg-white border rounded-lg hover:bg-slate-50 transition">
                    {copied ? "✅ 복사됨" : "📋 복사"}
                  </button>
                </div>
              </div>
              <div className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2 break-all">
                🔗 {shareUrl}
              </div>
              <button onClick={() => navigator.clipboard.writeText(shareUrl).then(() => toast({ title: "링크 복사됨" }))}
                className="w-full py-2 text-sm font-bold text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-50">
                📤 초대 링크 복사
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-4">생성된 초대 코드가 없습니다</p>
          )}
          <button
            onClick={generateCode}
            disabled={generating}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {generating ? "생성 중..." : inviteCode ? "🔄 새 코드 생성" : "✨ 초대 코드 생성"}
          </button>
          {inviteCode && <p className="text-xs text-slate-400 text-center">새 코드 생성 시 기존 코드는 무효화됩니다</p>}
        </CardContent>
      </Card>

      {/* 승인 설정 카드 */}
      <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 pb-3">
          <CardTitle className="text-base flex items-center gap-2">✅ 가입 승인 설정</CardTitle>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-start gap-4 p-4 rounded-2xl border border-slate-200 bg-slate-50">
            <div className="flex-1">
              <p className="font-bold text-sm">관리자 승인 필요</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {requireApproval
                  ? "초대 코드로 가입 시 관리자 승인 후 구성원으로 등록됩니다"
                  : "초대 코드로 가입하면 즉시 구성원으로 등록됩니다"}
              </p>
            </div>
            <button
              onClick={() => setRequireApproval(v => !v)}
              className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${requireApproval ? "bg-blue-500" : "bg-slate-300"}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${requireApproval ? "translate-x-6" : "translate-x-0.5"}`} />
            </button>
          </div>
          {requireApproval && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
              💡 승인이 활성화되면 <strong>구성원 명단</strong> 탭 상단에 승인 대기자가 표시됩니다
            </div>
          )}
          <button
            onClick={saveApprovalSetting}
            disabled={saving}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "저장 중..." : "💾 저장"}
          </button>
        </CardContent>
      </Card>
    </div>
    {showQR && inviteCode && (
      <QRPreviewModal
        url={`${window.location.origin}/join?code=${inviteCode}`}
        title={`초대 코드: ${inviteCode}`}
        onClose={() => setShowQR(false)}
      />
    )}
    </>
  );
}
