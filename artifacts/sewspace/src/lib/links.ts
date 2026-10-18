// Post links (migration 0022): the same rules as the API's normaliseLink.
// null = no link; false = not a link we accept (only http and https, a real
// host name, no user/password, no spaces, at most 500 characters).
export function normaliseLink(raw: string | null | undefined): string | null | false {
  const text = (raw ?? '').trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  if (withScheme.length > 500 || /\s/.test(withScheme)) return false;
  try {
    const url = new URL(withScheme);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password || !url.hostname.includes('.')) return false;
    return withScheme;
  } catch {
    return false;
  }
}

/** How a link reads on a post: the site and path, without "https://" and "www.", shortened. */
export function linkLabel(url: string, max = 40): string {
  try {
    const u = new URL(url);
    const text = `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`;
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  } catch {
    return url;
  }
}
