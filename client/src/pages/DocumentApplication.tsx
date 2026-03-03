import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowRight, FileText, Briefcase, FileCheck, GraduationCap, FileBadge, ClipboardList, BookOpen, Scroll, BadgeCheck, Building2 } from "lucide-react";

// 아이콘 이름 → 컴포넌트 매핑
const ICON_MAP: Record<string, React.ComponentType<any>> = {
  FileText, Briefcase, FileCheck, GraduationCap, FileBadge,
  ClipboardList, BookOpen, Scroll, BadgeCheck, Building2,
};

// 색상 클래스 목록
export const COLOR_OPTIONS = [
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

export const ICON_OPTIONS = Object.keys(ICON_MAP);

export default function DocumentApplication() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const { data: docTypes = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/document-types"],
    enabled: !!user,
  });

  const handleApply = (docName: string) => {
    // 양식 이름을 URL 파라미터로 전달
    setLocation(`/approvals?apply=${encodeURIComponent(docName)}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (docTypes.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-64 text-center space-y-3">
        <FileText className="h-12 w-12 text-slate-300" />
        <p className="text-slate-500 font-bold">등록된 양식이 없습니다</p>
        <p className="text-sm text-slate-400">관리자 설정에서 양식을 추가해 주세요</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="document-application-page">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {docTypes.map((doc: any) => {
          const Icon = ICON_MAP[doc.icon] || FileText;
          return (
            <Card
              key={doc.id}
              className="hover:shadow-lg transition-shadow cursor-pointer group"
              data-testid={`document-card-${doc.id}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className={`${doc.color || "bg-blue-500"} p-3 rounded-xl text-white`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{doc.name}</CardTitle>
                    <CardDescription>{doc.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full group-hover:bg-primary group-hover:text-primary-foreground"
                  variant="outline"
                  onClick={() => handleApply(doc.name)}
                  data-testid={`apply-button-${doc.id}`}
                >
                  신청하기
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
