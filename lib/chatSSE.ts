// lib/chatSSE.ts
type Client = { controller: ReadableStreamDefaultController };
const channels = new Map<string, Set<Client>>();
const enc = new TextEncoder();

export function subscribe(threadId: string, controller: ReadableStreamDefaultController) {
  let set = channels.get(threadId);
  if (!set) { set = new Set(); channels.set(threadId, set); }
  const client: Client = { controller };
  set.add(client);
  return () => {
    const s = channels.get(threadId);
    if (!s) return;
    s.delete(client);
    if (s.size === 0) channels.delete(threadId);
  };
}

export function publishMessage(threadId: string, messagePayload: unknown) {
  broadcast(threadId, { type: "message", data: messagePayload });
}
export function publishRead(threadId: string, readPayload: unknown) {
  broadcast(threadId, { type: "read", data: readPayload });
}

function broadcast(threadId: string, payload: any) {
  const s = channels.get(threadId);
  if (!s || s.size === 0) return;
  const data = enc.encode(`data: ${JSON.stringify(payload)}\n\n`);
  for (const c of s) { try { c.controller.enqueue(data); } catch {} }
}
