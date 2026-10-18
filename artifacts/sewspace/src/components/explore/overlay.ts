// The post view opens over Explore at /posts/:id (Explore step 5). The address
// changes with history.pushState so the link can be shared and Back closes it,
// but the page underneath stays Explore. The history entry is marked with an
// id that is new on every page load: a reload (or a link opened in a new tab)
// shows the full post page instead. The Explore filters (?tab=&sub=) travel in
// the entry so they survive while the address shows the post.

const LOAD_ID = Math.random().toString(36).slice(2);
const KEY = 'seamsExplorePost';
const base = () => import.meta.env.BASE_URL.replace(/\/$/, '');

type Mark = { load: string; search: string };
function mark(): Mark | null {
  try {
    const m = (window.history.state as Record<string, unknown> | null)?.[KEY] as Mark | undefined;
    return m && m.load === LOAD_ID ? m : null;
  } catch {
    return null;
  }
}

/** True while a post is open over Explore (the address reads /posts/:id). */
export const isExploreOverlay = (): boolean => Boolean(mark());

/** Explore's own query string (?tab=&sub=) while a post is open over it. */
export const overlaySearch = (): string => mark()?.search ?? '';

/** Opens a post over Explore: pushes /posts/:id, keeping Explore's filters. */
export function openPostOverlay(postId: number): void {
  window.history.pushState({ [KEY]: { load: LOAD_ID, search: window.location.search } }, '', `${base()}/posts/${postId}`);
}

/** Steps to another post (previous / next) without adding to Back. */
export function swapPostOverlay(postId: number): void {
  window.history.replaceState(window.history.state, '', `${base()}/posts/${postId}`);
}

/** Closes the post view: Back, so the browser's own Back button does the same. */
export function closePostOverlay(): void {
  window.history.back();
}
