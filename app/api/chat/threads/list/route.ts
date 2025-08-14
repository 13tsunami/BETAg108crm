export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Item = {
  id: string;
  peerId: string;
  peerName: string | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  unreadCount?: number;
};

export async function GET(req: Request) {
  const uid = (req.headers.get("x-user-id") || "").trim();
  const data: Item[] = uid ? [] : [];
  return Response.json(data);
}
