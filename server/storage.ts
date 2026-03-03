import { db } from "./db";
import { 
  users, approvals, surveys, surveyResponses, projects, events, posts,
  channels, channelMessages, channelMembers, approvalRoutes, notifications, portfolios,
  calendarSettings, monthlyPlanCells, messageReads, userSettings, channelMemberSettings,
  schools, userOrganizations,
  type User, type UpsertUser,
  type Approval, type InsertApproval,
  type Survey, type InsertSurvey,
  type Project, type InsertProject,
  type CalendarEvent, type InsertEvent,
  type Post, type InsertPost,
  type Channel, type ChannelMessage, type ChannelMember,
  type ApprovalRoute, type InsertApprovalRoute,
  type Notification, type InsertNotification,
  type Portfolio, type InsertPortfolio,
  type CalendarSetting, type InsertCalendarSetting,
  type MonthlyPlanCell, type InsertMonthlyPlanCell,
  type MessageRead,
  type UserSettings, type InsertUserSettings,
  type School, type InsertSchool
} from "@shared/schema";
import { eq, desc, and, gte, lte, sql, ne, gt, lt, asc } from "drizzle-orm";

export interface IStorage {
  // Schools
  getSchools(): Promise<School[]>;
  createSchool(name: string, opts?: { type?: string; country?: string; language?: string }): Promise<School>;
  getSchool(id: number): Promise<School | undefined>;
  updateSchoolSettings(id: number, settings: any): Promise<School>;
  updateSchool(id: number, data: any): Promise<School>;

  // User Organizations
  getUserOrganizations(userId: string): Promise<any[]>;
  addUserToOrganization(userId: string, orgId: number, role?: string, isApproved?: boolean): Promise<any>;
  setUserPrimaryOrg(userId: string, orgId: number): Promise<void>;

  // Users (Admin management)
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(schoolId?: number): Promise<User[]>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<void>;
  createUser(user: any): Promise<User>;
  
  // Approval Routes (결재 라인)
  getApprovalRoutes(schoolId?: number): Promise<ApprovalRoute[]>;
  createApprovalRoute(route: InsertApprovalRoute): Promise<ApprovalRoute>;
  updateApprovalRoute(id: number, data: Partial<InsertApprovalRoute>): Promise<ApprovalRoute>;
  deleteApprovalRoute(id: number): Promise<void>;
  getApprovalRoutesByType(type: string, schoolId?: number): Promise<ApprovalRoute[]>;
  
  // Approvals
  getApprovals(userId?: string, schoolId?: number): Promise<Approval[]>;
  getApproval(id: number): Promise<Approval | undefined>;
  createApproval(approval: InsertApproval): Promise<Approval>;
  updateApprovalStatus(id: number, status: string, feedback?: string, approverId?: string): Promise<Approval>;

  // Surveys
  getSurveys(schoolId?: number): Promise<Survey[]>;
  createSurvey(survey: InsertSurvey): Promise<Survey>;
  getSurvey(id: number): Promise<Survey | undefined>;

  // Projects
  createProject(project: InsertProject): Promise<Project>;

  // Events
  getEvents(schoolId?: number): Promise<CalendarEvent[]>;
  createEvent(event: InsertEvent): Promise<CalendarEvent>;
  updateEvent(id: number, event: Partial<InsertEvent>): Promise<CalendarEvent>;
  deleteEvent(id: number): Promise<void>;

  // Posts
  getPosts(schoolId?: number): Promise<Post[]>;
  createPost(post: InsertPost): Promise<Post>;

  // Chat
  getChannels(schoolId?: number): Promise<Channel[]>;
  createChannel(name: string, type: string, schoolId?: number): Promise<Channel>;
  getChannelMessages(channelId: number): Promise<ChannelMessage[]>;
  createChannelMessage(channelId: number, senderId: string, content: string, parentId?: number, metadata?: any): Promise<ChannelMessage>;
  joinChannel(channelId: number, userId: string, role?: string): Promise<void>;
  addReaction(messageId: number, emoji: string, userId: string): Promise<void>;
  recallMessage(messageId: number): Promise<void>;
  updateMessageMetadata(messageId: number, metadata: any): Promise<void>;
  updateMessageReactions(messageId: number, reactions: any): Promise<void>;
  
  // Notifications
  getNotifications(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: number): Promise<void>;
  getUsersByRole(role: string, schoolId?: number): Promise<User[]>;
  
