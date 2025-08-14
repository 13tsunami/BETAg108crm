// app/lib/serialize.ts
export function parseStrArray(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(x => String(x ?? "")).filter(Boolean);
  if (typeof input !== "string" || !input.trim()) return [];
  try {
    const v = JSON.parse(input);
    return Array.isArray(v) ? v.map(x => String(x ?? "")).filter(Boolean) : [];
  } catch {
    return [];
  }
}
export function toDbStrArray(v: unknown): string | null {
  if (!Array.isArray(v)) return null;
  const arr = v.map(x => String(x ?? "")).filter(Boolean);
  return arr.length ? JSON.stringify(arr) : null;
}
