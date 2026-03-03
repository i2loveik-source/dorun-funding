import { useEvents, useCreateEvent, useUpdateEvent, useDeleteEvent } from "@/hooks/use-events";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { Calendar as BigCalendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { ko } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, CheckCircle, RefreshCw } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { CalendarEvent, User } from "@shared/schema";
import { useSchoolTimezone } from "@/hooks/use-timezone";

const locales = {
  "ko": ko,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

const messages = {
  allDay: '종일',
  previous: '이전',
  next: '다음',
  today: '오늘',
  month: '월',
  week: '주',
  day: '일',
  agenda: '일정',
  date: '날짜',
  time: '시간',
  event: '일정',
  noEventsInRange: '이 기간에 일정이 없습니다.',
  showMore: (total: number) => `+${total}개 더보기`,
};

const BUS_ICONS: Record<string, { emoji: string; color: string }> = {
  '학교 버스': { emoji: '🚌', color: '#fbbf24' },
  '지역청 버스': { emoji: '🚍', color: '#a78bfa' },
  '임차 버스': { emoji: '🚐', color: '#f472b6' },
  '기관 지원': { emoji: '🚎', color: '#22d3ee' },
};

function CustomEvent({ event }: { event: any }) {
  const resource = event.resource;
  const busOption = resource?.busOption;
  const busComplete = resource?.busRequestComplete;
  const isOffCampus = resource?.isOffCampus;
  const busInfo = busOption ? BUS_ICONS[busOption] : null;

  return (
    <span className="flex items-center gap-0.5 text-white text-xs leading-tight truncate">
      <span className="truncate">{event.title}</span>
      {isOffCampus && (
        <span className="flex-shrink-0" title="교외체험학습">🎒</span>
      )}
      {busInfo && (
        <span className="flex-shrink-0" title={busOption}>{busInfo.emoji}</span>
      )}
      {busComplete && (
        <span className="flex-shrink-0 text-green-300" title="배차신청 완료">✅</span>
      )}
    </span>
  );
}

export default function CalendarPage() {
  const { user } = useAuth();
  const { data: events } = useEvents();
  const timezone = useSchoolTimezone();
  const [modalOpen, setModalOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [viewType, setViewType] = useState<'all' | 'academic' | 'duty'>('all');

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/calendar/google/sync", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("동기화 실패");
      return res.json();
    },
    onSuccess: (data) => {
      // 이벤트 목록 갱신
      import("@/lib/queryClient").then(m => m.queryClient.invalidateQueries({ queryKey: ["/api/events"] }));
    },
  });

  const filteredEvents = events?.filter(e => {
    if (viewType === 'all') return true;
    return e.type === viewType;
  });

  const calendarEvents = filteredEvents?.map(e => {
    const start = new Date(e.startTime);
    const end = new Date(e.endTime);
    return {
      id: e.id,
      title: e.title,
      start,
      end,
      allDay: e.isAllDay || false,
      resource: e,
    };
  }) || [];

  const handleSelectEvent = (event: any) => {
    setEditEvent(event.resource);
    setModalOpen(true);
  };

  const handleSelectSlot = ({ start, end }: { start: Date; end: Date }) => {
    setEditEvent({ 
      id: 0, 
      title: '', 
      startTime: start, 
      endTime: start, 
      creatorId: user?.id || '', 
      type: 'academic',
      isAllDay: false,
      description: null,
      googleEventId: null,
      location: null,
      supportRequest: null,
      isOffCampus: false,
      needsBus: false,
      assigneeIds: null
    } as any);
    setModalOpen(true);
  };

  return (
    <div className="space-y-4 h-[calc(100vh-100px)] flex flex-col">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Select value={viewType} onValueChange={(v: any) => setViewType(v)}>
          <SelectTrigger className="w-[110px] h-9 text-xs" data-testid="select-view-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 일정</SelectItem>
            <SelectItem value="academic">학사 일정</SelectItem>
            <SelectItem value="duty">업무 일정</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => { setEditEvent(null); setModalOpen(true); }} data-testid="button-add-event">
          <Plus className="w-3.5 h-3.5 mr-1" /> 일정 추가
        </Button>
        <Button 
          variant="outline"
          size="sm"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          {syncMutation.isPending ? '동기화 중...' : '구글 동기화'}
        </Button>
      </div>


      <div className="flex-1 bg-card p-6 rounded-2xl shadow-sm border border-border">
        <BigCalendar
          localizer={localizer}
          events={calendarEvents}
          startAccessor="start"
          endAccessor="end"
          style={{ height: "100%" }}
          views={['month', 'week', 'day', 'agenda']}
          messages={messages}
          culture="ko"
          onSelectEvent={handleSelectEvent}
          onSelectSlot={handleSelectSlot}
          selectable
          components={{
            event: CustomEvent,
          }}
          eventPropGetter={(event) => ({
            style: {
              backgroundColor: event.resource?.type === 'academic' ? '#3b82f6' : '#10b981',
              borderRadius: '4px',
              padding: '1px 4px',
            }
          })}
        />
      </div>
      <p className="text-xs text-muted-foreground text-center mt-2">🔄 구글 캘린더와 1시간마다 자동 동기화됩니다</p>

      <EventModal 
        open={modalOpen} 
        onOpenChange={setModalOpen} 
        event={editEvent}
        userId={user?.id || ''}
      />
    </div>
  );
}

