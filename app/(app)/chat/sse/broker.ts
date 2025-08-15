// app/(app)/chat/sse/broker.ts

export type EventPayload =
  | { type: 'message'; threadId: string; at: number; authorId?: string }
  | { type: 'threadCreated'; threadId: string; at: number }
  | { type: 'threadDeleted'; threadId: string; at: number }
  | { type: 'read'; threadId: string; at: number };

type Subscriber = (p: EventPayload) => void;

class Broker {
  private subs = new Map<string, Map<number, Subscriber>>();
  private seq = 0;

  subscribe(uid: string, fn: Subscriber) {
    if (typeof fn !== 'function') return () => {};
    let bucket = this.subs.get(uid);
    if (!bucket) {
      bucket = new Map<number, Subscriber>();
      this.subs.set(uid, bucket);
    }
    const id = ++this.seq;
    bucket.set(id, fn);

    // функция отписки
    return () => {
      try { bucket!.delete(id); } catch {}
      if (bucket && bucket.size === 0) this.subs.delete(uid);
    };
  }

  publish(targetUserIds: Array<string | null | undefined>, payload: EventPayload) {
    const delivered = new Set<string>();

    for (const id of targetUserIds) {
      if (!id || delivered.has(id)) continue;
      delivered.add(id);

      const bucket = this.subs.get(id);
      if (!bucket || bucket.size === 0) continue;

      // защитное очищение «мусора»
      for (const [key, handler] of Array.from(bucket.entries())) {
        if (typeof handler !== 'function') bucket.delete(key);
      }
      if (bucket.size === 0) { this.subs.delete(id); continue; }

      // безопасный обход: копия значений
      const handlers = Array.from(bucket.values());
      for (const handler of handlers) {
        if (typeof handler === 'function') {
          try { handler(payload); } catch { /* не роняем цепочку */ }
        }
      }
    }
  }
}

// типобезопасный синглтон на globalThis
type GlobalWithBroker = typeof globalThis & { __g108_broker?: Broker };
const g = globalThis as GlobalWithBroker;
const broker = g.__g108_broker ?? (g.__g108_broker = new Broker());

export default broker;
