/**
 * 공개 검증 API (B-1)
 * 
 * 인증 없이 누구나 호출 가능 — 투명성 보장
 * 
 * GET /api/public/supply          — 전체 코인 유통량 현황
 * GET /api/public/stats/:symbol   — 특정 코인 발행/소각/거래 통계
 * GET /api/public/verify/:txId    — 특정 거래 검증
 * GET /api/public/chain-tip       — 감사 로그 최신 해시 (앵커링 확인용)
 * GET /api/public/integrity       — 최신 무결성 검증 결과
 */

import { Router } from "express";
import { neon } from "@neondatabase/serverless";
import { getChainTip, verifyChain } from "./audit-chain";
import { getAnchorHistory } from "./anchor";

const router = Router();
const sql = neon(process.env.DATABASE_URL!);

// 캐시 (무거운 쿼리를 1분마다만 실행)
let supplyCache: { data: any; expiresAt: number } | null = null;
let integrityCache: { data: any; expiresAt: number } | null = null;

// ─── 전체 유통량 현황 ─────────────────────────────────────────
router.get("/supply", async (_req, res) => {
  try {
    if (supplyCache && Date.now() < supplyCache.expiresAt) {
      return res.json(supplyCache.data);
    }

    const coins = await sql`
      SELECT
        a.id,
        a.name,
        a.symbol,
        a.scope,
        a.max_supply,
        a.total_minted,
        a.total_burned,
        (a.total_minted - a.total_burned) AS circulating_supply,
        COUNT(DISTINCT w.user_id) AS holder_count,
        COALESCE(SUM(w.balance), 0) AS wallet_balance_sum
      FROM economy.asset_types a
      LEFT JOIN economy.wallets w ON w.asset_type_id = a.id AND w.balance > 0
      WHERE a.is_active = true
      GROUP BY a.id
      ORDER BY a.id ASC
    `;

    const data = {
      asOf: new Date().toISOString(),
      totalCoins: coins.length,
      coins: coins.map(c => ({
        id: c.id,
        name: c.name,
        symbol: c.symbol,
        scope: c.scope,
        maxSupply: c.max_supply ? Number(c.max_supply) : null,
        totalMinted: Number(c.total_minted),
        totalBurned: Number(c.total_burned),
        circulatingSupply: Number(c.circulating_supply),
        holderCount: Number(c.holder_count),
        // 무결성 검증: wallet 합계 vs 발행량 일치 여부
        balanceIntegrityOk: Math.abs(Number(c.wallet_balance_sum) - Number(c.circulating_supply)) <= 0.01,
      })),
    };

    supplyCache = { data, expiresAt: Date.now() + 60_000 };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "서버 오류" });
  }
});

// ─── 특정 코인 통계 ────────────────────────────────────────────
router.get("/stats/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const asset = await sql`
      SELECT id, name, symbol, scope, total_minted, total_burned, max_supply, created_at
      FROM economy.asset_types WHERE symbol = ${symbol.toUpperCase()} AND is_active = true
    `;
    if (!asset[0]) return res.status(404).json({ error: "코인을 찾을 수 없습니다." });
    const a = asset[0];

    // 최근 24시간 / 7일 / 30일 거래량
    const stats = await sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS tx_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')   AS tx_7d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')  AS tx_30d,
        COALESCE(SUM(amount) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0) AS vol_24h,
        COALESCE(SUM(amount) FILTER (WHERE created_at > NOW() - INTERVAL '7 days'), 0)   AS vol_7d,
        COALESCE(SUM(amount) FILTER (WHERE created_at > NOW() - INTERVAL '30 days'), 0)  AS vol_30d
      FROM economy.transactions
      WHERE asset_type_id = ${a.id} AND status = 'completed' AND type = 'transfer'
    `;
    const s = stats[0];

    // 상위 보유자 (익명화 — 유저 ID 앞 8자리만 노출)
    const topHolders = await sql`
      SELECT LEFT(user_id, 8) || '...' AS user_abbr, balance
      FROM economy.wallets
      WHERE asset_type_id = ${a.id} AND balance > 0
      ORDER BY balance DESC LIMIT 10
    `;

    res.json({
      asOf: new Date().toISOString(),
      symbol: a.symbol,
      name: a.name,
      scope: a.scope,
      maxSupply: a.max_supply ? Number(a.max_supply) : null,
      totalMinted: Number(a.total_minted),
      totalBurned: Number(a.total_burned),
      circulatingSupply: Number(a.total_minted) - Number(a.total_burned),
      launchedAt: a.created_at,
      activity: {
        transactions24h: Number(s.tx_24h),
        transactions7d:  Number(s.tx_7d),
        transactions30d: Number(s.tx_30d),
        volume24h: Number(s.vol_24h),
        volume7d:  Number(s.vol_7d),
        volume30d: Number(s.vol_30d),
      },
      topHolders,
    });
  } catch (err) {
    res.status(500).json({ error: "서버 오류" });
  }
});

