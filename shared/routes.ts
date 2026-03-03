import { z } from 'zod';
import { 
  insertApprovalSchema, approvals,
  insertSurveySchema, surveys,
  insertProjectSchema, projects,
  insertEventSchema, events,
  insertPostSchema, posts,
  channels, channelMessages
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  // === APPROVALS ===
  approvals: {
    list: {
      method: 'GET' as const,
      path: '/api/approvals',
      responses: {
        200: z.array(z.custom<typeof approvals.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/approvals',
      input: insertApprovalSchema,
      responses: {
        201: z.custom<typeof approvals.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    updateStatus: {
      method: 'PATCH' as const,
      path: '/api/approvals/:id/status',
      input: z.object({ status: z.enum(["approved", "rejected"]), feedback: z.string().optional() }),
      responses: {
        200: z.custom<typeof approvals.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },

  // === AI TOOLS ===
  ai: {
    generateSurvey: {
      method: 'POST' as const,
      path: '/api/ai/generate-survey',
      input: z.object({ prompt: z.string(), image: z.string().optional() }), // image as base64 if needed
      responses: {
        200: z.object({ title: z.string(), questions: z.array(z.any()) }),
      },
    },
    generateCurriculum: {
      method: 'POST' as const,
      path: '/api/ai/generate-curriculum',
      input: z.object({ topic: z.string(), mindmap: z.any().optional() }),
      responses: {
        200: z.object({ curriculum: z.any() }),
      },
    },
    generateReport: {
      method: 'POST' as const,
      path: '/api/ai/generate-report',
      input: z.object({ type: z.string(), topic: z.string(), photos: z.array(z.string()).optional(), details: z.string() }),
      responses: {
        200: z.object({ content: z.string() }),
      },
    }
  },

  // === SURVEYS ===
  surveys: {
    list: {
      method: 'GET' as const,
      path: '/api/surveys',
      responses: {
        200: z.array(z.custom<typeof surveys.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/surveys',
      input: insertSurveySchema,
      responses: {
        201: z.custom<typeof surveys.$inferSelect>(),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/surveys/:id',
      responses: {
        200: z.custom<typeof surveys.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    }
  },

  // === EVENTS (Calendar) ===
  events: {
    list: {
      method: 'GET' as const,
      path: '/api/events',
      responses: {
        200: z.array(z.custom<typeof events.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/events',
      input: insertEventSchema,
      responses: {
        201: z.custom<typeof events.$inferSelect>(),
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/events/:id',
      input: insertEventSchema.partial(),
      responses: {
        200: z.custom<typeof events.$inferSelect>(),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/events/:id',
      responses: {
        204: z.void(),
      },
    }
  },

  // === POSTS ===
  posts: {
    list: {
      method: 'GET' as const,
      path: '/api/posts',
      responses: {
        200: z.array(z.custom<typeof posts.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/posts',
      input: insertPostSchema,
      responses: {
        201: z.custom<typeof posts.$inferSelect>(),
      },
    },
  },

  // === HUMAN CHAT ===
  channels: {
    list: {
      method: 'GET' as const,
      path: '/api/channels',
      responses: {
        200: z.array(z.custom<typeof channels.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/channels',
      input: z.object({ name: z.string(), type: z.string() }),
      responses: {
        201: z.custom<typeof channels.$inferSelect>(),
      },
    },
    messages: {
      method: 'GET' as const,
      path: '/api/channels/:id/messages',
      responses: {
        200: z.array(z.custom<typeof channelMessages.$inferSelect>()),
      },
    },
    sendMessage: {
      method: 'POST' as const,
      path: '/api/channels/:id/messages',
      input: z.object({ 
        content: z.string(), 
        senderId: z.string().optional(), 
        parentId: z.number().optional(),
        nonce: z.string().optional(),
        metadata: z.any().optional()
      }),
      responses: {
        201: z.custom<typeof channelMessages.$inferSelect>(),
      },
    },
    addReaction: {
      method: 'POST' as const,
      path: '/api/channels/:id/messages/:messageId/reactions',
      input: z.object({ emoji: z.string() }),
      responses: {
        200: z.any(),
      },
    },
    invite: {
      method: 'POST' as const,
      path: '/api/channels/:id/invite',
      input: z.object({ userId: z.string() }),
      responses: {
        200: z.object({ message: z.string() }),
      },
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
