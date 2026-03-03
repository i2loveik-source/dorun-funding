import { Strategy as LocalStrategy } from "passport-local";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { authStorage } from "./storage";
import { comparePasswords } from "../../auth-utils";

const isProduction = process.env.NODE_ENV === "production";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week

  let store: any = undefined;
  if (process.env.DATABASE_URL) {
    const pgStore = connectPg(session);
    // Neon Serverless Pool — WebSocket(443) 기반, 교육청 방화벽 통과
    neonConfig.webSocketConstructor = ws;
    const neonPool = new NeonPool({ connectionString: process.env.DATABASE_URL });
    store = new pgStore({
      pool: neonPool,
      createTableIfMissing: true,
      ttl: sessionTtl / 1000,
      tableName: "sessions",
    });
  }

  return session({
    secret: process.env.SESSION_SECRET || "smart-school-secret",
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      maxAge: sessionTtl,
      // 서브도메인 간 세션 공유: dorunhub.com ↔ funding.dorunhub.com
      domain: isProduction ? ".dorunhub.com" : undefined,
      sameSite: isProduction ? "none" : "lax",
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        // 아이디, 전화번호, 이메일로 로그인
        let user = await authStorage.getUserByUsername(username);
        if (!user) {
          user = await authStorage.getUserByPhone(username);
        }
        if (!user) {
          user = await authStorage.getUserByEmail(username);
        }
        if (!user || !user.password || !(await comparePasswords(password, user.password))) {
          return done(null, false, { message: "아이디 또는 비밀번호가 잘못되었습니다." });
        }
        if (user.isApproved === false) {
          return done(null, false, { message: "관리자 승인 대기 중입니다. 승인 후 로그인할 수 있습니다." });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user: any, cb) => {
    cb(null, user.id);
  });

  passport.deserializeUser(async (id: string, cb) => {
    try {
      const user = await authStorage.getUser(id);
      if (!user) {
        return cb(null, false);
      }
      cb(null, user);
    } catch (e) {
      cb(null, false);
    }
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      req.session.destroy((err) => {
        if (err) console.error("Session destroy error:", err);
        res.clearCookie("connect.sid");
        res.redirect("/login");
      });
    });
  });

  app.get("/api/login", (_req, res) => res.redirect("/login"));
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};
