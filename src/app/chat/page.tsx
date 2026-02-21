"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, Send, Bot, User, Loader2, BriefcaseBusiness } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabaseClient";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

type EscalationBanner = {
  case_id: string;
};

const ASSISTANT_NAME = "Alex";

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content:
    `Hello, I'm ${ASSISTANT_NAME}, your welfare services assistant. I can help you with unemployment benefit applications, check your claim status, or answer questions about eligibility. How can I help you today?`,
  timestamp: new Date(),
};

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);

  const [displayName, setDisplayName] = React.useState<string>("");
  const [messages, setMessages] = React.useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [escalation, setEscalation] = React.useState<EscalationBanner | null>(null);

  const bottomRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Auth check and user info
  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (!user) {
        router.replace("/login?next=/chat");
        return;
      }
      setDisplayName(user.user_metadata?.displayName ?? user.email ?? "");
    });
  }, [supabase, router]);

  // Auto-scroll to bottom on new messages
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });

      const data = await res.json();

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply ?? "Sorry, I couldn't process your request. Please try again.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (data.escalated && data.case_id) {
        setEscalation({ case_id: data.case_id });
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "I'm sorry, something went wrong. Please try again in a moment.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded bg-primary/10 text-primary shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight truncate">Welfare Services Portal</p>
              <p className="text-xs text-muted-foreground leading-tight truncate">
                Powered by ATLAS Governance Framework
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {displayName && (
              <span className="hidden sm:block text-xs text-muted-foreground truncate max-w-[140px]">
                {displayName}
              </span>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link href="/cases">
                <BriefcaseBusiness className="w-3.5 h-3.5 mr-1.5" />
                Cases
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Escalation banner */}
      {escalation && (
        <div className="mx-auto w-full max-w-3xl px-4 pt-4">
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
            <span className="text-base shrink-0">⏳</span>
            <div>
              <span className="font-medium">Your request has been escalated for review by a case officer.</span>
              {" "}You'll be notified when a decision is made.
              {escalation.case_id && (
                <span className="ml-1 font-mono text-xs opacity-80">(Ref: {escalation.case_id})</span>
              )}
            </div>
            <button
              onClick={() => setEscalation(null)}
              className="ml-auto shrink-0 text-amber-400/60 hover:text-amber-400 text-base leading-none"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Chat area */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="flex items-end shrink-0">
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                </div>
              )}

              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm"
                }`}
              >
                <p>{msg.content}</p>
                <p
                  className={`text-[10px] mt-1 ${
                    msg.role === "user" ? "text-primary-foreground/60 text-right" : "text-muted-foreground"
                  }`}
                >
                <p>{msg.role === "assistant" ? `${ASSISTANT_NAME} · ` : ""}{formatTime(msg.timestamp)}</p>
                </p>
              </div>

              {msg.role === "user" && (
                <div className="flex items-end shrink-0">
                  <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
                    <User className="w-4 h-4 text-secondary-foreground" />
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="flex items-end shrink-0">
                <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              </div>
              <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
              <span className="text-xs text-muted-foreground ml-1">{ASSISTANT_NAME} is typing…</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input area */}
      <div className="sticky bottom-0 border-t bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message… (Enter to send, Shift+Enter for new line)"
              disabled={loading}
              rows={1}
              className="resize-none min-h-[42px] max-h-36 flex-1 text-sm"
            />
            <Button
              onClick={() => void sendMessage()}
              disabled={loading || !input.trim()}
              size="icon"
              className="shrink-0 h-[42px] w-[42px]"
            >
              <Send className="w-4 h-4" />
              <span className="sr-only">Send</span>
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Alex is an AI assistant. Responses are for guidance only and do not constitute legal advice.
          </p>
        </div>
      </div>
    </div>
  );
}
