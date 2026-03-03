import { usePosts, useCreatePost } from "@/hooks/use-posts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Plus, Image as ImageIcon } from "lucide-react";

const categoryLabels: Record<string, string> = {
  'notice': '공지사항',
  'story': '학교 소식',
  'event': '행사',
};

export default function SchoolLife() {
  const { data: posts } = usePosts();

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex justify-end">
        <CreatePostModal />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {posts?.map(post => (
          <Card key={post.id} className="overflow-hidden hover:shadow-lg transition-all duration-300 group" data-testid={`post-card-${post.id}`}>
            <div className="h-48 bg-slate-100 relative overflow-hidden">
              {post.images && post.images.length > 0 ? (
                <img src={post.images[0]} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-300">
                  <ImageIcon className="w-12 h-12" />
                </div>
              )}
              <div className="absolute top-4 left-4">
                <span className="px-3 py-1 bg-white/90 backdrop-blur-sm text-xs font-bold rounded-full uppercase tracking-wider text-slate-800">
                  {categoryLabels[post.category as string] || post.category}
                </span>
              </div>
            </div>
            <CardHeader>
              <div className="text-xs text-slate-400 mb-2">
                {post.createdAt && format(new Date(post.createdAt), "yyyy년 M월 d일", { locale: ko })}
              </div>
              <CardTitle className="text-xl leading-tight group-hover:text-primary transition-colors">{post.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600 text-sm line-clamp-3">{post.content}</p>
            </CardContent>
          </Card>
        ))}
        {(!posts || posts.length === 0) && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>아직 등록된 소식이 없습니다</p>
          </div>
        )}
      </div>
    </div>
  );
}

function CreatePostModal() {
  const [open, setOpen] = useState(false);
  const { mutate: createPost, isPending } = useCreatePost();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("story");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createPost(
      { title, content, authorId: "current", category }, 
      { onSuccess: () => { setOpen(false); setTitle(""); setContent(""); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-new-post"><Plus className="w-4 h-4 mr-2" /> 소식 작성</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>새 소식 작성</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>카테고리</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="select-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="notice">공지사항</SelectItem>
                <SelectItem value="story">학교 소식</SelectItem>
                <SelectItem value="event">행사</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>제목</Label>
            <Input placeholder="소식 제목을 입력하세요" value={title} onChange={e => setTitle(e.target.value)} required data-testid="input-post-title" />
          </div>
          <div className="space-y-2">
            <Label>내용</Label>
            <Textarea placeholder="소식 내용을 작성하세요..." className="h-32" value={content} onChange={e => setContent(e.target.value)} required data-testid="input-post-content" />
          </div>
          <Button type="submit" className="w-full" disabled={isPending} data-testid="button-submit-post">게시하기</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
