/**
 * GitHub 앵커링 (B-3 대체)
 * 
 * 매일 두런코인 감사 로그 chain-tip 해시를
 * GitHub 레포에 자동 커밋하여 타임스탬프 증명
 * 
 * 기록 위치: audit-anchors/YYYY-MM-DD.txt
 * 누구나 https://github.com/i2loveik-source/Smart-School-Hub/tree/main/audit-anchors 에서 확인 가능
 * 
 * 환경변수:
 *   GITHUB_ANCHOR_TOKEN  — GitHub Personal Access Token (repo 쓰기 권한)
 *   GITHUB_ANCHOR_REPO   — "owner/repo" (예: i2loveik-source/Smart-School-Hub)
 *   GITHUB_ANCHOR_BRANCH — 브랜치 (기본: main)
 */

import { neon } from "@neondatabase/serverless";
import { getChainTip } from "./audit-chain";

const sql = neon(process.env.DATABASE_URL!);

const GITHUB_API = "https://api.github.com";

// ─── GitHub API 헬퍼 ──────────────────────────────────────────
async function githubRequest(path: string, method: string, body?: any) {
  const token = process.env.GITHUB_ANCHOR_TOKEN;
  if (!token) throw new Error("GITHUB_ANCHOR_TOKEN 미설정");

  const res = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "DoRunHub-Anchor/1.0",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── 파일 SHA 조회 (업데이트 시 필요) ────────────────────────
async function getFileSha(repo: string, path: string, branch: string): Promise<string | null> {
  try {
    const data = await githubRequest(`/repos/${repo}/contents/${path}?ref=${branch}`, "GET");
    return data.sha ?? null;
  } catch {
    return null; // 파일 없음
  }
}

// ─── 앵커 파일 커밋 ───────────────────────────────────────────
export async function anchorToGitHub(): Promise<{
  success: boolean;
  commitUrl?: string;
  message: string;
}> {
  const token = process.env.GITHUB_ANCHOR_TOKEN;
  const repo  = process.env.GITHUB_ANCHOR_REPO  ?? "i2loveik-source/DoRunHub";
  const branch = process.env.GITHUB_ANCHOR_BRANCH ?? "main";

  if (!token) {
    return { success: false, message: "GITHUB_ANCHOR_TOKEN 미설정 — 앵커링 건너뜀" };
  }

  try {
    await ensureAnchorTable();

    const tip = await getChainTip();
    if (!tip) return { success: false, message: "감사 로그 없음" };

    // 오늘 날짜 (KST)
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const dateStr = kst.toISOString().slice(0, 10); // YYYY-MM-DD
    const filePath = `audit-anchors/${dateStr}.txt`;

    // 이미 오늘치 앵커링 완료 여부 확인
    const recent = await sql`
      SELECT id FROM economy.onchain_anchors
      WHERE chain_tip = ${tip.hash} AND status = 'confirmed' LIMIT 1
    `;
    if (recent.length > 0) {
      return { success: true, message: "이미 앵커링된 해시 — 건너뜀" };
    }

    // 기록 내용
    const content = [
      `# 두런코인 감사 로그 앵커링 — ${dateStr}`,
      ``,
      `날짜: ${kst.toISOString().replace("T", " ").slice(0, 19)} KST`,
      ``,
      `## 감사 로그 체인 상태`,
      `- 총 로그 행 수: ${tip.rowCount.toLocaleString()}개`,
      `- chain-tip 해시: ${tip.hash}`,
      `- 기록 시각: ${tip.asOf}`,
      ``,
      `## 검증 방법`,
      `1. https://dorunhub.com/api/public/chain-tip 에서 현재 해시를 확인`,
      `2. 이 파일의 해시와 비교`,
      `3. 일치하면 이 날 이후 감사 로그가 조작되지 않았음을 의미`,
      ``,
      `## 공개 검증 API`,
      `- 유통량: https://dorunhub.com/api/public/supply`,
      `- 무결성: https://dorunhub.com/api/public/integrity`,
      `- 거래 검증: https://dorunhub.com/api/public/verify/{txId}`,
      ``,
      `---`,
      `DoRunHub 두런코인 투명성 시스템 | https://dorunhub.com`,
    ].join("\n");

    const contentBase64 = Buffer.from(content, "utf8").toString("base64");

    // 기존 파일 SHA 조회 (덮어쓰기 시 필요)
    const existingSha = await getFileSha(repo, filePath, branch);

    // GitHub에 파일 커밋
    const result = await githubRequest(`/repos/${repo}/contents/${filePath}`, "PUT", {
      message: `chore: 두런코인 감사 로그 앵커링 ${dateStr} [chain-tip: ${tip.hash.slice(0, 16)}...]`,
      content: contentBase64,
      branch,
      ...(existingSha ? { sha: existingSha } : {}),
    });

    const commitUrl = result.commit?.html_url ?? `https://github.com/${repo}/commits/${branch}`;

    // DB 기록
    await sql`
      INSERT INTO economy.onchain_anchors
        (chain_tip, row_count, tx_hash, block_number, chain_id, status)
      VALUES
        (${tip.hash}, ${tip.rowCount},
         ${result.commit?.sha ?? "github"},
         0,
         0,
         'confirmed')
    `;

    console.log(`[anchor] ✅ GitHub 앵커링 완료: ${commitUrl}`);
    return { success: true, commitUrl, message: `GitHub 앵커링 완료 — ${dateStr}` };

  } catch (err: any) {
    console.error("[anchor] GitHub 앵커링 실패:", err.message);
    return { success: false, message: `앵커링 실패: ${err.message}` };
  }
}

// ─── DB 테이블 보장 ───────────────────────────────────────────
async function ensureAnchorTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS economy.onchain_anchors (
      id            SERIAL PRIMARY KEY,
      chain_tip     TEXT NOT NULL,
      row_count     INTEGER NOT NULL,
      tx_hash       TEXT,
      block_number  BIGINT,
      chain_id      INTEGER NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'pending',
      error         TEXT,
      anchored_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

// ─── 앵커링 기록 조회 (공개 API용) ───────────────────────────
export async function getAnchorHistory(limit = 10) {
  await ensureAnchorTable();
  return sql`
    SELECT chain_tip, row_count, tx_hash, block_number, chain_id, status, anchored_at
    FROM economy.onchain_anchors
    WHERE status = 'confirmed'
    ORDER BY anchored_at DESC
    LIMIT ${limit}
  `;
}

// ─── 크론: 매일 03:00 KST 앵커링 ────────────────────────────
export function startAnchorCron(): void {
  const run = async () => {
    console.log("[anchor] GitHub 앵커링 시도...");
    const result = await anchorToGitHub();
    console.log(`[anchor] ${result.message}`);
    if (result.commitUrl) console.log(`[anchor] 커밋: ${result.commitUrl}`);
  };

  // 03:00 KST = 18:00 UTC — 다음 03:00 KST까지 ms 계산
  function msUntilNext3amKST(): number {
    const now = Date.now();
    const kst = new Date(now + 9 * 60 * 60 * 1000);
    const next3am = new Date(kst);
    next3am.setUTCHours(18, 0, 0, 0); // 03:00 KST = 18:00 UTC 전날
    if (next3am.getTime() <= now + 9 * 60 * 60 * 1000) {
      next3am.setUTCDate(next3am.getUTCDate() + 1);
    }
    return next3am.getTime() - (now + 9 * 60 * 60 * 1000);
  }

  // 첫 실행: 다음 03:00 KST에
  const delay = Math.max(0, msUntilNext3amKST());
  setTimeout(() => {
    run();
    setInterval(run, 24 * 60 * 60 * 1000);
  }, delay);

  // 서버 시작 15초 후 즉시 1회 실행 (배포 확인용)
  setTimeout(run, 15_000);

  const nextRun = new Date(Date.now() + delay);
  console.log(`✅ GitHub anchor cron initialized — 다음 정기 실행: ${nextRun.toLocaleString("ko-KR")}`);
}
