import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CalendarEvent, MonthlyPlanCell } from "@shared/schema";
import { useSchoolTimezone, toLocalDateStr } from "@/hooks/use-timezone";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

interface MonthlyPlanData {
  cells: MonthlyPlanCell[];
  events: CalendarEvent[];
}

interface DayInfo {
  date: Date;
  day: number;
  weekday: string;
  weekNumber: number;
  isFirstOfWeek: boolean;
  daysInWeek: number;
}

function getDaysInMonth(year: number, month: number): DayInfo[] {
  const days: DayInfo[] = [];
  const daysCount = new Date(year, month, 0).getDate();
  
  let currentWeekNumber = 0;
  let weekDays: DayInfo[] = [];
  
  for (let d = 1; d <= daysCount; d++) {
    const date = new Date(year, month - 1, d);
    const dayOfWeek = date.getDay();
    
    if (dayOfWeek === 0 && d > 1) {
      currentWeekNumber++;
    }
    
    const dayInfo: DayInfo = {
      date,
      day: d,
      weekday: WEEKDAYS[dayOfWeek],
      weekNumber: currentWeekNumber,
      isFirstOfWeek: dayOfWeek === 0 || d === 1,
      daysInWeek: 0
    };
    
    days.push(dayInfo);
  }
  
  // Calculate days in each week for rowspan
  const weekCounts: Record<number, number> = {};
  days.forEach(day => {
    weekCounts[day.weekNumber] = (weekCounts[day.weekNumber] || 0) + 1;
  });
  
  days.forEach(day => {
    day.daysInWeek = weekCounts[day.weekNumber];
  });
  
  return days;
}

