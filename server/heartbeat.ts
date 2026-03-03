// Heartbeat tracking system for real-time online status
// Tracks user connections across web, mobile, and desktop platforms

interface PlatformStatus {
  web: boolean;
  mobile: boolean;
  desktop: boolean;
  lastSeen: Date;
}

// In-memory storage for user online status
const userOnlineStatus = new Map<string, PlatformStatus>();

const HEARTBEAT_TIMEOUT = 90000; // 90 seconds (3 missed heartbeats)
const CLEANUP_INTERVAL = 60000; // Check every 60 seconds

/**
 * Update heartbeat for a user on a specific platform
 */
export function updateHeartbeat(userId: string, platform: "web" | "mobile" | "desktop") {
  const current = userOnlineStatus.get(userId) || {
    web: false,
    mobile: false,
    desktop: false,
    lastSeen: new Date()
  };

  current[platform] = true;
  current.lastSeen = new Date();
  userOnlineStatus.set(userId, current);
}

/**
 * Get online status for a specific user
 */
export function getUserOnlineStatus(userId: string): PlatformStatus | null {
  return userOnlineStatus.get(userId) || null;
}

/**
 * Get all users' online status
 */
export function getAllOnlineStatus(): Record<string, PlatformStatus> {
  const result: Record<string, PlatformStatus> = {};
  userOnlineStatus.forEach((status, userId) => {
    result[userId] = status;
  });
  return result;
}

/**
 * Check if user is online on any platform
 */
export function isUserOnline(userId: string): boolean {
  const status = userOnlineStatus.get(userId);
  if (!status) return false;
  return status.web || status.mobile || status.desktop;
}

/**
 * Clean up stale heartbeats (offline detection)
 */
function cleanupStaleHeartbeats() {
  const now = Date.now();
  
  userOnlineStatus.forEach((status, userId) => {
    const timeSinceLastSeen = now - status.lastSeen.getTime();
    
    if (timeSinceLastSeen > HEARTBEAT_TIMEOUT) {
      // Mark all platforms as offline if heartbeat is stale
      status.web = false;
      status.mobile = false;
      status.desktop = false;
      
      // If completely offline, could remove from map to save memory
      // userOnlineStatus.delete(userId);
    }
  });
}

// Start cleanup interval
setInterval(cleanupStaleHeartbeats, CLEANUP_INTERVAL);

console.log("✅ Heartbeat system initialized");
