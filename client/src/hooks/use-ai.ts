import { useMutation } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useGenerateSurvey() {
  return useMutation({
    mutationFn: async (data: { prompt: string, image?: string }) => {
      const res = await fetch(api.ai.generateSurvey.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("AI generation failed");
      return api.ai.generateSurvey.responses[200].parse(await res.json());
    },
  });
}

export function useGenerateCurriculum() {
  return useMutation({
    mutationFn: async (data: { topic: string, mindmap?: any }) => {
      const res = await fetch(api.ai.generateCurriculum.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Curriculum generation failed");
      return api.ai.generateCurriculum.responses[200].parse(await res.json());
    },
  });
}

export function useGenerateReport() {
  return useMutation({
    mutationFn: async (data: { type: string, topic: string, details: string, photos?: string[] }) => {
      const res = await fetch(api.ai.generateReport.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Report generation failed");
      return api.ai.generateReport.responses[200].parse(await res.json());
    },
  });
}
