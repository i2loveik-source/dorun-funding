import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import type { User } from "@shared/models/auth";

async function fetchUser(): Promise<User | null> {
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function logout(): Promise<void> {
  localStorage.removeItem("coin_token");
  localStorage.removeItem("coin_refresh");
  localStorage.removeItem("activeOrgId");
  try {
    await fetch("/api/logout", { credentials: "include" });
  } catch {}
  window.location.href = "/login";
}

// 활성 조직 ID 저장 키
const ACTIVE_ORG_KEY = "activeOrgId";

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  // 활성 조직 ID (localStorage 기반)
  const [activeOrgId, setActiveOrgIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem(ACTIVE_ORG_KEY);
    return stored ? parseInt(stored) : null;
  });

  // user 로드 완료 후 activeOrgId 초기화
  useEffect(() => {
    if (!user) return;
    const orgs: any[] = (user as any).organizations || [];
    const stored = localStorage.getItem(ACTIVE_ORG_KEY);
    const storedId = stored ? parseInt(stored) : null;

    // 저장된 조직이 실제로 내 조직 목록에 있으면 유지, 없으면 schoolId 또는 첫 번째로
    if (storedId && orgs.find((o: any) => o.organizationId === storedId)) {
      setActiveOrgIdState(storedId);
    } else {
      const defaultId = user.schoolId || orgs[0]?.organizationId || null;
      if (defaultId) {
        localStorage.setItem(ACTIVE_ORG_KEY, String(defaultId));
        setActiveOrgIdState(defaultId);
      }
    }
  }, [user?.id]);

  const setActiveOrg = useCallback((orgId: number) => {
    localStorage.setItem(ACTIVE_ORG_KEY, String(orgId));
    setActiveOrgIdState(orgId);
    // 해당 조직 관련 쿼리 무효화 (화면 갱신)
    queryClient.invalidateQueries({ queryKey: ["/api/school/settings"] });
    queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
    queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
  }, [queryClient]);

  // 현재 활성 조직 정보
  const orgs: any[] = (user as any)?.organizations || [];
  const activeOrg = orgs.find((o: any) => o.organizationId === activeOrgId)
    || (user?.schoolId ? orgs.find((o: any) => o.organizationId === user.schoolId) : null)
    || orgs[0]
    || null;

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
    // 조직 관련
    activeOrg,
    activeOrgId: activeOrg?.organizationId ?? null,
    setActiveOrg,
    allOrgs: orgs,
  };
}
