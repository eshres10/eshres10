// Who is making a request. Every access decision starts from a Viewer.
export interface Viewer {
  /** Clerk user id, or null for signed-out visitors. */
  userId: string | null;
  /** True when userId is listed in ADMIN_USER_IDS (comma-separated Clerk ids). */
  isAdmin: boolean;
}

function adminIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export function viewerFor(userId: string | null): Viewer {
  return { userId, isAdmin: userId !== null && adminIds().has(userId) };
}

export const SIGNED_OUT: Viewer = { userId: null, isAdmin: false };
