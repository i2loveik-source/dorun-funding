import { useState } from "react";
import { useGenerateCurriculum, useGenerateReport, useGenerateSurvey } from "@/hooks/use-ai";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, FileText, BrainCircuit, PenTool, Loader2 } from "lucide-react";

export default function AITools() {
  const [activeTool, setActiveTool] = useState<string | null>(null);

  const tools = [
    {
      id: "survey",
      title: "설문지 자동 생성",
      description: "간단한 프롬프트나 이미지로부터 설문지를 자동 생성합니다.",
      icon: FileText,
      color: "text-blue-500",
      bg: "bg-blue-50"
    },
    {
      id: "curriculum",
      title: "교육과정 설계",
      description: "주제를 입력하면 성취기준, 시수, 평가 기준이 포함된 교육과정을 생성합니다.",
      icon: BrainCircuit,
      color: "text-purple-500",
      bg: "bg-purple-50"
    },
    {
      id: "report",
      title: "보고서 자동 작성",
      description: "핵심 내용을 입력하면 체험학습 보고서나 활동 계획서를 자동 생성합니다.",
      icon: PenTool,
      color: "text-orange-500",
      bg: "bg-orange-50"
    }
  ];

  return (
    <div className="space-y-8 animate-in zoom-in-95 duration-500">

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Card 
              key={tool.id} 
              className="group cursor-pointer hover:shadow-xl transition-all duration-300 border-slate-200 hover:border-primary/50"
              onClick={() => setActiveTool(tool.id)}
              data-testid={`card-ai-${tool.id}`}
            >
              <CardHeader>
                <div className={`w-12 h-12 rounded-xl ${tool.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-6 h-6 ${tool.color}`} />
                </div>
                <CardTitle>{tool.title}</CardTitle>
                <CardDescription>{tool.description}</CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <ToolModal tool={activeTool} onClose={() => setActiveTool(null)} />
    </div>
  );
}

function ToolModal({ tool, onClose }: { tool: string | null, onClose: () => void }) {
  const { mutate: generateSurvey, isPending: surveyPending, data: surveyResult } = useGenerateSurvey();
  const { mutate: generateCurriculum, isPending: currPending, data: currResult } = useGenerateCurriculum();
  const { mutate: generateReport, isPending: reportPending, data: reportResult } = useGenerateReport();

  const [prompt, setPrompt] = useState("");
  const [details, setDetails] = useState("");

  const handleSurveySubmit = () => {
    generateSurvey({ prompt });
  };

  const handleCurriculumSubmit = () => {
    generateCurriculum({ topic: prompt });
  };

  const handleReportSubmit = () => {
    generateReport({ type: "Activity", topic: prompt, details });
  };

  const isLoading = surveyPending || currPending || reportPending;

  const getTitle = () => {
    if (tool === 'survey') return "설문지 생성";
    if (tool === 'curriculum') return "교육과정 설계";
    if (tool === 'report') return "보고서 작성";
    return "";
  };

  return (
    <Dialog open={!!tool} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {tool === 'survey' && "설문 주제"}
              {tool === 'curriculum' && "교육 주제"}
              {tool === 'report' && "보고서 제목"}
            </label>
            <Input 
              placeholder={
                tool === 'survey' ? "예: 학부모 만족도 조사" :
                tool === 'curriculum' ? "예: 환경 보호와 지속 가능한 발전" :
                "예: 국립중앙박물관 체험학습"
              }
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              data-testid="input-ai-prompt"
            />
          </div>

          {tool === 'report' && (
             <div className="space-y-2">
               <label className="text-sm font-medium">주요 활동 내용</label>
               <Textarea 
                 placeholder="체험한 내용, 학생 반응, 주요 성과 등을 적어주세요..." 
                 className="h-32"
                 value={details}
                 onChange={(e) => setDetails(e.target.value)}
                 data-testid="input-ai-details"
               />
             </div>
          )}

          {(surveyResult || currResult || reportResult) && (
            <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-100 max-h-60 overflow-y-auto">
              <h4 className="font-bold text-sm mb-2 text-green-600">생성 결과:</h4>
              <pre className="text-xs whitespace-pre-wrap font-mono">
                {JSON.stringify(surveyResult || currResult || reportResult, null, 2)}
              </pre>
            </div>
          )}

          <div className="flex justify-end pt-4">
            <Button onClick={() => {
              if (tool === 'survey') handleSurveySubmit();
              if (tool === 'curriculum') handleCurriculumSubmit();
              if (tool === 'report') handleReportSubmit();
            }} disabled={isLoading || !prompt} data-testid="button-generate">
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              생성하기
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
