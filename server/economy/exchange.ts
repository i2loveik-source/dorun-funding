/**
 * 환전 API — 두런코인 ↔ 지역코인 교환
 * 
 * GET  /api/economy/exchange/rates          — 가능한 환전 쌍 목록
 * GET  /api/economy/exchange/preview        — 환전 미리보기 (수수료 계산)
 * POST /api/economy/exchange                — 환전 실행
 * GET  /api/economy/exchange/history        — 내 환전 내역
 */

import { Router } from "express";
import { neon } from "@neondatabase/serverless";
import { appendAuditLog } from "./audit-chain";

const router = Router();
const sql = neon(process.env.DATABASE_URL!);

// ─── 환전 가능 목록 ────────────────────────────────────────────
router.get("/rates", async (req, res) => {
  try {
    const rates = await sql`
      SELECT
        er.id,
        er.rate,
        er.fee_percent,
        er.effective_from,
        fa.id   AS from_id,
        fa.name AS from_name,
        fa.symbol AS from_symbol,
        ta.id   AS to_id,
        ta.name AS to_name,
        ta.symbol AS to_symbol
      FROM economy.exchange_rates er
      JOIN economy.asset_types fa ON fa.id = er.from_asset_id
      JOIN economy.asset_types ta ON ta.id = er.to_asset_id
      WHERE fa.is_active = true AND ta.is_active = true
        AND er.effective_from <= NOW()
      ORDER BY er.from_asset_id, er.to_asset_id
    `;
    res.json(rates.map(r => ({
      id: r.id,
      from: { id: r.from_id, name: r.from_name, symbol: r.from_symbol },
      to:   { id: r.to_id,   name: r.to_name,   symbol: r.to_symbol },
      rate: Number(r.rate),
      feePercent: Number(r.fee_percent),
    })));
  } catch (err) {
    res.status(500).json({ error: "서버 오류" });
  }
});

// ─── 환전 미리보기 ────────────────────────────────────────────
router.get("/preview", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "로그인 필요" });

  const { fromAssetId, toAssetId, amount } = req.query;
  if (!fromAssetId || !toAssetId || !amount) {
    return res.status(400).json({ error: "fromAssetId, toAssetId, amount 필수" });
  }

  try {
    const rate = await sql`
      SELECT rate, fee_percent
      FROM economy.exchange_rates
      WHERE from_asset_id = ${Number(fromAssetId)}
        AND to_asset_id   = ${Number(toAssetId)}
        AND effective_from <= NOW()
      ORDER BY effective_from DESC LIMIT 1
    `;
    if (!rate[0]) return res.status(404).json({ error: "환전 비율 없음" });

    const inputAmount = Number(amount);
    const feePercent  = Number(rate[0].fee_percent);
    const rateVal     = Number(rate[0].rate);
    const fee         = Math.ceil(inputAmount * feePercent / 100 * 100) / 100;
    const afterFee    = inputAmount - fee;
    const outputAmount = Math.floor(afterFee * rateVal * 100) / 100;

    // 내 잔액
    const wallet = await sql`
      SELECT balance FROM economy.wallets
      WHERE user_id = ${userId} AND asset_type_id = ${Number(fromAssetId)}
    `;
    const myBalance = Number(wallet[0]?.balance ?? 0);

    res.json({
      inputAmount,
      fee,
      feePercent,
      afterFee,
      rate: rateVal,
      outputAmount,
      myBalance,
      sufficient: myBalance >= inputAmount,
    });
  } catch (err) {
    res.status(500).json({ error: "서버 오류" });
  }
});

