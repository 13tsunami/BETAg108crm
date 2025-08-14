// app/api/chat/_bus.ts
export type PushEvent =
  | { type: "hello"; at: number }
  | { type: "message"; threadId: string; data: any }
  | { type: "thread-updated"; threadId?: string }
  | { type: "thread-deleted"; threadId: string }
  | { type: "typing"; threadId: string };

type Controller = ReadableStreamDefaultController;

const g = globalThis as any;
if (!g.__CHAT_BUS__) g.__CHAT_BUS__ = new Map<string, Set<Controller>>();
const BUS: Map<string, Set<Controller>> = g.__CHAT_BUS__;

export function subscribeUser(userId: string, controller: Controller): void {
  if (!BUS.has(userId)) BUS.set(userId, new Set<Controller>());
  BUS.get(userId)!.add(controller);
}
export function unsubscribeUser(userId: string, controller: Controller): void {
  const set = BUS.get(userId);
  if (!set) return;
  set.delete(controller);
  if (set.size === 0) BUS.delete(userId);
}

export function pushToUser(userId: string, payload: PushEvent): void {
  const set = BUS.get(userId);
  if (!set) return;
  const line = `event: push\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const ctrl of set) {
    try { ctrl.enqueue(line); } catch {}
  }
}

export function pushTyping(userIds: string | string[], threadId: string): void {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  for (const uid of ids) pushToUser(uid, { type: "typing", threadId });
}
export function pushThreadUpdated(userId: string, threadId?: string): void {
  pushToUser(userId, threadId ? { type: "thread-updated", threadId } : { type: "thread-updated" });
}
export function pushThreadDeleted(userId: string, threadId: string): void {
  pushToUser(userId, { type: "thread-deleted", threadId });
}
export function pushMessage(userId: string, threadId: string, data: any): void {
  pushToUser(userId, { type: "message", threadId, data });
}
export function pushToMany(userIds: string[], payload: PushEvent): void {
  for (const uid of userIds) pushToUser(uid, payload);
}
