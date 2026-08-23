"use client";

import { useEffect, useRef, useState } from "react";
import { chatApi, type ChatMessage, type User } from "@/lib/services";

interface ChatPanelProps {
  meetingId: string;
  currentUser: User;
  onClose: () => void;
}

interface WsMessage {
  type: "chat_message";
  data: {
    id: string;
    meeting_id: string;
    user_id: string;
    user_name: string;
    content: string;
    created_at: string;
  };
}

export default function ChatPanel({ meetingId, currentUser, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load history
  useEffect(() => {
    chatApi.getMessages(meetingId).then(setMessages).catch(console.error);
  }, [meetingId]);

  // WebSocket connection
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const wsUrl = apiUrl.replace(/^http/, "ws");
    const token = localStorage.getItem("access_token") ?? "";
    const ws = new WebSocket(`${wsUrl}/ws/meetings/${meetingId}/chat?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const msg: WsMessage = JSON.parse(ev.data);
        if (msg.type === "chat_message") {
          setMessages((prev) => {
            // Avoid duplicates (REST + WS)
            if (prev.some((m) => m.id === msg.data.id)) return prev;
            return [
              ...prev,
              {
                id: msg.data.id,
                meeting_id: msg.data.meeting_id,
                user: {
                  id: msg.data.user_id,
                  email: "",
                  full_name: msg.data.user_name,
                  avatar_url: null,
                  is_active: true,
                  created_at: msg.data.created_at,
                },
                content: msg.data.content,
                created_at: msg.data.created_at,
              },
            ];
          });
        }
      } catch {
        // Ignore malformed messages
      }
    };

    return () => ws.close();
  }, [meetingId]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = input.trim();
    if (!content || isSending) return;
    setInput("");
    setIsSending(true);
    try {
      // Send via WS (it will broadcast to all including sender)
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ content }));
      } else {
        // Fallback to REST if WS isn't connected
        const msg = await chatApi.sendMessage(meetingId, content);
        setMessages((prev) => [...prev, msg]);
      }
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <h3 className="font-semibold text-sm">Meeting chat</h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-slate-500 text-sm py-8">
            No messages yet. Say hello! 👋
          </p>
        )}
        {messages.map((msg) => {
          const isMe = msg.user.id === currentUser.id;
          return (
            <div
              key={msg.id}
              className={`flex flex-col gap-0.5 animate-slide-in ${isMe ? "items-end" : "items-start"}`}
            >
              {!isMe && (
                <span className="text-xs text-slate-500 px-1">{msg.user.full_name}</span>
              )}
              <div
                className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
                  isMe
                    ? "text-white rounded-tr-sm"
                    : "text-slate-200 rounded-tl-sm"
                }`}
                style={
                  isMe
                    ? { background: "linear-gradient(135deg, #6366f1, #5b21b6)" }
                    : { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.06)" }
                }
              >
                {msg.content}
              </div>
              <span className="text-xs text-slate-600 px-1">{formatTime(msg.created_at)}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={sendMessage}
        className="px-4 py-3 border-t shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <div className="flex gap-2">
          <input
            id="chat-input"
            type="text"
            className="input-field flex-1 py-2 text-sm"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={4096}
          />
          <button
            type="submit"
            disabled={!input.trim() || isSending}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-all shrink-0"
            style={{
              background: input.trim() ? "linear-gradient(135deg, #6366f1, #5b21b6)" : "rgba(255,255,255,0.06)",
            }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
