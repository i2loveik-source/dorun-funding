import { useState } from "react";
import { useCreateApproval } from "@/hooks/use-approvals";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Plus } from "lucide-react";

export function ApprovalModal() {
  const [open, setOpen] = useState(false);
  const { mutate: createApproval, isPending } = useCreateApproval();
  
  const [type, setType] = useState<string>("field_trip");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createApproval(
      { 
        type: type as any, 
        title, 
        content,
        requesterId: "current-user",
        data: {} as any
      },
      {
        onSuccess: () => {
          setOpen(false);
          setTitle("");
          setContent("");
        }
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20" data-testid="button-new-approval">
          <Plus className="w-4 h-4 mr-2" />
          결재 요청
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>결재 요청 작성</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label>요청 유형</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger data-testid="select-approval-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="field_trip">가정체험학습 신청서</SelectItem>
                <SelectItem value="absence">결석계</SelectItem>
                <SelectItem value="transfer">전학신청서</SelectItem>
                <SelectItem value="report">보고서</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>제목</Label>
            <Input 
              placeholder="예: 5학년 1반 김철수 가정체험학습" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              required
              data-testid="input-approval-title"
            />
          </div>

          <div className="space-y-2">
            <Label>상세 내용</Label>
            <Textarea 
              placeholder="결재자가 검토할 상세 내용을 작성해주세요..." 
              className="h-32"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              data-testid="input-approval-content"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button>
            <Button type="submit" disabled={isPending} data-testid="button-submit-approval">
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              요청 제출
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
