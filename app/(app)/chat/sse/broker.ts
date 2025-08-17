// Простой in-memory брокер событий по threadId. Работает в рамках одного инстанса.
type Msg = {
  id: string;
  text: string;
  ts: string;        // ISO
  authorId: string;
  threadId: string;
  edited?: boolean;
  deleted?: boolean;
};

type Listener = (m: Msg) => void;

type Broker = {
  subscribe: (threadId: string, cb: Listener) => () => void;
  publish: (threadId: string, msg: Msg) => void;
};

const g = globalThis as any;
if (!g.__CHAT_BROKER__) {
  g.__CHAT_BROKER__ = new Map<string, Set<Listener>>();
}

function ensureSet(threadId: string): Set<Listener> {
  const map: Map<string, Set<Listener>> = g.__CHAT_BROKER__;
  let set = map.get(threadId);
  if (!set) {
    set = new Set<Listener>();
    map.set(threadId, set);
  }
  return set;
}

export const broker: Broker = {
  subscribe(threadId, cb) {
    const set = ensureSet(threadId);
    set.add(cb);
    return () => set.delete(cb);
  },
  publish(threadId, msg) {
    const set = ensureSet(threadId);
    for (const cb of set) cb(msg);
  },
};
