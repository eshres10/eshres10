import type { Notification } from '@workspace/api-client-react';

// Repeats read as one line: every like on the same post ("Ann and 3 others
// liked your post"), and follows that arrive one after another. Grouping is
// done on what's loaded, so it never shows anything the list didn't already.

export interface NotificationGroup {
  key: string;
  /** Newest first; the first one sets the place in the list, the text and the link. */
  items: Notification[];
  read: boolean;
}

export function groupNotifications(items: Notification[]): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  const likes = new Map<number, NotificationGroup>();
  for (const n of items) {
    const previous = groups[groups.length - 1];
    let group: NotificationGroup | undefined;
    if (n.kind === 'like' && n.post) group = likes.get(n.post.id);
    else if (n.kind === 'follow' && previous?.items[0].kind === 'follow') group = previous;
    if (group) {
      group.items.push(n);
      group.read = group.read && n.read;
      continue;
    }
    group = { key: n.kind === 'like' && n.post ? `like-${n.post.id}` : `n-${n.id}`, items: [n], read: n.read };
    if (n.kind === 'like' && n.post) likes.set(n.post.id, group);
    groups.push(group);
  }
  return groups;
}

/** The people in a group, once each ("Someone" for anyone without a handle yet). */
export function groupActors(group: NotificationGroup): Array<Notification['actor']> {
  const seen = new Set<string>();
  const out: Array<Notification['actor']> = [];
  for (const n of group.items) {
    const key = n.actor?.handle ?? `someone-${n.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n.actor);
  }
  return out;
}

/** "Ann", "Ann and Ben", "Ann and 3 others". */
export function namesFor(actors: Array<Notification['actor']>): string {
  const name = (a: Notification['actor']) => a?.name ?? 'Someone';
  if (actors.length <= 1) return name(actors[0] ?? null);
  if (actors.length === 2) return `${name(actors[0])} and ${name(actors[1])}`;
  return `${name(actors[0])} and ${actors.length - 1} others`;
}