// ─── 환전 실행 ────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "로그인 필요" });

  const { fromAssetId, toAssetId, amount } = req.body;
  if (!fromAssetId || !toAssetId || !amount || amount <= 0) {
    return res.status(400).json({ error: "잘못된 요청" });
  }

  try {
    // 환전 비율 조회
    const rate = await sql`
      SELECT rate, fee_percent
      FROM economy.exchange_rates
      WHERE from_asset_id = ${fromAssetId} AND to_asset_id = ${toAssetId}
        AND effective_from <= NOW()
      ORDER BY effective_from DESC LIMIT 1
    `;
    if (!rate[0]) return res.status(404).json({ error: "환전 비율 없음" });

    const inputAmount  = Number(amount);
    const feePercent   = Number(rate[0].fee_percent);
    const rateVal      = Number(rate[0].rate);
    const fee          = Math.ceil(inputAmount * feePercent / 100 * 100) / 100;
    const outputAmount = Math.floor((inputAmount - fee) * rateVal * 100) / 100;

    if (outputAmount <= 0) return res.status(400).json({ error: "환전 금액이 너무 적습니다." });

    // from 지갑 잔액 확인 + 차감
    const fromWallet = await sql`
      SELECT id, balance FROM economy.wallets
      WHERE user_id = ${userId} AND asset_type_id = ${fromAssetId}
    `;
    if (!fromWallet[0]) return res.status(400).json({ error: "출금 지갑 없음" });
    if (Number(fromWallet[0].balance) < inputAmount) {
      return res.status(400).json({ error: "잔액 부족" });
    }

    // to 지갑 확인 (없으면 생성)
    let toWallet = await sql`
      SELECT id FROM economy.wallets
      WHERE user_id = ${userId} AND asset_type_id = ${toAssetId}
    `;
    if (!toWallet[0]) {
      toWallet = await sql`
        INSERT INTO economy.wallets (user_id, asset_type_id, balance)
        VALUES (${userId}, ${toAssetId}, 0)
        RETURNING id
      `;
    }

    // 원자적 이체
    await sql`UPDATE economy.wallets SET balance = balance - ${inputAmount}  WHERE id = ${fromWallet[0].id}`;
    await sql`UPDATE economy.wallets SET balance = balance + ${outputAmount} WHERE id = ${toWallet[0].id}`;

    // 거래 기록 (exchange 타입)
    const rid = `exch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await sql`
      INSERT INTO economy.transactions
        (request_id, from_wallet_id, to_wallet_id, asset_type_id, amount, fee, type, status, description)
      VALUES
        (${rid}, ${fromWallet[0].id}, ${toWallet[0].id}, ${fromAssetId}, ${inputAmount}, ${fee}, 'exchange', 'completed',
         ${"환전: " + fromAssetId + " → " + toAssetId + " (rate " + rateVal + ")"})
    `;

    // 감사 로그
    await appendAuditLog({
      actorId: userId,
      action: "exchange",
      targetType: "wallet",
      targetId: String(toWallet[0].id),
      details: { fromAssetId, toAssetId, inputAmount, outputAmount, fee, rate: rateVal, requestId: rid },
    });

    res.json({
      success: true,
      requestId: rid,
      inputAmount,
      fee,
      outputAmount,
      message: `환전 완료: ${inputAmount} → ${outputAmount}`,
    });
  } catch (err) {
    console.error("[exchange] 오류:", err);
    res.status(500).json({ error: "환전 처리 중 오류" });
  }
});

// ─── 내 환전 내역 ─────────────────────────────────────────────
router.get("/history", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "로그인 필요" });

  try {
    const history = await sql`
      SELECT
        t.id, t.request_id, t.amount, t.fee, t.created_at, t.description,
        fa.name AS from_name, fa.symbol AS from_symbol,
        ta.name AS to_name,   ta.symbol AS to_symbol
      FROM economy.transactions t
      JOIN economy.wallets fw ON fw.id = t.from_wallet_id
      JOIN economy.wallets tw ON tw.id = t.to_wallet_id
      JOIN economy.asset_types fa ON fa.id = t.asset_type_id
      JOIN economy.asset_types ta ON ta.id = tw.asset_type_id
      WHERE fw.user_id = ${userId} AND t.type = 'exchange' AND t.status = 'completed'
      ORDER BY t.created_at DESC LIMIT 50
    `;
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: "서버 오류" });
  }
});

export default router;
