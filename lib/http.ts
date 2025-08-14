// app/lib/http.ts
export async function safeJson<T = any>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) throw new Error(`Пустой ответ ${res.status}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Неверный JSON ${res.status}: ${text.slice(0, 400)}`);
  }
}
