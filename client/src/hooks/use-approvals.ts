import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertApproval, type Approval } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useApprovals() {
  return useQuery({
    queryKey: [api.approvals.list.path],
    queryFn: async () => {
      const res = await fetch(api.approvals.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch approvals");
      return api.approvals.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateApproval() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertApproval) => {
      const res = await fetch(api.approvals.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to create approval request");
      }
      
      return api.approvals.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.approvals.list.path] });
      toast({
        title: "Request Submitted",
        description: "Your approval request has been sent successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });
}

export function useUpdateApprovalStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, status, feedback }: { id: number, status: "approved" | "rejected", feedback?: string }) => {
      const url = buildUrl(api.approvals.updateStatus.path, { id });
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, feedback }),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to update status");
      return api.approvals.updateStatus.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.approvals.list.path] });
      toast({
        title: "Status Updated",
        description: "The approval request has been updated.",
      });
    },
  });
}
