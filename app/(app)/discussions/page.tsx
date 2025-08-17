// app/discussions/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Attachment = {
  id?: string;
  type: "image" | "video" | "file";
  url: string;
  name?: string | null;
  size?: number | null;
};

type VoteState = 1 | -1 | 0;

type Comment = {
  id: string;
  postId: string;
  authorId: string;
  authorName?: string | null;
  text: string;
  createdAt: string;
  votesUp?: number;
  votesDown?: number;
  myVote?: VoteState;
};

type Post = {
  id: string;
  authorId: string;
  authorName?: string | null;
  title?: string | null;
  text: string;
  createdAt: string;
  attachments?: Attachment[];
  commentsCount?: number;
  votesUp?: number;
  votesDown?: number;
  myVote?: VoteState;
  _comments?: Comment[];
  _commentsLoaded?: boolean;
};

type ApiPostList = Post[];
type ApiCommentList = Comment[];

const BRAND = "#8d2828";
const BRAND_SOFT = "#f6eaea";
const NEW_MARK = "#ef9b28";
const MONTHS_RU = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

function fmtRuDateTime(iso?: string | null) {
  if (!iso) return "—";
  const x = new Date(iso);
  if (isNaN(+x)) return "—";
  const dd = String(x.getDate()).padStart(2, "0");
  const mm = MONTHS_RU[x.getMonth()];
  const hh = String(x.getHours()).padStart(2, "0");
  const mi = String(x.getMinutes()).padStart(2, "0");
  return `${dd} ${mm} ${x.getFullYear()} в ${hh}:${mi}`;
}
function ts(iso: string) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}
function toB64(s?: string) {
  if (!s) return "";
  try { return btoa(unescape(encodeURIComponent(s))); } catch { return ""; }
}