  // Portfolio
  getPortfolios(studentId: string, schoolId?: number): Promise<Portfolio[]>;
  createPortfolio(portfolio: InsertPortfolio): Promise<Portfolio>;
  updatePortfolio(id: number, data: Partial<InsertPortfolio>): Promise<Portfolio>;
  deletePortfolio(id: number): Promise<void>;
  
  // Calendar Settings
  getCalendarSettings(): Promise<CalendarSetting[]>;
  getCalendarSettingByType(type: string): Promise<CalendarSetting | undefined>;
  upsertCalendarSetting(setting: InsertCalendarSetting): Promise<CalendarSetting>;
  updateEventGoogleId(eventId: number, googleEventId: string): Promise<void>;
  
  // Monthly Plan (월중계획)
  getMonthlyPlanCells(year: number, month: number, schoolId?: number): Promise<MonthlyPlanCell[]>;
  upsertMonthlyPlanCell(cell: InsertMonthlyPlanCell): Promise<MonthlyPlanCell>;
  getEventsForMonth(year: number, month: number, schoolId?: number): Promise<CalendarEvent[]>;

  deleteSchool(id: number): Promise<void>;

  // Advanced Chat Features
  getChannelsWithPinStatus(userId: string, schoolId?: number): Promise<(Channel & { memberCount: number; isPinned: boolean; isMuted: boolean; unreadCount: number })[]>;
  updateMemberMuteStatus(channelId: number, userId: string, isMuted: boolean): Promise<void>;
  getChannelFiles(channelId: number): Promise<{ name: string; url: string; type: string; createdAt: Date }[]>;
  updateLastReadMessage(channelId: number, userId: string, messageId: number): Promise<void>;
  getOrCreateDirectChannel(user1Id: string, user2Id: string, schoolId?: number): Promise<Channel>;
}

export class DatabaseStorage implements IStorage {
  // Schools
  async getSchools(): Promise<School[]> {
    return db.select().from(schools);
  }

  async createSchool(name: string, opts?: { type?: string; country?: string; language?: string }): Promise<School> {
    const [school] = await db.insert(schools).values({ 
      name,
      type: opts?.type || 'school',
      country: opts?.country || 'KR',
      language: opts?.language || 'ko',
    }).returning();
    return school;
  }

  async getSchool(id: number): Promise<School | undefined> {
    const [school] = await db.select().from(schools).where(eq(schools.id, id));
    return school;
  }

  async updateSchoolSettings(id: number, settings: any): Promise<School> {
    const [updated] = await db.update(schools)
      .set({ settings })
      .where(eq(schools.id, id))
      .returning();
    return updated;
  }

  async updateSchool(id: number, data: any): Promise<School> {
    const [updated] = await db.update(schools).set(data).where(eq(schools.id, id)).returning();
    return updated;
  }

  // User Organizations
  async getUserOrganizations(userId: string): Promise<any[]> {
    const rows = await db.select({
      id: userOrganizations.id,
      userId: userOrganizations.userId,
      organizationId: userOrganizations.organizationId,
      role: userOrganizations.role,
      isApproved: userOrganizations.isApproved,
      isPrimary: userOrganizations.isPrimary,
      joinedAt: userOrganizations.joinedAt,
      orgName: schools.name,
      orgType: schools.type,
      orgCountry: schools.country,
    })
    .from(userOrganizations)
    .innerJoin(schools, eq(userOrganizations.organizationId, schools.id))
    .where(eq(userOrganizations.userId, userId));
    return rows;
  }

  async addUserToOrganization(userId: string, orgId: number, role: string = 'member', isApproved: boolean = false): Promise<any> {
    const [row] = await db.insert(userOrganizations)
      .values({ userId, organizationId: orgId, role, isApproved })
      .onConflictDoNothing()
      .returning();
    return row;
  }

  async setUserPrimaryOrg(userId: string, orgId: number): Promise<void> {
    // 전부 false로
    await db.update(userOrganizations)
      .set({ isPrimary: false })
      .where(eq(userOrganizations.userId, userId));
    // 해당 조직만 true
    await db.update(userOrganizations)
      .set({ isPrimary: true })
      .where(and(eq(userOrganizations.userId, userId), eq(userOrganizations.organizationId, orgId)));
  }

