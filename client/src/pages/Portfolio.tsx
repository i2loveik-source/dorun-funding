import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Plus, Award, GraduationCap, Star, Calendar, Trash2 } from "lucide-react";
import type { Portfolio } from "@shared/schema";

const CATEGORIES = [
  { value: "academic", label: "학업", icon: GraduationCap },
  { value: "activity", label: "활동", icon: Star },
  { value: "award", label: "수상", icon: Award },
  { value: "general", label: "기타", icon: BookOpen },
];

export default function PortfolioPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEntry, setNewEntry] = useState({
    title: "",
    category: "general",
    content: "",
    date: new Date().toISOString().split("T")[0],
  });

  const studentId = user?.id || "";

  const { data: portfolios = [], isLoading } = useQuery<Portfolio[]>({
    queryKey: ["/api/portfolios", studentId],
    queryFn: async () => {
      const res = await fetch(`/api/portfolios/${studentId}`);
      if (!res.ok) throw new Error("Failed to fetch portfolios");
      return res.json();
    },
    enabled: !!studentId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newEntry) => {
      return apiRequest("POST", "/api/portfolios", {
        ...data,
        studentId,
        teacherId: user?.role === "teacher" ? user.id : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portfolios", studentId] });
      toast({ title: "포트폴리오가 추가되었습니다" });
      setDialogOpen(false);
      setNewEntry({
        title: "",
        category: "general",
        content: "",
        date: new Date().toISOString().split("T")[0],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/portfolios/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portfolios", studentId] });
      toast({ title: "포트폴리오가 삭제되었습니다" });
    },
  });

  const getCategoryInfo = (category: string) => {
    return CATEGORIES.find((c) => c.value === category) || CATEGORIES[3];
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "academic":
        return "bg-blue-500";
      case "activity":
        return "bg-green-500";
      case "award":
        return "bg-yellow-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="p-6 space-y-6" data-testid="portfolio-page">
      <div className="flex items-center justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-portfolio-button">
              <Plus className="h-4 w-4 mr-2" />
              새 기록 추가
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 포트폴리오 기록</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>제목</Label>
                <Input
                  value={newEntry.title}
                  onChange={(e) => setNewEntry({ ...newEntry, title: e.target.value })}
                  placeholder="예: 과학 탐구 프로젝트"
                  data-testid="input-portfolio-title"
                />
              </div>
              <div className="space-y-2">
                <Label>카테고리</Label>
                <Select
                  value={newEntry.category}
                  onValueChange={(v) => setNewEntry({ ...newEntry, category: v })}
                >
                  <SelectTrigger data-testid="select-portfolio-category">
                    <SelectValue placeholder="카테고리 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>날짜</Label>
                <Input
                  type="date"
                  value={newEntry.date}
                  onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })}
                  data-testid="input-portfolio-date"
                />
              </div>
              <div className="space-y-2">
                <Label>내용</Label>
                <Textarea
                  value={newEntry.content}
                  onChange={(e) => setNewEntry({ ...newEntry, content: e.target.value })}
                  placeholder="활동 내용이나 성과를 기록하세요"
                  rows={4}
                  data-testid="input-portfolio-content"
                />
              </div>
              <Button
                className="w-full"
                onClick={() => createMutation.mutate(newEntry)}
                disabled={!newEntry.title || createMutation.isPending}
                data-testid="submit-portfolio"
              >
                저장
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">로딩 중...</div>
      ) : portfolios.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>아직 포트폴리오가 없습니다</p>
            <p className="text-sm">새 기록을 추가하여 성장 여정을 기록해보세요</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {portfolios.map((item) => {
            const categoryInfo = getCategoryInfo(item.category || "general");
            const CategoryIcon = categoryInfo.icon;
            return (
              <Card key={item.id} data-testid={`portfolio-item-${item.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`${getCategoryColor(item.category || "general")} p-2 rounded-lg text-white`}>
                        <CategoryIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{item.title}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline">{categoryInfo.label}</Badge>
                          {item.date && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(item.date).toLocaleDateString("ko-KR")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(item.id)}
                      data-testid={`delete-portfolio-${item.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                {item.content && (
                  <CardContent>
                    <p className="text-muted-foreground whitespace-pre-wrap">{item.content}</p>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