function EventModal({ 
  open, 
  onOpenChange, 
  event,
  userId
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  event: CalendarEvent | null;
  userId: string;
}) {
  const { mutate: createEvent, isPending: isCreating } = useCreateEvent();
  const { mutate: updateEvent, isPending: isUpdating } = useUpdateEvent();
  const { mutate: deleteEvent, isPending: isDeleting } = useDeleteEvent();
  
  const isEditing = event && event.id !== 0;
  
  const [title, setTitle] = useState("");
  const [type, setType] = useState("academic");
  const [isAllDay, setIsAllDay] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");
  const [supportRequest, setSupportRequest] = useState("");
  const [isOffCampus, setIsOffCampus] = useState(false);
  const [needsBus, setNeedsBus] = useState(false);
  const [busOption, setBusOption] = useState("");
  const [busRequestComplete, setBusRequestComplete] = useState(false);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);

  const { data: staffUsers } = useQuery<User[]>({
    queryKey: ["/api/users", "staff"],
    queryFn: async () => {
      const res = await fetch("/api/users?role=teacher,admin", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    enabled: type === "duty",
  });

  useEffect(() => {
    if (event) {
      setTitle(event.title || "");
      setType(event.type || "academic");
      setIsAllDay(event.isAllDay || false);
      if (event.isAllDay) {
        // UTC 자정으로 저장되어 있으므로 ISO 문자열에서 날짜만 추출
        setStart(event.startTime ? new Date(event.startTime).toISOString().split('T')[0] : "");
        setEnd(event.endTime ? new Date(event.endTime).toISOString().split('T')[0] : "");
      } else {
        setStart(event.startTime ? format(new Date(event.startTime), "yyyy-MM-dd'T'HH:mm") : "");
        setEnd(event.endTime ? format(new Date(event.endTime), "yyyy-MM-dd'T'HH:mm") : "");
      }
      setLocation(event.location || "");
      setSupportRequest(event.supportRequest || "");
      setIsOffCampus(event.isOffCampus || false);
      setNeedsBus(event.needsBus || false);
      setBusOption((event as any).busOption || "");
      setBusRequestComplete((event as any).busRequestComplete || false);
      setSelectedAssignees(event.assigneeIds || []);
    } else {
      setTitle("");
      setType("academic");
      setIsAllDay(false);
      setStart("");
      setEnd("");
      setLocation("");
      setSupportRequest("");
      setIsOffCampus(false);
      setNeedsBus(false);
      setBusOption("");
      setBusRequestComplete(false);
      setSelectedAssignees([]);
    }
  }, [event]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const eventData: any = {
      title,
      startTime: isAllDay ? new Date(start + 'T00:00:00Z').toISOString() : new Date(start).toISOString(),
      endTime: isAllDay ? new Date(end + 'T00:00:00Z').toISOString() : new Date(end).toISOString(),
      creatorId: userId,
      type,
      isAllDay
    };

    if (type === "academic") {
      eventData.location = location || null;
      eventData.supportRequest = supportRequest || null;
      eventData.isOffCampus = isOffCampus;
      eventData.needsBus = !!(busOption && busOption !== 'none');
      eventData.busOption = (busOption && busOption !== 'none') ? busOption : null;
      eventData.busRequestComplete = busRequestComplete;
    } else if (type === "duty") {
      eventData.assigneeIds = selectedAssignees.length > 0 ? selectedAssignees : null;
    }

    if (isEditing && event) {
      updateEvent({ id: event.id, ...eventData }, {
        onSuccess: () => {
          onOpenChange(false);
        }
      });
    } else {
      createEvent(eventData, {
        onSuccess: () => {
          onOpenChange(false);
        }
      });
    }
  };

  const handleDelete = () => {
    if (event && isEditing) {
      deleteEvent(event.id, {
        onSuccess: () => {
          onOpenChange(false);
        }
      });
    }
  };

  const toggleAssignee = (userId: string) => {
    setSelectedAssignees(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "principal": return "교장";
      case "vice_principal": return "교감";
      case "teacher": return "교사";
      case "staff": return "교직원";
      default: return role;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? '일정 수정' : '새 일정 추가'}</DialogTitle>
          <DialogDescription>
            {isEditing ? '일정 정보를 수정합니다.' : '새로운 일정을 추가합니다.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>일정 제목</Label>
            <Input 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              placeholder="예: 학부모 상담 주간"
              required 
              data-testid="input-event-title"
            />
          </div>
          <div className="space-y-2">
            <Label>일정 유형</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger data-testid="select-event-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="academic">학사 일정</SelectItem>
                <SelectItem value="duty">업무 일정</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="isAllDay" 
              checked={isAllDay}
              onCheckedChange={(checked) => {
                const allDay = checked === true;
                setIsAllDay(allDay);
                if (start) {
                  const d = new Date(start);
                  if (allDay) {
                    // ISO에서 날짜만 추출 (UTC 기준)
                    const dateOnly = d.toISOString().split('T')[0];
                    setStart(dateOnly);
                    setEnd(dateOnly);
                  } else {
                    setStart(format(d, "yyyy-MM-dd'T'HH:mm"));
                    setEnd(end ? format(new Date(end), "yyyy-MM-dd'T'HH:mm") : "");
                  }
                }
              }}
            />
            <Label htmlFor="isAllDay" className="font-normal cursor-pointer">종일</Label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>시작</Label>
              <Input 
                type={isAllDay ? "date" : "datetime-local"} 
                value={start} 
                onChange={(e) => setStart(e.target.value)} 
                required 
                data-testid="input-event-start"
              />
            </div>
            <div className="space-y-2">
              <Label>종료</Label>
              <Input 
                type={isAllDay ? "date" : "datetime-local"} 
                value={end} 
                onChange={(e) => setEnd(e.target.value)} 
                required 
                data-testid="input-event-end"
              />
            </div>
          </div>

          {type === "academic" && (
            <>
              <div className="space-y-2">
                <Label>지역</Label>
                <Input 
                  value={location} 
                  onChange={(e) => setLocation(e.target.value)} 
                  placeholder="예: 서울시 강남구"
                  data-testid="input-event-location"
                />
              </div>
              <div className="space-y-2">
                <Label>지원 요청 사항</Label>
                <Input 
                  value={supportRequest} 
                  onChange={(e) => setSupportRequest(e.target.value)} 
                  placeholder="필요한 지원 사항을 입력하세요"
                  data-testid="input-event-support"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="isOffCampus" 
                  checked={isOffCampus}
                  onCheckedChange={(checked) => setIsOffCampus(checked === true)}
                  data-testid="checkbox-off-campus"
                />
                <Label htmlFor="isOffCampus" className="font-normal cursor-pointer">교외체험학습</Label>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>배차 옵션</Label>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="busRequestComplete" 
                      checked={busRequestComplete}
                      onCheckedChange={(checked) => setBusRequestComplete(checked === true)}
                    />
                    <Label htmlFor="busRequestComplete" className="font-normal cursor-pointer text-sm text-green-600">배차신청 완료</Label>
                  </div>
                </div>
                <Select value={busOption} onValueChange={setBusOption}>
                  <SelectTrigger data-testid="select-bus-option">
                    <SelectValue placeholder="선택 안함" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">선택 안함</SelectItem>
                    <SelectItem value="학교 버스">학교 버스</SelectItem>
                    <SelectItem value="지역청 버스">지역청 버스</SelectItem>
                    <SelectItem value="임차 버스">임차 버스</SelectItem>
                    <SelectItem value="기관 지원">기관 지원</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {type === "duty" && (
            <div className="space-y-2">
              <Label>담당자 선택</Label>
              <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2" data-testid="assignee-list">
                {staffUsers?.map((user) => (
                  <div key={user.id} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`assignee-${user.id}`}
                      checked={selectedAssignees.includes(user.id)}
                      onCheckedChange={() => toggleAssignee(user.id)}
                      data-testid={`checkbox-assignee-${user.id}`}
                    />
                    <Label htmlFor={`assignee-${user.id}`} className="font-normal cursor-pointer flex-1">
                      {user.firstName || user.email} 
                      <span className="text-muted-foreground text-sm ml-2">({getRoleLabel(user.role || "")})</span>
                    </Label>
                  </div>
                ))}
                {(!staffUsers || staffUsers.length === 0) && (
                  <p className="text-sm text-muted-foreground">등록된 직원이 없습니다</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4">
            {isEditing && (
              <Button 
                type="button" 
                variant="destructive" 
                onClick={handleDelete}
                disabled={isDeleting}
                data-testid="button-delete-event"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                삭제
              </Button>
            )}
            <Button 
              type="submit" 
              disabled={isCreating || isUpdating}
              className={isEditing ? '' : 'ml-auto'}
              data-testid="button-save-event"
            >
              {isEditing ? '수정' : '추가'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
