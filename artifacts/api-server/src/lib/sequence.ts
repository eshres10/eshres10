/**
 * Runs query functions one after another and returns their results as a
 * tuple, like Promise.all. Inside a request transaction there is a single
 * database connection, so queries must not overlap (pg warns today and will
 * reject in pg 9).
 */
export async function sequence<const T extends readonly (() => PromiseLike<unknown>)[]>(
  steps: T,
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const results: unknown[] = [];
  for (const step of steps) results.push(await step());
  return results as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
}
