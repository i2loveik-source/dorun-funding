/**
 * funding-app.ts
 * 두런 펀딩 전용 Express 앱 라우터 설정
 * - 펀딩 API (/api/funding)
 * - 경제 공개 API (/api/public)
 * - 코인 환전 (/api/economy/exchange)
 * - 코인 런치패드 (/api/economy/launch)
 * - 투명성 리포트 (/api/economy/transparency)
 * - 사용자 인증 조회 (/api/user, /api/auth/*)
 */

import type { Express, Request, Response } from "express";
import { isAuthenticated } from "./replit_integrations/auth/replitAuth";
import { registerAuthRoutes } from "./replit_integrations/auth/routes";
import fundingRouter from "./funding/routes";
import publicEconomyRouter from "./economy/public-api";
import exchangeRouter from "./economy/exchange";
import coinLaunchRouter from "./economy/launch";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { users } from "../shared/schema";

export async function registerFundingRoutes(app: Express) {
  // 인증 라우트 등록 (/api/auth/user, /api/auth/login, /api/logout 등)
  registerAuthRoutes(app);

  // 현재 사용자 정보 (레거시 호환)
  app.get("/api/user", isAuthenticated, (req: Request, res: Response) => {
    res.json(req.user);
  });

  app.get("/api/auth/me", (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.json(req.user);
  });

  // 사용자 목록 (멘션, 프로필 등에서 사용)
  app.get("/api/users", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const allUsers = await db.select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        profileImage: users.profileImage,
        role: users.role,
      }).from(users);
      res.json(allUsers);
    } catch (e) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // 펀딩 API
  app.use("/api/funding", fundingRouter);

  // 경제 공개 API (투명성 리포트용)
  app.use("/api/public", publicEconomyRouter);

  // 코인 환전
  app.use("/api/economy/exchange", exchangeRouter);

  // 코인 런치패드
  app.use("/api/economy/launch", coinLaunchRouter);

  // 헬스체크
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "dorunhub-funding", ts: new Date().toISOString() });
  });
}