  async deleteSchool(id: number): Promise<void> {
    // 순수 raw SQL — 실제 DB 컬럼 기준으로 순서대로 삭제
    // FK NO ACTION 테이블 먼저
    await db.execute(sql`DELETE FROM org_invite_qr WHERE organization_id = ${id}`);
    await db.execute(sql`DELETE FROM document_types WHERE school_id = ${id}`);

    // 채널 하위 테이블들
    await db.execute(sql`
      DELETE FROM message_reads WHERE message_id IN (
        SELECT cm.id FROM channel_messages cm
        JOIN channels c ON cm.channel_id = c.id
        WHERE c.school_id = ${id}
      )
    `);
    await db.execute(sql`
      DELETE FROM channel_member_settings WHERE channel_id IN (SELECT id FROM channels WHERE school_id = ${id})
    `);
    await db.execute(sql`
      DELETE FROM poll_votes WHERE poll_id IN (
        SELECT p.id FROM polls p
        JOIN channels c ON p.channel_id = c.id
        WHERE c.school_id = ${id}
      )
    `);
    await db.execute(sql`
      DELETE FROM polls WHERE channel_id IN (SELECT id FROM channels WHERE school_id = ${id})
    `);
    await db.execute(sql`
      DELETE FROM channel_members WHERE channel_id IN (SELECT id FROM channels WHERE school_id = ${id})
    `);
    await db.execute(sql`
      DELETE FROM channel_messages WHERE channel_id IN (SELECT id FROM channels WHERE school_id = ${id})
    `);
    await db.execute(sql`DELETE FROM channels WHERE school_id = ${id}`);

    // 설문 응답 → 설문
    await db.execute(sql`
      DELETE FROM survey_responses WHERE survey_id IN (SELECT id FROM surveys WHERE school_id = ${id})
    `);
    await db.execute(sql`DELETE FROM surveys WHERE school_id = ${id}`);

    // 결재 라우트 → 결재
    await db.execute(sql`DELETE FROM approval_routes WHERE school_id = ${id}`);
    await db.execute(sql`DELETE FROM approvals WHERE school_id = ${id}`);

    // 나머지 school_id 참조 테이블
    await db.execute(sql`DELETE FROM events WHERE school_id = ${id}`);
    await db.execute(sql`DELETE FROM posts WHERE school_id = ${id}`);
    await db.execute(sql`DELETE FROM portfolios WHERE school_id = ${id}`);
    await db.execute(sql`DELETE FROM projects WHERE school_id = ${id}`);
    await db.execute(sql`DELETE FROM monthly_plan_cells WHERE school_id = ${id}`);

    // 조직 구성원(user_organizations)에서 이 조직 소속 레코드 삭제
    await db.execute(sql`DELETE FROM user_organizations WHERE organization_id = ${id}`);

    // 유저 하위 테이블 → 유저 (school_id로 직접 소속된 유저들)
    await db.execute(sql`
      DELETE FROM user_settings WHERE user_id IN (SELECT id FROM users WHERE school_id = ${id})
    `);
    await db.execute(sql`
      DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE school_id = ${id})
    `);
    await db.execute(sql`
      DELETE FROM user_organizations WHERE user_id IN (SELECT id FROM users WHERE school_id = ${id})
    `);
    // economy 스키마 — 유저의 지갑/권한 삭제
    await db.execute(sql`
      DELETE FROM economy.wallets WHERE user_id IN (SELECT id::text FROM users WHERE school_id = ${id})
    `);
    await db.execute(sql`
      DELETE FROM economy.coin_roles WHERE user_id IN (SELECT id::text FROM users WHERE school_id = ${id})
    `);
    // economy 스키마 — 조직 자체의 코인 역할/자산 삭제
    await db.execute(sql`DELETE FROM economy.coin_roles WHERE organization_id = ${id}`);
    await db.execute(sql`DELETE FROM economy.asset_types WHERE organization_id = ${id}`);

    await db.execute(sql`DELETE FROM users WHERE school_id = ${id}`);

    // 최종: 조직 삭제
    await db.execute(sql`DELETE FROM schools WHERE id = ${id}`);
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getAllUsers(schoolId?: number): Promise<User[]> {
    if (schoolId) {
      return db.select().from(users).where(eq(users.schoolId, schoolId)).orderBy(desc(users.createdAt));
    }
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const [updated] = await db.update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async createUser(userData: any): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }

  // Approval Routes (결재 라인)
  async getApprovalRoutes(schoolId?: number): Promise<ApprovalRoute[]> {
    let query = db.select().from(approvalRoutes);
    if (schoolId) query.where(eq(approvalRoutes.schoolId, schoolId));
    return query.orderBy(approvalRoutes.approvalType, approvalRoutes.stepOrder);
  }

  async createApprovalRoute(route: InsertApprovalRoute): Promise<ApprovalRoute> {
    const [newRoute] = await db.insert(approvalRoutes).values(route).returning();
    return newRoute;
  }

  async updateApprovalRoute(id: number, data: Partial<InsertApprovalRoute>): Promise<ApprovalRoute> {
    const [updated] = await db.update(approvalRoutes)
      .set(data)
      .where(eq(approvalRoutes.id, id))
      .returning();
    return updated;
  }

  async deleteApprovalRoute(id: number): Promise<void> {
    await db.delete(approvalRoutes).where(eq(approvalRoutes.id, id));
  }

  async getApprovalRoutesByType(type: string, schoolId?: number): Promise<ApprovalRoute[]> {
    const conditions = [eq(approvalRoutes.approvalType, type)];
    if (schoolId) conditions.push(eq(approvalRoutes.schoolId, schoolId));
    return db.select().from(approvalRoutes).where(and(...conditions)).orderBy(approvalRoutes.stepOrder);
  }

  async getApproval(id: number): Promise<Approval | undefined> {
    const [approval] = await db.select().from(approvals).where(eq(approvals.id, id));
    return approval;
  }

    async getApprovals(userId?: string, schoolId?: number): Promise<Approval[]> {
    let query = db.select().from(approvals);
    const conditions = [];
    if (userId) conditions.push(eq(approvals.requesterId, userId));
    if (schoolId) conditions.push(eq(approvals.schoolId, schoolId));
    
    if (conditions.length > 0) {
      return query.where(and(...conditions)).orderBy(desc(approvals.createdAt));
    }
    return query.orderBy(desc(approvals.createdAt));
  }

  async createApproval(approval: InsertApproval): Promise<Approval> {
    const [newApproval] = await db.insert(approvals).values(approval).returning();
    return newApproval;
  }

  async updateApprovalStatus(id: number, status: string, feedback?: string, approverId?: string): Promise<Approval> {
    const [updated] = await db.update(approvals)
      .set({ status: status as any, feedback, approverId })
      .where(eq(approvals.id, id))
      .returning();
    return updated;
  }

  async getSurveys(schoolId?: number): Promise<Survey[]> {
    if (schoolId) {
      return db.select().from(surveys).where(eq(surveys.schoolId, schoolId)).orderBy(desc(surveys.createdAt));
    }
    return db.select().from(surveys).orderBy(desc(surveys.createdAt));
  }

  async createSurvey(survey: InsertSurvey): Promise<Survey> {
    const [newSurvey] = await db.insert(surveys).values(survey).returning();
    return newSurvey;
  }

  async getSurvey(id: number): Promise<Survey | undefined> {
    const [survey] = await db.select().from(surveys).where(eq(surveys.id, id));
    return survey;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [newProject] = await db.insert(projects).values(project).returning();
    return newProject;
  }

  async getEvents(schoolId?: number): Promise<CalendarEvent[]> {
    if (schoolId) {
      return db.select().from(events).where(eq(events.schoolId, schoolId)).orderBy(events.startTime);
    }
    return db.select().from(events).orderBy(events.startTime);
  }

  async createEvent(event: InsertEvent): Promise<CalendarEvent> {
    const [newEvent] = await db.insert(events).values(event).returning();
    return newEvent;
  }

  async updateEvent(id: number, event: Partial<InsertEvent>): Promise<CalendarEvent> {
    const [updated] = await db.update(events).set(event).where(eq(events.id, id)).returning();
    return updated;
  }

  async deleteEvent(id: number): Promise<void> {
    await db.delete(events).where(eq(events.id, id));
  }

  async getPosts(schoolId?: number): Promise<Post[]> {
    if (schoolId) {
      return db.select().from(posts).where(eq(posts.schoolId, schoolId)).orderBy(desc(posts.createdAt));
    }
    return db.select().from(posts).orderBy(desc(posts.createdAt));
  }

  async createPost(post: InsertPost): Promise<Post> {
    const [newPost] = await db.insert(posts).values(post).returning();
    return newPost;
  }

  async getChannels(schoolId?: number): Promise<Channel[]> {
    if (schoolId) {
      return db.select().from(channels).where(eq(channels.schoolId, schoolId));
    }
    return db.select().from(channels);
  }

  async createChannel(name: string, type: string, schoolId?: number): Promise<Channel> {
    const [channel] = await db.insert(channels).values({ name, type, schoolId }).returning();
    return channel;
  }

  async getChannelMessages(channelId: number): Promise<ChannelMessage[]> {
    return db.select().from(channelMessages).where(eq(channelMessages.channelId, channelId)).orderBy(channelMessages.createdAt);
  }

  async createChannelMessage(channelId: number, senderId: string, content: string, parentId?: number, metadata?: any): Promise<ChannelMessage> {
    const [msg] = await db.insert(channelMessages).values({ channelId, senderId, content, parentId, metadata }).returning();
    return msg;
  }

  async joinChannel(channelId: number, userId: string, role: string = "member"): Promise<void> {
    await db.insert(channelMembers).values({ channelId, userId, role }).onConflictDoNothing();
  }

  async addReaction(messageId: number, emoji: string, userId: string): Promise<void> {
    const [message] = await db.select().from(channelMessages).where(eq(channelMessages.id, messageId));
    if (!message) return;

    const reactions = (message.reactions as Record<string, string[]>) || {};
    if (!reactions[emoji]) reactions[emoji] = [];
    if (!reactions[emoji].includes(userId)) {
      reactions[emoji].push(userId);
    } else {
      reactions[emoji] = reactions[emoji].filter(id => id !== userId);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    }

    await db.update(channelMessages).set({ reactions }).where(eq(channelMessages.id, messageId));
  }
  
  async recallMessage(messageId: number): Promise<void> {
    await db.update(channelMessages).set({ isRecalled: true, content: "삭제된 메시지입니다." }).where(eq(channelMessages.id, messageId));
  }

  async updateMessageMetadata(messageId: number, metadata: any): Promise<void> {
    const [message] = await db.select().from(channelMessages).where(eq(channelMessages.id, messageId));
    if (!message) return;
    const newMetadata = { ...(message.metadata as any || {}), ...metadata };
    await db.update(channelMessages).set({ metadata: newMetadata }).where(eq(channelMessages.id, messageId));
  }

  async updateMessageReactions(messageId: number, reactions: any): Promise<void> {
    await db.update(channelMessages).set({ reactions }).where(eq(channelMessages.id, messageId));
  }

  // Notifications
  async getNotifications(userId: string): Promise<Notification[]> {
    return db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }
  
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db.insert(notifications).values(notification).returning();
    return newNotification;
  }
  