export default function DiscussionsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const meId = (session?.user as any)?.id as string | undefined;
  const meName = (session?.user as any)?.name as string | undefined;

  const authHeaders = useMemo(() => {
    const h: Record<string,string> = {};
    if (meId) h["X-User-Id"] = meId;
    const b64 = toB64(meName);
    if (b64) h["X-User-Name-B64"] = b64;
    return h;
  }, [meId, meName]);

  // compose state
  const [posting, setPosting] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<Array<{ url: string; type: "image" | "video" | "file"; file: File }>>([]);

  // feed state
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  // comments state
  const [sendingComment, setSendingComment] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  // SSE/refresh
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<number | null>(null);

  // seen/new markers
  const [seen, setSeen] = useState<Set<string>>(new Set());

  // popover
  const [popoverPost, setPopoverPost] = useState<Post | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  // per-item refs for anchor
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());

  function loadSeen(u?: string) {
    if (!u) return new Set<string>();
    try {
      const raw = localStorage.getItem(`discuss:u:${u}:seen`);
      const arr: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) return new Set(arr.map(String));
    } catch {}
    return new Set<string>();
  }
  function saveSeen(u: string, s: Set<string>) {
    try { localStorage.setItem(`discuss:u:${u}:seen`, JSON.stringify(Array.from(s))); } catch {}
  }
  function markSeen(postId: string) {
    if (!meId) return;
    setSeen(prev => {
      if (prev.has(postId)) return prev;
      const next = new Set(prev);
      next.add(postId);
      saveSeen(meId, next);
      return next;
    });
  }

  useEffect(() => {
    if (status !== "authenticated") return;
    setSeen(loadSeen(meId));
  }, [status, meId]);

  function setItemRef(id: string) {
    return (el: HTMLElement | null) => {
      if (!el) itemRefs.current.delete(id);
      else itemRefs.current.set(id, el);
    };
  }

  async function loadPosts() {
    setLoading(true);
    try {
      const r = await fetch("/api/discussions", { cache: "no-store", headers: authHeaders });
      const data = r.ok ? ((await r.json()) as ApiPostList) : [];
      setPosts(Array.isArray(data) ? normalizePosts(data) : []);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }

  function normalizePosts(list: ApiPostList): Post[] {
    const arr = (list || []).map(p => ({
      ...p,
      attachments: Array.isArray(p.attachments) ? p.attachments : [],
      votesUp: p.votesUp ?? 0,
      votesDown: p.votesDown ?? 0,
      myVote: (p.myVote ?? 0) as VoteState,
      _commentsLoaded: false,
    }));
    return arr.sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
  }

  async function loadComments(postId: string) {
    try {
      const r = await fetch(`/api/discussions/${encodeURIComponent(postId)}/comments`, { cache: "no-store", headers: authHeaders });
      if (!r.ok) return;
      const data = (await r.json()) as ApiCommentList;
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, _comments: normalizeComments(data), _commentsLoaded: true } : p));
    } catch {}
  }
  function normalizeComments(list: ApiCommentList): Comment[] {
    const arr = (list || []).map(c => ({
      ...c,
      votesUp: c.votesUp ?? 0,
      votesDown: c.votesDown ?? 0,
      myVote: (c.myVote ?? 0) as VoteState,
    }));
    return arr.sort((a, b) => ts(a.createdAt) - ts(b.createdAt));
  }

  function onFilesChange(flist: FileList | null) {
    const arr = flist ? Array.from(flist) : [];
    setFiles(arr);
    const previews = arr.map(file => {
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      const isImage = /^image\//.test(file.type) || ["jpg","jpeg","png","gif","webp","avif","bmp"].includes(ext);
      const isVideo = /^video\//.test(file.type) || ["mp4","webm","mov","mkv"].includes(ext);
      const type: "image" | "video" | "file" = isImage ? "image" : (isVideo ? "video" : "file");
      return { url: URL.createObjectURL(file), type, file };
    });
    setPreview(previews);
  }

  async function publish() {
    if (!newText.trim() && !newTitle.trim() && files.length === 0) return;
    setPosting(true);
    try {
      const fd = new FormData();
      if (newTitle.trim()) fd.append("title", newTitle.trim());
      if (newText.trim()) fd.append("text", newText.trim());
      files.forEach((f) => fd.append("files", f, f.name));
      const r = await fetch("/api/discussions", { method: "POST", body: fd, headers: authHeaders });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        alert(`Не удалось опубликовать: ${t || r.status}`);
      } else {
        setNewTitle("");
        setNewText("");
        setFiles([]);
        setPreview((prev) => { prev.forEach((p) => URL.revokeObjectURL(p.url)); return []; });
        await loadPosts();
      }
    } finally {
      setPosting(false);
    }
  }

  async function votePost(postId: string, value: VoteState) {
    const v = value;
    setPosts(prev =>
      prev.map(p => {
        if (p.id !== postId) return p;
        const old = p.myVote ?? 0;
        let up = p.votesUp ?? 0;
        let dn = p.votesDown ?? 0;
        if (old === 1) up--;
        else if (old === -1) dn--;
        if (v === 1) up++;
        else if (v === -1) dn++;
        return { ...p, votesUp: up, votesDown: dn, myVote: v };
      })
    );
    try {
      await fetch(`/api/discussions/${encodeURIComponent(postId)}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ value: v }),
      });
    } catch {}
  }

  async function voteComment(postId: string, commentId: string, value: VoteState) {
    setPosts(prev =>
      prev.map(p => {
        if (p.id !== postId || !p._comments) return p;
        const next = p._comments.map(c => {
          if (c.id !== commentId) return c;
          const old = c.myVote ?? 0;
          let up = c.votesUp ?? 0;
          let dn = c.votesDown ?? 0;
          if (old === 1) up--;
          else if (old === -1) dn--;
          if (value === 1) up++;
          else if (value === -1) dn++;
          return { ...c, votesUp: up, votesDown: dn, myVote: value };
        });
        return { ...p, _comments: next };
      })
    );
    try {
      await fetch(`/api/discussions/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ value }),
      });
    } catch {}
  }

  async function addComment(postId: string) {
    const text = (commentDrafts[postId] || "").trim();
    if (!text) return;
    setSendingComment(prev => ({ ...prev, [postId]: true }));
    try {
      const r = await fetch(`/api/discussions/${encodeURIComponent(postId)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        alert(`Не удалось отправить комментарий: ${t || r.status}`);
      } else {
        setCommentDrafts(prev => ({ ...prev, [postId]: "" }));
        // если поповер открыт — перезагрузим нить
        if (popoverPost?.id === postId) await loadComments(postId);
      }
    } finally {
      setSendingComment(prev => ({ ...prev, [postId]: false }));
    }
  }

  function connectSSE() {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    try {
      const url = new URL("/api/discussions/stream", window.location.origin);
      if (meId) url.searchParams.set("uid", meId);
      const es = new EventSource(url.toString());
      es.onmessage = (ev) => {
        if (!ev.data) return;
        try {
          const payload = JSON.parse(ev.data);
          const t = payload?.type as string;
          if (t === "post:new") {
            const post: Post = payload.post;
            setPosts(prev => normalizePosts([post, ...prev]));
          } else if (t === "post:update") {
            const post: Post = payload.post;
            setPosts(prev => prev.map(p => p.id === post.id ? { ...p, ...post } : p));
          } else if (t === "comment:new") {
            const c: Comment = payload.comment;
            setPosts(prev => prev.map(p => {
              if (p.id !== c.postId) return p;
              const count = (p.commentsCount ?? 0) + 1;
              if (p._commentsLoaded && p._comments) {
                return { ...p, commentsCount: count, _comments: normalizeComments([...p._comments, c]) };
              }
              return { ...p, commentsCount: count };
            }));
          } else if (t === "vote:update") {
            const { postId, votesUp, votesDown, myVote } = payload;
            setPosts(prev => prev.map(p => p.id === postId ? { ...p, votesUp, votesDown, myVote: (myVote ?? p.myVote) as VoteState } : p));
          } else if (t === "comment:vote") {
            const { postId, commentId, votesUp, votesDown } = payload;
            setPosts(prev => prev.map(p => {
              if (p.id !== postId || !p._comments) return p;
              const next = p._comments.map(c => c.id === commentId ? { ...c, votesUp, votesDown } : c);
              return { ...p, _comments: next };
            }));
          }
        } catch {}
      };
      es.onerror = () => {
        es.close();
        esRef.current = null;
      };
      esRef.current = es;
    } catch {
      esRef.current = null;
    }
  }

  useEffect(() => {
    if (status !== "authenticated") return;
    loadPosts();
    connectSSE();

    if (pollRef.current !== null) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(() => {
      if (document.visibilityState === "visible" && !esRef.current) loadPosts();
    }, 15000);

    const onVis = () => {
      if (document.visibilityState === "visible") {
        if (!esRef.current) connectSSE();
        loadPosts();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [status, authHeaders]);

  const ready = status === "authenticated";
  const sortedPosts = useMemo(() => [...posts].sort((a, b) => ts(b.createdAt) - ts(a.createdAt)), [posts]);

  function voteBtnColor(active: boolean, negative?: boolean) {
    if (!active) return "#e5e7eb";
    return negative ? "#ef4444" : "#10b981";
  }

  function openPopover(p: Post) {
    const el = itemRefs.current.get(p.id) || null;
    const rect = el?.getBoundingClientRect() || null;
    setPopoverPost(p);
    setAnchorRect(rect);
    if (!seen.has(p.id)) markSeen(p.id);
    // лениво дозагрузить комменты при первом открытии
    if (!p._commentsLoaded) loadComments(p.id);
  }
  function closePopover() {
    setPopoverPost(null);
    setAnchorRect(null);
  }

  function writeToAuthor(authorId?: string) {
    if (!authorId) return;
    // мягкая навигация в чаты: передаём адресата через query
    router.push(`/chats?to=${encodeURIComponent(authorId)}`);
  }

  if (!ready) {
    return (
      <section style={{ padding: 16, fontFamily: '"Times New Roman", serif', fontSize: 12 }}>
        Нужна авторизация.
      </section>
    );
  }

  const hasPreview = preview.length > 0;

  return (
    <section style={{ fontFamily: '"Times New Roman", serif', fontSize: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16 }}>
        {/* composer */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Новая публикация</div>
          <div style={{ display: "grid", gap: 8 }}>
            <input
              type="text"
              placeholder="Тема новости (заголовок)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              style={{ height: 32, borderRadius: 10, border: "1px solid #e5e7eb", padding: "0 10px" }}
            />
            <textarea
              placeholder="Текст новости"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              rows={6}
              style={{ borderRadius: 10, border: "1px solid #e5e7eb", padding: 10, resize: "vertical" }}
            />
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="file" multiple onChange={(e) => onFilesChange(e.target.files)} style={{ display: "none" }} />
              <span className="btnGhost">Прикрепить файлы</span>
            </label>
            {hasPreview && (
              <div className="previews">
                {preview.map((p, i) => (
                  <div key={i} className="prevItem">
                    {p.type === "image" ? (
                      <img src={p.url} alt="preview" />
                    ) : p.type === "video" ? (
                      <video src={p.url} controls />
                    ) : (
                      <div className="fileStub">
                        <div className="fileIcon">📄</div>
                        <div className="fileName">{p.file.name}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={publish} disabled={posting} className="btnPrimary">
                Опубликовать
              </button>
            </div>
          </div>
        </div>

        {/* feed */}
        <div className="card" style={{ padding: 0, minHeight: 420, display: "flex", flexDirection: "column" }}>
          <div className="feedHead">
            <div style={{ fontWeight: 800 }}>Тренды G108</div>
            <Link href="/calendar" className="btnGhost">Календарь</Link>
          </div>

          {loading && <div style={{ padding: 12, color: "#6b7280" }}>Загрузка…</div>}

          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {sortedPosts.map((p) => {
              const isNew = !seen.has(p.id);
              const myVote = p.myVote ?? 0;
              const up = p.votesUp ?? 0;
              const dn = p.votesDown ?? 0;

              return (
                <article
                  key={p.id}
                  ref={setItemRef(p.id)}
                  className={`feedItem ${isNew ? "new" : ""}`}
                  onClick={(e) => {
                    // чтобы не срабатывало на кнопках
                    const tag = (e.target as HTMLElement).closest("button,a");
                    if (tag) return;
                    openPopover(p);
                  }}
                >
                  {/* compact header */}
                  <div className="fiRow">
                    <div className="fiTitle">{p.title || "Без темы"}</div>
                    <div className="fiMeta">{p.authorName || "Пользователь"} • {fmtRuDateTime(p.createdAt)}</div>
                  </div>
                  {/* snippet */}
                  <div className="fiSnippet">{(p.text || "").slice(0, 180)}{(p.text || "").length > 180 ? "…" : ""}</div>
                  {/* actions */}
                  <div className="fiActs">
                    <button
                      className="chip"
                      title="Нравится"
                      onClick={() => votePost(p.id, myVote === 1 ? 0 : 1)}
                    >
                      ▲ {up}
                    </button>
                    <button
                      className="chip"
                      title="Не нравится"
                      onClick={() => votePost(p.id, myVote === -1 ? 0 : -1)}
                    >
                      ▼ {dn}
                    </button>
                    <button className="chip" onClick={() => openPopover(p)}>
                      Открыть
                    </button>
                    <button className="chip" onClick={() => writeToAuthor(p.authorId)}>
                      Написать автору
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>

      {/* Popover */}
      {popoverPost && (
        <PostPopover
          post={popoverPost}
          anchorRect={anchorRect}
          onClose={closePopover}
          onVote={votePost}
          onVoteComment={voteComment}
          onWriteAuthor={writeToAuthor}
          comments={posts.find(x => x.id === popoverPost.id)?._comments}
          commentsLoaded={posts.find(x => x.id === popoverPost.id)?._commentsLoaded}
          commentDraft={commentDrafts[popoverPost.id] || ""}
          setCommentDraft={(v) => setCommentDrafts(prev => ({ ...prev, [popoverPost.id]: v }))}
          sendComment={() => addComment(popoverPost.id)}
          sending={!!sendingComment[popoverPost.id]}
        />
      )}

      <style jsx>{`
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; }
        .btnPrimary {
          height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid ${BRAND};
          background: ${BRAND}; color: #fff; cursor: pointer; font-weight: 800;
        }
        .btnGhost {
          display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 10px;
          border: 1px solid #e5e7eb; background: #fff; color: #111827; text-decoration: none; cursor: pointer;
        }
        .feedHead { padding: 12px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between; }

        .previews { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .prevItem { border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; background: #fcfcfc; }
        .prevItem img, .prevItem video { display: block; width: 100%; height: auto; }
        .fileStub { display: grid; grid-template-columns: 28px 1fr; align-items: center; padding: 8px; gap: 8px; }
        .fileName { font-size: 12px; color: #374151; }

        .feedItem {
          position: relative;
          border: 1px solid #e5e7eb; border-radius: 12px; background: #fff; padding: 10px 12px;
          cursor: pointer; transition: background 120ms ease, border-color 120ms ease;
        }
        .feedItem:hover { background: #fafafa; }
        .feedItem.new { border-color: ${NEW_MARK}; background: #fffaf2; }
        .feedItem.new::before {
          content: ""; position: absolute; left: -1px; top: -1px; bottom: -1px; width: 4px;
          background: ${NEW_MARK}; border-top-left-radius: 12px; border-bottom-left-radius: 12px;
        }
        .fiRow { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
        .fiTitle { font-weight: 800; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fiMeta { font-size: 12px; color: #6b7280; }
        .fiSnippet { margin-top: 6px; color: #111827; }
        .fiActs { margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap; }
        .chip { height: 26px; padding: 0 10px; border-radius: 999px; border: 1px solid #e5e7eb; background: #fff; cursor: pointer; font-size: 12px; }
      `}</style>
    </section>
  );
}

/** Поповер поста: календарный визуал, адаптивное позиционирование, авторазмер */
function PostPopover(props: {
  post: Post;
  anchorRect: DOMRect | null;
  onClose: () => void;
  onVote: (postId: string, v: VoteState) => void;
  onVoteComment: (postId: string, commentId: string, v: VoteState) => void;
  onWriteAuthor: (authorId?: string) => void;
  comments?: Comment[];
  commentsLoaded?: boolean;
  commentDraft: string;
  setCommentDraft: (v: string) => void;
  sendComment: () => void;
  sending: boolean;
}) {
  const {
    post, anchorRect, onClose, onVote, onVoteComment, onWriteAuthor,
    comments, commentsLoaded, commentDraft, setCommentDraft, sendComment, sending
  } = props;

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxW: number }>(() => ({ top: 100, left: 100, maxW: 720 }));

  useEffect(() => {
    function place() {
      const pad = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const maxW = Math.min(720, vw - pad * 2);
      if (!anchorRect) {
        // по центру
        setPos({ top: Math.max(24, vh * 0.07), left: Math.max(pad, (vw - maxW) / 2), maxW });
        return;
      }
      const left = Math.min(Math.max(pad, anchorRect.left + window.scrollX), vw - maxW - pad) + 0;
      const above = anchorRect.top + window.scrollY - 24; // чуть выше карточки
      const top = Math.max(16, above);
      setPos({ top, left, maxW });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place);
      document.removeEventListener("keydown", onEsc);
    };
  }, [anchorRect, onClose]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const card = cardRef.current;
      if (!card) return;
      if (!card.contains(e.target as Node)) onClose();
    };
    const overlay = overlayRef.current;
    overlay?.addEventListener("mousedown", handler);
    return () => overlay?.removeEventListener("mousedown", handler);
  }, [onClose]);

  const myVote = post.myVote ?? 0;
  const up = post.votesUp ?? 0;
  const dn = post.votesDown ?? 0;

  return (
    <>
      <div ref={overlayRef} className="ppOverlay" />
      <div
        ref={cardRef}
        className="ppCard"
        style={{ top: pos.top, left: pos.left, maxWidth: pos.maxW }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`pp-title-${post.id}`}
      >
        <div className="ppArrow" />
        <header className="ppHead">
          <div className="ppWho">
            <div className="ppTitle" id={`pp-title-${post.id}`}>{post.title || "Без темы"}</div>
            <div className="ppMeta">
              Опубликовал: <strong>{post.authorName || "Пользователь"}</strong> • {fmtRuDateTime(post.createdAt)}
            </div>
          </div>
          <div className="ppHeadActs">
            <button className="btnGhost sm" onClick={() => onWriteAuthor(post.authorId)}>Написать автору</button>
            <button className="btnGhost sm" onClick={onClose} aria-label="Закрыть">Закрыть</button>
          </div>
        </header>

        <section className="ppBody">
          {/* текст — в собственной рамке с авторазмером */}
          <div className="ppTextBox">
            <div className="ppText">{post.text}</div>
          </div>

          {/* вложения */}
          {post.attachments && post.attachments.length > 0 && (
            <div className="attachments">
              {post.attachments.map((a, i) => (
                <div key={a.id || i} className="attItem">
                  {a.type === "image" ? (
                    <a href={a.url} target="_blank" rel="noreferrer">
                      <img src={a.url} alt={a.name || "image"} />
                    </a>
                  ) : a.type === "video" ? (
                    <video src={a.url} controls />
                  ) : (
                    <a className="fileLink" href={a.url} download>
                      <span className="fileIcon">📄</span>
                      <span className="fileName">{a.name || "файл"}</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="ppFoot">
          <div className="ppVotes">
            <button
              className={`chip ${myVote === 1 ? "on" : ""}`}
              title="Нравится"
              onClick={() => onVote(post.id, myVote === 1 ? 0 : 1)}
            >
              ▲ {up}
            </button>
            <button
              className={`chip ${myVote === -1 ? "on" : ""}`}
              title="Не нравится"
              onClick={() => onVote(post.id, myVote === -1 ? 0 : -1)}
            >
              ▼ {dn}
            </button>
          </div>
          <div className="ppSpacer" />
          <button className="btnGhost sm" onClick={() => onWriteAuthor(post.authorId)}>Написать автору</button>
        </footer>

        {/* комментарии — визуально отличающиеся от поста */}
        <section className="ppComments">
          <div className="cHeadRow">
            <div className="cTitle">Комментарии {typeof post.commentsCount === "number" ? `(${post.commentsCount})` : ""}</div>
          </div>

          {!commentsLoaded && <div className="muted">Загрузка ветки…</div>}
          {commentsLoaded && (!comments || comments.length === 0) && <div className="muted">Пока нет комментариев</div>}

          {commentsLoaded && comments && comments.length > 0 && (
            <div className="cThread">
              {comments.map(c => {
                const cmv = c.myVote ?? 0;
                return (
                  <div key={c.id} className="cItem">
                    <div className="cMetaRow">
                      <div className="cName">{c.authorName || "Пользователь"}</div>
                      <div className="cTime">{fmtRuDateTime(c.createdAt)}</div>
                    </div>
                    <div className="cBox">{c.text}</div>
                    <div className="cActs">
                      <button
                        className={`chip ${cmv === 1 ? "on" : ""}`}
                        title="Нравится"
                        onClick={() => onVoteComment(post.id, c.id, cmv === 1 ? 0 : 1)}
                      >
                        ▲ {c.votesUp ?? 0}
                      </button>
                      <button
                        className={`chip ${cmv === -1 ? "on" : ""}`}
                        title="Не нравится"
                        onClick={() => onVoteComment(post.id, c.id, cmv === -1 ? 0 : -1)}
                      >
                        ▼ {c.votesDown ?? 0}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="cForm">
            <input
              type="text"
              placeholder="Ваш комментарий…"
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
            />
            <button type="button" className="btnPrimary sm" onClick={sendComment} disabled={sending || !commentDraft.trim()}>
              Отправить
            </button>
          </div>
        </section>
      </div>

      <style jsx>{`
        .ppOverlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.18); z-index: 60;
        }
        .ppCard {
          position: absolute; z-index: 61;
          background: #fff; border: 1px solid #e5e7eb; border-radius: 14px;
          box-shadow: 0 12px 28px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.1);
          overflow: hidden;
          width: calc(100vw - 16px);
        }
        .ppArrow {
          position: absolute; top: -8px; left: 28px; width: 16px; height: 16px;
          background: #fff; border-left: 1px solid #e5e7eb; border-top: 1px solid #e5e7eb;
          transform: rotate(45deg);
        }
        .ppHead {
          padding: 12px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between; gap: 8px;
        }
        .ppWho { min-width: 0; }
        .ppTitle { font-weight: 800; font-size: 16px; line-height: 1.2; margin-bottom: 4px; }
        .ppMeta { font-size: 12px; color: #6b7280; }
        .ppHeadActs { display: flex; gap: 8px; flex-wrap: wrap; }
        .btnGhost { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 10px; border: 1px solid #e5e7eb; background: #fff; color: #111827; cursor: pointer; }
        .btnGhost.sm { height: 28px; padding: 0 10px; border-radius: 8px; font-size: 12px; }
        .btnPrimary { height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid ${BRAND}; background: ${BRAND}; color: #fff; cursor: pointer; font-weight: 800; }
        .btnPrimary.sm { height: 28px; border-radius: 8px; font-size: 12px; }

        .ppBody { padding: 12px; display: grid; gap: 10px; max-height: calc(80vh - 200px); overflow: auto; }
        .ppTextBox {
          border: 1px solid #e5e7eb; background: ${BRAND_SOFT}; border-radius: 10px; padding: 10px;
        }
        .ppText { white-space: pre-wrap; word-break: break-word; }

        .attachments { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
        .attItem { border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; background: #fcfcfc; }
        .attItem img, .attItem video { display: block; width: 100%; height: auto; }
        .fileLink { display: grid; grid-template-columns: 24px 1fr; align-items: center; gap: 6px; padding: 8px; text-decoration: none; color: #111827; }
        .fileIcon { font-size: 16px; }
        .fileName { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .ppFoot { padding: 10px 12px; border-top: 1px solid #e5e7eb; display: flex; align-items: center; gap: 8px; }
        .ppVotes { display: flex; gap: 8px; }
        .chip { height: 26px; padding: 0 10px; border-radius: 9999px; border: 1px solid #e5e7eb; background: #fff; cursor: pointer; font-size: 12px; }
        .chip.on { border-color: ${BRAND}; }

        .ppComments { padding: 12px; border-top: 1px dashed #e5e7eb; background: #fff; }
        .cHeadRow { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .cTitle { font-weight: 800; }
        .muted { font-size: 12px; color: #6b7280; }
        .cThread { display: grid; gap: 8px; }
        .cItem {
          border: 1px solid #e5e7eb; border-radius: 10px; background: #fafafa; position: relative;
        }
        .cItem::before {
          content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: ${BRAND};
          border-top-left-radius: 10px; border-bottom-left-radius: 10px; opacity: 0.35;
        }
        .cMetaRow { display: flex; justify-content: space-between; padding: 8px 10px 4px 10px; font-size: 12px; color: #6b7280; }
        .cName { font-weight: 700; color: #111827; }
        .cTime { }
        .cBox { padding: 4px 10px 8px 10px; white-space: pre-wrap; word-break: break-word; }
        .cActs { padding: 6px 10px 10px 10px; display: flex; gap: 8px; }

        .cForm { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-top: 10px; }
        .cForm input { height: 32px; border-radius: 10px; border: 1px solid #e5e7eb; padding: 0 10px; }
      `}</style>
    </>
  );
}
