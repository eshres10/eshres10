/** A stored colour if the browser understands it ("#287b63", "teal"), else the peach token. */
export function swatch(color: string | null | undefined): string {
  return color && typeof CSS !== 'undefined' && CSS.supports('color', color) ? color : 'var(--color-peach)';
}
