import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar, serial, text, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User roles expanded
// 교사, 교감, 교장, 학생, 학부모, 교직원, 외부, 관리자, 최고관리자
export const userRoles = ["teacher", "vice_principal", "principal", "student", "parent", "staff", "external", "admin", "super_admin"] as const;
export type UserRole = typeof userRoles[number];

// Role groups for login
export const schoolRoles = ["teacher", "vice_principal", "principal", "staff", "admin", "super_admin"] as const; // 학교 그룹
export const studentRoles = ["student"] as const; // 학생 그룹  
export const parentRoles = ["parent"] as const; // 학부모 그룹

// Approver roles (can approve documents)
export const approverRoles = ["vice_principal", "principal"] as const;

// Admin roles (can access admin settings)
export const adminRoles = ["admin", "super_admin"] as const;

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  schoolId: integer("school_id"),
  username: varchar("username").unique(),
  password: varchar("password"),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  role: varchar("role").default("teacher"),
  department: varchar("department"), // 부서 (예: 5학년, 교무부)
  position: varchar("position"), // 직책 (예: 담임, 부장)
  profileImageUrl: varchar("profile_image_url"),
  isDesktopOnline: boolean("is_desktop_online").default(false),
  lastDesktopActiveAt: timestamp("last_desktop_active_at"),
  phone: varchar("phone"),
  signatureUrl: varchar("signature_url"), // 전자 서명 이미지 URL
  isApproved: boolean("is_approved").default(false), // 가입 승인 여부
  isDeleted: boolean("is_deleted").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Approval Routes (결재 라인 설정)
// Defines which roles/users must approve specific approval types
export const approvalRoutes = pgTable("approval_routes", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id"),
  approvalType: text("approval_type").notNull(), // field_trip, absence, transfer, report
  stepOrder: serial("step_order").notNull(), // 1, 2, 3... (순서)
  approverRole: varchar("approver_role"), // Role-based: vice_principal, admin
  approverId: varchar("approver_id"), // Specific user ID (optional)
  isActive: varchar("is_active").default("true"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertApprovalRouteSchema = createInsertSchema(approvalRoutes).omit({ id: true, createdAt: true });
export type ApprovalRoute = typeof approvalRoutes.$inferSelect;
export type InsertApprovalRoute = z.infer<typeof insertApprovalRouteSchema>;
