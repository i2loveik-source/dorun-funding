/**
 * 지역코인 런치패드 API (C-1)
 * 
 * POST /api/economy/launch          — 신청
 * GET  /api/economy/launch          — 내 신청 목록
 * GET  /api/economy/launch/all      — 전체 목록 (관리자)
 * POST /api/economy/launch/:id/approve — 승인 + 코인 자동 발행
 * POST /api/economy/launch/:id/reject  — 반려
 */

import { Router } from "express";
import { neon } from "@neondatabase/serverless";
import { appendAuditLog } from "./audit-chain";

const router = Router();
const sql = neon(process.env.DATABASE_URL!);

// ─── 신청 ─────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "로그인 필요" });

  const { organizationId, name, symbol, description, maxSupply, initialSupply, useCase } = req.body;
  if (!organizationId || !name || !symbol) {
    return res.status(400).json({ error: "organizationId, name, symbol 필수" });
  }
  if (!/^[A-Z]{2,8}$/.test(symbol.toUpperCase())) {
    return res.status(400).json({ error: "심볼은 2~8자 영문 대문자만 사용 가능" });
  }

  try {
    // 심볼 중복 확인
    const dup = await sql`
      SELECT id FROM economy.asset_types WHERE symbol = ${symbol.toUpperCase()} LIMIT 1
    `;
    if (dup.length > 0) return res.status(409).json({ error: "이미 사용 중인 심볼입니다." });

    // 대기 중 신청 중복 확인
    const dupReq = await sql`
      SELECT id FROM economy.coin_launch_requests
      WHERE organization_id = ${organizationId} AND status IN ('pending', 'approved')
      LIMIT 1
    `;
    if (dupReq.length > 0) return res.status(409).json({ error: "이미 진행 중인 신청이 있습니다." });

    const inserted = await sql`
      INSERT INTO economy.coin_launch_requests
        (organization_id, requester_id, name, symbol, description, max_supply, initial_supply, use_case)
      VALUES
        (${organizationId}, ${userId}, ${name}, ${symbol.toUpperCase()},
         ${description ?? null}, ${maxSupply ?? null}, ${initialSupply ?? 0}, ${useCase ?? null})
      RETURNING id
    `;

    await appendAuditLog({
      actorId: userId,
      action: "coin_launch_request",
      targetType: "organization",
      targetId: String(organizationId),
      details: { name, symbol, organizationId, requestId: inserted[0].id },
    });

    // 관리자 알림
    const broadcastAdminAlert = (global as any).broadcastAdminAlert;
    if (broadcastAdminAlert) {
      broadcastAdminAlert({
        type: "coin_launch_request",
        message: `새 지역코인 신청: "${name}" (${symbol.toUpperCase()}) — 검토 필요`,
        severity: "info",
      });
    }

    res.status(201).json({ id: inserted[0].id, message: "신청이 접수되었습니다. 관리자 승인 후 발행됩니다." });
  } catch (err) {
    res.status(500).json({ error: "서버 오류" });
  }
});

// ─── 내 신청 목록 ─────────────────────────────────────────────
router.get("/", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "로그인 필요" });

  const list = await sql`
    SELECT lr.*, o.name AS org_name, a.id AS launched_id
    FROM economy.coin_launch_requests lr
    LEFT JOIN organizations o ON o.id = lr.organization_id
    LEFT JOIN economy.asset_types a ON a.id = lr.asset_type_id
    WHERE lr.requester_id = ${userId}
    ORDER BY lr.created_at DESC
  `;
  res.json(list);
});

// ─── 전체 목록 (관리자) ───────────────────────────────────────
router.get("/all", async (req, res) => {
  const user = (req as any).user;
  if (!user || user.role !== "super_admin") {
    return res.status(403).json({ error: "관리자 권한 필요" });
  }
  const list = await sql`
    SELECT lr.*, o.name AS org_name
    FROM economy.coin_launch_requests lr
    LEFT JOIN organizations o ON o.id = lr.organization_id
    ORDER BY lr.created_at DESC LIMIT 100
  `;
  res.json(list);
});