  async markNotificationRead(id: number): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
  }
  
  async getUsersByRole(role: string, schoolId?: number): Promise<User[]> {
    if (schoolId) {
      return db.select().from(users).where(and(eq(users.role, role), eq(users.schoolId, schoolId)));
    }
    return db.select().from(users).where(eq(users.role, role));
  }
  
  // Portfolio
  async getPortfolios(studentId: string, schoolId?: number): Promise<Portfolio[]> {
    let query = db.select().from(portfolios);
    const conditions = [eq(portfolios.studentId, studentId)];
    if (schoolId) conditions.push(eq(portfolios.schoolId, schoolId));
    
    return query.where(and(...conditions)).orderBy(desc(portfolios.createdAt));
  }
  
  async createPortfolio(portfolio: InsertPortfolio): Promise<Portfolio> {
    const [newPortfolio] = await db.insert(portfolios).values(portfolio).returning();
    return newPortfolio;
  }
  
  async updatePortfolio(id: number, data: Partial<InsertPortfolio>): Promise<Portfolio> {
    const [updated] = await db.update(portfolios).set(data).where(eq(portfolios.id, id)).returning();
    return updated;
  }
  
  async deletePortfolio(id: number): Promise<void> {
    await db.delete(portfolios).where(eq(portfolios.id, id));
  }
  
  // Calendar Settings
  async getCalendarSettings(): Promise<CalendarSetting[]> {
    return db.select().from(calendarSettings);
  }
  
  async getCalendarSettingByType(type: string): Promise<CalendarSetting | undefined> {
    const [setting] = await db.select().from(calendarSettings).where(eq(calendarSettings.type, type));
    return setting;
  }
  
  async upsertCalendarSetting(setting: InsertCalendarSetting): Promise<CalendarSetting> {
    const existing = await this.getCalendarSettingByType(setting.type);
    if (existing) {
      const [updated] = await db.update(calendarSettings)
        .set({ ...setting, updatedAt: new Date() })
        .where(eq(calendarSettings.id, existing.id))
        .returning();
      return updated;
    }
    const [newSetting] = await db.insert(calendarSettings).values(setting).returning();
    return newSetting;
  }
  
  async updateEventGoogleId(eventId: number, googleEventId: string): Promise<void> {
    await db.update(events).set({ googleEventId }).where(eq(events.id, eventId));
  }
  
  // Monthly Plan (월중계획)
  async getMonthlyPlanCells(year: number, month: number, schoolId?: number): Promise<MonthlyPlanCell[]> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    
    let query = db.select().from(monthlyPlanCells);
    const conditions = [
      gte(monthlyPlanCells.date, startDate),
      lte(monthlyPlanCells.date, endDate)
    ];
    if (schoolId) conditions.push(eq(monthlyPlanCells.schoolId, schoolId));
    
    return query.where(and(...conditions));
  }
  
  async upsertMonthlyPlanCell(cell: InsertMonthlyPlanCell): Promise<MonthlyPlanCell> {
    const conditions = [
      eq(monthlyPlanCells.date, cell.date),
      eq(monthlyPlanCells.columnType, cell.columnType)
    ];
    if (cell.schoolId) conditions.push(eq(monthlyPlanCells.schoolId, cell.schoolId));

    const [existing] = await db.select().from(monthlyPlanCells)
      .where(and(...conditions));
    
    if (existing) {
      const [updated] = await db.update(monthlyPlanCells)
        .set({ content: cell.content, updatedBy: cell.updatedBy, updatedAt: new Date() })
        .where(eq(monthlyPlanCells.id, existing.id))
        .returning();
      return updated;
    }
    
    const [newCell] = await db.insert(monthlyPlanCells).values(cell).returning();
    return newCell;
  }
  
  async getEventsForMonth(year: number, month: number, schoolId?: number): Promise<CalendarEvent[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    const conditions = [
      gte(events.startTime, startDate),
      lte(events.startTime, endDate)
    ];
    if (schoolId) conditions.push(eq(events.schoolId, schoolId));
    
    return db.select().from(events)
      .where(and(...conditions))
      .orderBy(events.startTime);
  }
  
  // Message Read Receipts
  async markMessageRead(messageId: number, userId: string): Promise<void> {
    const [existing] = await db.select().from(messageReads)
      .where(and(
        eq(messageReads.messageId, messageId),
        eq(messageReads.userId, userId)
      ));
    if (!existing) {
      await db.insert(messageReads).values({ messageId, userId });
    }
  }
  
  async markChannelMessagesRead(channelId: number, userId: string): Promise<void> {
    const msgs = await db.select().from(channelMessages).where(eq(channelMessages.channelId, channelId));
    for (const msg of msgs) {
      await this.markMessageRead(msg.id, userId);
    }
    // Also update member settings last read
    if (msgs.length > 0) {
      const maxId = Math.max(...msgs.map(m => m.id));
      await this.updateLastReadMessage(channelId, userId, maxId);
    }
  }
  
  async getMessageReads(messageId: number): Promise<MessageRead[]> {
    return db.select().from(messageReads).where(eq(messageReads.messageId, messageId));
  }
  
  async getMessageReadCount(messageId: number): Promise<number> {
    const reads = await db.select().from(messageReads).where(eq(messageReads.messageId, messageId));
    return reads.length;
  }
  
  async getMessagesWithReadCounts(channelId: number, options?: { limit?: number; before?: number }): Promise<(ChannelMessage & { readCount: number; readBy: string[] })[]> {
    const limit = options?.limit || 10;
    const conditions = [eq(channelMessages.channelId, channelId)];
    if (options?.before) {
      conditions.push(lt(channelMessages.id, options.before));
    }
    
    const msgs = await db.select()
      .from(channelMessages)
      .where(and(...conditions))
      .orderBy(desc(channelMessages.id))
      .limit(limit);
    
    if (msgs.length === 0) return [];
    
    // 채널 멤버 수 조회
    const memberCount = await this.getChannelMemberCount(channelId);
    
    // 한번에 모든 메시지의 읽음 수만 조회 (readBy 리스트는 전송하지 않음)
    const msgIds = msgs.map(m => m.id);
    const readCounts = await db.select({
      messageId: messageReads.messageId,
      count: sql<number>`count(*)::int`
    })
      .from(messageReads)
      .where(sql`${messageReads.messageId} IN (${sql.join(msgIds.map(id => sql`${id}`), sql`, `)})`)
      .groupBy(messageReads.messageId);
    
    const countMap = new Map<number, number>();
    for (const r of readCounts) {
      countMap.set(r.messageId, r.count);
    }
    
    // 시간 순 정렬 (오래된 것 위로)
    // unreadCount = 멤버수 - 읽은 수 (카카오톡 스타일)
    return msgs.reverse().map(msg => ({
      ...msg,
      readCount: countMap.get(msg.id) || 0,
      unreadCount: Math.max(0, memberCount - (countMap.get(msg.id) || 0)),
      readBy: [] // 빈 배열 (필요 시 별도 API로 조회)
    }));
  }
  
  // readBy 상세 조회 (별도 API)
  async getMessageReadBy(messageId: number): Promise<string[]> {
    const reads = await db.select().from(messageReads).where(eq(messageReads.messageId, messageId));
    return reads.map(r => r.userId);
  }
  
  // Channel Members
  async getChannelMemberCount(channelId: number): Promise<number> {
    const members = await db.select().from(channelMembers).where(eq(channelMembers.channelId, channelId));
    return members.length;
  }
  
  async getChannelMembers(channelId: number): Promise<ChannelMember[]> {
    return db.select().from(channelMembers).where(eq(channelMembers.channelId, channelId));
  }
  
  async getChannelsWithMemberCounts(schoolId?: number): Promise<(Channel & { memberCount: number })[]> {
    let query = db.select().from(channels);
    if (schoolId) query.where(eq(channels.schoolId, schoolId));
    
    const allChannels = await query;
    const result = [];
    for (const channel of allChannels) {
      const memberCount = await this.getChannelMemberCount(channel.id);
      result.push({ ...channel, memberCount });
    }
    return result;
  }
  
  // User Settings (개인 설정)
  async getUserSettings(userId: string): Promise<UserSettings | undefined> {
    const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    return settings;
  }
  
  async upsertUserSettings(settings: InsertUserSettings): Promise<UserSettings> {
    const existing = await this.getUserSettings(settings.userId);
    if (existing) {
      const [updated] = await db.update(userSettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(userSettings.userId, settings.userId))
        .returning();
      return updated;
    }
    const [newSettings] = await db.insert(userSettings).values(settings).returning();
    return newSettings;
  }
  
  // Channel Management
  async updateChannel(channelId: number, data: { name?: string; profileImageUrl?: string }): Promise<Channel> {
    const [updated] = await db.update(channels).set(data).where(eq(channels.id, channelId)).returning();
    return updated;
  }
  
  async renameChannel(channelId: number, name: string): Promise<void> {
    await db.update(channels).set({ name }).where(eq(channels.id, channelId));
  }

  async deleteChannel(channelId: number): Promise<void> {
    await db.delete(channelMessages).where(eq(channelMessages.channelId, channelId));
    await db.delete(channelMembers).where(eq(channelMembers.channelId, channelId));
    await db.delete(channelMemberSettings).where(eq(channelMemberSettings.channelId, channelId));
    await db.delete(channels).where(eq(channels.id, channelId));
  }
  
  async leaveChannel(channelId: number, userId: string): Promise<void> {
    await db.delete(channelMembers).where(
      and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId))
    );
    await db.delete(channelMemberSettings).where(
      and(eq(channelMemberSettings.channelId, channelId), eq(channelMemberSettings.userId, userId))
    );
  }
  
  async removeMemberFromChannel(channelId: number, userId: string): Promise<void> {
    await this.leaveChannel(channelId, userId);
  }
  
  async getChannelMemberRole(channelId: number, userId: string): Promise<string | undefined> {
    const [member] = await db.select().from(channelMembers).where(
      and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId))
    );
    return member?.role || undefined;
  }

  async updateMemberRole(channelId: number, userId: string, role: string): Promise<void> {
    await db.update(channelMembers)
      .set({ role })
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)));
  }
  
  // Advanced Features Implementation
  async pinChannel(channelId: number, userId: string): Promise<void> {
    const [existing] = await db.select().from(channelMemberSettings).where(
      and(eq(channelMemberSettings.channelId, channelId), eq(channelMemberSettings.userId, userId))
    );
    if (existing) {
      await db.update(channelMemberSettings)
        .set({ isPinned: true, updatedAt: new Date() })
        .where(eq(channelMemberSettings.id, existing.id));
    } else {
      await db.insert(channelMemberSettings).values({ channelId, userId, isPinned: true });
    }
  }
  
  async unpinChannel(channelId: number, userId: string): Promise<void> {
    await db.update(channelMemberSettings)
      .set({ isPinned: false, updatedAt: new Date() })
      .where(and(eq(channelMemberSettings.channelId, channelId), eq(channelMemberSettings.userId, userId)));
  }

  async updateMemberMuteStatus(channelId: number, userId: string, isMuted: boolean): Promise<void> {
    const [existing] = await db.select().from(channelMemberSettings).where(
      and(eq(channelMemberSettings.channelId, channelId), eq(channelMemberSettings.userId, userId))
    );
    if (existing) {
      await db.update(channelMemberSettings)
        .set({ isMuted, updatedAt: new Date() })
        .where(eq(channelMemberSettings.id, existing.id));
    } else {
      await db.insert(channelMemberSettings).values({ channelId, userId, isMuted });
    }
  }

  async updateLastReadMessage(channelId: number, userId: string, messageId: number): Promise<void> {
    const [existing] = await db.select().from(channelMemberSettings).where(
      and(eq(channelMemberSettings.channelId, channelId), eq(channelMemberSettings.userId, userId))
    );
    if (existing) {
      await db.update(channelMemberSettings)
        .set({ lastReadMessageId: messageId, updatedAt: new Date() })
        .where(eq(channelMemberSettings.id, existing.id));
    } else {
      await db.insert(channelMemberSettings).values({ channelId, userId, lastReadMessageId: messageId });
    }
  }

  async getChannelFiles(channelId: number): Promise<{ name: string; url: string; type: string; createdAt: Date }[]> {
    const msgs = await db.select().from(channelMessages).where(and(eq(channelMessages.channelId, channelId), ne(channelMessages.isRecalled, true)));
    const files: any[] = [];
    for (const msg of msgs) {
      const metadata = msg.metadata as any;
      if (metadata?.files) {
        metadata.files.forEach((f: any) => files.push({ ...f, createdAt: msg.createdAt }));
      }
    }
    return files;
  }
  
  async getChannelPinStatus(channelId: number, userId: string): Promise<boolean> {
    const [settings] = await db.select().from(channelMemberSettings).where(
      and(eq(channelMemberSettings.channelId, channelId), eq(channelMemberSettings.userId, userId))
    );
    return settings?.isPinned || false;
  }
  
  async getChannelsWithPinStatus(userId: string, schoolId?: number): Promise<(Channel & { memberCount: number; isPinned: boolean; isMuted: boolean; unreadCount: number })[]> {
    // 사용자가 멤버인 채널만 조회
    const userMemberships = await db.select().from(channelMembers).where(eq(channelMembers.userId, userId));
    const userChannelIds = new Set(userMemberships.map(m => m.channelId));
    
    let query = db.select().from(channels);
    if (schoolId) query.where(eq(channels.schoolId, schoolId));
    
    const allChannels = await query;
    const result = [];
    for (const channel of allChannels) {
      // 사용자가 멤버가 아닌 채널은 건너뛰기
      if (!userChannelIds.has(channel.id)) continue;
      
      const memberCount = await this.getChannelMemberCount(channel.id);
      const [settings] = await db.select().from(channelMemberSettings).where(
        and(eq(channelMemberSettings.channelId, channel.id), eq(channelMemberSettings.userId, userId))
      );
      
      const lastReadId = settings?.lastReadMessageId || 0;
      const [unread] = await db.select({ count: sql<number>`count(*)` })
        .from(channelMessages)
        .where(and(eq(channelMessages.channelId, channel.id), gt(channelMessages.id, lastReadId)));

      // 최근 메시지
      const [lastMsg] = await db.select().from(channelMessages)
        .where(eq(channelMessages.channelId, channel.id))
        .orderBy(desc(channelMessages.createdAt))
        .limit(1);

      result.push({ 
        ...channel, 
        memberCount, 
        isPinned: settings?.isPinned || false, 
        isMuted: settings?.isMuted || false,
        unreadCount: Number(unread.count),
        lastMessage: lastMsg ? { content: lastMsg.content, senderId: lastMsg.senderId, createdAt: lastMsg.createdAt } : null,
      });
    }
    return result.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return a.id - b.id;
    });
  }

  async getOrCreateDirectChannel(user1Id: string, user2Id: string, schoolId?: number): Promise<Channel> {
    // Find a 'dm' type channel where both users are members
    const user1Channels = await db.select().from(channelMembers).where(eq(channelMembers.userId, user1Id));
    const user1ChannelIds = user1Channels.map(m => m.channelId);

    const commonChannels = await db.select()
      .from(channels)
      .innerJoin(channelMembers, eq(channels.id, channelMembers.channelId))
      .where(and(
        eq(channels.type, "dm"),
        eq(channelMembers.userId, user2Id),
        sql`${channels.id} IN ${user1ChannelIds}`
      ));

    if (commonChannels.length > 0) {
      return commonChannels[0].channels;
    }

    // Create new DM channel
    const [newChannel] = await db.insert(channels).values({
      name: `DM-${user1Id}-${user2Id}`,
      type: "dm",
      schoolId
    }).returning();

    await db.insert(channelMembers).values([
      { channelId: newChannel.id, userId: user1Id, role: "member" },
      { channelId: newChannel.id, userId: user2Id, role: "member" }
    ]);

    return newChannel;
  }
}

export const storage = new DatabaseStorage();
