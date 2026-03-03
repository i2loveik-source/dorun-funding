import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { 
  LayoutDashboard, 
  FileCheck, 
  CalendarDays, 
  Sparkles, 
  MessageSquare, 
  BookOpen, 
  LogOut,
  School,
  Shield,
  FileText,
  BookMarked,
  Table2,
  Settings,
  Coins,
  Newspaper,
  BrainCircuit,
  TrendingUp,
  ArrowLeftRight,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const studentParentRoles = ["student", "parent"];
type MenuKey = "messenger" | "dashboard" | "approvals" | "documents" | "calendar" | "monthlyPlan" | "aiTools" | "news" | "portfolio" | "coinWallet" | "coinExchange" | "coinLaunch" | "coinTransparency" | "aiAssist" | "orgNews" | "funding";

export function AppSidebar() {
  const [location] = useLocation();
  const { t } = useTranslation();
  const { logout, user, activeOrg, activeOrgId, setActiveOrg, allOrgs } = useAuth();
  const queryClient = useQueryClient();

  const isAdmin = user?.role === "admin";
  const isSuperAdmin = user?.role === "super_admin";
  const isStudentOrParent = studentParentRoles.includes(user?.role || "");

  // 현재 활성 조직 설정 (schoolSettings)
  const { data: schoolSettings } = useQuery({
    queryKey: ["/api/school/settings", activeOrgId],
    queryFn: async () => {
      const orgId = activeOrgId || user?.schoolId;
      if (!orgId) return null;
      const res = await fetch(`/api/schools/${orgId}/settings`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!(activeOrgId || user?.schoolId),
    // 조직 프로필 업데이트 이벤트 수신 시 재조회
    refetchOnWindowFocus: true,
  });

  // 조직 프로필 업데이트 이벤트 감지 → 쿼리 무효화
  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/school/settings"] });
    };
    window.addEventListener("org-profile-updated", handler);
    return () => window.removeEventListener("org-profile-updated", handler);
  }, [queryClient]);

  const disabledMenus: MenuKey[] = schoolSettings?.disabledMenus || [];
  const isMenuEnabled = (key: MenuKey) => !disabledMenus.includes(key);

  // 조직 타입 (activeOrg 기준)
  const orgType = activeOrg?.orgType || 'school';
  const isSchoolType = !orgType || orgType === 'school' || orgType === '학교';

  // 활성 조직 이름 (settings.name > settings.displayName > activeOrg.orgName 우선순위)
  const orgName = schoolSettings?.name || activeOrg?.orgName || "두런 허브";
  const orgInitial = orgName.charAt(0);

  const menuLabels: Record<string, Record<string, string>> = {
    school:  { calendar: t('nav.calendar'), monthlyPlan: t('nav.monthlyPlan'), approvals: t('nav.approvals'), documents: t('nav.documents'), news: t('nav.news'), ai: t('nav.aiTools'), portfolio: t('nav.portfolio') },
    학교:    { calendar: t('nav.calendar'), monthlyPlan: t('nav.monthlyPlan'), approvals: t('nav.approvals'), documents: t('nav.documents'), news: t('nav.news'), ai: t('nav.aiTools'), portfolio: t('nav.portfolio') },
    general: { calendar: "일정 관리",  monthlyPlan: "월중 계획", approvals: "결재 관리", documents: "문서 관리", news: "소식", ai: "AI 업무 지원", portfolio: "성과 관리" },
    일반:    { calendar: "일정 관리",  monthlyPlan: "월중 계획", approvals: "결재 관리", documents: "문서 관리", news: "소식", ai: "AI 업무 지원", portfolio: "성과 관리" },
  };
  const ml = menuLabels[orgType] || menuLabels.school;

  type NavItem = { key: MenuKey; href: string; label: string; icon: React.ElementType };

  const schoolMenuItems: NavItem[] = [
    { key: "messenger",   href: "/",             label: t('nav.messenger'), icon: MessageSquare },
    { key: "dashboard",   href: "/dashboard",    label: t('nav.dashboard'), icon: LayoutDashboard },
    { key: "approvals",   href: "/approvals",    label: ml.approvals,       icon: FileCheck },
    { key: "documents",   href: "/documents",    label: ml.documents,       icon: FileText },
    { key: "calendar",    href: "/calendar",     label: ml.calendar,        icon: CalendarDays },
    { key: "monthlyPlan", href: "/monthly-plan", label: ml.monthlyPlan,     icon: Table2 },
    { key: "aiTools",     href: "/ai-tools",     label: ml.ai,              icon: Sparkles },
    { key: "news",        href: "/school-life",  label: ml.news,            icon: BookOpen },
    { key: "portfolio",   href: "/portfolio",    label: ml.portfolio,       icon: BookMarked },
    { key: "coinWallet",  href: "/coin-wallet",      label: "두런코인",           icon: Coins },
    { key: "coinExchange",href: "/coin/exchange",    label: "코인 환전",           icon: ArrowLeftRight },
    { key: "coinLaunch",  href: "/coin/launch",      label: "지역코인 발행",       icon: Rocket },
    { key: "coinTransparency", href: "/coin/transparency", label: "투명성 리포트", icon: ShieldCheck },
    { key: "funding",     href: "/funding",          label: "지역 펀딩",           icon: TrendingUp },
    { key: "aiAssist",    href: "/ai-assist",    label: "AI 업무 지원",       icon: Sparkles },
    { key: "orgNews",     href: "/org-news",     label: "소식",              icon: Newspaper },
  ];

  const studentParentMenuItems: NavItem[] = [
    { key: "messenger",  href: "/",            label: t('nav.messenger'), icon: MessageSquare },
    { key: "calendar",   href: "/calendar",    label: ml.calendar,        icon: CalendarDays },
    { key: "documents",  href: "/documents",   label: ml.documents,       icon: FileText },
    { key: "news",       href: "/school-life", label: ml.news,            icon: BookOpen },
    { key: "portfolio",  href: "/portfolio",   label: ml.portfolio,       icon: BookMarked },
    { key: "coinWallet",  href: "/coin-wallet",      label: "두런코인",   icon: Coins },
    { key: "coinExchange",href: "/coin/exchange",    label: "코인 환전",   icon: ArrowLeftRight },
    { key: "coinTransparency", href: "/coin/transparency", label: "투명성", icon: ShieldCheck },
    { key: "funding",    href: "/funding",           label: "지역 펀딩",  icon: TrendingUp },
  ];

  let allNavItems: NavItem[];
  if (isStudentOrParent) {
    allNavItems = studentParentMenuItems;
  } else {
    // 전체 메뉴 목록 — disabledMenus 필터로 제어
    allNavItems = schoolMenuItems;
  }

  const navItems = isSuperAdmin
    ? allNavItems
    : allNavItems.filter(item => isMenuEnabled(item.key));

  const getRoleLabel = (role: string) => {
    const map: Record<string, string> = { teacher: "교직원", student: "학생", parent: "학부모", member: "일반", admin: "관리자", super_admin: "최고관리자" };
    return map[role] || role;
  };

  const getRoleBadgeVariant = (role: string): "destructive" | "default" | "secondary" | "outline" => {
    if (role === "super_admin" || role === "admin") return "destructive";
    if (role === "teacher") return "default";
    return "outline";
  };

  // 조직 역할 레이블 (activeOrg 기준 — 조직마다 역할 다를 수 있음)
  const activeOrgRole = activeOrg?.role || user?.role || "";

  return (
    <Sidebar>
      {/* ── 헤더: 조직 프로필 + 이름 + 조직 전환 ── */}
      <SidebarHeader className="border-b border-sidebar-border p-3">
        <div className="flex items-center gap-3 w-full p-2">
          {/* 조직 아이콘 / 프로필 이미지 */}
          <div className="bg-primary p-1.5 rounded-lg flex-shrink-0 flex items-center justify-center w-9 h-9">
            {schoolSettings?.logoUrl
              ? <img src={schoolSettings.logoUrl} alt={orgName} className="w-6 h-6 rounded object-cover" onError={() => {}} />
              : <span className="text-white font-bold text-base leading-none">{orgInitial}</span>
            }
          </div>
          {/* 조직 이름 */}
          <span className="font-display font-bold text-sm leading-tight flex-1 truncate">{orgName}</span>
        </div>

      </SidebarHeader>

      {/* ── 메뉴 ── */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>메뉴</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      data-testid={`nav-${item.href.replace("/", "") || "home"}`}
                    >
                      <Link href={item.href}>
                        <Icon className="w-5 h-5" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── 푸터: 사용자 프로필 ── */}
      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
            <AvatarFallback>{(user?.firstName)?.charAt(0) || "U"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold truncate">{user?.firstName || '사용자'}</span>
              {activeOrgRole && (
                <Badge variant={getRoleBadgeVariant(activeOrgRole)} className="text-[10px] px-1.5 py-0">
                  {getRoleLabel(activeOrgRole)}
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground truncate block">{user?.username}</span>
          </div>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={location === "/settings"} data-testid="nav-settings">
              <Link href="/settings">
                <Settings className="w-4 h-4" />
                <span>개인 설정</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {(isAdmin || isSuperAdmin) && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={location === "/admin"} data-testid="nav-admin">
                <Link href="/admin">
                  <Shield className="w-4 h-4" />
                  <span>관리자 설정</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => logout()}
              className="text-destructive hover:text-destructive"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
              <span>로그아웃</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
