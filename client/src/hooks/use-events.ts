import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertEvent } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useEvents() {
  return useQuery({
    queryKey: [api.events.list.path],
    queryFn: async () => {
      const res = await fetch(api.events.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch events");
      return api.events.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertEvent) => {
      const res = await fetch(api.events.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create event");
      return api.events.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.events.list.path] });
      toast({ title: "Event Created", description: "Calendar has been updated." });
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertEvent>) => {
      const url = buildUrl(api.events.update.path, { id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update event");
      return api.events.update.responses[200].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.events.list.path] }),
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.events.delete.path, { id });
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete event");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.events.list.path] }),
  });
}