function getWeekStartDate(year: number, month: number, weekNumber: number, days: DayInfo[]): string {
  const weekDays = days.filter(d => d.weekNumber === weekNumber);
  if (weekDays.length === 0) return "";
  const firstDay = weekDays[0].day;
  return `${year}-${String(month).padStart(2, '0')}-${String(firstDay).padStart(2, '0')}`;
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function MonthlyPlan() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  
  const schoolStaffRoles = ["teacher", "admin"];
  const canEdit = user?.role && schoolStaffRoles.includes(user.role);
  const timezone = useSchoolTimezone();

  const { data, isLoading } = useQuery<MonthlyPlanData>({
    queryKey: ["/api/monthly-plan", currentYear, currentMonth],
    queryFn: () => fetch(`/api/monthly-plan?year=${currentYear}&month=${currentMonth}`, { credentials: "include" })
      .then(res => res.json()),
  });

  const updateCellMutation = useMutation({
    mutationFn: async (cellData: { date: string; columnType: string; content: string }) => {
      return apiRequest("POST", "/api/monthly-plan/cell", cellData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-plan", currentYear, currentMonth] });
    },
    onError: () => {
      toast({ title: "저장 실패", description: "셀 저장 중 오류가 발생했습니다", variant: "destructive" });
    }
  });

  const days = useMemo(() => getDaysInMonth(currentYear, currentMonth), [currentYear, currentMonth]);

  const getCellContent = (dateStr: string, columnType: string): string => {
    const cell = data?.cells?.find(c => c.date === dateStr && c.columnType === columnType);
    return cell?.content || "";
  };
  
  const getWeeklyCellContent = (weekNumber: number, columnType: string): string => {
    const weekStartDate = getWeekStartDate(currentYear, currentMonth, weekNumber, days);
    return getCellContent(weekStartDate, columnType);
  };

  const getEventsForDay = (dateStr: string, type: "academic" | "duty"): string[] => {
    if (!data?.events) return [];
    return data.events
      .filter(e => {
        // 종일 이벤트는 UTC 자정으로 저장됨
        const eventDate = new Date(e.startTime).toISOString().split('T')[0];
        return eventDate === dateStr && e.type === type;
      })
      .map(e => e.title);
  };

  const handleCellChange = useCallback((date: string, columnType: string, content: string) => {
    updateCellMutation.mutate({ date, columnType, content });
  }, [updateCellMutation]);
  
  const handleWeeklyCellChange = useCallback((weekNumber: number, columnType: string, content: string) => {
    const weekStartDate = getWeekStartDate(currentYear, currentMonth, weekNumber, days);
    updateCellMutation.mutate({ date: weekStartDate, columnType, content });
  }, [updateCellMutation, currentYear, currentMonth, days]);

  const prevMonth = () => {
    if (currentMonth === 1) {
      setCurrentYear(y => y - 1);
      setCurrentMonth(12);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 12) {
      setCurrentYear(y => y + 1);
      setCurrentMonth(1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  return (
    <div className="p-4 h-full overflow-auto" data-testid="monthly-plan-page">
      <Card className="h-full flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            월중계획
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prevMonth} data-testid="button-prev-month">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-lg font-semibold min-w-[120px] text-center" data-testid="text-current-month">
              {currentYear}년 {currentMonth}월
            </span>
            <Button variant="outline" size="icon" onClick={nextMonth} data-testid="button-next-month">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <span className="text-muted-foreground">로딩 중...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[1000px]">
                <thead className="sticky top-0 bg-muted z-10">
                  <tr className="border-b">
                    <th className="border px-2 py-2 text-center text-xs font-medium w-10">월</th>
                    <th className="border px-2 py-2 text-center text-xs font-medium w-10">일</th>
                    <th className="border px-2 py-2 text-center text-xs font-medium w-10">요일</th>
                    <th className="border px-2 py-2 text-left text-xs font-medium min-w-[150px]">학사일정 요약</th>
                    <th className="border px-2 py-2 text-left text-xs font-medium min-w-[150px]">업무일정 요약</th>
                    <th className="border px-2 py-2 text-left text-xs font-medium min-w-[120px] bg-green-50 dark:bg-green-950">출장</th>
                    <th className="border px-2 py-2 text-left text-xs font-medium min-w-[150px] bg-blue-50 dark:bg-blue-950">회의 (주간)</th>
                    <th className="border px-2 py-2 text-left text-xs font-medium min-w-[150px] bg-yellow-50 dark:bg-yellow-950">안내 (주간)</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((day) => {
                    const dateStr = formatDate(currentYear, currentMonth, day.day);
                    const isWeekend = day.weekday === "토" || day.weekday === "일";
                    const isToday = new Date().toDateString() === day.date.toDateString();
                    const academicEvents = getEventsForDay(dateStr, "academic");
                    const dutyEvents = getEventsForDay(dateStr, "duty");
                    
                    return (
                      <tr 
                        key={dateStr}
                        className={`border-b ${isToday ? "bg-yellow-50 dark:bg-yellow-950/30" : ""}`}
                        data-testid={`row-day-${day.day}`}
                      >
                        <td className="border px-2 py-1 text-center text-sm">{currentMonth}</td>
                        <td className={`border px-2 py-1 text-center text-sm ${isWeekend ? "text-red-500 font-medium" : ""}`}>
                          {day.day}
                        </td>
                        <td className={`border px-2 py-1 text-center text-sm ${isWeekend ? "text-red-500 font-medium" : ""}`}>
                          {day.weekday}
                        </td>
                        <td className="border px-2 py-1 text-sm">
                          {academicEvents.length > 0 ? (
                            <ul className="list-disc list-inside">
                              {academicEvents.map((e, i) => (
                                <li key={i} className="text-xs">{e}</li>
                              ))}
                            </ul>
                          ) : null}
                        </td>
                        <td className="border px-2 py-1 text-sm">
                          {dutyEvents.length > 0 ? (
                            <ul className="list-disc list-inside">
                              {dutyEvents.map((e, i) => (
                                <li key={i} className="text-xs">{e}</li>
                              ))}
                            </ul>
                          ) : null}
                        </td>
                        <EditableCell
                          dateStr={dateStr}
                          columnType="trip"
                          value={getCellContent(dateStr, "trip")}
                          canEdit={!!canEdit}
                          onSave={handleCellChange}
                          testId={`cell-trip-${day.day}`}
                          bgClass="bg-green-50/50 dark:bg-green-950/20"
                        />
                        {day.isFirstOfWeek && (
                          <>
                            <WeeklyEditableCell
                              weekNumber={day.weekNumber}
                              columnType="meeting"
                              value={getWeeklyCellContent(day.weekNumber, "meeting")}
                              canEdit={!!canEdit}
                              onSave={handleWeeklyCellChange}
                              testId={`cell-meeting-week-${day.weekNumber}`}
                              rowSpan={day.daysInWeek}
                              bgClass="bg-blue-50/50 dark:bg-blue-950/20"
                            />
                            <WeeklyEditableCell
                              weekNumber={day.weekNumber}
                              columnType="notice"
                              value={getWeeklyCellContent(day.weekNumber, "notice")}
                              canEdit={!!canEdit}
                              onSave={handleWeeklyCellChange}
                              testId={`cell-notice-week-${day.weekNumber}`}
                              rowSpan={day.daysInWeek}
                              bgClass="bg-yellow-50/50 dark:bg-yellow-950/20"
                            />
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface EditableCellProps {
  dateStr: string;
  columnType: string;
  value: string;
  canEdit?: boolean;
  onSave: (date: string, columnType: string, content: string) => void;
  testId: string;
  bgClass?: string;
}

function EditableCell({ dateStr, columnType, value, canEdit, onSave, testId, bgClass = "bg-green-50/50 dark:bg-green-950/20" }: EditableCellProps) {
  const [localValue, setLocalValue] = useState(value);
  const [isEditing, setIsEditing] = useState(false);
  
  useEffect(() => {
    setLocalValue(value);
  }, [value]);
  
  const handleBlur = () => {
    setIsEditing(false);
    if (localValue !== value) {
      onSave(dateStr, columnType, localValue);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleBlur();
    }
    if (e.key === "Escape") {
      setLocalValue(value);
      setIsEditing(false);
    }
  };
  
  if (!canEdit) {
    return (
      <td className={`border px-2 py-1 text-sm ${bgClass}`} data-testid={testId}>
        <div className="whitespace-pre-wrap text-xs">{value}</div>
      </td>
    );
  }
  
  return (
    <td 
      className={`border p-0 ${bgClass} cursor-text`}
      onClick={() => setIsEditing(true)}
      data-testid={testId}
    >
      {isEditing ? (
        <textarea
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-full h-full min-h-[40px] p-1 text-xs border-2 border-primary bg-background resize-none focus:outline-none"
          autoFocus
          data-testid={`${testId}-input`}
        />
      ) : (
        <div className="px-2 py-1 min-h-[32px] text-xs whitespace-pre-wrap">
          {localValue || <span className="text-muted-foreground italic">클릭하여 입력</span>}
        </div>
      )}
    </td>
  );
}

interface WeeklyEditableCellProps {
  weekNumber: number;
  columnType: string;
  value: string;
  canEdit?: boolean;
  onSave: (weekNumber: number, columnType: string, content: string) => void;
  testId: string;
  rowSpan: number;
  bgClass?: string;
}

function WeeklyEditableCell({ weekNumber, columnType, value, canEdit, onSave, testId, rowSpan, bgClass = "bg-blue-50/50 dark:bg-blue-950/20" }: WeeklyEditableCellProps) {
  const [localValue, setLocalValue] = useState(value);
  const [isEditing, setIsEditing] = useState(false);
  
  useEffect(() => {
    setLocalValue(value);
  }, [value]);
  
  const handleBlur = () => {
    setIsEditing(false);
    if (localValue !== value) {
      onSave(weekNumber, columnType, localValue);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleBlur();
    }
    if (e.key === "Escape") {
      setLocalValue(value);
      setIsEditing(false);
    }
  };
  
  const lineCount = (localValue || value || "").split("\n").length;
  const minHeight = Math.max(60, lineCount * 18 + 20);
  
  if (!canEdit) {
    return (
      <td className={`border px-2 py-1 text-sm ${bgClass} align-top`} rowSpan={rowSpan} data-testid={testId}>
        <div className="whitespace-pre-wrap text-xs break-words">{value}</div>
      </td>
    );
  }
  
  return (
    <td 
      className={`border p-0 ${bgClass} cursor-text align-top`}
      onClick={() => setIsEditing(true)}
      rowSpan={rowSpan}
      data-testid={testId}
    >
      {isEditing ? (
        <textarea
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-full p-1 text-xs border-2 border-primary bg-background resize-y focus:outline-none"
          style={{ minHeight: `${minHeight}px` }}
          autoFocus
          data-testid={`${testId}-input`}
        />
      ) : (
        <div 
          className="px-2 py-1 text-xs whitespace-pre-wrap break-words"
          style={{ minHeight: `${minHeight}px` }}
        >
          {localValue || <span className="text-muted-foreground italic">주간 내용 입력</span>}
        </div>
      )}
    </td>
  );
}
