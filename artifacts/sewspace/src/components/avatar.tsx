/** A person's avatar: their uploaded photo, or the first letter of their name. */
export function UserAvatar({ name, avatarUrl, size = 36, className = '' }: { name?: string | null; avatarUrl?: string | null; size?: number; className?: string }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  if (avatarUrl) return <img src={avatarUrl} alt="" style={style} className={`shrink-0 rounded-full object-cover ${className}`} />;
  return <span aria-hidden="true" style={style} className={`grid shrink-0 place-items-center rounded-full bg-ink font-display text-white ${className}`}>{initial}</span>;
}