// ─── 승인 + 코인 자동 발행 ────────────────────────────────────
router.post("/:id/approve", async (req, res) => {
  const user = (req as any).user;
  if (!user || user.role !== "super_admin") {
    return res.status(403).json({ error: "관리자 권한 필요" });
  }

  const { id } = req.params;
  const { reviewNote } = req.body;

  try {
    const req_ = await sql`
      SELECT * FROM economy.coin_launch_requests WHERE id = ${id} AND status = 'pending'
    `;
    if (!req_[0]) return res.status(404).json({ error: "신청을 찾을 수 없거나 이미 처리됨" });
    const lr = req_[0];

    // 코인 발행 (asset_types에 추가)
    const newAsset = await sql`
      INSERT INTO economy.asset_types
        (name, symbol, scope, organization_id, max_supply, total_minted, total_burned, is_active)
      VALUES
        (${lr.name}, ${lr.symbol}, 'local', ${lr.organization_id},
         ${lr.max_supply ?? null}, ${lr.initial_supply}, 0, true)
      RETURNING id
    `;
    const assetId = newAsset[0].id;

    // 초기 물량 발행: 신청자 지갑에 지급
    if (Number(lr.initial_supply) > 0) {
      await sql`
        INSERT INTO economy.wallets (user_id, asset_type_id, balance)
        VALUES (${lr.requester_id}, ${assetId}, ${lr.initial_supply})
        ON CONFLICT (user_id, asset_type_id) DO UPDATE SET balance = economy.wallets.balance + ${lr.initial_supply}
      `;
      await sql`
        INSERT INTO economy.transactions
          (request_id, from_wallet_id, to_wallet_id, asset_type_id, amount, fee, type, status, description)
        SELECT
          ${"launch_" + assetId}, w.id, w.id, ${assetId}, ${lr.initial_supply}, 0, 'mint', 'completed',
          ${"초기 발행 — " + lr.name + " 런치패드"}
        FROM economy.wallets w
        WHERE w.user_id = ${lr.requester_id} AND w.asset_type_id = ${assetId}
      `;
    }

    // DR-Base ↔ 새 코인 기본 환전비율 등록 (1 DRB = 10 지역코인, 1% 수수료)
    const drbAsset = await sql`SELECT id FROM economy.asset_types WHERE symbol = 'DRB' LIMIT 1`;
    if (drbAsset[0]) {
      await sql`
        INSERT INTO economy.exchange_rates (from_asset_id, to_asset_id, rate, fee_percent, set_by, effective_from)
        VALUES
          (${drbAsset[0].id}, ${assetId}, 10, 1, ${user.id}, NOW()),
          (${assetId}, ${drbAsset[0].id}, 0.1, 1, ${user.id}, NOW())
        ON CONFLICT DO NOTHING
      `;
    }

    // 신청 상태 업데이트
    await sql`
      UPDATE economy.coin_launch_requests
      SET status = 'launched', reviewer_id = ${user.id}, review_note = ${reviewNote ?? null},
          asset_type_id = ${assetId}, updated_at = NOW()
      WHERE id = ${id}
    `;

    await appendAuditLog({
      actorId: user.id,
      action: "coin_launch_approved",
      targetType: "asset_type",
      targetId: String(assetId),
      details: { requestId: id, symbol: lr.symbol, organizationId: lr.organization_id },
    });

    res.json({ success: true, assetId, message: `${lr.name} (${lr.symbol}) 코인이 발행되었습니다!` });
  } catch (err) {
    console.error("[launch] approve 오류:", err);
    res.status(500).json({ error: "서버 오류" });
  }
});

// ─── 반려 ─────────────────────────────────────────────────────
router.post("/:id/reject", async (req, res) => {
  const user = (req as any).user;
  if (!user || user.role !== "super_admin") {
    return res.status(403).json({ error: "관리자 권한 필요" });
  }
  const { reviewNote } = req.body;
  await sql`
    UPDATE economy.coin_launch_requests
    SET status = 'rejected', reviewer_id = ${user.id}, review_note = ${reviewNote ?? null}, updated_at = NOW()
    WHERE id = ${req.params.id}
  `;
  res.json({ success: true });
});

export default router;