// ─── 거래 검증 ────────────────────────────────────────────────
router.get("/verify/:txId", async (req, res) => {
  try {
    const { txId } = req.params;
    const tx = await sql`
      SELECT
        t.id, t.request_id, t.type, t.amount, t.status, t.description, t.created_at,
        t.asset_type_id,
        a.symbol AS coin_symbol,
        t.from_wallet_id, t.to_wallet_id
      FROM economy.transactions t
      JOIN economy.asset_types a ON a.id = t.asset_type_id
      WHERE t.request_id = ${txId} OR t.id::text = ${txId}
      LIMIT 1
    `;
    if (!tx[0]) return res.status(404).json({ error: "거래를 찾을 수 없습니다." });
    const t = tx[0];

    res.json({
      valid: t.status === "completed",
      transaction: {
        id: t.id,
        requestId: t.request_id,
        type: t.type,
        amount: Number(t.amount),
        coin: t.coin_symbol,
        status: t.status,
        description: t.description,
        timestamp: t.created_at,
        // 지갑 ID만 노출 (유저 ID 숨김)
        fromWalletId: t.from_wallet_id,
        toWalletId: t.to_wallet_id,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "서버 오류" });
  }
});

// ─── 감사 로그 최신 해시 (온체인 앵커링 확인) ─────────────────
router.get("/chain-tip", async (_req, res) => {
  try {
    const tip = await getChainTip();
    if (!tip) return res.json({ hash: null, rowCount: 0, message: "감사 로그 없음" });
    res.json({
      ...tip,
      message: "이 해시로 감사 로그의 무결성을 외부에서 검증할 수 있습니다.",
      verifyUrl: "/api/public/integrity",
    });
  } catch (err) {
    res.status(500).json({ error: "서버 오류" });
  }
});

// ─── 무결성 검증 결과 (캐시 1분) ─────────────────────────────
router.get("/integrity", async (_req, res) => {
  try {
    if (integrityCache && Date.now() < integrityCache.expiresAt) {
      return res.json(integrityCache.data);
    }
    const result = await verifyChain();
    const tip = await getChainTip();

    const data = {
      ...result,
      chainTip: tip?.hash ?? null,
      message: result.valid
        ? "감사 로그 해시 체인 무결성 검증 통과"
        : `⚠️ 행 #${result.firstInvalidId}부터 체인 불일치 감지`,
    };

    integrityCache = { data, expiresAt: Date.now() + 60_000 };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "서버 오류" });
  }
});

// ─── 온체인 앵커링 기록 ───────────────────────────────────────
router.get("/anchors", async (_req, res) => {
  try {
    const repo = process.env.GITHUB_ANCHOR_REPO ?? "i2loveik-source/DoRunHub";
    const branch = process.env.GITHUB_ANCHOR_BRANCH ?? "main";
    const anchors = await getAnchorHistory(20);
    res.json({
      method: "github",
      repo: `https://github.com/${repo}/tree/${branch}/audit-anchors`,
      count: anchors.length,
      anchors: anchors.map((a: any) => {
        const date = new Date(a.anchored_at).toISOString().slice(0, 10);
        return {
          chainTip: a.chain_tip,
          rowCount: a.row_count,
          commitSha: a.tx_hash,
          githubUrl: a.tx_hash && a.tx_hash !== "github"
            ? `https://github.com/${repo}/commit/${a.tx_hash}`
            : `https://github.com/${repo}/blob/${branch}/audit-anchors/${date}.txt`,
          fileUrl: `https://github.com/${repo}/blob/${branch}/audit-anchors/${date}.txt`,
          anchoredAt: a.anchored_at,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: "서버 오류" });
  }
});

export default router;
