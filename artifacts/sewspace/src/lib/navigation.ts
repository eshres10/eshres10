import { basePath } from '@/lib/clerk';

/** The current in-app location (path + query + hash), without the deploy base path. */
export function currentAppPath(): string {
  const { pathname, search, hash } = window.location;
  const path = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || '/' : pathname;
  return path + search + hash;
}

/** Only allow returning to a path inside this app (never another site). */
export function safeReturnPath(value: string | null | undefined, fallback = '/studio'): string {
  if (!value) return fallback;
  let path = value;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    path = url.pathname + url.search + url.hash;
    if (basePath && path.startsWith(basePath)) path = path.slice(basePath.length) || '/';
  } catch {
    return fallback;
  }
  return path.startsWith('/') && !path.startsWith('//') ? path : fallback;
}

/**
 * Link to Clerk's sign-in or sign-up page that comes back to `returnTo`
 * afterwards. Clerk reads the redirect_url query parameter.
 */
export function authHref(mode: 'sign-in' | 'sign-up', returnTo: string = currentAppPath()): string {
  const target = `${window.location.origin}${basePath}${safeReturnPath(returnTo, '/')}`;
  return `/${mode}?redirect_url=${encodeURIComponent(target)}`;
}
