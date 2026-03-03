import { ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, Link } from "wouter";
import { SidebarProvider, SidebarTrigger, SidebarInset, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  CheckCircle, 
  Search, 
  Settings, 
  LogOut,
  Shield,
  Plus,
  Bell,
  SearchIcon,
  X,
  Menu,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, 
  DropdownMenuSeparator, DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Approval } from "@shared/schema";

interface LayoutProps {
  children: ReactNode;
}

function SuperAdminHeader() {
  const [location, setLocation] = useLocation();
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-slate-200 z-[100] bg-white/95 backdrop-blur-md sticky top-0">
      <div className="flex items-center gap-3">
        <Shield className="w-5 h-5 text-primary" />
        <h1 className="text-base font-black text-slate-900 tracking-tight">관리자 센터</h1>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="flex items-center gap-2 p-1 pl-1.5 pr-3 hover:bg-slate-50 rounded-full cursor-pointer transition-all border border-black/5 bg-white shadow-sm active:scale-95">
              <Avatar className="h-8 w-8 border border-white shadow-xs">
                <AvatarImage src={user?.profileImageUrl || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary font-black text-[10px]">
                  {user?.firstName?.charAt(0) || "S"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start -space-y-0.5 min-w-0 max-w-[80px]">
                <span className="text-[11px] font-black text-slate-900 truncate w-full">{user?.firstName || "최고관리자"}</span>
                <span className="text-[9px] font-bold text-amber-600 uppercase tracking-tighter">SUPER ADMIN</span>
              </div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 font-bold rounded-2xl p-2 shadow-2xl border-black/5">
            <div className="px-2 py-3 mb-1 bg-amber-50 rounded-xl border border-amber-200">
              <p className="text-[10px] text-amber-600 uppercase tracking-widest mb-0.5">최고관리자</p>
              <p className="text-sm text-slate-900 truncate font-black">{user?.firstName}</p>
              <p className="text-[10px] text-slate-500 font-mono">@{user?.username}</p>
            </div>
            <DropdownMenuSeparator className="my-1.5" />
            <DropdownMenuItem onClick={() => logout()} className="text-destructive rounded-lg py-2 cursor-pointer">
              <LogOut className="w-4 h-4 mr-2" /> {t('common.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function GlobalHeader() {
  const [location, setLocation] = useLocation();
  const { t } = useTranslation();
  const { user, logout, activeOrg, activeOrgId, setActiveOrg, allOrgs } = useAuth();
  const [search, setSearch] = useState("");

  // 조직 설정 (이름, 로고) 조회
  const { data: orgSettings } = useQuery({
    queryKey: ["/api/school/settings", activeOrgId],
    queryFn: async () => {
      const id = activeOrgId || user?.schoolId;
      if (!id) return null;
      const res = await fetch(`/api/schools/${id}/settings`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!(activeOrgId || user?.schoolId),
  });
  
  const { data: approvals = [] } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
    enabled: !!user,
  });

  const pendingCount = approvals.filter(a => a.status === "pending").length;
  const isChatPage = location === "/" || location.startsWith("/chat");

  // 조직명 (settings 우선 → activeOrg.orgName fallback)
  const orgName = orgSettings?.name || activeOrg?.orgName || "";

  const menuName = (() => {
    if (isChatPage) return t('nav.messenger');
    if (location.startsWith("/calendar")) return t('nav.calendar');
    if (location.startsWith("/monthly-plan")) return t('nav.monthlyPlan');
    if (location.startsWith("/approvals")) return t('nav.approvals');
    if (location.startsWith("/school-life")) return t('nav.news');
    if (location.startsWith("/portfolio")) return t('nav.portfolio');
    if (location.startsWith("/ai-tools")) return t('nav.aiTools');
    if (location.startsWith("/settings")) return t('nav.personalSettings');
    if (location.startsWith("/admin")) return t('nav.admin');
    if (location.startsWith("/document")) return t('nav.documents');
    if (location.startsWith("/coin-wallet")) return "두런코인";
    if (location.startsWith("/ai-assist")) return "AI 업무 지원";
    if (location.startsWith("/org-news")) return "소식";
    return "Smart Hub";
  })();

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-3 border-b border-slate-200 dark:border-slate-800 z-[100] bg-white/95 backdrop-blur-md sticky top-0">
      <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
        <SidebarTrigger className="h-9 w-9 rounded-lg hover:bg-slate-100 shrink-0" />
        
        <div className="flex items-center gap-1.5 overflow-hidden">
          {/* 조직명 > 메뉴명 breadcrumb 형태 */}
          {orgName && (
            <>
              <span className="text-xs md:text-sm text-slate-400 font-medium truncate max-w-[100px] md:max-w-[160px]">{orgName}</span>
              <span className="text-slate-300 text-xs flex-shrink-0">›</span>
            </>
          )}
          <h1 className="text-sm md:text-base font-black text-slate-900 tracking-tighter truncate">
            {menuName}
          </h1>
          {isChatPage && (
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent('open-new-room-modal'))}
              className="p-1.5 bg-[#2DB400] text-white rounded-full shadow-sm hover:bg-[#28A000] active:scale-90 transition-all shrink-0"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
        {/* Global Search */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-slate-500"><Search className="w-5 h-5" /></Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2 rounded-2xl shadow-2xl" align="end">
             <div className="relative">
               <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
               <Input 
                 placeholder="검색어를 입력하세요..." 
                 value={search}
                 onChange={(e) => setSearch(e.target.value)}
                 className="pl-9 h-10 bg-slate-50 border-none rounded-xl text-xs font-bold focus-visible:ring-1 focus-visible:ring-primary/20"
               />
             </div>
          </PopoverContent>
        </Popover>

        {/* Approvals */}
        <Link href="/approvals">
          <button className="relative p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-all group">
            <CheckCircle className="h-5.5 w-5.5 group-hover:text-primary transition-colors" />
            {pendingCount > 0 && (
              <span className="absolute top-1 right-1 bg-[#FF4B4B] text-white text-[9px] font-black h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center border border-white shadow-sm">
                {pendingCount}
              </span>
            )}
          </button>
        </Link>

        {/* Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="flex items-center gap-2 p-1 pl-1.5 pr-2 md:pr-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full cursor-pointer transition-all border border-black/5 bg-white shadow-sm active:scale-95">
              <Avatar className="h-8 w-8 border border-white shadow-xs">
                <AvatarImage src={user?.profileImageUrl || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary font-black text-[10px]">
                  {(user?.firstName)?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="hidden xs:flex flex-col items-start -space-y-0.5 min-w-0 max-w-[80px]">
                <span className="text-[11px] font-black text-slate-900 truncate w-full">{user?.firstName || "지구파"}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter truncate w-full">{user?.role || "Admin"}</span>
              </div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 font-bold rounded-2xl p-2 shadow-2xl border-black/5">
             <div className="px-2 py-3 mb-1 bg-slate-50 rounded-xl border border-black/5">
               <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-0.5 opacity-70">로그인 정보</p>
               <p className="text-sm text-slate-900 truncate font-black">{user?.firstName} {user?.lastName ? user.lastName : ''}</p>
             </div>
             <DropdownMenuItem onClick={() => setLocation("/settings")} className="rounded-lg py-2 cursor-pointer">
               <Settings className="w-4 h-4 mr-2 text-slate-500" /> 개인 설정
             </DropdownMenuItem>
             {(user?.role === "admin" || user?.role === "super_admin") && (
               <DropdownMenuItem onClick={() => setLocation("/admin")} className="rounded-lg py-2 text-primary hover:text-primary cursor-pointer">
                 <Shield className="w-4 h-4 mr-2" /> 관리자 도구
               </DropdownMenuItem>
             )}
             <DropdownMenuSeparator className="my-1.5" />
             <DropdownMenuItem onClick={() => logout()} className="text-destructive rounded-lg py-2 cursor-pointer">
               <LogOut className="w-4 h-4 mr-2" /> {t('common.logout')}
             </DropdownMenuItem>
             {/* 조직 전환 — 항상 맨 아래 */}
             {allOrgs.length > 1 && (
               <>
                 <DropdownMenuSeparator className="my-1.5" />
                 <p className="px-2 py-1 text-[10px] text-slate-400 font-bold uppercase tracking-widest">조직 전환</p>
                 {allOrgs.map((org: any) => (
                   <DropdownMenuItem
                     key={org.organizationId}
                     className={`rounded-lg py-2 cursor-pointer text-xs ${org.organizationId === activeOrgId ? "bg-primary/10 text-primary" : ""}`}
                     onClick={() => {
                       if (org.organizationId === activeOrgId) return;
                       setActiveOrg(org.organizationId);
                       setTimeout(() => window.location.reload(), 100);
                     }}
                   >
                     <span className="mr-2">{{"school":"🏫","학교":"🏫","general":"🏢","일반":"🏢"}[org.orgType as string] || "🏫"}</span>
                     <span className="font-bold">{org.orgName}</span>
                     {org.organizationId === activeOrgId && <span className="ml-auto text-[10px]">✓</span>}
                   </DropdownMenuItem>
                 ))}
               </>
             )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function LayoutContent({ children }: { children: ReactNode }) {
  const { setOpenMobile } = useSidebar();
  const [location] = useLocation();

  useEffect(() => {
    setOpenMobile(false);
  }, [location, setOpenMobile]);

  return (
    <SidebarInset className="flex-1 flex flex-col min-w-0 relative h-screen overflow-hidden bg-white dark:bg-slate-950">
      <GlobalHeader />
      <main className="flex-1 overflow-hidden relative h-full">
        {children}
      </main>
    </SidebarInset>
  );
}

export function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const isAuthPage = location === "/login" || location === "/signup" || location === "/join";
  const isSuperAdmin = user?.role === "super_admin";

  // 로딩 중
  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isAuthPage) {
    return <main className="min-h-screen bg-background w-full">{children}</main>;
  }

  // 최고관리자: 사이드바 없이 관리자 센터
  // 로그인 시 이미 /admin으로 이동하므로 여기서 추가 리다이렉트 불필요
  if (isSuperAdmin) {
    return (
      <div className="flex min-h-screen w-full bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans">
        <div className="flex-1 flex flex-col min-w-0 relative h-screen overflow-hidden bg-white dark:bg-slate-950">
          <SuperAdminHeader />
          <main className="flex-1 overflow-auto relative h-full">
            {children}
          </main>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans">
        <AppSidebar />
        <LayoutContent>{children}</LayoutContent>
      </div>
    </SidebarProvider>
  );
}
