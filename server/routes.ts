import type { Express } from "express";
import { createServer, type Server } from "http";
import fundingRouter from "./funding/routes";
import publicEconomyRouter from "./economy/public-api";
import exchangeRouter from "./economy/exchange";
import coinLaunchRouter from "./economy/launch";
import { storage } from "./storage";
import { db } from "./db";
import { polls, pollVotes, channels, channelMessages } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { api } from "@shared/routes";
import { generateApprovalPDF } from "./pdf-service";
import { neisService } from "./neis-service";
import { z } from "zod";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerImageRoutes } from "./replit_integrations/image"; // We might use this or use client
import { openai } from "./replit_integrations/image/client"; // Use shared openai client
import { hashPassword, comparePasswords } from "./auth-utils";
import { updateHeartbeat, getAllOnlineStatus, getUserOnlineStatus } from "./heartbeat";
import multer from "multer";
import fs from "fs";
import path from "path";
import ical from "ical.js";
import { google } from "googleapis";

// Setup multer for file storage
const storageDir = "client/public/uploads";
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, storageDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: fileStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Setup Auth
  await setupAuth(app);
  registerAuthRoutes(app);

  // === 펀딩 API ===
  app.use("/api/funding", fundingRouter);
  app.use("/api/public", publicEconomyRouter);
  app.use("/api/economy/exchange", exchangeRouter);
  app.use("/api/economy/launch", coinLaunchRouter);

  // === Email & SMS verification (mock implementation) ===
  // In-memory stores for verification codes. For production use Redis or DB.
  const emailCodes: Map<string, { code: string; expiresAt: number }> = new Map();
  const smsCodes: Map<string, { code: string; expiresAt: number }> = new Map();
  const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

  // Send email code (mock: prints code to console)
  app.post('/api/auth/send-email-code', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== 'string') return res.status(400).json({ message: '유효한 이메일이 필요합니다' });
      const code = generateCode();
      emailCodes.set(email, { code, expiresAt: Date.now() + CODE_TTL_MS });
      console.log(`[MOCK EMAIL] Verification code for ${email}: ${code}`);
      // In production, integrate with SendGrid/Postmark/etc.
      res.json({ success: true });
    } catch (err) {
      console.error('send-email-code error', err);
      res.status(500).json({ message: '이메일 전송 실패' });
    }
  });

  app.post('/api/auth/verify-email-code', async (req, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) return res.status(400).json({ message: '이메일과 코드가 필요합니다' });
      const record = emailCodes.get(email);
      if (!record) return res.status(400).json({ message: '코드가 존재하지 않거나 만료되었습니다' });
      if (record.expiresAt < Date.now()) { emailCodes.delete(email); return res.status(400).json({ message: '코드가 만료되었습니다' }); }
      if (record.code !== String(code)) return res.status(400).json({ message: '코드가 일치하지 않습니다' });
      // Mark verified by removing code (or keep as needed)
      emailCodes.delete(email);
      res.json({ success: true });
    } catch (err) {
      console.error('verify-email-code error', err);
      res.status(500).json({ message: '이메일 인증 실패' });
    }
  });

  // Send SMS code (mock: prints code to console)
  app.post('/api/auth/send-sms-code', async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone || typeof phone !== 'string') return res.status(400).json({ message: '유효한 휴대폰 번호가 필요합니다' });
      const code = generateCode();
      smsCodes.set(phone, { code, expiresAt: Date.now() + CODE_TTL_MS });
      console.log(`[MOCK SMS] Verification code for ${phone}: ${code}`);
      // In production, integrate with Twilio or similar provider.
      res.json({ success: true });
    } catch (err) {
      console.error('send-sms-code error', err);
      res.status(500).json({ message: 'SMS 전송 실패' });
    }
  });

  app.post('/api/auth/verify-sms-code', async (req, res) => {
    try {
      const { phone, code } = req.body;
      if (!phone || !code) return res.status(400).json({ message: '전화번호와 코드가 필요합니다' });
      const record = smsCodes.get(phone);
      if (!record) return res.status(400).json({ message: '코드가 존재하지 않거나 만료되었습니다' });
      if (record.expiresAt < Date.now()) { smsCodes.delete(phone); return res.status(400).json({ message: '코드가 만료되었습니다' }); }
      if (record.code !== String(code)) return res.status(400).json({ message: '코드가 일치하지 않습니다' });
      smsCodes.delete(phone);
      res.json({ success: true });
    } catch (err) {
      console.error('verify-sms-code error', err);
      res.status(500).json({ message: 'SMS 인증 실패' });
    }
  });

  // 아이디 찾기 API
  app.post('/api/auth/find-username', async (req, res) => {
    try {
      const { name, email, phone } = req.body;
      
      if (!name || (!email && !phone)) {
        return res.status(400).json({ message: '이름과 이메일 또는 전화번호를 입력해주세요' });
      }
      
      // 이름 + 이메일 또는 이름 + 전화번호로 사용자 찾기
      const users = await storage.getAllUsers();
      const user = users.find(u => 
        u.firstName === name && 
        (email ? u.email === email : true) && 
        (phone ? u.phone === phone : true)
      );
      
      if (!user) {
        return res.status(404).json({ message: '일치하는 사용자를 찾을 수 없습니다' });
      }
      
      // 아이디 반환 (이메일로 전송하는 것도 고려할 수 있음)
      res.json({ username: user.username, email: user.email });
    } catch (err) {
      console.error('find-username error', err);
      res.status(500).json({ message: '아이디 찾기 중 오류가 발생했습니다' });
    }
  });

  // 비밀번호 재설정 인증 코드 발송
  const passwordResetCodes = new Map(); // { email: { code, expiry, username } }
  
  app.post('/api/auth/send-password-reset-code', async (req, res) => {
    try {
      const { username, email } = req.body;
      
      if (!username || !email) {
        return res.status(400).json({ message: '아이디와 이메일을 입력해주세요' });
      }
      
      // 사용자 확인
      const user = await storage.getUserByUsername(username);
      if (!user || user.email !== email) {
        return res.status(404).json({ message: '일치하는 사용자를 찾을 수 없습니다' });
      }
      
      // 인증 코드 생성 (6자리)
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiry = Date.now() + 10 * 60 * 1000; // 10분 유효
      
      passwordResetCodes.set(email, { code, expiry, username });
      
      // 실제 이메일 발송은 구현해야 함 (일단 콘솔에 출력)
      console.log(`[Password Reset] Code for ${email}: ${code}`);
      
      res.json({ success: true, message: '인증 코드가 이메일로 발송되었습니다' });
    } catch (err) {
      console.error('send-password-reset-code error', err);
      res.status(500).json({ message: '인증 코드 발송 중 오류가 발생했습니다' });
    }
  });

  // 비밀번호 재설정
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { username, code, newPassword } = req.body;
      
      if (!username || !code || !newPassword) {
        return res.status(400).json({ message: '모든 항목을 입력해주세요' });
      }
      
      // 사용자 확인
      const user = await storage.getUserByUsername(username);
      if (!user || !user.email) {
        return res.status(404).json({ message: '사용자를 찾을 수 없습니다' });
      }
      
      // 인증 코드 검증
      const stored = passwordResetCodes.get(user.email);
      if (!stored || stored.code !== code) {
        return res.status(400).json({ message: '잘못된 인증 코드입니다' });
      }
      
      if (Date.now() > stored.expiry) {
        return res.status(400).json({ message: '인증 코드가 만료되었습니다' });
      }
      
      // 비밀번호 해싱 후 업데이트
      const hashed = await hashPassword(newPassword);
      await storage.updateUser(user.id, { password: hashed });
      
      // 인증 코드 삭제
      passwordResetCodes.delete(user.email);
      
      res.json({ success: true, message: '비밀번호가 성공적으로 재설정되었습니다' });
    } catch (err) {
      console.error('reset-password error', err);
      res.status(500).json({ message: '비밀번호 재설정 중 오류가 발생했습니다' });
    }
  });

  // Final registration endpoint: expects client to have verified email and phone already
  app.post('/api/auth/register', async (req: any, res) => {
    try {
      const { username, password, firstName, lastName, email, phone, schoolId, role } = req.body;
      // 이름, 아이디, 비밀번호는 필수 / 이메일, 전화번호는 선택
      if (!username || !password || !firstName) {
        return res.status(400).json({ message: '필수 입력값(아이디, 비밀번호, 이름)이 누락되었습니다' });
      }

      // super_admin 역할로 가입 불가
      const userRole = role && role !== 'super_admin' ? role : 'teacher';

      // 관리자(admin/super_admin)가 직접 생성하면 즉시 승인, 일반 가입은 역할에 따라 판단
      const requesterRole = req.user?.role;
      const isAdminCreating = requesterRole === 'admin' || requesterRole === 'super_admin';
      const needsApproval = !isAdminCreating && ['teacher', 'admin'].includes(userRole);

      // Check existing user
      const existing = await storage.getUserByUsername(username).catch(() => null);
      if (existing) return res.status(400).json({ message: '이미 존재하는 아이디입니다' });

      // Hash password
      const hashed = await hashPassword(password);

      const userData: any = {
        username,
        password: hashed,
        firstName,
        lastName: lastName || '',
        email: email || null,
        phone: phone || null,
        role: userRole,
        schoolId: schoolId ? Number(schoolId) : null,
        isApproved: !needsApproval, // 관리자 생성 또는 학생/학부모/외부는 즉시 승인
      };

      const user = await storage.createUser(userData);
      res.status(201).json({ success: true, user: { id: user.id, username: user.username, email: user.email, schoolId: user.schoolId } });
    } catch (err) {
      console.error('register error', err);
      res.status(500).json({ message: '회원가입 중 오류가 발생했습니다' });
    }
  });

  // Schools list (public)
  app.get('/api/schools', async (req, res) => {
    try {
      const schools = await storage.getSchools();
      res.json(schools);
    } catch (err) {
      res.status(500).json({ message: '학교 목록 조회 실패' });
    }
  });

  // 조직 설정 조회 (메뉴 활성화 등 - 인증 불필요, 공개 설정만)
  app.get('/api/schools/:id/settings', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const school = await storage.getSchool(id);
      if (!school) return res.status(404).json({ message: '조직을 찾을 수 없습니다' });
      const settings = (school.settings || {}) as any;
      res.json({
        disabledMenus: settings.disabledMenus || [],
        orgType: settings.orgType || school.type || 'school',
        name: settings.displayName || school.name || '',
        logoUrl: settings.logoUrl || null,
      });
    } catch (err) {
      res.status(500).json({ message: '설정 조회 실패' });
    }
  });

  // 조직 메뉴 활성화 설정 저장 (관리자만)
  app.patch('/api/schools/:id/menu-settings', async (req, res) => {
    try {
      if (!req.isAuthenticated || !(req as any).isAuthenticated()) {
        return res.status(401).json({ message: '로그인이 필요합니다' });
      }
      const user = req.user as any;
      const id = Number(req.params.id);
      // 자신의 학교 관리자이거나 super_admin만 허용
      if (user.role !== 'super_admin' && (user.role !== 'admin' || user.schoolId !== id)) {
        return res.status(403).json({ message: '권한이 없습니다' });
      }
      const { disabledMenus } = req.body;
      const school = await storage.getSchool(id);
      if (!school) return res.status(404).json({ message: '조직을 찾을 수 없습니다' });
      const currentSettings = (school.settings || {}) as any;
      const updated = await storage.updateSchoolSettings(id, {
        ...currentSettings,
        disabledMenus: disabledMenus || [],
      });
      res.json({ success: true, disabledMenus: (updated.settings as any)?.disabledMenus || [] });
    } catch (err) {
      res.status(500).json({ message: '설정 저장 실패' });
    }
  });

  // Register AI Routes (Optional, for generic chat/image)
  registerChatRoutes(app); 
  registerImageRoutes(app);

  // === APP ROUTES ===

  // Middleware to filter resources by schoolId
  app.use('/api', async (req, res, next) => {
    if (req.user) {
      const userId = (req.user as any).claims?.sub || (req.user as any).id;
      const user = await storage.getUser(userId);
      if (user?.schoolId) {
        (req as any).schoolId = user.schoolId;
      }
    }
    next();
  });

  // 문서 검증 (QR 코드 스캔용 — 인증 불필요)
  app.get("/api/verify/:id", async (req, res) => {
    try {
      const approvalId = Number(req.params.id);
      const approval = await storage.getApproval(approvalId);
      if (!approval) return res.status(404).json({ valid: false, message: "문서를 찾을 수 없습니다" });
      const requester = await storage.getUser(approval.requesterId);
      res.json({
        valid: true,
        document: {
          id: approval.id,
          title: approval.title,
          type: approval.type,
          status: approval.status,
          requester: requester?.firstName || 'Unknown',
          createdAt: approval.createdAt,
          updatedAt: (approval as any).updatedAt,
        }
      });
    } catch {
      res.status(500).json({ valid: false, message: "검증 중 오류" });
    }
  });

  // Approvals
  app.get(api.approvals.list.path, async (req, res) => {
    const schoolId = (req as any).schoolId;
    const approvals = await storage.getApprovals(undefined, schoolId);
    res.json(approvals);
  });

  app.post(api.approvals.create.path, async (req, res) => {
    try {
      const input = api.approvals.create.input.parse(req.body);
      const schoolId = (req as any).schoolId;
      const approval = await storage.createApproval({ ...input, schoolId });
      
      // Send notifications to approvers based on approval routes (non-blocking)
      try {
        const schoolId = (req as any).schoolId;
        const routes = await storage.getApprovalRoutesByType(approval.type, schoolId);
        for (const route of routes) {
          if (route.approverRole) {
            const approvers = await storage.getUsersByRole(route.approverRole, schoolId);
            for (const approver of approvers) {
              try {
                await storage.createNotification({
                  userId: approver.id,
                  type: "approval",
                  title: `새 결재 요청: ${approval.title}`,
                  content: `${approval.type === 'field_trip' ? '현장체험학습' : approval.type === 'absence' ? '결석계' : approval.type === 'transfer' ? '전학 신청' : '보고서'} 결재 요청이 있습니다.`,
                  referenceId: approval.id,
                  referenceType: "approval",
                });
              } catch (notifErr) {
                console.error("Failed to create notification for approver:", approver.id, notifErr);
              }
            }
          }
        }
      } catch (routeErr) {
        console.error("Failed to fetch approval routes for notifications:", routeErr);
      }
      
      res.status(201).json(approval);
    } catch (err) {
      if (err instanceof z.ZodError) res.status(400).json(err);
      else res.status(500).json({message: "Error creating approval"});
    }
  });

  app.patch(api.approvals.updateStatus.path, async (req, res) => {
    const { status, feedback } = req.body;
    const approvalId = Number(req.params.id);
    const approval = await storage.updateApprovalStatus(approvalId, status, feedback);
    
    // Task 1: Generate PDF on approval
    if (status === 'approved') {
      try {
        const requester = await storage.getUser(approval.requesterId);
        const approverId = (req.user as any).claims?.sub || (req.user as any).id;
        const approver = await storage.getUser(approverId);
        if (requester) {
          const pdfPath = await generateApprovalPDF(approval, requester, approver?.signatureUrl || undefined);
          console.log(`Generated PDF for approval ${approvalId}: ${pdfPath}`);
        }
      } catch (pdfErr) {
        console.error("Failed to generate PDF:", pdfErr);
      }
    }
    
    res.json(approval);
  });

  // Surveys
  app.get(api.surveys.list.path, async (req, res) => {
    const schoolId = (req as any).schoolId;
    const surveys = await storage.getSurveys(schoolId);
    res.json(surveys);
  });

  app.post(api.surveys.create.path, async (req, res) => {
    const input = api.surveys.create.input.parse(req.body);
    const schoolId = (req as any).schoolId;
    const survey = await storage.createSurvey({ ...input, schoolId });
    res.status(201).json(survey);
  });

  app.get(api.surveys.get.path, async (req, res) => {
    const survey = await storage.getSurvey(Number(req.params.id));
    const schoolId = (req as any).schoolId;
    if (!survey || (schoolId && survey.schoolId !== schoolId)) return res.status(404).send();
    res.json(survey);
  });

  // Events
  app.get(api.events.list.path, async (req, res) => {
    const schoolId = (req as any).schoolId;
    const events = await storage.getEvents(schoolId);
    res.json(events);
  });

  app.post(api.events.create.path, async (req, res) => {
    const input = api.events.create.input.parse(req.body);
    const schoolId = (req as any).schoolId;
    const event = await storage.createEvent({ ...input, schoolId });
    // 구글 캘린더에 자동 반영
    if (schoolId) syncEventToGoogle(schoolId, event.id, 'create', { ...event, type: input.type || 'academic' });
    res.status(201).json(event);
  });

  app.put(api.events.update.path, async (req, res) => {
    // 기존 이벤트 가져와서 googleEventId 확인
    const existingEvents = await storage.getEvents();
    const existing = existingEvents.find(e => e.id === Number(req.params.id));
    const oldType = (existing as any)?.type || 'academic';
    const newType = req.body.type || oldType;
    // 날짜 문자열을 Date로 변환
    const updates = { ...req.body };
    if (updates.startTime && typeof updates.startTime === 'string') updates.startTime = new Date(updates.startTime);
    if (updates.endTime && typeof updates.endTime === 'string') updates.endTime = new Date(updates.endTime);
    const event = await storage.updateEvent(Number(req.params.id), updates);
    if (!event) return res.status(404).json({ message: "이벤트를 찾을 수 없습니다" });
    const schoolId = (event as any).schoolId || (existing as any)?.schoolId;
    
    if (schoolId) {
      // 캘린더 타입이 변경된 경우: 이전 캘린더에서 삭제 → 새 캘린더에 생성
      if (oldType !== newType && (existing as any)?.googleEventId?.startsWith('gcal-')) {
        await syncEventToGoogle(schoolId, event.id, 'delete', { ...existing, type: oldType });
        await storage.updateEvent(event.id, { googleEventId: null } as any);
        syncEventToGoogle(schoolId, event.id, 'create', { ...event, type: newType, googleEventId: null });
      } else {
        syncEventToGoogle(schoolId, event.id, 'update', { ...event, googleEventId: (event as any).googleEventId || (existing as any)?.googleEventId });
      }
    }
    res.json(event);
  });

  app.delete(api.events.delete.path, async (req, res) => {
    // 삭제 전 이벤트 정보 가져오기
    const existingEvents = await storage.getEvents();
    const existing = existingEvents.find(e => e.id === Number(req.params.id));
    await storage.deleteEvent(Number(req.params.id));
    // 구글 캘린더에서도 삭제
    if (existing && (existing as any).schoolId) {
      syncEventToGoogle((existing as any).schoolId, Number(req.params.id), 'delete', existing);
    }
    res.status(204).send();
  });

  // Users (for assignee selection, invitations) - authenticated only
  app.get("/api/users", async (req, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const currentUser = req.user as any;
    const currentUserId = currentUser.claims?.sub || currentUser.id;
    const currentSchoolId = currentUser.schoolId;
    
    const allUsers = await storage.getAllUsers();
    // Filter by role if query param provided
    const { role, search } = req.query;
    let filtered = allUsers;
    
    // 같은 학교 소속 사용자만 반환 (super_admin은 전체, 미소속은 자기 자신만)
    if (currentUser.role !== "super_admin") {
      if (currentSchoolId) {
        filtered = filtered.filter(u => u.schoolId === currentSchoolId);
      } else {
        filtered = filtered.filter(u => u.id === currentUserId);
      }
    }
    
    if (role) {
      const roles = (role as string).split(",");
      filtered = filtered.filter(u => roles.includes(u.role || ""));
    }
    if (search) {
      const searchLower = (search as string).toLowerCase();
      filtered = filtered.filter(u => 
        (u.firstName?.toLowerCase().includes(searchLower)) ||
        (u.lastName?.toLowerCase().includes(searchLower)) ||
        (u.email?.toLowerCase().includes(searchLower))
      );
    }
    // Return limited user info (no sensitive data)
    const safeUsers = filtered.map(u => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      role: u.role,
      profileImageUrl: u.profileImageUrl,
      isDesktopOnline: u.isDesktopOnline
    }));
    res.json(safeUsers);
  });

  // === HEARTBEAT & ONLINE STATUS ===
  // Heartbeat endpoint - clients ping every 30s
  app.post("/api/heartbeat", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const userId = (req.user as any).claims?.sub || (req.user as any).id;
    const { platform } = req.body;
    
    if (!platform || !["web", "mobile", "desktop"].includes(platform)) {
      return res.status(400).json({ message: "유효한 platform이 필요합니다 (web, mobile, desktop)" });
    }
    
    updateHeartbeat(userId, platform as "web" | "mobile" | "desktop");
    res.json({ success: true });
  });

  // 조직 전환 (기본 조직 변경 = schoolId 업데이트)
  app.post("/api/user/switch-organization", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const userId = (req.user as any).claims?.sub || (req.user as any).id;
    const { organizationId } = req.body;
    try {
      // 소속 확인
      const orgs = await storage.getUserOrganizations(userId);
      const membership = orgs.find((o: any) => o.organizationId === organizationId);
      if (!membership) return res.status(403).json({ message: "소속되지 않은 조직입니다" });
      // schoolId 업데이트
      await storage.updateUser(userId, { schoolId: organizationId });
      // isPrimary 갱신
      await storage.setUserPrimaryOrg(userId, organizationId);
      res.json({ success: true, organizationId });
    } catch (err) {
      res.status(500).json({ message: "조직 전환 중 오류가 발생했습니다" });
    }
  });

  // 초대 코드로 조직 참여
  app.post("/api/organizations/join", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const userId = (req.user as any).claims?.sub || (req.user as any).id;
    const { inviteCode, role: requestedRole } = req.body;
    try {
      const allSchools = await storage.getSchools();
      const org = allSchools.find((s: any) => s.inviteCode === inviteCode);
      if (!org) return res.status(404).json({ message: "유효하지 않은 초대 코드입니다" });
      // 이미 소속인지 확인
      const orgs = await storage.getUserOrganizations(userId);
      if (orgs.some((o: any) => o.organizationId === org.id)) {
        return res.status(400).json({ message: "이미 소속된 조직입니다" });
      }
      const user = await storage.getUser(userId);
      // 조직 설정에서 자동승인 여부 조회
      const orgSettings = (org.settings || {}) as any;
      const requireApproval = orgSettings.requireApproval === true;
      // 역할: 요청된 역할 > 기존 사용자 역할 > member
      const role = requestedRole || user?.role || 'member';
      const isApproved = !requireApproval;
      await storage.addUserToOrganization(userId, org.id, role, isApproved);
      // 첫 조직이면 schoolId 설정
      if (!user?.schoolId) {
        await storage.updateUser(userId, { schoolId: org.id });
      }
      res.json({ success: true, organizationName: org.name, needsApproval: requireApproval });
    } catch (err) {
      res.status(500).json({ message: "조직 참여 중 오류가 발생했습니다" });
    }
  });

  // 조직 탈퇴
  app.delete("/api/organizations/:orgId/leave", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const userId = (req.user as any).claims?.sub || (req.user as any).id;
    const orgId = Number(req.params.orgId);
    try {
      const orgs = await storage.getUserOrganizations(userId);
      const membership = orgs.find((o: any) => o.organizationId === orgId);
      if (!membership) return res.status(404).json({ message: "해당 조직에 소속되어 있지 않습니다" });
      if (membership.role === 'admin') {
        // 관리자는 다른 관리자가 있을 때만 탈퇴 가능
        const allMembers = await storage.getOrganizationUsers(orgId);
        const otherAdmins = allMembers.filter((m: any) => m.role === 'admin' && m.id !== userId);
        if (otherAdmins.length === 0) return res.status(400).json({ message: "조직의 유일한 관리자는 탈퇴할 수 없습니다. 다른 관리자를 지정 후 탈퇴하세요." });
      }
      await db.execute(sql`DELETE FROM user_organizations WHERE user_id = ${userId} AND organization_id = ${orgId}`);
      // schoolId가 탈퇴 조직이면 다른 조직으로 교체
      const user = await storage.getUser(userId);
      if (user?.schoolId === orgId) {
        const remaining = orgs.filter((o: any) => o.organizationId !== orgId);
        const nextOrg = remaining[0]?.organizationId || null;
        await storage.updateUser(userId, { schoolId: nextOrg });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "조직 탈퇴 중 오류가 발생했습니다" });
    }
  });

  // 관리자: 조직 참여 대기자 목록
  app.get("/api/admin/organizations/:orgId/pending-members", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const role = (req.user as any).role;
    if (role !== 'admin' && role !== 'super_admin') return res.status(403).json({ message: "권한이 없습니다" });
    const orgId = Number(req.params.orgId);
    try {
      const rows = await db.execute(sql`
        SELECT u.id, u.username, u.first_name, u.last_name, u.email, u.role,
               uo.role as org_role, uo.is_approved, uo.joined_at
        FROM user_organizations uo
        JOIN users u ON uo.user_id = u.id
        WHERE uo.organization_id = ${orgId} AND uo.is_approved = false
        ORDER BY uo.joined_at ASC
      `);
      res.json({ members: rows.rows || rows });
    } catch (err) {
      res.status(500).json({ message: "목록 조회 실패" });
    }
  });

  // 관리자: 조직 가입 승인
  app.post("/api/admin/organizations/:orgId/approve-member/:userId", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const role = (req.user as any).role;
    if (role !== 'admin' && role !== 'super_admin') return res.status(403).json({ message: "권한이 없습니다" });
    const orgId = Number(req.params.orgId);
    const targetUserId = req.params.userId;
    try {
      await db.execute(sql`
        UPDATE user_organizations SET is_approved = true
        WHERE user_id = ${targetUserId} AND organization_id = ${orgId}
      `);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "승인 처리 실패" });
    }
  });

  // 관리자: 조직 가입 거절 (삭제)
  app.delete("/api/admin/organizations/:orgId/reject-member/:userId", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const role = (req.user as any).role;
    if (role !== 'admin' && role !== 'super_admin') return res.status(403).json({ message: "권한이 없습니다" });
    const orgId = Number(req.params.orgId);
    const targetUserId = req.params.userId;
    try {
      await db.execute(sql`
        DELETE FROM user_organizations WHERE user_id = ${targetUserId} AND organization_id = ${orgId}
      `);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "거절 처리 실패" });
    }
  });

  // 조직 초대 코드 조회 (본인 소속 조직용)
  app.get("/api/organizations/invite-code", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const role = (req.user as any).role;
    if (role !== 'admin' && role !== 'super_admin') return res.status(403).json({ message: "권한이 없습니다" });
    const orgId = Number(req.query.orgId);
    try {
      const school = await storage.getSchool(orgId);
      res.json({ inviteCode: school?.inviteCode || null });
    } catch (err) {
      res.status(500).json({ message: "조회 실패" });
    }
  });

  // 관리자: 초대 코드 생성/갱신
  app.post("/api/admin/schools/:id/invite-code", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const role = (req.user as any).role;
    if (role !== 'admin' && role !== 'super_admin') return res.status(403).json({ message: "권한이 없습니다" });
    try {
      const schoolId = Number(req.params.id);
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      await storage.updateSchool(schoolId, { inviteCode: code });
      res.json({ inviteCode: code });
    } catch (err) {
      res.status(500).json({ message: "초대 코드 생성 실패" });
    }
  });

  // ─── QR 조직 등록 시스템 ───

  // 관리자: QR 초대 코드 생성
  app.post("/api/admin/org-qr/create", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const role = (req.user as any).role;
    if (role !== 'admin' && role !== 'super_admin') return res.status(403).json({ message: "권한이 없습니다" });
    try {
      const { organizationId, description, defaultRole, maxUses, expiresInDays } = req.body;
      if (!organizationId) return res.status(400).json({ message: "조직 ID가 필요합니다" });

      const code = 'Q' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400000).toISOString() : null;
      const userId = (req.user as any).claims?.sub || (req.user as any).id;

      await db.execute(sql`
        INSERT INTO org_invite_qr (organization_id, code, description, default_role, max_uses, expires_at, created_by)
        VALUES (${organizationId}, ${code}, ${description || null}, ${defaultRole || 'student'}, ${maxUses || null}, ${expiresAt}, ${userId})
      `);

      // QR 데이터: 앱이 이 URL을 열면 자동 등록 화면
      const qrData = JSON.stringify({ type: 'org_join', code });
      res.json({ code, qrData, expiresAt });
    } catch (err) {
      console.error("QR 생성 오류:", err);
      res.status(500).json({ message: "QR 생성 실패" });
    }
  });

  // 관리자: QR 초대 목록
  app.get("/api/admin/org-qr/:orgId", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    try {
      const orgId = Number(req.params.orgId);
      const rows = await db.execute(sql`
        SELECT * FROM org_invite_qr WHERE organization_id = ${orgId} ORDER BY created_at DESC
      `);
      res.json(rows.rows);
    } catch (err) {
      res.status(500).json({ message: "조회 실패" });
    }
  });

  // 공개: QR 코드 정보 조회 (스캔 시)
  app.get("/api/org-qr/:code", async (req, res) => {
    try {
      const { code } = req.params;
      const rows = await db.execute(sql`
        SELECT q.*, s.name as org_name, s.type as org_type
        FROM org_invite_qr q JOIN schools s ON q.organization_id = s.id
        WHERE q.code = ${code} AND q.is_active = true
      `);
      if (rows.rows.length === 0) return res.status(404).json({ message: "유효하지 않은 QR 코드입니다" });

      const qr = rows.rows[0] as any;
      if (qr.expires_at && new Date(qr.expires_at) < new Date()) return res.status(410).json({ message: "만료된 QR 코드입니다" });
      if (qr.max_uses && qr.used_count >= qr.max_uses) return res.status(410).json({ message: "사용 횟수를 초과한 QR 코드입니다" });

      res.json({
        code: qr.code,
        orgName: qr.org_name,
        orgType: qr.org_type,
        organizationId: qr.organization_id,
        defaultRole: qr.default_role,
        description: qr.description,
      });
    } catch (err) {
      res.status(500).json({ message: "QR 조회 실패" });
    }
  });

  // 공개: QR 스캔으로 가입 + 조직 등록
  app.post("/api/org-qr/join", async (req, res) => {
    try {
      const { code, name, userId, phone, email, password } = req.body;
      if (!code || !name) return res.status(400).json({ message: "QR 코드와 이름은 필수입니다" });
      if (!password) return res.status(400).json({ message: "비밀번호를 설정해주세요" });
      if (!userId && !phone) return res.status(400).json({ message: "아이디 또는 전화번호를 입력해주세요" });

      // QR 유효성 확인
      const rows = await db.execute(sql`
        SELECT q.*, s.name as org_name FROM org_invite_qr q JOIN schools s ON q.organization_id = s.id
        WHERE q.code = ${code} AND q.is_active = true
      `);
      if (rows.rows.length === 0) return res.status(404).json({ message: "유효하지 않은 QR 코드입니다" });
      const qr = rows.rows[0] as any;
      if (qr.expires_at && new Date(qr.expires_at) < new Date()) return res.status(410).json({ message: "만료된 QR 코드입니다" });
      if (qr.max_uses && qr.used_count >= qr.max_uses) return res.status(410).json({ message: "사용 횟수 초과" });

      // 로그인에 사용할 아이디 결정: 전화번호 우선, 없으면 userId
      const username = phone || userId;

      // 중복 체크
      const existUser = await storage.getUserByUsername(username).catch(() => null);
      if (existUser) return res.status(400).json({ message: `이미 사용 중인 아이디입니다: ${username}` });
      if (phone) {
        const existPhone = await db.execute(sql`SELECT id FROM users WHERE phone = ${phone}`);
        if (existPhone.rows.length > 0) return res.status(400).json({ message: "이미 등록된 전화번호입니다. 기존 계정으로 로그인하세요." });
      }
      if (email) {
        const existEmail = await db.execute(sql`SELECT id FROM users WHERE email = ${email}`);
        if (existEmail.rows.length > 0) return res.status(400).json({ message: "이미 등록된 이메일입니다. 기존 계정으로 로그인하세요." });
      }

      const hashed = await hashPassword(password);
      const loginMethod = phone ? 'phone' : 'username';

      const userData: any = {
        username,
        password: hashed,
        firstName: name,
        lastName: '',
        email: email || null,
        phone: phone || null,
        role: qr.default_role || 'student',
        schoolId: qr.organization_id,
        isApproved: true, // QR 가입은 즉시 승인
      };
      const user = await storage.createUser(userData);

      // login_method 업데이트
      await db.execute(sql`UPDATE users SET login_method = ${loginMethod} WHERE id = ${user.id}`);

      // user_organizations에 추가
      await db.execute(sql`
        INSERT INTO user_organizations (user_id, organization_id) VALUES (${user.id}, ${qr.organization_id})
        ON CONFLICT DO NOTHING
      `);

      // QR 사용 횟수 증가
      await db.execute(sql`UPDATE org_invite_qr SET used_count = used_count + 1 WHERE id = ${qr.id}`);

      const loginId = phone || userId;
      res.status(201).json({
        success: true,
        username: loginId,
        loginMethod,
        orgName: qr.org_name,
        message: phone ? `전화번호(${phone})로 로그인하세요` : `아이디(${userId})로 로그인하세요`,
      });
    } catch (err) {
      console.error("QR 가입 오류:", err);
      res.status(500).json({ message: "가입 처리 중 오류가 발생했습니다" });
    }
  });

  // ─── 전화번호/이메일 기반 로그인 지원 ───
  // (기존 passport 로그인에 phone/email 조회 추가 필요 — 아래 별도 처리)

  // Get online status for all users
  app.get("/api/users/online", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    
    const onlineStatus = getAllOnlineStatus();
    res.json(onlineStatus);
  });

  // Get current user info
  app.get("/api/user", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const userId = (req.user as any).claims?.sub || (req.user as any).id;
    
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
      }
      
      // 소속 조직 목록 포함
      const orgs = await storage.getUserOrganizations(userId);
      const { password, ...safeUser } = user;
      res.json({ ...safeUser, organizations: orgs });
    } catch (err) {
      console.error("Get user error:", err);
      res.status(500).json({ message: "사용자 정보 조회 중 오류가 발생했습니다" });
    }
  });

  // Posts
  app.get(api.posts.list.path, async (req, res) => {
    const schoolId = (req as any).schoolId;
    const posts = await storage.getPosts(schoolId);
    res.json(posts);
  });

  app.post(api.posts.create.path, async (req, res) => {
    const input = api.posts.create.input.parse(req.body);
    const schoolId = (req as any).schoolId;
    const post = await storage.createPost({ ...input, schoolId });
    res.status(201).json(post);
  });

  // === HUMAN CHAT ===
  app.get(api.channels.list.path, async (req, res) => {
    const schoolId = (req as any).schoolId;
    const channels = await storage.getChannelsWithMemberCounts(schoolId);
    res.json(channels);
  });

  // Backwards-compatible endpoint used by client for pin/mute/unread status
  app.get('/api/channels-with-pins', async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub || (req.user as any)?.id || 'local-user-id';
      const schoolId = (req as any).schoolId;
      const channels = await storage.getChannelsWithPinStatus(userId, schoolId);
      res.json(channels);
    } catch (err) {
      console.error('Failed to fetch channels-with-pins:', err);
      res.status(500).json({ message: 'Failed to fetch channels' });
    }
  });

  app.post(api.channels.create.path, async (req, res) => {
    try {
      const { name, type } = req.body;
      const schoolId = (req as any).schoolId;
      if (!name) return res.status(400).json({ message: "방 이름을 입력해주세요" });
      const channel = await storage.createChannel(name, type || "general", schoolId);
      
      // Auto-join the creator to the channel
      const userId = (req.user as any).claims?.sub || (req.user as any).id;
      if (userId) {
        await storage.joinChannel(channel.id, userId, "admin");
      }
      
      console.log("Channel created and joined:", channel);
      res.status(201).json(channel);
    } catch (err) {
      console.error("Channel creation error:", err);
      res.status(500).json({ message: "대화방 생성 중 오류가 발생했습니다" });
    }
  });

  app.post("/api/channels/direct", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    try {
      const { targetUserId } = req.body;
      const currentUserId = (req.user as any).claims?.sub || (req.user as any).id;
      const schoolId = (req as any).schoolId;
      
      if (!targetUserId) {
        return res.status(400).json({ message: "대상 사용자 ID가 필요합니다" });
      }
      
      const channel = await storage.getOrCreateDirectChannel(currentUserId, targetUserId, schoolId);
      res.json(channel);
    } catch (err) {
      console.error("Direct channel error:", err);
      res.status(500).json({ message: "1:1 대화방 생성 중 오류가 발생했습니다" });
    }
  });

  app.get(api.channels.messages.path, async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const before = req.query.before ? Number(req.query.before) : undefined;
    const messages = await storage.getMessagesWithReadCounts(Number(req.params.id), { limit, before });
    // Mark messages as read for current user
    const userId = (req.user as any).claims?.sub || (req.user as any).id;
    if (userId) {
      await storage.markChannelMessagesRead(Number(req.params.id), userId);
    }
    res.json(messages);
  });

  // Simple in-memory deduplication for chat messages
  const messageNonces = new Map<string, Set<string>>();
  
  app.post(api.channels.sendMessage.path, async (req, res) => {
    const { content, parentId, metadata, nonce } = req.body;
    const senderId = (req.user as any).claims?.sub || (req.user as any).id || "anonymous"; 
    
    // Server-side deduplication using nonce
    if (nonce) {
      const userNonces = messageNonces.get(senderId) || new Set<string>();
      if (userNonces.has(nonce)) {
        console.log(`[DEDUPE] Duplicate message detected for user ${senderId} with nonce ${nonce}`);
        // Return a 200/201 but don't create a new message
        // In a real app, you might want to return the existing message, but for now just prevent creation
        return res.status(201).json({ deduplicated: true });
      }
      userNonces.add(nonce);
      messageNonces.set(senderId, userNonces);
      
      // Clean up old nonces after 1 minute
      setTimeout(() => {
        const current = messageNonces.get(senderId);
        if (current) {
          current.delete(nonce);
          if (current.size === 0) messageNonces.delete(senderId);
        }
      }, 60000);
    }

    const message = await storage.createChannelMessage(Number(req.params.id), senderId, content, parentId, metadata);
    // WebSocket 브로드캐스트
    const broadcast = (global as any).broadcastToChannel;
    if (broadcast) broadcast(Number(req.params.id), { type: "new_message", message });
    res.status(201).json(message);
  });

  app.post(api.channels.addReaction.path, async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    try {
      const messageId = Number(req.params.messageId);
      const { emoji } = req.body;
      const userId = (req.user as any)?.claims?.sub || (req.user as any)?.id || 'local-user-id';
      
      if (!emoji) {
        return res.status(400).json({ message: "이모지가 필요합니다" });
      }
      
      const messages = await storage.getChannelMessages(Number(req.params.id));
      const message = messages.find(m => m.id === messageId);
      
      if (!message) {
        return res.status(404).json({ message: "메시지를 찾을 수 없습니다" });
      }
      
      const reactions = (message.reactions as Record<string, string[]>) || {};
      
      let alreadySelectedThisEmoji = false;
      for (const e in reactions) {
        if (reactions[e].includes(userId)) {
          if (e === emoji) alreadySelectedThisEmoji = true;
          reactions[e] = reactions[e].filter(id => id !== userId);
          if (reactions[e].length === 0) delete reactions[e];
        }
      }

      let action: 'added' | 'removed';
      if (alreadySelectedThisEmoji) {
        action = 'removed';
      } else {
        if (!reactions[emoji]) reactions[emoji] = [];
        reactions[emoji].push(userId);
        action = 'added';
      }
      
      for (const e in reactions) {
        if (!reactions[e] || reactions[e].length === 0) {
          delete reactions[e];
        }
      }
      
      await storage.updateMessageReactions(messageId, reactions);
      const broadcast = (global as any).broadcastToChannel;
      if (broadcast) broadcast(Number(req.params.id), { type: "reaction_update", messageId, reactions });
      res.json({ success: true, action, reactions });
    } catch (err) {
      console.error("Reaction error:", err);
      res.status(500).json({ message: "반응 추가 중 오류가 발생했습니다" });
    }
  });

  // File Upload Route
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "파일이 없습니다" });

    // Validate size against school settings if available
    const schoolId = (req as any).schoolId;
    if (schoolId) {
      const school = await storage.getSchool(schoolId);
      const maxSizeMb = school?.settings?.maxUploadSizeMb || 10;
      if (req.file.size > maxSizeMb * 1024 * 1024) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: `파일 크기가 제한(${maxSizeMb}MB)을 초과했습니다.` });
      }
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    let thumbnailUrl: string | undefined;
    let blurHash: string | undefined;

    // 이미지 파일이면 썸네일 + 블러 플레이스홀더 자동 생성
    if (req.file.mimetype.startsWith("image/")) {
      try {
        const sharp = (await import("sharp")).default;
        const thumbFilename = `thumb_${req.file.filename}`;
        const thumbPath = path.join(storageDir, thumbFilename);
        
        // 300px 썸네일 생성
        await sharp(req.file.path)
          .resize(300, 300, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 70 })
          .toFile(thumbPath);
        thumbnailUrl = `/uploads/${thumbFilename}`;
        
        // 10px 블러 플레이스홀더 (base64 인라인)
        const blurBuffer = await sharp(req.file.path)
          .resize(10, 10, { fit: "inside" })
          .jpeg({ quality: 30 })
          .toBuffer();
        blurHash = `data:image/jpeg;base64,${blurBuffer.toString("base64")}`;
      } catch (e) {
        console.error("Thumbnail generation failed:", e);
      }
    }

    res.json({ 
      name: req.file.originalname, 
      url: fileUrl, 
      type: req.file.mimetype,
      thumbnailUrl,
      blurHash
    });
  });

  app.post("/api/channels/:channelId/messages/:messageId/recall", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const currentUserId = (req.user as any).claims?.sub || (req.user as any).id;
    try {
      const messages = await storage.getChannelMessages(Number(req.params.channelId));
      const message = messages.find(m => m.id === Number(req.params.messageId));
      if (!message || message.senderId !== currentUserId) {
        return res.status(403).json({ message: "자신의 메시지만 회수할 수 있습니다" });
      }
      await storage.recallMessage(Number(req.params.messageId));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "메시지 회수 중 오류가 발생했습니다" });
    }
  });

  // 메시지 삭제 (1분 이내 본인 메시지만)
  app.delete("/api/channels/:channelId/messages/:messageId", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const currentUserId = (req.user as any).claims?.sub || (req.user as any).id;
    try {
      const messages = await storage.getChannelMessages(Number(req.params.channelId));
      const message = messages.find(m => m.id === Number(req.params.messageId));
      if (!message) return res.status(404).json({ message: "메시지를 찾을 수 없습니다" });
      if (message.senderId !== currentUserId) return res.status(403).json({ message: "자신의 메시지만 삭제할 수 있습니다" });
      const minutesSince = (Date.now() - new Date(message.createdAt!).getTime()) / 60000;
      if (minutesSince > 1) return res.status(400).json({ message: "메시지 전송 후 1분이 지나 삭제할 수 없습니다" });
      await db.delete(channelMessages).where(eq(channelMessages.id, Number(req.params.messageId)));
      const broadcast = (global as any).broadcastToChannel;
      if (broadcast) broadcast(Number(req.params.channelId), { type: "message_deleted", messageId: Number(req.params.messageId) });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "메시지 삭제 중 오류가 발생했습니다" });
    }
  });

  // 메시지 읽은 사람 목록 조회
  app.get("/api/channels/:channelId/messages/:messageId/reads", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    try {
      const readBy = await storage.getMessageReadBy(Number(req.params.messageId));
      res.json({ readBy });
    } catch (err) {
      res.status(500).json({ message: "읽음 정보 조회 중 오류가 발생했습니다" });
    }
  });

  app.post("/api/channels/:channelId/messages/:messageId/translate", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const { targetLang } = req.body; // e.g. "en", "jp", "cn"
    try {
      const messages = await storage.getChannelMessages(Number(req.params.channelId));
      const message = messages.find(m => m.id === Number(req.params.messageId));
      if (!message) return res.status(404).json({ message: "메시지를 찾을 수 없습니다" });

      const metadata = message.metadata as any || {};
      if (metadata.translation?.[targetLang]) {
        return res.json({ translation: metadata.translation[targetLang] });
      }

      const response = await openai!.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: `Translate the following text to ${targetLang}. Return only the translation.` },
          { role: "user", content: message.content }
        ]
      });

      const translation = response.choices[0].message.content || "";
      await storage.updateMessageMetadata(message.id, {
        translation: { ...metadata.translation, [targetLang]: translation }
      });
      res.json({ translation });
    } catch (err) {
      console.error("Translation error:", err);
      res.status(500).json({ message: "통역 중 오류가 발생했습니다" });
    }
  });

  app.patch("/api/channels/:id/rename", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "이름을 입력하세요" });
    try {
      const channelId = Number(req.params.id);
      await storage.renameChannel(channelId, name.trim());
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "이름 변경 실패" });
    }
  });

  app.get("/api/channels/:id/files", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    try {
      const files = await storage.getChannelFiles(Number(req.params.id));
      res.json(files);
    } catch (err) {
      res.status(500).json({ message: "파일 목록 조회 중 오류가 발생했습니다" });
    }
  });

  app.patch("/api/channels/:id/mute", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const userId = (req.user as any).claims?.sub || (req.user as any).id;
    const { isMuted } = req.body;
    try {
      await storage.updateMemberMuteStatus(Number(req.params.id), userId, isMuted);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "알림 설정 변경 중 오류가 발생했습니다" });
    }
  });

  // 공지 설정/해제
  app.patch("/api/channels/:id/announcement", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const { messageId } = req.body; // null to clear
    try {
      const channelId = Number(req.params.id);
      await db.update(channels).set({ announcementMessageId: messageId }).where(eq(channels.id, channelId));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "공지 설정 실패" });
    }
  });

  app.post(api.channels.invite.path, async (req, res) => {
    const { userId } = req.body;
    await storage.joinChannel(Number(req.params.id), userId);
    res.json({ message: "초대되었습니다" });
  });

  // Remove a member from channel (kick) - protected by auth in client UI, server will still verify user exists
  app.delete("/api/channels/:id/members/:userId", async (req, res) => {
    try {
      const channelId = Number(req.params.id);
      const userId = String(req.params.userId);
      // In production, check req.user and permissions here
      await storage.removeMemberFromChannel(channelId, userId);
      res.status(200).json({ message: "멤버가 제거되었습니다" });
    } catch (err) {
      console.error("Failed to remove member:", err);
      res.status(500).json({ message: "멤버 제거 중 오류가 발생했습니다" });
    }
  });
  
  // Pin/Unpin channel for current user
  app.post('/api/channels/:id/pin', async (req, res) => {
    try {
      const channelId = Number(req.params.id);
      const userId = (req.user as any)?.claims?.sub || (req.user as any)?.id || 'local-user-id';
      await storage.pinChannel(channelId, userId);
      res.json({ success: true });
    } catch (err) {
      console.error('Pin channel error:', err);
      res.status(500).json({ message: '채널 고정 중 오류가 발생했습니다' });
    }
  });

  app.post('/api/channels/:id/unpin', async (req, res) => {
    try {
      const channelId = Number(req.params.id);
      const userId = (req.user as any)?.claims?.sub || (req.user as any)?.id || 'local-user-id';
      await storage.unpinChannel(channelId, userId);
      res.json({ success: true });
    } catch (err) {
      console.error('Unpin channel error:', err);
      res.status(500).json({ message: '채널 고정 해제 중 오류가 발생했습니다' });
    }
  });

  // Invite user to channel
  app.post("/api/channels/:id/invite", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    try {
      const channelId = Number(req.params.id);
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ message: "사용자 ID가 필요합니다" });
      }
      
      // Check if user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
      }
      
      // Add user to channel
      await storage.joinChannel(channelId, userId);
      
      // Send notification to invited user
      await storage.createNotification({
        userId: userId,
        type: "channel_invite",
        title: "채널 초대",
        content: `채널에 초대되었습니다`,
        referenceId: channelId,
        referenceType: "channel"
      });
      
      res.json({ success: true, message: "초대가 완료되었습니다" });
    } catch (err) {
      console.error("Invite error:", err);
      res.status(500).json({ message: "초대 중 오류가 발생했습니다" });
    }
  });

  // Leave channel (current user)
  app.post("/api/channels/:id/leave", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    try {
      const channelId = Number(req.params.id);
      const userId = (req.user as any)?.claims?.sub || (req.user as any)?.id || 'local-user-id';
      
      await storage.removeMemberFromChannel(channelId, userId);
      
      // 마지막 멤버가 나가면 채널 자동 삭제
      const remainingMembers = await storage.getChannelMembers(channelId);
      if (remainingMembers.length === 0) {
        await storage.deleteChannel(channelId);
        return res.json({ success: true, message: "마지막 멤버가 나가서 채널이 삭제되었습니다", deleted: true });
      }
      
      res.json({ success: true, message: "채널에서 나갔습니다" });
    } catch (err) {
      console.error("Leave channel error:", err);
      res.status(500).json({ message: "채널 나가기 중 오류가 발생했습니다" });
    }
  });

  // Update channel (name or profile)
  app.put("/api/channels/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    try {
      const channelId = Number(req.params.id);
      const userId = (req.user as any)?.claims?.sub || (req.user as any)?.id || 'local-user-id';
      
      // Check if user is admin of this channel
      const members = await storage.getChannelMembers(channelId);
      const member = members.find(m => m.userId === userId);
      
      if (!member || member.role !== "admin") {
        return res.status(403).json({ message: "방장만 변경할 수 있습니다" });
      }
      
      const { name, profileImageUrl } = req.body;
      const updateData: any = {};
      if (name) updateData.name = name;
      if (profileImageUrl) updateData.profileImageUrl = profileImageUrl;
      
      await storage.updateChannel(channelId, updateData);
      
      res.json({ success: true, message: "채널 정보가 업데이트되었습니다" });
    } catch (err) {
      console.error("Update channel error:", err);
      res.status(500).json({ message: "채널 업데이트 중 오류가 발생했습니다" });
    }
  });

  // Transfer admin role
  app.post("/api/channels/:id/transfer-admin", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    try {
      const channelId = Number(req.params.id);
      const userId = (req.user as any)?.claims?.sub || (req.user as any)?.id || 'local-user-id';
      const { newAdminId } = req.body;
      
      if (!newAdminId) {
        return res.status(400).json({ message: "새로운 방장을 선택해주세요" });
      }
      
      // Check if current user is admin
      const members = await storage.getChannelMembers(channelId);
      const currentMember = members.find(m => m.userId === userId);
      
      if (!currentMember || currentMember.role !== "admin") {
        return res.status(403).json({ message: "방장만 위임할 수 있습니다" });
      }
      
      // Check if target user is a member
      const targetMember = members.find(m => m.userId === newAdminId);
      if (!targetMember) {
        return res.status(404).json({ message: "대상 사용자가 채널에 없습니다" });
      }
      
      // Transfer: current admin becomes member, target becomes admin
      await storage.updateMemberRole(channelId, userId, "member");
      await storage.updateMemberRole(channelId, newAdminId, "admin");
      
      res.json({ success: true, message: "방장이 위임되었습니다" });
    } catch (err) {
      console.error("Transfer admin error:", err);
      res.status(500).json({ message: "방장 위임 중 오류가 발생했습니다" });
    }
  });

  // Get channel members
  app.get("/api/channels/:id/members", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    try {
      const members = await storage.getChannelMembers(Number(req.params.id));
      // Get user details for each member
      const memberDetails = await Promise.all(
        members.map(async (m) => {
          const user = await storage.getUser(m.userId);
          return {
            ...m,
            user: user ? {
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              role: user.role,
              profileImageUrl: user.profileImageUrl,
              isDesktopOnline: user.isDesktopOnline
            } : null
          };
        })
      );
      res.json(memberDetails);
    } catch (err) {
      res.status(500).json({ message: "채널 멤버 조회 중 오류가 발생했습니다" });
    }
  });
  
  // Get message read details
  app.get("/api/channels/:channelId/messages/:messageId/reads", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    try {
      const reads = await storage.getMessageReads(Number(req.params.messageId));
      // Get user details
      const readDetails = await Promise.all(
        reads.map(async (r) => {
          const user = await storage.getUser(r.userId);
          return {
            ...r,
            user: user ? {
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              role: user.role,
              profileImageUrl: user.profileImageUrl,
              isDesktopOnline: user.isDesktopOnline
            } : null
          };
        })
      );
      res.json(readDetails);
    } catch (err) {
      res.status(500).json({ message: "읽음 정보 조회 중 오류가 발생했습니다" });
    }
  });
  
  // Get reaction details (who reacted with which emoji)
  app.get("/api/channels/:channelId/messages/:messageId/reactions", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    try {
      const messages = await storage.getChannelMessages(Number(req.params.channelId));
      const message = messages.find(m => m.id === Number(req.params.messageId));
      if (!message) return res.status(404).json({ message: "메세지를 찾을 수 없습니다" });
      
      const reactions = message.reactions as Record<string, string[]> || {};
      // Get user details for each reactor
      const reactionDetails: Record<string, any[]> = {};
      for (const [emoji, userIds] of Object.entries(reactions)) {
        reactionDetails[emoji] = await Promise.all(
          userIds.map(async (userId) => {
            const user = await storage.getUser(userId);
            return user ? {
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              role: user.role,
              profileImageUrl: user.profileImageUrl
            } : { id: userId, firstName: userId };
          })
        );
      }
      res.json(reactionDetails);
    } catch (err) {
      res.status(500).json({ message: "반응 정보 조회 중 오류가 발생했습니다" });
    }
  });

  app.post("/api/channels/:channelId/messages/:messageId/remind", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    
    try {
      const channelId = Number(req.params.channelId);
      const messageId = Number(req.params.messageId);
      
      // Get all members of the channel
      const members = await storage.getChannelMembers(channelId);
      // Get those who have read the message
      const reads = await storage.getMessageReads(messageId);
      const readUserIds = new Set(reads.map(r => r.userId));
      
      // Filter members who haven't read
      const unreadMembers = members.filter(m => !readUserIds.has(m.userId));
      
      // Get message content for context
      const messages = await storage.getChannelMessages(channelId);
      const message = messages.find(m => m.id === messageId);
      
      if (!message) return res.status(404).json({ message: "메시지를 찾을 수 없습니다" });

      // Send notifications to unread members
      for (const member of unreadMembers) {
        await storage.createNotification({
          userId: member.userId,
          type: "message",
          title: "확인하지 않은 공지가 있습니다",
          content: `내용: ${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}`,
          referenceId: messageId,
          referenceType: "message",
        });
      }
      
      res.json({ success: true, remindedCount: unreadMembers.length });
    } catch (err) {
      console.error("Reminder error:", err);
      res.status(500).json({ message: "리마인드 알림 발송 중 오류가 발생했습니다" });
    }
  });

  // === POLLS API (투표) ===
  // ========== 투표 (DB 기반) ==========

  // Create poll
  app.post("/api/channels/:id/polls", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const userId = (req.user as any).claims?.sub || (req.user as any).id;
    try {
      const { title, description, pollType, options, isMultipleChoice, isAnonymous, deadline, showResultsAfterClose } = req.body;
      const channelId = Number(req.params.id);
      if (!title || !options || !Array.isArray(options) || options.length < 2) {
        return res.status(400).json({ message: "제목과 2개 이상의 옵션이 필요합니다" });
      }
      const optionsWithIds = options.map((opt: any, idx: number) => ({
        id: String(idx),
        label: opt.label || opt,
        date: opt.date || null,
      }));
      const [poll] = await db.insert(polls).values({
        channelId,
        creatorId: userId,
        title,
        description: description || null,
        pollType: pollType || "text",
        options: optionsWithIds,
        isMultipleChoice: isMultipleChoice || false,
        isAnonymous: isAnonymous || false,
        showResultsAfterClose: showResultsAfterClose || false,
        deadline: deadline ? new Date(deadline) : null,
      }).returning();
      res.status(201).json({ ...poll, votes: {} });
    } catch (err) {
      console.error("Poll creation error:", err);
      res.status(500).json({ message: "투표 생성 중 오류가 발생했습니다" });
    }
  });

  // Get channel polls
  app.get("/api/channels/:id/polls", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const userId = (req.user as any).claims?.sub || (req.user as any).id;
    try {
      const channelId = Number(req.params.id);
      const channelPolls = await db.select().from(polls).where(eq(polls.channelId, channelId)).orderBy(desc(polls.createdAt));
      const result = [];
      for (const poll of channelPolls) {
        const votes = await db.select().from(pollVotes).where(eq(pollVotes.pollId, poll.id));
        const voteMap: Record<string, string[]> = {};
        for (const v of votes) {
          if (!voteMap[v.userId]) voteMap[v.userId] = [];
          voteMap[v.userId].push(v.optionId);
        }
        // 마감 자동 처리
        const isExpired = poll.deadline && new Date(poll.deadline) < new Date();
        const effectivelyClosed = poll.isClosed || isExpired;
        // 결과 공개 여부: showResultsAfterClose=true면 마감 전에는 결과 숨김
        const hideResults = poll.showResultsAfterClose && !effectivelyClosed;
        result.push({
          ...poll,
          isClosed: effectivelyClosed,
          votes: hideResults ? {} : (poll.isAnonymous ? anonymizeVotes(voteMap, userId) : voteMap),
          totalVoters: hideResults ? 0 : Object.keys(voteMap).length,
          myVotes: voteMap[userId] || [],
          hideResults,
        });
      }
      res.json(result);
    } catch (err) {
      console.error("Polls fetch error:", err);
      res.status(500).json({ message: "투표 목록 조회 중 오류가 발생했습니다" });
    }
  });

  function anonymizeVotes(voteMap: Record<string, string[]>, currentUserId: string) {
    // 익명: 옵션별 카운트만 반환, 자기 투표는 표시
    const optionCounts: Record<string, number> = {};
    for (const optionIds of Object.values(voteMap)) {
      for (const oid of optionIds) {
        optionCounts[oid] = (optionCounts[oid] || 0) + 1;
      }
    }
    return { _counts: optionCounts, _myVotes: voteMap[currentUserId] || [] };
  }

  // Vote on poll
  app.post("/api/channels/:id/polls/:pollId/vote", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const userId = (req.user as any).claims?.sub || (req.user as any).id;
    try {
      const pollId = Number(req.params.pollId);
      const { optionIds } = req.body;
      if (!Array.isArray(optionIds)) return res.status(400).json({ message: "optionIds는 배열이어야 합니다" });

      const [poll] = await db.select().from(polls).where(eq(polls.id, pollId));
      if (!poll) return res.status(404).json({ message: "투표를 찾을 수 없습니다" });
      if (poll.isClosed || (poll.deadline && new Date(poll.deadline) < new Date())) {
        return res.status(400).json({ message: "마감된 투표입니다" });
      }
      if (!poll.isMultipleChoice && optionIds.length > 1) {
        return res.status(400).json({ message: "단일 선택 투표입니다" });
      }

      // 기존 투표 삭제 후 새로 삽입
      await db.delete(pollVotes).where(and(eq(pollVotes.pollId, pollId), eq(pollVotes.userId, userId)));
      if (optionIds.length > 0) {
        await db.insert(pollVotes).values(optionIds.map((oid: string) => ({
          pollId,
          userId,
          optionId: oid,
        })));
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Vote error:", err);
      res.status(500).json({ message: "투표 중 오류가 발생했습니다" });
    }
  });

  // Close poll
  app.post("/api/channels/:id/polls/:pollId/close", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const userId = (req.user as any).claims?.sub || (req.user as any).id;
    try {
      const pollId = Number(req.params.pollId);
      const [poll] = await db.select().from(polls).where(eq(polls.id, pollId));
      if (!poll) return res.status(404).json({ message: "투표를 찾을 수 없습니다" });
      if (poll.creatorId !== userId) return res.status(403).json({ message: "생성자만 마감할 수 있습니다" });
      await db.update(polls).set({ isClosed: true }).where(eq(polls.id, pollId));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "투표 마감 중 오류가 발생했습니다" });
    }
  });

  // Delete poll
  app.delete("/api/channels/:id/polls/:pollId", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const userId = (req.user as any).claims?.sub || (req.user as any).id;
    try {
      const pollId = Number(req.params.pollId);
      const [poll] = await db.select().from(polls).where(eq(polls.id, pollId));
      if (!poll) return res.status(404).json({ message: "투표를 찾을 수 없습니다" });
      if (poll.creatorId !== userId) return res.status(403).json({ message: "생성자만 삭제할 수 있습니다" });
      const minutesSinceCreation = (Date.now() - new Date(poll.createdAt!).getTime()) / 60000;
      if (minutesSinceCreation > 5) return res.status(400).json({ message: "투표 생성 후 5분이 지나 삭제할 수 없습니다" });
      await db.delete(pollVotes).where(eq(pollVotes.pollId, pollId));
      await db.delete(polls).where(eq(polls.id, pollId));
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "투표 삭제 중 오류가 발생했습니다" });
    }
  });

  // User Desktop Status
  app.post("/api/user/desktop-status", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const userId = (req.user as any).claims?.sub || (req.user as any).id;
    const { isOnline } = req.body;
    try {
      await storage.updateUser(userId, { 
        isDesktopOnline: isOnline,
        lastDesktopActiveAt: isOnline ? new Date() : undefined
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "상태 업데이트 중 오류가 발생했습니다" });
    }
  });

  // Update current user profile
  app.patch("/api/users/me", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const userId = (req.user as any).claims?.sub || (req.user as any).id;
    
    try {
      const { firstName, email, phone, profileImageUrl, signatureUrl } = req.body;
      const updateData: any = {};
      
      if (firstName !== undefined) updateData.firstName = firstName;
      if (email !== undefined) updateData.email = email === "" ? null : email;
      if (phone !== undefined) updateData.phone = phone;
      if (profileImageUrl !== undefined) updateData.profileImageUrl = profileImageUrl;
      if (signatureUrl !== undefined) updateData.signatureUrl = signatureUrl;
      
      const user = await storage.updateUser(userId, updateData);
      res.json(user);
    } catch (err) {
      console.error("Profile update error:", err);
      res.status(500).json({ message: "프로필 업데이트 중 오류가 발생했습니다" });
    }
  });

  // Change password for current user
  app.post("/api/users/me/change-password", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const userId = (req.user as any).claims?.sub || (req.user as any).id;
    
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "현재 비밀번호와 새 비밀번호를 모두 입력해주세요" });
      }
      
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "비밀번호는 최소 6자 이상이어야 합니다" });
      }
      
      // Get current user
      const user = await storage.getUser(userId);
      if (!user || !user.password) {
        return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
      }
      
      // Verify current password
      const isValid = await comparePasswords(currentPassword, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "현재 비밀번호가 올바르지 않습니다" });
      }
      
      // Hash and update new password
      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUser(userId, { password: hashedPassword });
      
      res.json({ success: true, message: "비밀번호가 성공적으로 변경되었습니다" });
    } catch (err) {
      console.error("Password change error:", err);
      res.status(500).json({ message: "비밀번호 변경 중 오류가 발생했습니다" });
    }
  });

  // === AI ENDPOINTS ===
  app.post(api.ai.generateSurvey.path, async (req, res) => {
    const { prompt, image } = req.body;
    // Call OpenAI to generate questions
    try {
      let messages: any[] = [{ 
        role: "system", 
        content: "You are an expert educator. Generate a survey based on the user's prompt. Return JSON with 'title' and 'questions' (array of objects with type, text, options)." 
      }];
      
      let userContent: any[] = [{ type: "text", text: prompt }];
      if (image) {
        userContent.push({ type: "image_url", image_url: { url: image } });
      }
      messages.push({ role: "user", content: userContent });

      const response = await openai!.chat.completions.create({
        model: "gpt-4o", // Use 4o for vision
        messages: messages,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "AI Generation failed" });
    }
  });

  app.post(api.ai.generateCurriculum.path, async (req, res) => {
    const { topic } = req.body;
    try {
        const response = await openai!.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "Generate a curriculum project plan. Return JSON with 'curriculum' object containing 'hours', 'standards', 'evaluation', and a 'mindmap' structure." },
                { role: "user", content: `Topic: ${topic}` }
            ],
            response_format: { type: "json_object" }
        });
        const result = JSON.parse(response.choices[0].message.content || "{}");
        res.json(result);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "AI Generation failed" });
    }
  });

  app.post(api.ai.generateReport.path, async (req, res) => {
      const { type, topic, details } = req.body;
      try {
          const response = await openai!.chat.completions.create({
              model: "gpt-4o",
              messages: [
                  { role: "system", content: `You are an assistant writing a school ${type}. Format in Markdown.` },
                  { role: "user", content: `Topic: ${topic}. Details: ${details}` }
              ]
          });
          res.json({ content: response.choices[0].message.content });
      } catch (e) {
          console.error(e);
          res.status(500).json({ error: "AI Generation failed" });
      }
  });

  // === ADMIN API ===
  // Generalized Role authorization middleware
  const requireRole = (allowedRoles: string[]) => async (req: any, res: any, next: any) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const userId = req.user.claims?.sub || (req.user as any).id;
    const user = await storage.getUser(userId);
    if (!user || !allowedRoles.includes(user.role || "")) {
      return res.status(403).json({ message: "접근 권한이 없습니다" });
    }
    next();
  };

  const requireAdmin = requireRole(["admin", "super_admin"]);
  const requireSuperAdmin = requireRole(["super_admin"]);
  const requireStaff = requireRole(["teacher", "admin", "super_admin"]);

  // Valid roles: 학교 조직 = teacher/student/parent/admin, 일반 조직 = member/admin
  const validRoles = ["teacher", "student", "parent", "member", "admin", "super_admin"] as const;
  
  // Schools management (super admin only)
  app.get("/api/admin/schools", requireSuperAdmin, async (req, res) => {
    try {
      const schools = await storage.getSchools();
      res.json(schools);
    } catch (err) {
      res.status(500).json({ message: "학교 목록 조회 실패" });
    }
  });

  app.post("/api/admin/schools", requireSuperAdmin, async (req, res) => {
    try {
      const { name, type, country, language, adminUserId } = req.body;
      if (!name) return res.status(400).json({ message: "조직 이름을 입력해주세요" });
      const school = await storage.createSchool(name, { type, country, language });

      // ── 두런코인 L2 코인 자동 생성 ──
      // 같은 Neon DB를 직접 사용하므로 webhook 대신 DB 직접 처리
      try {
        const { neon } = await import("@neondatabase/serverless");
        const coinSql = neon(process.env.DATABASE_URL!);

        // 이미 이 조직의 L2 코인이 있는지 확인
        const existing = await coinSql`
          SELECT id FROM economy.asset_types
          WHERE organization_id = ${school.id} AND type = 'community'
        `;

        if (existing.length === 0) {
          // 심볼 자동 생성: 한글 초성 추출 → 영문 매핑 (예: 영인사색이음 → YISE)
          const CHOSUNG_MAP: Record<string, string> = {
            'ㄱ':'G','ㄴ':'N','ㄷ':'D','ㄹ':'R','ㅁ':'M','ㅂ':'B','ㅅ':'S','ㅇ':'Y',
            'ㅈ':'J','ㅊ':'C','ㅋ':'K','ㅌ':'T','ㅍ':'P','ㅎ':'H','ㄲ':'GG','ㄸ':'DD',
            'ㅃ':'BB','ㅆ':'SS','ㅉ':'JJ'
          };
          const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
          let chosungStr = '';
          for (const ch of name) {
            const code = ch.charCodeAt(0);
            if (code >= 0xAC00 && code <= 0xD7A3) {
              const idx = Math.floor((code - 0xAC00) / 28 / 21);
              chosungStr += CHOSUNG_MAP[CHOSUNG[idx]] || '';
            } else if (/[a-zA-Z0-9]/.test(ch)) {
              chosungStr += ch.toUpperCase();
            }
          }
          const symbolBase = (chosungStr.substring(0, 4) || name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().substring(0, 4) || `ORG${school.id}`).toUpperCase();
          let symbol = symbolBase;
          let suffix = 1;
          while (true) {
            const dup = await coinSql`SELECT id FROM economy.asset_types WHERE symbol = ${symbol}`;
            if (dup.length === 0) break;
            symbol = symbolBase.substring(0, 3) + String(suffix++);
          }

          const asset = await coinSql`
            INSERT INTO economy.asset_types (
              name, symbol, type, organization_id,
              max_supply, daily_transfer_limit, expiration_days, scope,
              pricing_model, metadata, is_active
            ) VALUES (
              ${name + ' 코인'},
              ${symbol},
              'community',
              ${school.id},
              1000000, 1000, 365, 'org', 'fixed_policy',
              ${JSON.stringify({ description: `${name} 조직 코인`, autoCreated: true })},
              true
            ) RETURNING id, name, symbol
          `;

          // adminUserId 있으면 org_issuer 권한 부여
          const reqUser = req.user as any;
          const grantUserId = adminUserId || reqUser?.id?.toString();
          if (grantUserId) {
            await coinSql`
              INSERT INTO economy.coin_roles (user_id, role, organization_id, granted_by)
              VALUES (${String(grantUserId)}, 'org_issuer', ${school.id}, ${String(grantUserId)})
              ON CONFLICT (user_id, role, organization_id) DO NOTHING
            `;
          }

          console.log(`[createSchool] L2 코인 자동 생성: ${name} → ${symbol} (assetId: ${asset[0].id})`);
          return res.status(201).json({ ...school, coinAsset: asset[0] });
        }
      } catch (coinErr) {
        console.error("[createSchool] 코인 자동 생성 실패 (조직은 생성됨):", coinErr);
        // 코인 생성 실패해도 조직은 정상 응답
      }

      res.status(201).json(school);
    } catch (err) {
      res.status(500).json({ message: "조직 생성 중 오류가 발생했습니다" });
    }
  });

  // 학교 설정 저장 - 관리자 이상 권한 (학교 관리자도 자신의 학교만 수정 가능)
  app.patch("/api/admin/schools/:id/settings", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { settings } = req.body;
      
      // 학교 관리자는 자신의 학교만 수정 가능
      if ((req.user as any)?.role === 'admin' && (req.user as any)?.schoolId !== id) {
        return res.status(403).json({ message: "자신의 학교만 수정할 수 있습니다" });
      }
      
      const school = await storage.updateSchoolSettings(id, settings);
      res.json(school);
    } catch (err) {
      res.status(500).json({ message: "학교 설정 저장 중 오류가 발생했습니다" });
    }
  });

  app.delete("/api/admin/schools/:id", requireSuperAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteSchool(id);
      res.status(204).send();
    } catch (err: any) {
      console.error("[deleteSchool] error:", err?.message || err);
      res.status(500).json({ message: "삭제 중 오류가 발생했습니다", detail: err?.message });
    }
  });

  // 학교별 통계 API
  app.get("/api/admin/schools/stats", requireSuperAdmin, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const schools = await storage.getSchools();
      
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const stats: Record<number, any> = {};
      
      for (const school of schools) {
        const schoolUsers = allUsers.filter(u => u.schoolId === school.id);
        const schoolUserIds = new Set(schoolUsers.map(u => u.id));
        
        // 채널 수
        const channels = await storage.getChannels(school.id);
        
        // 메시지 수 (전체/오늘/이번달)
        let totalMessages = 0;
        let todayMessages = 0;
        let monthMessages = 0;
        let totalFiles = 0;
        
        for (const channel of channels) {
          const messages = await storage.getChannelMessages(channel.id);
          totalMessages += messages.length;
          todayMessages += messages.filter(m => new Date(m.createdAt!) >= todayStart).length;
          monthMessages += messages.filter(m => new Date(m.createdAt!) >= monthStart).length;
          
          // 파일 수 (메시지에 첨부된 파일)
          for (const msg of messages) {
            const files = (msg.metadata as any)?.files;
            if (files && Array.isArray(files)) {
              totalFiles += files.length;
            }
          }
        }
        
        stats[school.id] = {
          userCount: schoolUsers.length,
          channelCount: channels.length,
          totalMessages,
          todayMessages,
          monthMessages,
          totalFiles,
          // 예상 저장소 (메시지당 약 0.5KB 추정)
          estimatedStorageKB: Math.round(totalMessages * 0.5 + totalFiles * 500),
        };
      }
      
      res.json(stats);
    } catch (err) {
      res.status(500).json({ message: "통계 조회 실패" });
    }
  });

  // 학교 활성/비활성 토글
  app.patch("/api/admin/schools/:id/status", requireSuperAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { isActive } = req.body;
      const school = await storage.getSchool(id);
      if (!school) return res.status(404).json({ message: "학교를 찾을 수 없습니다" });
      const currentSettings = school.settings || {};
      const updated = await storage.updateSchoolSettings(id, { ...currentSettings, isActive: !!isActive });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "상태 변경 실패" });
    }
  });
  const updateUserSchema = z.object({
    role: z.enum(validRoles).optional(),
    department: z.string().optional(),
    position: z.string().optional(),
  });

  const createRouteSchema = z.object({
    approvalType: z.enum(["field_trip", "absence", "transfer", "report", "purchase", "leave", "expense"]),
    approverRole: z.enum(["teacher", "admin"]).optional(),
    approverId: z.string().optional(),
    stepOrder: z.number().min(1),
  });

  // Users Management (protected)
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    const userId = (req.user as any).claims?.sub || (req.user as any).id;
    const currentUser = await storage.getUser(userId);

    // 관리자는 user_organizations 기반으로 자기 조직에 소속된 모든 유저 조회
    // (school_id 기반 필터 제거 — 다중 조직 가입 지원)
    if (currentUser?.role === "admin" && currentUser.schoolId) {
      try {
        const rows = await db.execute(sql`
          SELECT DISTINCT u.*, uo.role as org_role, uo.is_approved as org_approved, uo.organization_id as org_id
          FROM users u
          JOIN user_organizations uo ON uo.user_id = u.id
          WHERE uo.organization_id = ${currentUser.schoolId}
            AND u.username NOT LIKE 'deleted_%'
          ORDER BY u.created_at DESC
        `);
        return res.json(rows.rows || rows);
      } catch (err) {
        console.error("admin/users org-based query error:", err);
        // fallback to school_id filter
        let users = await storage.getAllUsers();
        users = users.filter(u => u.schoolId === currentUser.schoolId);
        return res.json(users.filter(u => !u.isDeleted));
      }
    }

    let users = await storage.getAllUsers();
    // Filter out soft-deleted users
    res.json(users.filter(u => !u.isDeleted));
  });

  // 관리자 전용 유저 생성 — 무조건 isApproved: true
  app.post("/api/admin/users", requireAdmin, async (req: any, res) => {
    try {
      const { username, password, firstName, lastName, email, phone, schoolId, role } = req.body;
      if (!username || !password || !firstName) {
        return res.status(400).json({ message: "아이디, 비밀번호, 이름은 필수입니다" });
      }
      const userRole = role && role !== "super_admin" ? role : "member";
      const existing = await storage.getUserByUsername(username).catch(() => null);
      if (existing) return res.status(400).json({ message: "이미 존재하는 아이디입니다" });

      const hashed = await hashPassword(password);
      const user = await storage.createUser({
        username, password: hashed,
        firstName, lastName: lastName || "",
        email: email || null, phone: phone || null,
        role: userRole,
        schoolId: schoolId ? Number(schoolId) : null,
        isApproved: true, // 관리자가 생성하면 항상 즉시 승인
      });
      res.status(201).json({ success: true, user: { id: user.id, username: user.username } });
    } catch (err) {
      console.error("admin create user error:", err);
      res.status(500).json({ message: "계정 생성 중 오류가 발생했습니다" });
    }
  });

  app.post("/api/admin/users/batch", requireAdmin, async (req, res) => {
    try {
      const { users: newUsers } = req.body;
      if (!Array.isArray(newUsers)) return res.status(400).json({ message: "사용자 목록이 유효하지 않습니다" });

      const userId = (req.user as any).claims?.sub || (req.user as any).id;
      const currentUser = await storage.getUser(userId);

      const results = [];
      for (const userData of newUsers) {
        const hashedPassword = userData.password ? await hashPassword(userData.password) : undefined;
        const email = userData.email && userData.email.trim() !== "" ? userData.email.trim() : null;
        
        // Inherit schoolId from current admin if they are a regular admin
        const schoolId = (currentUser?.role === "admin" && currentUser.schoolId) 
          ? currentUser.schoolId 
          : userData.schoolId;

        const user = await storage.createUser({
          ...userData,
          email,
          password: hashedPassword,
          schoolId
        });
        results.push(user);
      }
      res.status(201).json(results);
    } catch (err: any) {
      console.error("Batch user creation error:", err);
      if (err?.code === '23505') {
        const detail = err?.detail || '';
        if (detail.includes('username')) return res.status(400).json({ message: "이미 존재하는 아이디입니다." });
        if (detail.includes('email')) return res.status(400).json({ message: "이미 존재하는 이메일입니다." });
      }
      res.status(500).json({ message: "사용자 일괄 등록 중 오류가 발생했습니다" });
    }
  });

  // Bulk update endpoint
  app.post("/api/admin/users/batch-update", requireAdmin, async (req, res) => {
    try {
      const { userIds, updates } = req.body;
      if (!Array.isArray(userIds)) return res.status(400).json({ message: "사용자 ID 목록이 필요합니다" });
      
      const results = [];
      for (const id of userIds) {
        const user = await storage.updateUser(id, updates);
        results.push(user);
      }
      
      console.log(`[AUDIT] Bulk update by ${(req.user as any).id}: ${userIds.length} users updated with ${JSON.stringify(updates)}`);
      res.json({ success: true, count: results.length });
    } catch (err) {
      console.error("Batch update error:", err);
      res.status(500).json({ message: "일괄 수정 중 오류가 발생했습니다" });
    }
  });

  // Bulk delete endpoint (soft-delete)
  app.post("/api/admin/users/batch-delete", requireAdmin, async (req, res) => {
    try {
      const { userIds } = req.body;
      if (!Array.isArray(userIds)) return res.status(400).json({ message: "사용자 ID 목록이 필요합니다" });
      
      for (const id of userIds) {
        await storage.updateUser(id, { isDeleted: true });
      }
      
      console.log(`[AUDIT] Bulk delete by ${(req.user as any).id}: ${userIds.length} users soft-deleted`);
      res.json({ success: true, count: userIds.length });
    } catch (err) {
      console.error("Batch delete error:", err);
      res.status(500).json({ message: "일괄 삭제 중 오류가 발생했습니다" });
    }
  });

  // Reset password (admin only)
  app.post("/api/admin/users/:id/reset-password", requireAdmin, async (req, res) => {
    try {
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 4) return res.status(400).json({ message: "비밀번호는 4자 이상이어야 합니다" });
      
      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUser(req.params.id, { password: hashedPassword });
      
      console.log(`[AUDIT] Password reset for user ${req.params.id} by admin ${(req.user as any).id}`);
      res.json({ success: true, message: "비밀번호가 초기화되었습니다" });
    } catch (err) {
      res.status(500).json({ message: "비밀번호 초기화 중 오류가 발생했습니다" });
    }
  });

  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const { firstName, email, phone, role, department, position } = req.body;
      const user = await storage.updateUser(req.params.id, {
        firstName,
        email: email || null,
        phone,
        role,
        department,
        position
      });
      res.json(user);
    } catch (err) {
      res.status(500).json({ message: "사용자 정보 수정 중 오류가 발생했습니다" });
    }
  });

  // Withdrawal (User self-delete)
  app.delete("/api/users/me", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "인증이 필요합니다" });
    const userId = (req.user as any).claims?.sub || (req.user as any).id;
    
    try {
      await storage.updateUser(userId, { isDeleted: true });
      req.logout(() => {
        res.json({ success: true, message: "탈퇴가 완료되었습니다" });
      });
    } catch (err) {
      res.status(500).json({ message: "탈퇴 처리 중 오류가 발생했습니다" });
    }
  });

  // 관리자 사용자 수정 (역할 변경, 승인 등)
  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = z.string().min(1).parse(req.params.id);
      const { role, isApproved } = req.body;
      const updateData: any = {};
      if (role !== undefined) updateData.role = role;
      if (isApproved !== undefined) updateData.isApproved = isApproved;
      const user = await storage.updateUser(id, updateData);
      res.json(user);
    } catch (err) {
      res.status(500).json({ message: "사용자 수정 중 오류가 발생했습니다" });
    }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = z.string().min(1).parse(req.params.id);
      await storage.deleteUser(id);
      res.status(204).send();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "잘못된 사용자 ID입니다" });
      }
      res.status(500).json({ message: "사용자 삭제 중 오류가 발생했습니다" });
    }
  });

  // Approval Routes Management (protected)
  app.get("/api/admin/approval-routes", requireAdmin, async (req, res) => {
    const schoolId = (req as any).schoolId;
    const routes = await storage.getApprovalRoutes(schoolId);
    res.json(routes);
  });

  app.post("/api/admin/approval-routes", requireAdmin, async (req, res) => {
    try {
      const validated = createRouteSchema.parse(req.body);
      const schoolId = (req as any).schoolId;
      const route = await storage.createApprovalRoute({ ...validated, schoolId });
      res.status(201).json(route);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "잘못된 입력입니다", errors: err.errors });
      }
      res.status(500).json({ message: "결재 라인 생성 중 오류가 발생했습니다" });
    }
  });

  const updateRouteSchema = z.object({
    approvalType: z.enum(["field_trip", "absence", "transfer", "report", "purchase", "leave", "expense"]).optional(),
    approverRole: z.enum(["teacher", "admin"]).optional(),
    approverId: z.string().optional(),
    stepOrder: z.number().min(1).optional(),
    isActive: z.string().optional(),
  });

  app.patch("/api/admin/approval-routes/:id", requireAdmin, async (req, res) => {
    try {
      const validated = updateRouteSchema.parse(req.body);
      const route = await storage.updateApprovalRoute(Number(req.params.id), validated);
      res.json(route);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "잘못된 입력입니다", errors: err.errors });
      }
      res.status(500).json({ message: "결재 라인 수정 중 오류가 발생했습니다" });
    }
  });

  app.delete("/api/admin/approval-routes/:id", requireAdmin, async (req, res) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      await storage.deleteApprovalRoute(id);
      res.status(204).send();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "잘못된 결재 라인 ID입니다" });
      }
      res.status(500).json({ message: "결재 라인 삭제 중 오류가 발생했습니다" });
    }
  });

  // 결재 라인 일괄 저장 (해당 타입의 기존 라인 삭제 후 새로 생성)
  app.put("/api/admin/approval-routes/bulk", requireAdmin, async (req, res) => {
    const schoolId = (req as any).schoolId;
    const { approvalType, steps } = req.body; // steps: [{ approverId, stepOrder }]
    try {
      // 해당 타입의 기존 라인 삭제
      const existing = await storage.getApprovalRoutesByType(approvalType, schoolId);
      for (const r of existing) {
        await storage.deleteApprovalRoute(r.id);
      }
      // 새로 생성
      const created = [];
      for (const step of steps) {
        const route = await storage.createApprovalRoute({
          schoolId,
          approvalType,
          approverId: step.approverId,
          approverRole: step.approverRole || null,
          stepOrder: step.stepOrder,
          isActive: "true",
        });
        created.push(route);
      }
      res.json(created);
    } catch (err) {
      console.error("Bulk approval route error:", err);
      res.status(500).json({ message: "결재 라인 저장 중 오류가 발생했습니다" });
    }
  });

  // Calendar Settings (Google Calendar Integration)
  const calendarSettingSchema = z.object({
    type: z.enum(["academic", "duty"]),
    calendarId: z.string().optional(),
    syncEnabled: z.boolean().default(false),
  });

  app.get("/api/admin/calendar-settings", requireAdmin, async (req, res) => {
    const settings = await storage.getCalendarSettings();
    res.json(settings);
  });

  app.post("/api/admin/calendar-settings", requireAdmin, async (req, res) => {
    try {
      const validated = calendarSettingSchema.parse(req.body);
      const setting = await storage.upsertCalendarSetting(validated);
      res.json(setting);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "잘못된 입력입니다", errors: err.errors });
      }
      res.status(500).json({ message: "캘린더 설정 저장 중 오류가 발생했습니다" });
    }
  });

  // === Google Calendar OAuth2 양방향 동기화 ===
  const GOOGLE_CLIENT_ID = "909416358091-ou8apfdvjg2e4mdq8bbatnfb7nbp1foa.apps.googleusercontent.com";
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
  const getGoogleRedirectUri = (req: any) => {
    const host = req.get('host');
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    return `${protocol}://${host}/api/auth/google/callback`;
  };

  const createOAuth2Client = (req: any) => {
    return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, getGoogleRedirectUri(req));
  };

  const getAuthenticatedCalendar = (tokens: any) => {
    const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    auth.setCredentials(tokens);
    return google.calendar({ version: "v3", auth });
  };

  // Step 1: 구글 인증 시작 — 관리자가 클릭하면 구글 로그인 페이지로 리다이렉트
  app.get("/api/auth/google/calendar", (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const oauth2Client = createOAuth2Client(req);
    const schoolId = (req.user as any).schoolId;
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/calendar"],
      state: JSON.stringify({ schoolId, userId: (req.user as any).id }),
    });
    res.json({ url });
  });

  // Step 2: 구글 콜백 — 토큰 받아서 학교 settings에 저장
  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      if (!code || !state) return res.status(400).send("인증 코드가 없습니다.");

      const { schoolId } = JSON.parse(state as string);
      const oauth2Client = createOAuth2Client(req);
      const { tokens } = await oauth2Client.getToken(code as string);

      // 학교 설정에 토큰 저장
      const schools = await storage.getSchools();
      const school = schools.find(s => s.id === schoolId);
      if (!school) return res.status(404).send("학교를 찾을 수 없습니다.");

      const settings = (school.settings || {}) as any;
      settings.googleCalendarTokens = tokens;

      // 연결된 캘린더 목록도 가져오기
      const calendar = getAuthenticatedCalendar(tokens);
      const calendarList = await calendar.calendarList.list();
      const calendars = (calendarList.data.items || []).map(c => ({
        id: c.id,
        summary: c.summary,
        primary: c.primary || false,
      }));
      settings.googleCalendars = calendars;

      await storage.updateSchoolSettings(schoolId, settings);

      // 성공 시 관리자 페이지로 리다이렉트
      res.send(`
        <html><body>
          <script>
            window.opener?.postMessage({ type: 'GOOGLE_CALENDAR_CONNECTED' }, '*');
            window.close();
          </script>
          <p>구글 캘린더 연동 완료! 이 창을 닫아주세요.</p>
        </body></html>
      `);
    } catch (err) {
      console.error("Google OAuth callback error:", err);
      res.status(500).send("구글 인증 중 오류가 발생했습니다.");
    }
  });

  // 구글 캘린더 연동 해제
  app.post("/api/calendar/google/disconnect", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const schoolId = (req.user as any).schoolId;
    if (!schoolId) return res.status(400).json({ message: "소속 학교가 없습니다" });

    const schools = await storage.getSchools();
    const school = schools.find(s => s.id === schoolId);
    if (!school) return res.status(404).json({ message: "학교를 찾을 수 없습니다" });

    const settings = (school.settings || {}) as any;
    delete settings.googleCalendarTokens;
    delete settings.googleCalendars;
    delete settings.googleCalendarAcademicId;
    delete settings.googleCalendarDutyId;
    await storage.updateSchoolSettings(schoolId, settings);
    res.json({ success: true });
  });

  // 연동된 캘린더 목록 가져오기
  app.get("/api/calendar/google/calendars", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const schoolId = (req.user as any).schoolId;
    if (!schoolId) return res.status(400).json({ message: "소속 학교가 없습니다" });

    const schools = await storage.getSchools();
    const school = schools.find(s => s.id === schoolId);
    const settings = (school?.settings || {}) as any;

    if (!settings.googleCalendarTokens) {
      return res.json({ connected: false, calendars: [] });
    }

    try {
      const calendar = getAuthenticatedCalendar(settings.googleCalendarTokens);
      const calendarList = await calendar.calendarList.list();
      const calendars = (calendarList.data.items || []).map(c => ({
        id: c.id,
        summary: c.summary,
        primary: c.primary || false,
      }));
      res.json({ connected: true, calendars });
    } catch (err) {
      console.error("Google calendar list error:", err);
      res.json({ connected: false, calendars: [], error: "토큰이 만료되었습니다. 다시 연동해주세요." });
    }
  });

  // 학사/업무 캘린더 ID 매핑 저장
  app.post("/api/calendar/google/map", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const schoolId = (req.user as any).schoolId;
    if (!schoolId) return res.status(400).json({ message: "소속 학교가 없습니다" });

    const { academicCalendarId, dutyCalendarId } = req.body;
    const schools = await storage.getSchools();
    const school = schools.find(s => s.id === schoolId);
    if (!school) return res.status(404).json({ message: "학교를 찾을 수 없습니다" });

    const settings = (school.settings || {}) as any;
    settings.googleCalendarAcademicId = academicCalendarId || null;
    settings.googleCalendarDutyId = dutyCalendarId || null;
    await storage.updateSchoolSettings(schoolId, settings);
    res.json({ success: true });
  });

  // === 양방향 동기화: Google → 앱, 앱 → Google ===
  app.post("/api/calendar/google/sync", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const schoolId = (req.user as any).schoolId;
    if (!schoolId) return res.status(400).json({ message: "소속 학교가 없습니다" });

    const schools = await storage.getSchools();
    const school = schools.find(s => s.id === schoolId);
    if (!school) return res.status(404).json({ message: "학교를 찾을 수 없습니다" });

    const settings = (school.settings || {}) as any;
    if (!settings.googleCalendarTokens) {
      return res.status(400).json({ message: "구글 캘린더가 연동되지 않았습니다" });
    }

    try {
      const calendar = getAuthenticatedCalendar(settings.googleCalendarTokens);
      const result = { fromGoogle: 0, toGoogle: 0, updated: 0, deleted: 0 };

      const syncCalendar = async (calendarId: string | null, type: string) => {
        if (!calendarId) return;

        // 1. Google → 앱: 구글 일정 가져오기
        const googleEvents = await calendar.events.list({
          calendarId,
          maxResults: 500,
          singleEvents: true,
          orderBy: "startTime",
          timeMin: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // 90일 전부터
        });

        const existingEvents = await storage.getEvents(schoolId);
        const existingByGoogleId = new Map<string, any>();
        for (const e of existingEvents) {
          if ((e as any).googleEventId && (e as any).type === type) {
            existingByGoogleId.set((e as any).googleEventId, e);
          }
        }

        const seenGoogleIds = new Set<string>();

        for (const gEvent of googleEvents.data.items || []) {
          if (!gEvent.id || gEvent.status === 'cancelled') continue;
          const googleId = `gcal-${gEvent.id}`;
          seenGoogleIds.add(googleId);

          const startTime = gEvent.start?.dateTime ? new Date(gEvent.start.dateTime) : gEvent.start?.date ? new Date(gEvent.start.date) : null;
          const isAllDay = !!gEvent.start?.date;
          const endTime = gEvent.end?.dateTime ? new Date(gEvent.end.dateTime) : gEvent.end?.date ? new Date(gEvent.end.date) : null;
          const existing = existingByGoogleId.get(googleId);

          if (existing) {
            // 업데이트 감지: 제목, 시간이 다르면 업데이트
            if (existing.title !== gEvent.summary || 
                new Date(existing.startTime).getTime() !== startTime!.getTime()) {
              await storage.updateEvent(existing.id, {
                title: gEvent.summary || "Untitled",
                description: gEvent.description || "",
                startTime: startTime!,
                endTime: endTime! || new Date(startTime!.getTime() + 3600000),
                isAllDay,
              });
              result.updated++;
            }
          } else {
            // 새 이벤트 가져오기
            await storage.createEvent({
              title: gEvent.summary || "Untitled",
              description: gEvent.description || "",
              startTime: startTime!,
              endTime: endTime! || new Date(startTime!.getTime() + 3600000),
              creatorId: "google-sync",
              type,
              isAllDay,
              schoolId,
              googleEventId: googleId,
            });
            result.fromGoogle++;
          }
        }

        // Google에서 삭제된 이벤트 처리
        for (const [googleId, event] of existingByGoogleId) {
          if (!seenGoogleIds.has(googleId)) {
            await storage.deleteEvent(event.id);
            result.deleted++;
          }
        }

        // 2. 앱 → Google: 앱에서 직접 만든 일정을 구글에 업로드
        const localOnlyEvents = existingEvents.filter(
          e => (e as any).type === type && !(e as any).googleEventId
        );

        for (const localEvent of localOnlyEvents) {
          try {
            const gEvent = await calendar.events.insert({
              calendarId,
              requestBody: {
                summary: localEvent.title,
                description: (localEvent as any).description || "",
                start: (localEvent as any).isAllDay
                  ? { date: new Date(localEvent.startTime).toISOString().split("T")[0] }
                  : { dateTime: new Date(localEvent.startTime).toISOString() },
                end: (localEvent as any).isAllDay
                  ? { date: new Date(localEvent.endTime).toISOString().split("T")[0] }
                  : { dateTime: new Date(localEvent.endTime).toISOString() },
                location: (localEvent as any).location || undefined,
              },
            });

            // 생성된 구글 이벤트 ID를 저장
            if (gEvent.data.id) {
              await storage.updateEvent(localEvent.id, {
                googleEventId: `gcal-${gEvent.data.id}`,
              });
            }
            result.toGoogle++;
          } catch (err) {
            console.error(`[Google Sync] Failed to push event ${localEvent.id}:`, err);
          }
        }

        // 3. 앱에서 수정된 이벤트를 구글에 반영
        const syncedLocalEvents = existingEvents.filter(
          e => (e as any).type === type && (e as any).googleEventId?.startsWith('gcal-')
        );

        for (const localEvent of syncedLocalEvents) {
          const googleId = (localEvent as any).googleEventId.replace('gcal-', '');
          try {
            const gEvent = await calendar.events.get({ calendarId, eventId: googleId });
            if (gEvent.data) {
              const gTitle = gEvent.data.summary || "";
              const gStart = gEvent.data.start?.dateTime ? new Date(gEvent.data.start.dateTime) : gEvent.data.start?.date ? new Date(gEvent.data.start.date) : null;
              
              // 앱 쪽이 더 최근에 수정되었으면 구글에 반영
              if (gTitle !== localEvent.title || (gStart && Math.abs(gStart.getTime() - new Date(localEvent.startTime).getTime()) > 60000)) {
                await calendar.events.update({
                  calendarId,
                  eventId: googleId,
                  requestBody: {
                    summary: localEvent.title,
                    description: (localEvent as any).description || "",
                    start: (localEvent as any).isAllDay
                      ? { date: new Date(localEvent.startTime).toISOString().split("T")[0] }
                      : { dateTime: new Date(localEvent.startTime).toISOString() },
                    end: (localEvent as any).isAllDay
                      ? { date: new Date(localEvent.endTime).toISOString().split("T")[0] }
                      : { dateTime: new Date(localEvent.endTime).toISOString() },
                  },
                });
              }
            }
          } catch (err: any) {
            // 404 = 구글에서 삭제됨 → 앱에서도 삭제
            if (err?.code === 404) {
              await storage.deleteEvent(localEvent.id);
              result.deleted++;
            }
          }
        }
      };

      await syncCalendar(settings.googleCalendarAcademicId, "academic");
      await syncCalendar(settings.googleCalendarDutyId, "duty");

      res.json({
        success: true,
        ...result,
        message: `Google→앱: ${result.fromGoogle}개, 앱→Google: ${result.toGoogle}개, 수정: ${result.updated}개, 삭제: ${result.deleted}개`
      });
    } catch (err: any) {
      console.error("Google calendar sync error:", err);
      if (err?.response?.status === 401 || err?.code === 401) {
        return res.status(401).json({ message: "구글 인증이 만료되었습니다. 다시 연동해주세요." });
      }
      res.status(500).json({ message: "동기화 중 오류가 발생했습니다" });
    }
  });

  // 이벤트 생성/수정/삭제 시 구글 캘린더에 자동 반영
  const syncEventToGoogle = async (schoolId: number, eventId: number, action: 'create' | 'update' | 'delete', eventData?: any) => {
    // Build rich description including options for Google Calendar
    const buildDescription = (data: any): string => {
      const parts: string[] = [];
      if (data?.description) parts.push(data.description);
      if (data?.type === 'academic') {
        if (data.isOffCampus) parts.push('🎒 교외체험학습');
        if (data.busOption && data.busOption !== 'none') parts.push(`🚌 ${data.busOption}${data.busRequestComplete ? ' ✅ 배차신청 완료' : ''}`);
        if (data.location) parts.push(`📍 ${data.location}`);
        if (data.supportRequest) parts.push(`📋 지원요청: ${data.supportRequest}`);
      }
      return parts.join('\n');
    };

    try {
      const schools = await storage.getSchools();
      const school = schools.find(s => s.id === schoolId);
      if (!school) return;
      const settings = (school.settings || {}) as any;
      if (!settings.googleCalendarTokens) return;

      const type = eventData?.type || 'academic';
      const calendarId = type === 'duty' ? settings.googleCalendarDutyId : settings.googleCalendarAcademicId;
      if (!calendarId) return;

      const calendar = getAuthenticatedCalendar(settings.googleCalendarTokens);

      // 종일 이벤트의 날짜를 학교 시간대 기준으로 변환
      const schoolTimezone = settings.timezone || 'Asia/Seoul';
      // 종일 이벤트: UTC 자정으로 저장되므로 ISO 문자열에서 날짜만 추출
      const toDateOnly = (dt: any) => new Date(dt).toISOString().split('T')[0];

      if (action === 'create' && eventData) {
        const gEvent = await calendar.events.insert({
          calendarId,
          requestBody: {
            summary: eventData.title,
            description: buildDescription(eventData),
            start: eventData.isAllDay
              ? { date: toDateOnly(eventData.startTime) }
              : { dateTime: new Date(eventData.startTime).toISOString(), timeZone: schoolTimezone },
            end: eventData.isAllDay
              ? { date: toDateOnly(eventData.endTime) }
              : { dateTime: new Date(eventData.endTime).toISOString(), timeZone: schoolTimezone },
          },
        });
        if (gEvent.data.id) {
          await storage.updateEvent(eventId, { googleEventId: `gcal-${gEvent.data.id}` });
        }
      } else if (action === 'update' && eventData?.googleEventId?.startsWith('gcal-')) {
        const googleId = eventData.googleEventId.replace('gcal-', '');
        await calendar.events.update({
          calendarId,
          eventId: googleId,
          requestBody: {
            summary: eventData.title,
            description: buildDescription(eventData),
            start: eventData.isAllDay
              ? { date: toDateOnly(eventData.startTime) }
              : { dateTime: new Date(eventData.startTime).toISOString(), timeZone: schoolTimezone },
            end: eventData.isAllDay
              ? { date: toDateOnly(eventData.endTime) }
              : { dateTime: new Date(eventData.endTime).toISOString(), timeZone: schoolTimezone },
          },
        });
      } else if (action === 'delete' && eventData?.googleEventId?.startsWith('gcal-')) {
        const googleId = eventData.googleEventId.replace('gcal-', '');
        try {
          await calendar.events.delete({ calendarId, eventId: googleId });
        } catch (err: any) {
          if (err?.code !== 404) throw err;
        }
      }
    } catch (err) {
      console.error(`[Google Sync] ${action} event ${eventId} error:`, err);
    }
  };

  // Sync events to Google Calendar (triggered when creating/updating events)
  app.post("/api/calendar/sync", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    
    try {
      const { eventId, action } = req.body; // action: create, update, delete
      const event = await storage.getEvents().then(evts => evts.find(e => e.id === eventId));
      if (!event) return res.status(404).json({ message: "이벤트를 찾을 수 없습니다" });
      
      const calendarType = event.type || "academic";
      const setting = await storage.getCalendarSettingByType(calendarType);
      
      if (!setting || !setting.syncEnabled || !setting.calendarId) {
        return res.json({ synced: false, message: "구글 캘린더 연동이 설정되지 않았습니다" });
      }
      
      // Google Calendar sync will be handled here when integration is set up
      // For now, return pending status
      res.json({ synced: false, message: "Google Calendar 연동을 설정해주세요" });
    } catch (err) {
      console.error("Calendar sync error:", err);
      res.status(500).json({ message: "캘린더 동기화 중 오류가 발생했습니다" });
    }
  });

  // ICal 파싱 API - 구글 캘린더 주소에서 이벤트 가져오기
  app.get("/api/calendar/import-ical", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    
    try {
      const { url, type } = req.query;
      if (!url || !type) {
        return res.status(400).json({ message: "url과 type 파라미터가 필요합니다" });
      }
      
      // Fetch ICal data
      const response = await fetch(url as string, {
        headers: {
          'User-Agent': 'SmartSchoolHub/1.0'
        }
      });
      
      if (!response.ok) {
        return res.status(400).json({ message: "ICal URL을 불러올 수 없습니다" });
      }
      
      const icalData = await response.text();
      
      // Parse ICal data
      const jcalData = ical.parse(icalData);
      const comp = new ical.Component(jcalData);
      const vevents = comp.getAllSubcomponents('vevent');
      
      const events = vevents.map(vevent => {
        const event = new ical.Event(vevent);
        return {
          title: event.summary,
          description: event.description,
          start: event.startDate?.toJSDate(),
          end: event.endDate?.toJSDate(),
          location: event.location,
          isAllDay: !event.startDate?.isDate === false
        };
      });
      
      res.json({ 
        success: true, 
        type, 
        count: events.length,
        events 
      });
    } catch (err) {
      console.error("ICal import error:", err);
      res.status(500).json({ message: "ICal 파싱 중 오류가 발생했습니다" });
    }
  });

  // 학교 설정에서 구글 캘린더 URL을 가져와서 이벤트 동기화
  app.post("/api/calendar/sync-from-settings", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    
    try {
      const schoolId = (req.user as any).schoolId;
      if (!schoolId) {
        return res.status(400).json({ message: "소속 학교가 없습니다" });
      }
      
      // 학교 설정 가져오기
      const schools = await storage.getSchools();
      const school = schools.find(s => s.id === schoolId);
      
      if (!school || !school.settings) {
        return res.status(404).json({ message: "학교 설정을 찾을 수 없습니다" });
      }
      
      const settings = school.settings as any;
      const academicUrl = settings.googleCalendarAcademicUrl;
      const dutyUrl = settings.googleCalendarDutyUrl;
      
      if (!academicUrl && !dutyUrl) {
        return res.status(400).json({ message: "구글 캘린더 주소가 설정되지 않았습니다" });
      }
      
      // ICal events fetch and import
      const importEvent = async (url: string, type: string) => {
        if (!url) return [];
        
        try {
          const response = await fetch(url, {
            headers: { 'User-Agent': 'SmartSchoolHub/1.0' }
          });
          
          if (!response.ok) return [];
          
          const icalData = await response.text();
          const jcalData = ical.parse(icalData);
          const comp = new ical.Component(jcalData);
          const vevents = comp.getAllSubcomponents('vevent');
          
          const importedEvents = [];
          for (const vevent of vevents) {
            const event = new ical.Event(vevent);
            const startTime = event.startDate?.toJSDate();
            const endTime = event.endDate?.toJSDate();
            
            if (startTime) {
              const newEvent = await storage.createEvent({
                title: event.summary || "Untitled",
                description: event.description || "",
                startTime: startTime!,
                endTime: endTime! || new Date(startTime!.getTime() + 3600000),
                creatorId: (req.user as any).id,
                type,
                isAllDay: !event.startDate?.isDate,
                schoolId: schoolId
              });
              importedEvents.push(newEvent);
            }
          }
          return importedEvents;
        } catch (err) {
          console.error(`Error importing ${type} calendar:`, err);
          return [];
        }
      };
      
      // Import both calendars
      const academicEvents = await importEvent(academicUrl, "academic");
      const dutyEvents = await importEvent(dutyUrl, "duty");
      
      res.json({
        success: true,
        imported: {
          academic: academicEvents.length,
          duty: dutyEvents.length
        },
        total: academicEvents.length + dutyEvents.length
      });
    } catch (err) {
      console.error("Calendar sync error:", err);
      res.status(500).json({ message: "캘린더 동기화 중 오류가 발생했습니다" });
    }
  });

  // === MONTHLY PLAN API (월중계획) ===
  // Only school staff can edit (teacher, admin)
  const schoolStaffRoles = ["teacher", "admin"];
  
  app.get("/api/monthly-plan", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    
    const { year, month } = req.query;
    if (!year || !month) {
      return res.status(400).json({ message: "year와 month 파라미터가 필요합니다" });
    }
    
    const schoolId = (req as any).schoolId;
    try {
      const cells = await storage.getMonthlyPlanCells(Number(year), Number(month), schoolId);
      const events = await storage.getEventsForMonth(Number(year), Number(month), schoolId);
      res.json({ cells, events });
    } catch (err) {
      console.error("Monthly plan fetch error:", err);
      res.status(500).json({ message: "월중계획을 불러오는 중 오류가 발생했습니다" });
    }
  });
  
  app.post("/api/monthly-plan/cell", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    
    const user = (req.user as any).claims || (req.user as any);
    const userId = user?.sub || user?.id;
    
    // Check if user has school staff role
    const dbUser = await storage.getUser(userId);
    if (!dbUser || !schoolStaffRoles.includes(dbUser.role || "")) {
      return res.status(403).json({ message: "교직원만 수정할 수 있습니다" });
    }
    
    try {
      const { date, columnType, content } = req.body;
      const schoolId = (req as any).schoolId;
      if (!date || !columnType) {
        return res.status(400).json({ message: "date와 columnType이 필요합니다" });
      }
      
      const cell = await storage.upsertMonthlyPlanCell({
        date,
        columnType,
        content: content || "",
        updatedBy: userId,
        schoolId
      });
      res.json(cell);
    } catch (err) {
      console.error("Monthly plan cell update error:", err);
      res.status(500).json({ message: "셀 저장 중 오류가 발생했습니다" });
    }
  });

  // === NOTIFICATIONS API ===
  app.get("/api/notifications", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const userId = (req.user as any).claims?.sub || (req.user as any).id;
    if (!userId) return res.status(401).json({ message: "사용자 정보를 찾을 수 없습니다" });
    const notifications = await storage.getNotifications(userId);
    res.json(notifications);
  });

  app.post("/api/notifications/:id/read", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    await storage.markNotificationRead(Number(req.params.id));
    res.status(200).json({ success: true });
  });

  // === PORTFOLIO API ===
  app.get("/api/portfolios/:studentId", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const portfolios = await storage.getPortfolios(req.params.studentId);
    res.json(portfolios);
  });

  app.post("/api/portfolios", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    try {
      const portfolio = await storage.createPortfolio(req.body);
      res.status(201).json(portfolio);
    } catch (err) {
      res.status(500).json({ message: "포트폴리오 생성 중 오류가 발생했습니다" });
    }
  });

  app.delete("/api/portfolios/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    await storage.deletePortfolio(Number(req.params.id));
    res.status(204).send();
  });

  // === USER SETTINGS (개인 설정) ===
  app.get("/api/settings", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const userId = (req.user as any).claims?.sub || (req.user as any).id;
    if (!userId) return res.status(401).json({ message: "사용자 정보를 찾을 수 없습니다" });
    
    try {
      const settings = await storage.getUserSettings(userId);
      res.json(settings || { 
        userId, 
        doNotDisturbEnabled: false, 
        doNotDisturbStart: null, 
        doNotDisturbEnd: null 
      });
    } catch (err) {
      res.status(500).json({ message: "설정 조회 중 오류가 발생했습니다" });
    }
  });

  app.post("/api/settings", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const userId = (req.user as any).claims?.sub || (req.user as any).id;
    if (!userId) return res.status(401).json({ message: "사용자 정보를 찾을 수 없습니다" });
    
    try {
      const { doNotDisturbEnabled, doNotDisturbStart, doNotDisturbEnd } = req.body;
      const settings = await storage.upsertUserSettings({
        userId,
        doNotDisturbEnabled,
        doNotDisturbStart,
        doNotDisturbEnd
      });
      res.json(settings);
    } catch (err) {
      res.status(500).json({ message: "설정 저장 중 오류가 발생했습니다" });
    }
  });

  // 채팅 그룹 설정 조회
  // 학교 단위 채팅 그룹 설정 조회 (모든 사용자)
  app.get("/api/settings/chat-groups", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const currentUser = req.user as any;
    const schoolId = currentUser.schoolId;
    if (!schoolId) return res.json([]);
    try {
      const school = await storage.getSchool(schoolId);
      res.json(school?.settings?.chatGroupSettings || []);
    } catch (err) {
      res.json([]);
    }
  });

  // 학교 단위 채팅 그룹 설정 저장 (관리자만)
  app.post("/api/settings/chat-groups", requireAdmin, async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "인증이 필요합니다" });
    const currentUser = req.user as any;
    const schoolId = currentUser.schoolId;
    if (!schoolId) return res.status(400).json({ message: "학교 소속이 필요합니다" });
    try {
      const { chatGroupSettings } = req.body;
      const school = await storage.getSchool(schoolId);
      const currentSettings = school?.settings || {};
      await storage.updateSchoolSettings(schoolId, { ...currentSettings, chatGroupSettings });
      res.json(chatGroupSettings);
    } catch (err) {
      res.status(500).json({ message: "저장 실패" });
    }
  });

  // === NEIS API ===
  app.get("/api/neis/meals", async (req, res) => {
    const { officeCode, schoolCode, date } = req.query;
    if (!officeCode || !schoolCode || !date) {
      return res.status(400).json({ message: "officeCode, schoolCode, date are required" });
    }
    const meals = await neisService.getMeals(officeCode as string, schoolCode as string, date as string);
    res.json(meals);
  });

  app.get("/api/neis/schedules", async (req, res) => {
    const { officeCode, schoolCode, startDate, endDate } = req.query;
    if (!officeCode || !schoolCode || !startDate || !endDate) {
      return res.status(400).json({ message: "officeCode, schoolCode, startDate, endDate are required" });
    }
    const schedules = await neisService.getSchedules(officeCode as string, schoolCode as string, startDate as string, endDate as string);
    res.json(schedules);
  });

  // === SEED DATA ===
  const schools = await storage.getSchools();
  let demoSchool = schools.find(s => s.name === "시범초등학교");
  if (!demoSchool) {
    console.log("Seeding initial school...");
    demoSchool = await storage.createSchool("시범초등학교");
  }
  const defaultSchoolId = demoSchool.id;

  const superAdmin = await storage.getUserByUsername("super");
  if (!superAdmin) {
    console.log("Seeding super admin...");
    const superAdminPassword = await hashPassword("super123");
    await storage.createUser({
      username: "super",
      password: superAdminPassword,
      email: "super@system.com",
      firstName: "최고관리자",
      lastName: "",
      role: "super_admin"
    });
  }

  const schoolAdmin = await storage.getUserByUsername("admin");
  if (!schoolAdmin) {
    console.log("Seeding school admin...");
    const adminPassword = await hashPassword("admin123");
    await storage.createUser({
      username: "admin",
      password: adminPassword,
      email: "admin@school.com",
      firstName: "학교관리자",
      lastName: "",
      role: "admin",
      schoolId: defaultSchoolId
    });
  } else if (schoolAdmin.schoolId === null) {
    console.log("Updating existing admin with schoolId...");
    await storage.updateUser(schoolAdmin.id, { schoolId: defaultSchoolId });
  }

  const existingPosts = await storage.getPosts();
  if (existingPosts.length === 0) {
    console.log("Seeding database content...");
    await storage.createPost({ 
      title: "Welcome to Smart School", 
      content: "Welcome to the new digital platform for our school. Check out the AI tools and Approvals system!", 
      authorId: "system", 
      category: "notice",
      schoolId: defaultSchoolId
    });
    
    await storage.createChannel("General", "school", defaultSchoolId);
    await storage.createChannel("Staff Room", "school", defaultSchoolId);
    
    await storage.createEvent({ 
      title: "School Opening Ceremony", 
      startTime: new Date(), 
      endTime: new Date(Date.now() + 3600000), 
      creatorId: "system", 
      type: "academic",
      isAllDay: false,
      schoolId: defaultSchoolId
    });

    // Create a demo survey
    await storage.createSurvey({
      title: "Student Satisfaction Survey",
      description: "Please rate your experience this semester.",
      questions: [
        { type: "rating", text: "How do you like the new cafeteria menu?", options: ["1", "2", "3", "4", "5"] },
        { type: "text", text: "Any suggestions for improvement?" }
      ],
      creatorId: "system",
      isActive: true,
      schoolId: defaultSchoolId
    });
  }

  // === 구글 캘린더 자동 동기화 (1시간마다) ===
  const syncAllSchoolCalendars = async () => {
    try {
      const schools = await storage.getSchools();
      for (const school of schools) {
        const settings = school.settings as any;
        if (!settings) continue;

        // 방법 1: Google Calendar API (OAuth2 토큰이 있는 경우 - 양방향)
        if (settings.googleCalendarTokens) {
          try {
            const calendar = getAuthenticatedCalendar(settings.googleCalendarTokens);
            
            const syncCalendarAuto = async (calendarId: string | null, type: string) => {
              if (!calendarId) return 0;
              let count = 0;
              try {
                // Google → 앱
                const googleEvents = await calendar.events.list({
                  calendarId,
                  maxResults: 500,
                  singleEvents: true,
                  orderBy: "startTime",
                  timeMin: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
                });

                const existingEvents = await storage.getEvents(school.id);
                const existingByGoogleId = new Map<string, any>();
                for (const e of existingEvents) {
                  if ((e as any).googleEventId && (e as any).type === type) {
                    existingByGoogleId.set((e as any).googleEventId, e);
                  }
                }

                const seenGoogleIds = new Set<string>();

                for (const gEvent of googleEvents.data.items || []) {
                  if (!gEvent.id || gEvent.status === 'cancelled') continue;
                  const googleId = `gcal-${gEvent.id}`;
                  seenGoogleIds.add(googleId);

                  const startTime = gEvent.start?.dateTime ? new Date(gEvent.start.dateTime) : gEvent.start?.date ? new Date(gEvent.start.date) : null;
                  const isAllDay = !!gEvent.start?.date;
                  const endTime = gEvent.end?.dateTime ? new Date(gEvent.end.dateTime) : gEvent.end?.date ? new Date(gEvent.end.date) : null;
                  const existing = existingByGoogleId.get(googleId);

                  if (existing) {
                    if (existing.title !== gEvent.summary ||
                        new Date(existing.startTime).getTime() !== startTime!.getTime()) {
                      await storage.updateEvent(existing.id, {
                        title: gEvent.summary || "Untitled",
                        description: gEvent.description || "",
                        startTime: startTime!,
                        endTime: endTime! || new Date(startTime!.getTime() + 3600000),
                        isAllDay,
                      });
                      count++;
                    }
                  } else {
                    await storage.createEvent({
                      title: gEvent.summary || "Untitled",
                      description: gEvent.description || "",
                      startTime: startTime!,
                      endTime: endTime! || new Date(startTime!.getTime() + 3600000),
                      creatorId: "google-sync",
                      type,
                      isAllDay,
                      schoolId: school.id,
                      googleEventId: googleId,
                    });
                    count++;
                  }
                }

                // Google에서 삭제된 이벤트 처리
                for (const [googleId, event] of existingByGoogleId) {
                  if (!seenGoogleIds.has(googleId)) {
                    await storage.deleteEvent(event.id);
                    count++;
                  }
                }

                // 앱 → Google: 로컬 전용 이벤트 업로드
                const localOnlyEvents = existingEvents.filter(
                  e => (e as any).type === type && !(e as any).googleEventId
                );
                for (const localEvent of localOnlyEvents) {
                  try {
                    const gEvent = await calendar.events.insert({
                      calendarId,
                      requestBody: {
                        summary: localEvent.title,
                        description: (localEvent as any).description || "",
                        start: (localEvent as any).isAllDay
                          ? { date: new Date(localEvent.startTime).toISOString().split("T")[0] }
                          : { dateTime: new Date(localEvent.startTime).toISOString() },
                        end: (localEvent as any).isAllDay
                          ? { date: new Date(localEvent.endTime).toISOString().split("T")[0] }
                          : { dateTime: new Date(localEvent.endTime).toISOString() },
                      },
                    });
                    if (gEvent.data.id) {
                      await storage.updateEvent(localEvent.id, { googleEventId: `gcal-${gEvent.data.id}` });
                    }
                    count++;
                  } catch (err) {
                    console.error(`[Auto Sync] Push event ${localEvent.id} error:`, err);
                  }
                }
              } catch (err) {
                console.error(`[Auto Sync] ${school.name} ${type} error:`, err);
              }
              return count;
            };

            const ac = await syncCalendarAuto(settings.googleCalendarAcademicId, "academic");
            const du = await syncCalendarAuto(settings.googleCalendarDutyId, "duty");
            if (ac + du > 0) console.log(`[Google API Sync] ${school.name}: academic=${ac}, duty=${du}`);
            continue; // Google API 성공 시 iCal 스킵
          } catch (err) {
            console.error(`[Google API Sync] ${school.name} token error, falling back to iCal:`, err);
          }
        }

        // 방법 2: iCal 폴백 (읽기 전용, OAuth2 미연동 학교)
        const academicUrl = settings.googleCalendarAcademicUrl;
        const dutyUrl = settings.googleCalendarDutyUrl;
        if (!academicUrl && !dutyUrl) continue;

        const importEvents = async (url: string, type: string) => {
          if (!url) return 0;
          try {
            const response = await fetch(url, { headers: { 'User-Agent': 'SmartSchoolHub/1.0' } });
            if (!response.ok) return 0;
            const icalData = await response.text();
            const jcalData = ical.parse(icalData);
            const comp = new ical.Component(jcalData);
            const vevents = comp.getAllSubcomponents('vevent');
            
            const existingEvents = await storage.getEvents(school.id);
            const existingByGoogleId = new Map<string, any>();
            for (const e of existingEvents) {
              if ((e as any).googleEventId?.startsWith('gcal-') && (e as any).type === type) {
                existingByGoogleId.set((e as any).googleEventId, e);
              }
            }

            const seenIds = new Set<string>();
            let count = 0;
            for (const vevent of vevents) {
              const event = new ical.Event(vevent);
              const startTime = event.startDate?.toJSDate();
              const endTime = event.endDate?.toJSDate();
              const googleId = `gcal-${event.uid}`;
              seenIds.add(googleId);
              if (!startTime) continue;

              const existing = existingByGoogleId.get(googleId);
              if (existing) {
                // 변경 감지
                if (existing.title !== event.summary ||
                    new Date(existing.startTime).getTime() !== startTime!.getTime()) {
                  await storage.updateEvent(existing.id, {
                    title: event.summary || "Untitled",
                    description: event.description || "",
                    startTime: startTime!,
                    endTime: endTime! || new Date(startTime!.getTime() + 3600000),
                    isAllDay: !event.startDate?.isDate,
                  });
                  count++;
                }
              } else {
                await storage.createEvent({
                  title: event.summary || "Untitled",
                  description: event.description || "",
                  startTime: startTime!,
                  endTime: endTime! || new Date(startTime!.getTime() + 3600000),
                  creatorId: "system",
                  type,
                  isAllDay: !event.startDate?.isDate,
                  schoolId: school.id,
                  googleEventId: googleId,
                });
                count++;
              }
            }

            // 삭제된 이벤트 처리
            for (const [googleId, ev] of existingByGoogleId) {
              if (!seenIds.has(googleId)) {
                await storage.deleteEvent(ev.id);
                count++;
              }
            }
            return count;
          } catch (err) {
            console.error(`[iCal Sync] ${school.name} ${type} error:`, err);
            return 0;
          }
        };

        const ac = await importEvents(academicUrl, "academic");
        const du = await importEvents(dutyUrl, "duty");
        if (ac + du > 0) console.log(`[iCal Sync] ${school.name}: academic=${ac}, duty=${du}`);
      }
    } catch (err) {
      console.error("[Calendar Sync] Error:", err);
    }
  };

  // 서버 시작 30초 후 첫 동기화, 이후 1시간마다
  setTimeout(() => {
    syncAllSchoolCalendars();
    setInterval(syncAllSchoolCalendars, 60 * 60 * 1000);
  }, 30000);
  console.log("✅ Calendar auto-sync initialized (every 1 hour)");

  // ── 펀딩 크론 시작 ───────────────────────────────────────────
  const { startFundingCrons } = await import("./funding/crons");
  startFundingCrons();

  // ── Economy 무결성 크론 시작 ─────────────────────────────────
  const { startIntegrityCrons } = await import("./economy/integrity");
  const { backfillHashes } = await import("./economy/audit-chain");
  const { startAnchorCron } = await import("./economy/anchor");
  await backfillHashes(); // 해시 미설정 행 백필 (서버 시작 시 1회)
  startIntegrityCrons();
  startAnchorCron();

  // ── 문서 신청 양식 관리 ──────────────────────────────────────
  // document_types 테이블 초기화
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS document_types (
      id SERIAL PRIMARY KEY,
      school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT DEFAULT 'FileText',
      color TEXT DEFAULT 'bg-blue-500',
      is_active BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // 조직의 양식 목록 조회 (로그인한 사용자 자신의 조직)
  app.get("/api/document-types", async (req: any, res) => {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return res.json([]);
      const types = await db.execute(sql`
        SELECT * FROM document_types
        WHERE school_id = ${schoolId} AND is_active = true
        ORDER BY sort_order ASC, id ASC
      `);
      res.json(types.rows);
    } catch (err) {
      res.status(500).json({ message: "양식 목록 조회 실패" });
    }
  });

  // 관리자용 전체 양식 목록 (비활성 포함)
  app.get("/api/admin/document-types", async (req: any, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "로그인 필요" });
      const schoolId = req.user.role === "super_admin"
        ? (req.query.schoolId ? Number(req.query.schoolId) : null)
        : req.user.schoolId;
      if (!schoolId) return res.json([]);
      const types = await db.execute(sql`
        SELECT * FROM document_types WHERE school_id = ${schoolId}
        ORDER BY sort_order ASC, id ASC
      `);
      res.json(types.rows);
    } catch (err) {
      res.status(500).json({ message: "양식 목록 조회 실패" });
    }
  });

  // 양식 추가
  app.post("/api/admin/document-types", async (req: any, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "로그인 필요" });
      if (!["admin", "super_admin"].includes(req.user.role)) return res.status(403).json({ message: "권한 없음" });
      const { name, description, icon, color, schoolId: bodySchoolId } = req.body;
      const schoolId = req.user.role === "super_admin" ? bodySchoolId : req.user.schoolId;
      if (!schoolId || !name) return res.status(400).json({ message: "조직과 양식명 필수" });
      const result = await db.execute(sql`
        INSERT INTO document_types (school_id, name, description, icon, color, is_active, sort_order)
        VALUES (${schoolId}, ${name}, ${description || ""}, ${icon || "FileText"}, ${color || "bg-blue-500"}, true,
          (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM document_types WHERE school_id = ${schoolId}))
        RETURNING *
      `);
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ message: "양식 추가 실패" });
    }
  });

  // 양식 수정 (이름, 설명, 아이콘, 색상, 활성화 여부, 순서)
  app.patch("/api/admin/document-types/:id", async (req: any, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "로그인 필요" });
      if (!["admin", "super_admin"].includes(req.user.role)) return res.status(403).json({ message: "권한 없음" });
      const id = Number(req.params.id);
      const { name, description, icon, color, isActive, sortOrder } = req.body;
      await db.execute(sql`
        UPDATE document_types SET
          name = COALESCE(${name}, name),
          description = COALESCE(${description}, description),
          icon = COALESCE(${icon}, icon),
          color = COALESCE(${color}, color),
          is_active = COALESCE(${isActive}, is_active),
          sort_order = COALESCE(${sortOrder}, sort_order)
        WHERE id = ${id}
      `);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "양식 수정 실패" });
    }
  });

  // 양식 삭제
  app.delete("/api/admin/document-types/:id", async (req: any, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "로그인 필요" });
      if (!["admin", "super_admin"].includes(req.user.role)) return res.status(403).json({ message: "권한 없음" });
      const id = Number(req.params.id);
      await db.execute(sql`DELETE FROM document_types WHERE id = ${id}`);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "양식 삭제 실패" });
    }
  });

  // 기본 양식 일괄 등록 (조직에 양식이 없을 때 초기화)
  app.post("/api/admin/document-types/init-defaults", async (req: any, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "로그인 필요" });
      if (!["admin", "super_admin"].includes(req.user.role)) return res.status(403).json({ message: "권한 없음" });
      const schoolId = req.user.role === "super_admin" ? req.body.schoolId : req.user.schoolId;
      if (!schoolId) return res.status(400).json({ message: "조직 ID 필요" });
      // 이미 있으면 스킵
      const existing = await db.execute(sql`SELECT COUNT(*) FROM document_types WHERE school_id = ${schoolId}`);
      if (Number(existing.rows[0].count) > 0) return res.json({ message: "이미 양식이 등록되어 있습니다" });
      const defaults = [
        { name: "현장체험학습", description: "가정체험학습 신청서 및 보고서", icon: "Briefcase", color: "bg-blue-500" },
        { name: "결석계", description: "결석/조퇴/지각/결과 사유서", icon: "FileCheck", color: "bg-orange-500" },
        { name: "전학 신청", description: "전학/전출 신청서", icon: "GraduationCap", color: "bg-green-500" },
        { name: "보고서", description: "각종 보고서 및 계획서", icon: "FileText", color: "bg-purple-500" },
      ];
      for (let i = 0; i < defaults.length; i++) {
        const d = defaults[i];
        await db.execute(sql`
          INSERT INTO document_types (school_id, name, description, icon, color, is_active, sort_order)
          VALUES (${schoolId}, ${d.name}, ${d.description}, ${d.icon}, ${d.color}, true, ${i + 1})
        `);
      }
      res.json({ message: "기본 양식 등록 완료", count: defaults.length });
    } catch (err) {
      res.status(500).json({ message: "기본 양식 등록 실패" });
    }
  });

  return httpServer;
}
