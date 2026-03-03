import { useEffect, useRef } from "react";
import { useAuth } from "./use-auth";

const HEARTBEAT_INTERVAL = 30000; // 30 seconds

/**
 * Detect platform based on user agent and screen size
 */
function detectPlatform(): "web" | "mobile" | "desktop" {
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  
  // Check if running in desktop app (you can add specific checks for Electron, Tauri, etc.)
  const isDesktopApp = (window as any).isDesktopApp === true;
  
  if (isDesktopApp) {
    return "desktop";
  } else if (isMobileDevice) {
    return "mobile";
  } else {
    return "web";
  }
}

/**
 * Send heartbeat to server
 */
async function sendHeartbeat(platform: "web" | "mobile" | "desktop") {
  try {
    await fetch("/api/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ platform }),
    });
  } catch (err) {
    console.error("Heartbeat failed:", err);
  }
}

/**
 * Hook to automatically send heartbeats while user is authenticated
 */
export function useHeartbeat() {
  const { isAuthenticated } = useAuth();
  const intervalRef = useRef<number | null>(null);
  const platformRef = useRef<"web" | "mobile" | "desktop">(detectPlatform());

  useEffect(() => {
    if (!isAuthenticated) {
      // Clear interval if user logs out
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Send initial heartbeat
    sendHeartbeat(platformRef.current);

    // Set up interval to send heartbeat every 30 seconds
    intervalRef.current = window.setInterval(() => {
      sendHeartbeat(platformRef.current);
    }, HEARTBEAT_INTERVAL);

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAuthenticated]);

  return { platform: platformRef.current };
}
