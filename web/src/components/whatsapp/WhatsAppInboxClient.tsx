"use client";

import { useEffect, useState, useRef } from "react";
import { isTransientNetworkError } from "@/lib/fetchJson";

type Message = {
  id: number;
  direction: "inbound" | "outbound";
  messageType: string;
  body: string;
  mediaUrl?: string | null;
  deliveryStatus?: string | null;
  isAutomated: boolean;
  createdAt: string;
  receivedAt?: string | null;
};

type Conversation = {
  id: number;
  customerPhone: string;
  customerName: string;
  unreadCount: number;
  lastMessageAt: string | null;
  isWindowOpen: boolean;
  botActive?: boolean;
  humanHandled?: boolean;
  messages: Message[];
  booking?: {
    publicBookingId: string;
    customerName: string;
    status: string;
    deliveryDate: string;
    returnDate: string;
  } | null;
};

export default function WhatsAppInboxClient() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = async () => {
    try {
      const res = await fetch("/api/whatsapp/conversations");
      const data = await res.json() as { conversations?: Conversation[] };
      setConversations(data.conversations || []);
    } catch (e) {
      if (!isTransientNetworkError(e)) console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadConversation = async (conv: Conversation) => {
    setSelected(conv);
    try {
      const res = await fetch(`/api/whatsapp/conversations/${conv.id}`);
      const data = await res.json() as {
        conversation?: { messages: Message[]; botActive?: boolean; humanHandled?: boolean };
      };
      setMessages(data.conversation?.messages || []);
      const botActive = data.conversation?.botActive;
      const humanHandled = data.conversation?.humanHandled;
      setSelected((prev) => (prev && prev.id === conv.id ? { ...prev, botActive, humanHandled } : prev));
      setConversations((prev) =>
        prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0, botActive, humanHandled } : c)),
      );
    } catch (e) {
      if (!isTransientNetworkError(e)) console.error(e);
    }
  };

  const sendReply = async () => {
    if (!selected || !replyText.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/whatsapp/conversations/${selected.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyText }),
      });
      const data = await res.json() as { message?: Message };
      if (data.message) {
        setMessages((prev) => [...prev, data.message!]);
        setReplyText("");
        // A manual reply hands control from the bot to the team.
        setSelected((prev) => (prev ? { ...prev, botActive: false, humanHandled: true } : prev));
        setConversations((prev) =>
          prev.map((c) => (c.id === selected.id ? { ...c, botActive: false, humanHandled: true } : c)),
        );
      }
    } catch (e) {
      if (!isTransientNetworkError(e)) console.error(e);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selected) return;
    const interval = setInterval(() => loadConversation(selected), 10000);
    return () => clearInterval(interval);
  }, [selected?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const filtered = conversations.filter(
    (c) =>
      c.customerName.toLowerCase().includes(search.toLowerCase()) ||
      c.customerPhone.includes(search),
  );

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  return (
    <div style={{ display: "flex", height: "calc(100vh - 72px)", background: "#f9fafb" }}>
      {/* LEFT PANEL */}
      <div style={{ width: 320, borderRight: "1px solid #e5e7eb", background: "#fff", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "16px", borderBottom: "1px solid #15803d", background: "#16a34a" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#fff" }}>
              <i className="fa-solid fa-comment-dots" />
              <span style={{ fontWeight: 600 }}>WhatsApp Inbox</span>
              {totalUnread > 0 && (
                <span style={{ background: "#fff", color: "#16a34a", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>
                  {totalUnread}
                </span>
              )}
            </div>
            <button
              onClick={loadConversations}
              style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}
            >
              <i className="fa-solid fa-arrows-rotate" />
            </button>
          </div>
          <div style={{ marginTop: 12, position: "relative" }}>
            <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#86efac", fontSize: 12 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              style={{
                width: "100%",
                paddingLeft: 30,
                paddingRight: 12,
                paddingTop: 8,
                paddingBottom: 8,
                background: "#15803d",
                border: "1px solid #16a34a",
                borderRadius: 8,
                color: "#fff",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: 16, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>No conversations yet</div>
          ) : (
            filtered.map((conv) => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                isSelected={selected?.id === conv.id}
                onClick={() => loadConversation(conv)}
              />
            ))
          )}
        </div>
      </div>

      {/* RIGHT PANEL */}
      {selected ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: "16px", borderBottom: "1px solid #e5e7eb", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontWeight: 600, color: "#1f2937" }}>{selected.customerName}</div>
              {selected.botActive ? (
                <span title="The chatbot is answering this customer automatically. Send a message to take over." style={{ background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 20, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                  <i className="fa-solid fa-robot" style={{ fontSize: 10 }} />
                  Bot auto-replying
                </span>
              ) : (
                <span title="A team member has taken over this chat. The bot will stay silent here." style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 20, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                  <i className="fa-solid fa-user-headset" style={{ fontSize: 10 }} />
                  Team handling
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
              <i className="fa-solid fa-phone" style={{ fontSize: 11 }} />
              {selected.customerPhone}
              {selected.isWindowOpen && (
                <span style={{ color: "#16a34a", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                  <i className="fa-solid fa-circle" style={{ fontSize: 6 }} />
                  Window open
                </span>
              )}
            </div>
            {selected.booking && (
              <div style={{ fontSize: 11, color: "#2563eb", marginTop: 2 }}>
                Booking: {selected.booking.publicBookingId} · {selected.booking.status}
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            <div ref={bottomRef} />
          </div>

          <div style={{ padding: 16, borderTop: "1px solid #e5e7eb", background: "#fff" }}>
            {selected.botActive && (
              <div style={{ background: "#ecfdf5", color: "#047857", borderRadius: 8, padding: "6px 10px", marginBottom: 8, fontSize: 12, textAlign: "center" }}>
                🤖 The chatbot is auto-replying to this customer. Send a message to take over the chat.
              </div>
            )}
            {!selected.isWindowOpen && (
              <div style={{ background: "#fffbeb", color: "#d97706", borderRadius: 8, padding: "6px 10px", marginBottom: 8, fontSize: 12, textAlign: "center" }}>
                ⚠️ 24-hour messaging window is closed. You can only send approved templates.
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendReply();
                  }
                }}
                placeholder="Type a message… (Enter to send)"
                rows={2}
                style={{ flex: 1, resize: "none", border: "1px solid #d1d5db", borderRadius: 12, padding: "8px 12px", fontSize: 13, outline: "none" }}
              />
              <button
                onClick={sendReply}
                disabled={sending || !replyText.trim()}
                style={{
                  background: sending || !replyText.trim() ? "#d1d5db" : "#16a34a",
                  color: "#fff",
                  border: "none",
                  borderRadius: 12,
                  padding: "0 16px",
                  cursor: sending || !replyText.trim() ? "not-allowed" : "pointer",
                  fontSize: 14,
                }}
              >
                <i className="fa-solid fa-paper-plane" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>
          <div style={{ textAlign: "center" }}>
            <i className="fa-solid fa-comment-dots" style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }} />
            <p style={{ fontSize: 16 }}>Select a conversation</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>to start chatting with your customer</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ConversationItem({
  conv,
  isSelected,
  onClick,
}: {
  conv: Conversation;
  isSelected: boolean;
  onClick: () => void;
}) {
  const lastMsg = conv.messages?.[0];
  const timeStr = conv.lastMessageAt
    ? new Date(conv.lastMessageAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div
      onClick={onClick}
      style={{
        padding: 12,
        borderBottom: "1px solid #f3f4f6",
        cursor: "pointer",
        background: isSelected ? "#f0fdf4" : "#fff",
        borderLeft: isSelected ? "4px solid #16a34a" : "4px solid transparent",
        transition: "background 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: isSelected ? "#16a34a" : "#9ca3af",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 14, fontWeight: 700, flexShrink: 0,
          }}>
            {conv.customerName.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 13, color: "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}>
              {conv.customerName}
              {conv.botActive && (
                <i className="fa-solid fa-robot" title="Bot auto-replying" style={{ fontSize: 10, color: "#059669", flexShrink: 0 }} />
              )}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lastMsg?.body || "No messages yet"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>{timeStr}</span>
          {conv.unreadCount > 0 && (
            <span style={{ background: "#16a34a", color: "#fff", fontSize: 11, fontWeight: 700, width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isOutbound = msg.direction === "outbound";

  return (
    <div style={{ display: "flex", justifyContent: isOutbound ? "flex-end" : "flex-start" }}>
      <div style={{
        maxWidth: "60%",
        padding: "8px 12px",
        borderRadius: isOutbound ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
        background: isOutbound ? "#16a34a" : "#fff",
        color: isOutbound ? "#fff" : "#1f2937",
        border: isOutbound ? "none" : "1px solid #e5e7eb",
        boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
        fontSize: 13,
      }}>
        {msg.isAutomated && isOutbound && (
          <div style={{ fontSize: 11, color: "#bbf7d0", marginBottom: 4 }}>🤖 Automated</div>
        )}
        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{msg.body}</p>
        <div style={{ fontSize: 10, marginTop: 4, display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end", color: isOutbound ? "#bbf7d0" : "#9ca3af" }}>
          <i className="fa-regular fa-clock" style={{ fontSize: 9 }} />
          {new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          {isOutbound && (
            msg.deliveryStatus === "read"
              ? <i className="fa-solid fa-check-double" style={{ color: "#93c5fd", fontSize: 10 }} />
              : msg.deliveryStatus === "delivered"
              ? <i className="fa-solid fa-check-double" style={{ fontSize: 10 }} />
              : <i className="fa-solid fa-check" style={{ fontSize: 10 }} />
          )}
        </div>
      </div>
    </div>
  );
}
