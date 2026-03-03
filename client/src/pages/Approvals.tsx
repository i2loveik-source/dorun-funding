import { useApprovals, useUpdateApprovalStatus } from "@/hooks/use-approvals";
import { ApprovalModal } from "@/components/ApprovalModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Check, X, FileText } from "lucide-react";

const typeLabels: Record<string, string> = {
  'field_trip': '가정체험학습',
  'absence': '결석계',
  'transfer': '전학신청서',
  'report': '보고서',
};

const statusLabels: Record<string, string> = {
  'pending': '대기중',
  'approved': '승인됨',
  'rejected': '반려됨',
};

export default function Approvals() {
  const { data: approvals, isLoading } = useApprovals();
  const { mutate: updateStatus, isPending } = useUpdateApprovalStatus();

  if (isLoading) return <div className="p-8">결재 내역을 불러오는 중...</div>;

  const pending = approvals?.filter(a => a.status === 'pending') || [];
  const history = approvals?.filter(a => a.status !== 'pending') || [];

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-end">
        <ApprovalModal />
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="bg-white p-1 rounded-xl border border-slate-100 mb-6">
          <TabsTrigger value="pending" className="data-[state=active]:bg-slate-100 rounded-lg" data-testid="tab-pending">
            대기 중 ({pending.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-slate-100 rounded-lg" data-testid="tab-history">
            처리 내역
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pending.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900">대기 중인 결재가 없습니다</h3>
              <p className="text-slate-500">모든 결재가 처리되었습니다!</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {pending.map((approval) => (
                <Card key={approval.id} className="hover:shadow-md transition-shadow" data-testid={`approval-card-${approval.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between pb-2 gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="uppercase text-xs font-bold tracking-wider">
                          {typeLabels[approval.type] || approval.type}
                        </Badge>
                        <span className="text-xs text-slate-400">
                          {approval.createdAt && format(new Date(approval.createdAt), "yyyy년 M월 d일", { locale: ko })}
                        </span>
                      </div>
                      <CardTitle className="text-xl">{approval.title}</CardTitle>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
                        onClick={() => updateStatus({ id: approval.id, status: 'approved' })}
                        disabled={isPending}
                        data-testid={`button-approve-${approval.id}`}
                      >
                        <Check className="w-4 h-4 mr-1" /> 승인
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                        onClick={() => updateStatus({ id: approval.id, status: 'rejected' })}
                        disabled={isPending}
                        data-testid={`button-reject-${approval.id}`}
                      >
                        <X className="w-4 h-4 mr-1" /> 반려
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-slate-600 bg-slate-50 p-4 rounded-lg text-sm">
                      {approval.content}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">유형</th>
                  <th className="px-6 py-4 font-medium">제목</th>
                  <th className="px-6 py-4 font-medium">신청일</th>
                  <th className="px-6 py-4 font-medium">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4">{typeLabels[item.type] || item.type}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">{item.title}</td>
                    <td className="px-6 py-4 text-slate-500">
                      {item.createdAt && format(new Date(item.createdAt), "yyyy년 M월 d일", { locale: ko })}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={item.status === 'approved' ? 'default' : 'destructive'}>
                        {statusLabels[item.status] || item.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
