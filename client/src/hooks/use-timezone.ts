import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./use-auth";

export function useSchoolTimezone(): string {
  const { user } = useAuth();
  
  const { data: schools } = useQuery<any[]>({
    queryKey: ["/api/schools"],
    queryFn: async () => {
      const res = await fetch("/api/schools", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  if (!user?.schoolId || !schools) return "Asia/Seoul";
  const school = schools.find((s: any) => s.id === user.schoolId);
  return school?.settings?.timezone || "Asia/Seoul";
}

/** 주어진 UTC Date를 timezone 기준 YYYY-MM-DD 문자열로 변환 */
export function toLocalDateStr(date: Date | string, timezone: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-CA', { timeZone: timezone }); // en-CA → YYYY-MM-DD
}

/** 주어진 UTC Date를 timezone 기준 Date 객체로 변환 (날짜 부분만) */
export function toLocalDate(date: Date | string, timezone: string): Date {
  const str = toLocalDateStr(date, timezone);
  return new Date(str + 'T00:00:00');
}
