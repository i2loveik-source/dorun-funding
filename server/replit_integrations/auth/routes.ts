import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import passport from "passport";
import { db } from "../../db";
import { userOrganizations, schools } from "@shared/schema";
import { eq } from "drizzle-orm";

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const user = await authStorage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      // 소속 조직 목록 포함 (user_organizations JOIN schools)
      const orgs = await db.select({
        organizationId: userOrganizations.organizationId,
        role: userOrganizations.role,
        isApproved: userOrganizations.isApproved,
        isPrimary: userOrganizations.isPrimary,
        orgName: schools.name,
        orgType: schools.type,
      })
      .from(userOrganizations)
      .innerJoin(schools, eq(userOrganizations.organizationId, schools.id))
      .where(eq(userOrganizations.userId, userId));

      res.json({ ...user, organizations: orgs });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Local login route
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message || "로그인 실패" });
      }
      req.logIn(user, (err) => {
        if (err) return next(err);
        return res.json(user);
      });
    })(req, res, next);
  });
}
