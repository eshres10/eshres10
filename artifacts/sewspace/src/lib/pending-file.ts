// A file chosen on one page and read by the next (the Pattern library's
// "Import a pattern PDF" banner opens the picker itself, then hands the file to
// the Add to stash flow). Lives only in memory for that one navigation.
let pending: File | null = null;

export function handOverFile(file: File) {
  pending = file;
}

export function takeHandedOverFile(): File | null {
  const file = pending;
  pending = null;
  return file;
}
