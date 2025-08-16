// app/(app)/chat/sse/broker.ts
export type EventPayload =
  | { type: 'message'; threadId: string; at: number; messageId: string; authorId: string; text: string; ts: string }
  | { type: 'messageEdited'; threadId: string; at: number; messageId: string; byId: string; text: string }
  | { type: 'messageDeleted'; threadId: string; at: number; messageId: string; byId: string; scope: 'self' | 'both' }
  | { type: 'read'; threadId: string; at: number }
  | { type: 'threadCreated'; threadId: string; at: number }
  | { type: 'threadDeleted'; threadId: string; at: number; byId: string; byName: string };

type Subscriber = (p: EventPayload) => void;

class Broker {
  private subs = new Map<string, Map<number, Subscriber>>();
  private seq = 0;

  subscribe(uid: string, fn: Subscriber) {
    if (!this.subs.has(uid)) this.subs.set(uid, new Map());
    const id = ++this.seq;
    this.subs.get(uid)!.set(id, fn);
    return () => this.subs.get(uid)?.delete(id);
  }

  publish(uids: string[] | string, payload: EventPayload) {
    const targets = Array.isArray(uids) ? uids : [uids];
    for (const uid of targets) {
      const hs = this.subs.get(uid);
      if (!hs?.size) continue;
      for (const [, h] of hs) { try { h(payload); } catch {} }
    }
  }
}

type G = typeof globalThis & { __g108_broker?: Broker };
const g = globalThis as G;
const broker = g.__g108_broker ?? (g.__g108_broker = new Broker());
export default broker;
