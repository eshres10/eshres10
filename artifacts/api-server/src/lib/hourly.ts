const HOUR = 3_600_000;

/**
 * A per-person hourly limit kept in memory per server process, for cheap
 * writes that don't keep a row to count (a vote you can take back, say).
 * Resets on restart; returns false once `perHour` is used up.
 */
export function hourlyLimit(perHour: number) {
  const recent = new Map<string, number[]>();
  return (userId: string, now = Date.now()): boolean => {
    const kept = (recent.get(userId) ?? []).filter((t) => now - t < HOUR);
    if (kept.length >= perHour) { recent.set(userId, kept); return false; }
    kept.push(now);
    recent.set(userId, kept);
    return true;
  };
}
