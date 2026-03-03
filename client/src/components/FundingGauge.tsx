/**
 * 실시간 펀딩 게이지 컴포넌트
 * WebSocket으로 실시간 업데이트, 막대/원형 선택 가능
 */
import { useEffect, useRef, useState } from "react";

interface FundingGaugeProps {
  current: number;
  target: number;
  variant?: "bar" | "circle";
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  animated?: boolean;
}

export function FundingGauge({
  current,
  target,
  variant = "bar",
  size = "md",
  showLabel = true,
  animated = true,
}: FundingGaugeProps) {
  const [displayRatio, setDisplayRatio] = useState(0);
  const ratio = Math.min((current / target) * 100, 100);

  // 애니메이션: 마운트 후 부드럽게 채우기
  useEffect(() => {
    const timer = setTimeout(() => setDisplayRatio(ratio), 100);
    return () => clearTimeout(timer);
  }, [ratio]);

  const color =
    ratio >= 100 ? "#22c55e" :
    ratio >= 80  ? "#f97316" :
    ratio >= 50  ? "#3b82f6" : "#6366f1";

  const heightMap = { sm: "h-2", md: "h-4", lg: "h-6" };
  const circleSize = { sm: 80, md: 120, lg: 160 };

  if (variant === "circle") {
    const sz = circleSize[size];
    const radius = sz / 2 - 10;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (displayRatio / 100) * circumference;

    return (
      <div className="flex flex-col items-center gap-1">
        <svg width={sz} height={sz} className="-rotate-90">
          <circle cx={sz/2} cy={sz/2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <circle
            cx={sz/2} cy={sz/2} r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={animated ? offset : circumference - (ratio / 100) * circumference}
            strokeLinecap="round"
            style={{ transition: animated ? "stroke-dashoffset 0.8s ease" : undefined }}
          />
        </svg>
        {showLabel && (
          <div className="text-center -mt-1">
            <p className="font-bold text-sm" style={{ color }}>{ratio.toFixed(1)}%</p>
            <p className="text-xs text-gray-500">{current.toLocaleString()} 코인</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className={`w-full ${heightMap[size]} bg-gray-200 rounded-full overflow-hidden`}>
        <div
          style={{
            width: animated ? `${displayRatio}%` : `${ratio}%`,
            height: "100%",
            backgroundColor: color,
            borderRadius: "9999px",
            transition: animated ? "width 0.8s ease" : undefined,
          }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between mt-1 text-xs text-gray-500">
          <span style={{ color }} className="font-semibold">{ratio.toFixed(1)}% 달성</span>
          <span>{current.toLocaleString()} / {target.toLocaleString()} 코인</span>
        </div>
      )}
    </div>
  );
}

// ─── 실시간 게이지 (WebSocket 연동) ──────────────────────────
interface RealtimeFundingGaugeProps extends Omit<FundingGaugeProps, "current"> {
  campaignId: number;
  initialCurrent: number;
}

export function RealtimeFundingGauge({ campaignId, initialCurrent, ...props }: RealtimeFundingGaugeProps) {
  const [current, setCurrent] = useState(initialCurrent);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    setCurrent(initialCurrent);
  }, [initialCurrent]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/funding/${campaignId}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "funding_update" && data.campaignId === campaignId) {
          setCurrent(Number(data.currentAmount));
        }
      } catch {}
    };

    return () => { ws.close(); };
  }, [campaignId]);

  return <FundingGauge current={current} {...props} />;
}
