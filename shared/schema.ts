import { pgTable, text, serial, integer, boolean, timestamp, jsonb, date } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Export Auth & Chat models
export * from "./models/auth";
export * from "./models/chat";
export * from "./models/funding";

import { users } from "./models/auth";

// === SCHOOLS ===
export const schools = pgTable("schools", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  type: text("type").default("school"), // school, company, cooperative, ngo, community
  country: text("country").default("KR"), // ISO 3166-1 alpha-2
  language: text("language").default("ko"), // ISO 639-1
  description: text("description"),
  inviteCode: text("invite_code").unique(), // 초대 코드
  maxMembers: integer("max_members").default(100),
  settings: jsonb("settings").$type<{
    maxUploadSizeMb?: number;
    fileRetentionDays?: number;
    googleCalendarAcademicUrl?: string;
    googleCalendarDutyUrl?: string;
    timezone?: string;
    enabledModules?: string[];
    chatGroupSettings?: any[];
  }>().default({ maxUploadSizeMb: 10, fileRetentionDays: 365 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSchoolSchema = createInsertSchema(schools).omit({ id: true, createdAt: true });
export type School = typeof schools.$inferSelect;
export type InsertSchool = z.infer<typeof insertSchoolSchema>;

// === USER-ORGANIZATION MEMBERSHIP ===
export const userOrganizations = pgTable("user_organizations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  organizationId: integer("organization_id").notNull(),
  role: text("role").default("member"), // 조직 내 역할
  isApproved: boolean("is_approved").default(false),
  isPrimary: boolean("is_primary").default(false), // 기본 조직 여부
  joinedAt: timestamp("joined_at").defaultNow(),
});

export type UserOrganization = typeof userOrganizations.$inferSelect;

// === APPROVAL SYSTEM ===
export const approvalTypes = ["field_trip", "absence", "transfer", "report", "purchase", "leave", "expense"] as const;
export const approvalStatuses = ["pending", "approved", "rejected"] as const;

export const approvals = pgTable("approvals", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id"),
  type: text("type", { enum: approvalTypes }).notNull(),
  requesterId: text("requester_id").notNull(), // references users.id
  title: text("title").notNull(),
  content: text("content").notNull(),
  data: jsonb("data").$type<any>(), // Structured data for the specific form
  status: text("status", { enum: approvalStatuses }).default("pending").notNull(),
  approverId: text("approver_id"), // references users.id (e.g. teacher/vice-principal)
  feedback: text("feedback"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertApprovalSchema = createInsertSchema(approvals).omit({ id: true, createdAt: true, status: true, approverId: true, feedback: true });

// === AI SURVEYS ===
export const surveys = pgTable("surveys", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id"),
  title: text("title").notNull(),
  description: text("description"),
  questions: jsonb("questions").notNull().$type<any[]>(), // Array of question objects
  creatorId: text("creator_id").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSurveySchema = createInsertSchema(surveys).omit({ id: true, createdAt: true });

export const surveyResponses = pgTable("survey_responses", {
  id: serial("id").primaryKey(),
  surveyId: integer("survey_id").notNull(),
  respondentId: text("respondent_id"), // Optional (anonymous)
  answers: jsonb("answers").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSurveyResponseSchema = createInsertSchema(surveyResponses).omit({ id: true, createdAt: true });

// === CURRICULUM / PROJECTS ===
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id"),
  title: text("title").notNull(),
  subject: text("subject"),
  gradeLevel: text("grade_level"),
  mindmapData: jsonb("mindmap_data"), // AI Generated Mindmap
  curriculumData: jsonb("curriculum_data"), // AI Generated Curriculum (hours, standards)
  creatorId: text("creator_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true });

// === EVENTS (Calendar) ===
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id"),
  title: text("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  type: text("type").default("academic"), // academic, duty
  googleEventId: text("google_event_id"),
  creatorId: text("creator_id").notNull(),
  isAllDay: boolean("is_all_day").default(false),
  // Academic event specific fields (학사 일정)
  location: text("location"), // 지역
  supportRequest: text("support_request"), // 지원 요청 사항
  isOffCampus: boolean("is_off_campus").default(false), // 교외체험학습 여부
  needsBus: boolean("needs_bus").default(false), // 배차 신청 (레거시)
  busOption: text("bus_option"), // 배차옵션: 학교 버스, 지역청 버스, 임차 버스, 기관 지원
  busRequestComplete: boolean("bus_request_complete").default(false), // 배차신청 완료
  // Duty event specific fields (업무 일정)
  assigneeIds: text("assignee_ids").array(), // 담당자 IDs
});

export const insertEventSchema = createInsertSchema(events, {
  startTime: z.union([z.string(), z.date()]).transform((val) => typeof val === 'string' ? new Date(val) : val),
  endTime: z.union([z.string(), z.date()]).transform((val) => typeof val === 'string' ? new Date(val) : val),
}).omit({ id: true });

// === POSTS (School Stories / News) ===
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  images: text("images").array(), // Array of image URLs
  authorId: text("author_id").notNull(),
  category: text("category").default("story"), // story, notice
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPostSchema = createInsertSchema(posts).omit({ id: true, createdAt: true });

// === RELATIONS ===
// (Optional: Define relations if needed for Drizzle queries, but we can do joins manually)

// === API TYPES ===
export type Approval = typeof approvals.$inferSelect;
export type InsertApproval = z.infer<typeof insertApprovalSchema>;

export type Survey = typeof surveys.$inferSelect;
export type InsertSurvey = z.infer<typeof insertSurveySchema>;

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export type CalendarEvent = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;

export type Post = typeof posts.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;

// === NOTIFICATIONS (결재 알림) ===
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(), // 알림 받는 사용자
  type: text("type").default("approval"), // approval, message, system
  title: text("title").notNull(),
  content: text("content"),
  referenceId: integer("reference_id"), // 관련 결재 ID 등
  referenceType: text("reference_type"), // approval, message, etc.
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true, isRead: true });
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// === PORTFOLIO (학생 성장 기록) ===
export const portfolios = pgTable("portfolios", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id"),
  studentId: text("student_id").notNull(), // 학생 ID
  title: text("title").notNull(),
  category: text("category").default("general"), // academic, activity, award, etc.
  content: text("content"),
  images: text("images").array(),
  date: date("date"),
  teacherId: text("teacher_id"), // 작성한 교사 ID
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPortfolioSchema = createInsertSchema(portfolios).omit({ id: true, createdAt: true });
export type Portfolio = typeof portfolios.$inferSelect;
export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;

// === HUMAN CHAT ===
export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id"),
  name: text("name").notNull(),
  type: text("type").default("general"), // general, class, dm
  description: text("description"),
  announcementMessageId: integer("announcement_message_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const channelMessages = pgTable("channel_messages", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull(),
  senderId: text("sender_id").notNull(), // references users.id
  content: text("content").notNull(),
  parentId: integer("parent_id"), // For replies
  reactions: jsonb("reactions").default({}), // { "emoji": ["userId1", "userId2"] }
  metadata: jsonb("metadata").$type<{
    files?: { name: string; url: string; type: string }[];
    translation?: Record<string, string>; // { "en": "...", "jp": "..." }
  }>().default({}),
  isRecalled: boolean("is_recalled").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const channelMembers = pgTable("channel_members", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").default("member"), // member, admin
  joinedAt: timestamp("joined_at").defaultNow(),
});

export type Channel = typeof channels.$inferSelect;
export type ChannelMessage = typeof channelMessages.$inferSelect;
export type ChannelMember = typeof channelMembers.$inferSelect;

// === GOOGLE CALENDAR SETTINGS ===
export const calendarSettings = pgTable("calendar_settings", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // "academic" or "duty"
  calendarId: text("calendar_id"), // Google Calendar ID
  syncEnabled: boolean("sync_enabled").default(false),
  lastSyncAt: timestamp("last_sync_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCalendarSettingSchema = createInsertSchema(calendarSettings).omit({ id: true, updatedAt: true, lastSyncAt: true });
export type CalendarSetting = typeof calendarSettings.$inferSelect;
export type InsertCalendarSetting = z.infer<typeof insertCalendarSettingSchema>;

// === MONTHLY PLAN (월중계획) ===
export const monthlyPlanColumnTypes = ["trip", "meeting", "notice"] as const; // 출장, 회의, 안내

export const monthlyPlanCells = pgTable("monthly_plan_cells", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id"),
  date: date("date").notNull(), // 날짜 (주별 셀은 주의 시작일)
  columnType: text("column_type", { enum: monthlyPlanColumnTypes }).notNull(), // trip, meeting, notice
  content: text("content").default(""), // 셀 내용
  updatedBy: text("updated_by"), // 마지막 수정자 ID
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMonthlyPlanCellSchema = createInsertSchema(monthlyPlanCells).omit({ id: true, updatedAt: true });
export type MonthlyPlanCell = typeof monthlyPlanCells.$inferSelect;
export type InsertMonthlyPlanCell = z.infer<typeof insertMonthlyPlanCellSchema>;

// === MESSAGE READ RECEIPTS (읽음 확인) ===
export const messageReads = pgTable("message_reads", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull(),
  userId: text("user_id").notNull(),
  readAt: timestamp("read_at").defaultNow(),
});

export const insertMessageReadSchema = createInsertSchema(messageReads).omit({ id: true, readAt: true });
export type MessageRead = typeof messageReads.$inferSelect;
export type InsertMessageRead = z.infer<typeof insertMessageReadSchema>;

// === USER SETTINGS (개인 설정) ===
export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  // 알림 방해 금지 시간 설정
  doNotDisturbEnabled: boolean("do_not_disturb_enabled").default(false),
  doNotDisturbStart: text("do_not_disturb_start"), // "22:00" 형식
  doNotDisturbEnd: text("do_not_disturb_end"), // "07:00" 형식
  // 채팅 그룹 설정 (선택된 사용자, 순서, 메모)
  chatGroupSettings: jsonb("chat_group_settings").$type<{ id: string; memo?: string }[]>(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({ id: true, updatedAt: true });
export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;

// === CHANNEL MEMBER SETTINGS (채널 핀 등) ===
export const channelMemberSettings = pgTable("channel_member_settings", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull(),
  userId: text("user_id").notNull(),
  isPinned: boolean("is_pinned").default(false),
  isMuted: boolean("is_muted").default(false),
  lastReadMessageId: integer("last_read_message_id"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// 투표 (Polls)
export const polls = pgTable("polls", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull(),
  creatorId: text("creator_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  pollType: text("poll_type").notNull().default("text"), // "text" | "date"
  options: jsonb("options").notNull().default([]), // [{id, label, date?}]
  isMultipleChoice: boolean("is_multiple_choice").default(false),
  isAnonymous: boolean("is_anonymous").default(false),
  deadline: timestamp("deadline"),
  isClosed: boolean("is_closed").default(false),
  showResultsAfterClose: boolean("show_results_after_close").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pollVotes = pgTable("poll_votes", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull(),
  userId: text("user_id").notNull(),
  optionId: text("option_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
