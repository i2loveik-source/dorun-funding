/**
 * economy 스키마 무결성 검증 크론
 * 
 * A-4: 매일 새벽 전체 wallet.balance 합산 = 전체 mint - burn 검증
 * A-1: 감사 로그 해시 체인 무결성 검증
 * 
 * 불일치 발생 시: 콘솔 경고 + 관리자 WebSocket 알림 + DB에 alert 기록
 */

import { neon } from "@neondatabase/serverless";
import { verifyChain, getChainTip } from "./audit-chain";

const sql = neon(process.env.DATABASE_URL!);

// ─── 잔액 무결성 검증 ─────────────────────────────────────────
export async function verifyBalanceIntegrity(): Promise<void> {
  try {
    // 코인 타입별: 전체 지갑 잔액 합 vs mint - burn 합
    const assetTypes = await sql`SELECT id, name, symbol FROM economy.asset_types WHERE is_active = true`;

    let allPassed = true;
    const results: { symbol: string; walletSum: number; mintBurnDiff: number; diff: number }[] = [];

    for (const asset of assetTypes) {
      // 전체 지갑 잔액 합계
      const walletSum = await sql`
        SELECT COALESCE(SUM(balance), 0) as total
        FROM economy.wallets WHERE asset_type_id = ${asset.id}
      `;

      // mint 합계 - burn 합계
      const mintBurn = await sql`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'mint' THEN amount ELSE 0 END), 0) as total_minted,
          COALESCE(SUM(CASE WHEN type = 'burn' THEN amount ELSE 0 END), 0) as total_burned
        FROM economy.transactions
        WHERE asset_type_id = ${asset.id} AND status = 'completed'
      `;

      const wSum = Number(walletSum[0].total);
      const minted = Number(mintBurn[0].total_minted);
      const burned = Number(mintBurn[0].total_burned);
      const expected = minted - burned;
      const diff = Math.abs(wSum - expected);

      results.push({ symbol: asset.symbol, walletSum: wSum, mintBurnDiff: expected, diff });

      // 허용 오차: 0 (소수점 반올림 고려해 0.01 이하는 허용)
      if (diff > 0.01) {
        allPassed = false;
        console.error(`[integrity] ❌ ${asset.symbol}: 잔액합=${wSum}, mint-burn=${expected}, 차이=${diff}`);

        // alerts 테이블에 기록
        await sql`
          INSERT INTO economy.alerts (type, severity, message, metadata)
          VALUES (
            'balance_integrity_fail',
            'critical',
            ${`코인 ${asset.symbol} 잔액 무결성 실패 — 차이: ${diff}`},
            ${JSON.stringify({ symbol: asset.symbol, walletSum: wSum, expected, diff })}
          )
          ON CONFLICT DO NOTHING
        `.catch(() => {}); // alerts 테이블 없으면 무시

        // 관리자 WebSocket 알림
        const broadcastAdminAlert = (global as any).broadcastAdminAlert;
        if (broadcastAdminAlert) {
          broadcastAdminAlert({
            type: "balance_integrity_fail",
            message: `🚨 ${asset.symbol} 잔액 무결성 실패! 차이: ${diff} — 즉각 조사 필요`,
            severity: "error",
          });
        }
      }
    }

    if (allPassed) {
      console.log(`[integrity] ✅ 잔액 무결성 검증 통과 (${assetTypes.length}개 코인)`);
    }
  } catch (err) {
    console.error("[integrity] verifyBalanceIntegrity 오류:", err);
  }
}

// ─── 감사 로그 해시 체인 검증 ────────────────────────────────
export async function verifyAuditChain(): Promise<void> {
  try {
    const result = await verifyChain();
    if (result.valid) {
      const tip = await getChainTip();
      console.log(`[integrity] ✅ 감사 로그 체인 검증 통과 — ${result.totalRows}개 행, tip: ${tip?.hash.slice(0, 16)}...`);
    } else {
      console.error(`[integrity] ❌ 감사 로그 체인 조작 감지! 최초 불일치 행: #${result.firstInvalidId}`);

      const broadcastAdminAlert = (global as any).broadcastAdminAlert;
      if (broadcastAdminAlert) {
        broadcastAdminAlert({
          type: "audit_chain_tampered",
          message: `🚨 감사 로그 조작 감지! 행 #${result.firstInvalidId}부터 체인 불일치 — 즉각 조사 필요`,
          severity: "error",
        });
      }
    }
  } catch (err) {
    console.error("[integrity] verifyAuditChain 오류:", err);
  }
}

// ─── 크론 시작 ────────────────────────────────────────────────
export function startIntegrityCrons(): void {
  // 매일 03:00 KST (= 18:00 UTC) — 서버는 UTC 기준
  // setInterval로 24시간마다 실행
  setInterval(async () => {
    console.log("[integrity] 일별 무결성 검증 시작...");
    await verifyBalanceIntegrity();
    await verifyAuditChain();
  }, 24 * 60 * 60 * 1000);

  // 서버 시작 후 10초 뒤 즉시 1회 실행 (배포 검증용)
  setTimeout(async () => {
    console.log("[integrity] 초기 무결성 검증 시작...");
    await verifyBalanceIntegrity();
    await verifyAuditChain();
  }, 10_000);

  console.log("✅ Economy integrity crons initialized (balance + audit-chain: daily)");
}
