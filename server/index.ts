import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { setupAuth } from "./replit_integrations/auth/replitAuth";
import { registerFundingRoutes } from "./funding-app";
import { serveStatic } from "./static";

const app = express();

// ── Security headers ──────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ── Rate limiting ─────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => {
    if (req.path.startsWith("/assets") || req.path.startsWith("/src")) return true;
    if (req.path.startsWith("/auth") || req.originalUrl.startsWith("/api/auth")) return true;
    if (req.path === "/logout" || req.originalUrl === "/api/logout") return true;
    return false;
  },
});
app.use("/api", limiter);

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : [
      "http://localhost:5001",
      "http://localhost:3000",
      "https://dorunhub.com",
      "https://www.dorunhub.com",
      "https://funding.dorunhub.com",
    ];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Requested-With");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── Body parsing ──────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Logger ────────────────────────────────────────────────────
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (req.path.startsWith("/api")) {
      log(`${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
    }
  });
  next();
});

const httpServer = createServer(app);

// ── 펀딩 실시간 WebSocket (/ws/funding/:campaignId) ───────────
const wssFunding = new WebSocketServer({ server: httpServer, path: "/ws/funding" });
const fundingClients = new Map<number, Set<WebSocket>>();

wssFunding.on("connection", (ws, req) => {
  const campaignId = Number(req.url?.split("/").pop());
  if (!campaignId) { ws.close(); return; }
  if (!fundingClients.has(campaignId)) fundingClients.set(campaignId, new Set());
  fundingClients.get(campaignId)!.add(ws);
  ws.on("close", () => fundingClients.get(campaignId)?.delete(ws));
});

export function broadcastFundingUpdate(campaignId: number, currentAmount: number) {
  const clients = fundingClients.get(campaignId);
  if (!clients) return;
  const data = JSON.stringify({ type: "funding_update", campaignId, currentAmount });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}
(global as any).broadcastFundingUpdate = broadcastFundingUpdate;

// ── 관리자 알림 WebSocket (/ws/admin) ─────────────────────────
const adminClients = new Set<WebSocket>();
const wssAdmin = new WebSocketServer({ server: httpServer, path: "/ws/admin" });

wssAdmin.on("connection", (ws, req) => {
  const cookie = req.headers.cookie ?? "";
  if (!cookie.includes("connect.sid") && !cookie.includes("session")) {
    ws.close(4001, "Unauthorized");
    return;
  }
  adminClients.add(ws);
  ws.send(JSON.stringify({ type: "connected", message: "관리자 알림 채널 연결됨", ts: Date.now() }));
  ws.on("close", () => adminClients.delete(ws));
  ws.on("error", () => adminClients.delete(ws));
});

export function broadcastAdminAlert(event: {
  type: string;
  campaignId?: number;
  title?: string;
  message: string;
  severity?: "info" | "warning" | "error";
}) {
  const data = JSON.stringify({ ...event, ts: Date.now() });
  for (const ws of adminClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}
(global as any).broadcastAdminAlert = broadcastAdminAlert;

// ── 더미 broadcastToChannel (펀딩 앱에서는 채팅 없음) ─────────
(global as any).broadcastToChannel = (_channelId: number, _event: any) => {};

// ── Main ──────────────────────────────────────────────────────
(async () => {
  app.set("trust proxy", 1);

  // 세션 + Passport 설정 (메인 앱과 동일한 DB sessions 테이블 공유)
  await setupAuth(app);

  // 펀딩 전용 라우터 등록
  await registerFundingRoutes(app);

  // 에러 핸들러
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("Error:", err);
    if (res.headersSent) return;
    res.status(status).json({ message });
  });

  const port = parseInt(process.env.PORT || "5002", 10);

  // 헬스체크
  app.get("/health", (_req, res) => res.send("OK"));

  httpServer.listen({ port, host: "0.0.0.0" }, async () => {
    log(`DoRunHub Funding serving on port ${port}`);

    if (process.env.NODE_ENV !== "production") {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);

    // 경제 크론 (무결성 검사, 앵커링)
    try {
      const { startIntegrityCrons } = await import("./economy/integrity");
      const { startAnchorCron } = await import("./economy/anchor");
      const { startFundingCrons } = await import("./funding/crons");
      startIntegrityCrons();
      startAnchorCron();
      startFundingCrons();
      log("크론 시작됨 (integrity, anchor, funding)", "cron");
    } catch (e) {
      console.error("크론 시작 실패:", e);
    }
  }
})();
