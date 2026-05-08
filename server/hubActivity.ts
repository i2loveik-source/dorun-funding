/**
 * 두런허브 통합 타임라인으로 활동 이벤트 push
 * 실패해도 본업에 영향 없도록 silent fail.
 */
const HUB_URL = process.env.HUB_URL || "https://dorunhub.com";
const INTERNAL_KEY = process.env.INTERNAL_SECRET || "";

export type HubActivity = {
  userId: string;
  title: string;
  body?: string;
  href?: string;
  metadata?: Record<string, any>;
  dedupeKey?: string;
};

export async function pushHubActivity(events: HubActivity | HubActivity[]) {
  if (!INTERNAL_KEY) return;
  const list = Array.isArray(events) ? events : [events];
  if (list.length === 0) return;
  const payload = list.map(e => ({
    ...e,
    source: "funding",
    menuKey: "localFunding",
  }));
  try {
    await fetch(`${HUB_URL}/api/internal/activity-events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-key": INTERNAL_KEY,
      },
      body: JSON.stringify({ events: payload }),
    });
  } catch (err) {
    console.warn("[hubActivity] push failed:", (err as any)?.message);
  }
}
