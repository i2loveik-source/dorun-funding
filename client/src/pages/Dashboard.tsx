import { useAuth } from "@/hooks/use-auth";
import { useEvents } from "@/hooks/use-events";
import { useApprovals } from "@/hooks/use-approvals";
import { usePosts } from "@/hooks/use-posts";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Calendar, CheckCircle2, Clock, Newspaper, ArrowRight, FileCheck, Sparkles, MessageSquare } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: events } = useEvents();
  const { data: approvals } = useApprovals();
  const { data: posts } = usePosts();

  const today = new Date();
  const todaysEvents = events?.filter(e => 
    new Date(e.startTime).toDateString() === today.toDateString()
  ) || [];

  const pendingApprovals = approvals?.filter(a => a.status === 'pending') || [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="text-center">
          <p className="text-xl font-bold text-blue-600">
            {format(today, "yyyy년 M월 d일 EEEE", { locale: ko })}
          </p>
      </div>

      {/* Stats Grid - Clickable */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/calendar">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">오늘의 일정</p>
                <h3 className="text-2xl font-bold text-slate-900">{todaysEvents.length}개</h3>
              </div>
            </div>
            <p className="text-xs text-blue-500 mt-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              일정 보기 <ArrowRight className="w-3 h-3" />
            </p>
          </div>
        </Link>

        <Link href="/approvals">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-orange-200 transition-all cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-orange-50 text-orange-600 group-hover:bg-orange-100 transition-colors">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">대기 중 결재</p>
                <h3 className="text-2xl font-bold text-slate-900">{pendingApprovals.length}건</h3>
              </div>
            </div>
            <p className="text-xs text-orange-500 mt-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              결재함 보기 <ArrowRight className="w-3 h-3" />
            </p>
          </div>
        </Link>

        <Link href="/ai-tools">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-green-200 transition-all cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-green-50 text-green-600 group-hover:bg-green-100 transition-colors">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">AI 교무 지원</p>
                <h3 className="text-2xl font-bold text-slate-900">바로가기</h3>
              </div>
            </div>
            <p className="text-xs text-green-500 mt-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              AI 도구 열기 <ArrowRight className="w-3 h-3" />
            </p>
          </div>
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/approvals">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-4 rounded-xl text-white hover:shadow-lg transition-shadow cursor-pointer">
            <FileCheck className="w-6 h-6 mb-2" />
            <p className="font-semibold">결재 요청</p>
            <p className="text-xs text-blue-100">가정체험학습, 결석계</p>
          </div>
        </Link>
        <Link href="/chat">
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 p-4 rounded-xl text-white hover:shadow-lg transition-shadow cursor-pointer">
            <MessageSquare className="w-6 h-6 mb-2" />
            <p className="font-semibold">메신저</p>
            <p className="text-xs text-purple-100">실시간 대화</p>
          </div>
        </Link>
        <Link href="/ai-tools">
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-4 rounded-xl text-white hover:shadow-lg transition-shadow cursor-pointer">
            <Sparkles className="w-6 h-6 mb-2" />
            <p className="font-semibold">설문 생성</p>
            <p className="text-xs text-emerald-100">AI로 간편하게</p>
          </div>
        </Link>
        <Link href="/school-life">
          <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-4 rounded-xl text-white hover:shadow-lg transition-shadow cursor-pointer">
            <Newspaper className="w-6 h-6 mb-2" />
            <p className="font-semibold">소식 작성</p>
            <p className="text-xs text-amber-100">학교 행사 공유</p>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Schedule */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              오늘의 일정
            </h2>
            <Link href="/calendar">
              <span className="text-sm font-medium text-primary hover:underline cursor-pointer flex items-center gap-1">
                전체 보기 <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          </div>
          <div className="space-y-4">
            {todaysEvents.length === 0 ? (
              <p className="text-slate-500 text-center py-8">오늘은 예정된 일정이 없습니다.</p>
            ) : (
              todaysEvents.map(event => (
                <div key={event.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                  <div className="w-16 text-center">
                    <p className="text-sm font-bold text-slate-900">{format(new Date(event.startTime), "HH:mm")}</p>
                    <p className="text-xs text-slate-400">{format(new Date(event.endTime), "HH:mm")}</p>
                  </div>
                  <div className="w-1 h-10 rounded-full bg-primary/20"></div>
                  <div>
                    <h4 className="font-semibold text-slate-900">{event.title}</h4>
                    <p className="text-xs text-slate-500">{event.type === 'academic' ? '학사' : event.type}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Latest News */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Newspaper className="w-5 h-5 text-amber-500" />
              학교 소식
            </h2>
            <Link href="/school-life">
              <span className="text-sm font-medium text-amber-500 hover:underline cursor-pointer flex items-center gap-1">
                전체 보기 <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          </div>
          <div className="space-y-4">
             {posts?.slice(0, 3).map(post => (
               <div key={post.id} className="group cursor-pointer">
                 <div className="flex justify-between items-start mb-1">
                   <span className="inline-block px-2 py-1 rounded-md bg-slate-100 text-xs font-semibold text-slate-600 mb-2">
                     {post.category === 'notice' ? '공지' : post.category === 'story' ? '소식' : post.category}
                   </span>
                   {post.createdAt && (
                     <span className="text-xs text-slate-400">{format(new Date(post.createdAt), "M월 d일", { locale: ko })}</span>
                   )}
                 </div>
                 <h3 className="font-bold text-slate-900 group-hover:text-primary transition-colors">{post.title}</h3>
                 <p className="text-sm text-slate-500 line-clamp-2 mt-1">{post.content}</p>
                 <div className="w-full h-px bg-slate-100 mt-4 group-last:hidden" />
               </div>
             ))}
             {!posts?.length && (
               <p className="text-slate-500 text-center py-8">아직 등록된 소식이 없습니다.</p>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
