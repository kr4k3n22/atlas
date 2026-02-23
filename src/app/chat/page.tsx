"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Send,
  Loader2,
  User,
  Plus,
  Search,
  Trash2,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabaseClient";
import { sanitizeRationale } from "@/lib/mcpClient";
import { toast } from "sonner";
import DecisionTrace, { type DecisionTraceData } from "@/components/DecisionTrace";

// ─── Types ───────────────────────────────────────────────────────────────────

type EscalationMeta = {
  case_id: string;
  risk_score?: number;
  risk_label?: string;
  risk_rationale?: string;
  policy_refs?: string[];
  recommended_action?: string;
  timestamp?: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  metadata?: {
    escalation?: EscalationMeta;
  };
  decision_trace?: DecisionTraceData;
};

type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strip any embedded JSON objects from a chat message before display. */
function stripInlineJson(text: string): string {
  return text.replace(/\s*\{(?:[^{}]|\{[^{}]*\})*\}\s*/g, " ").replace(/\s{2,}/g, " ").trim();
}

/** Format a date string as DD/MM/YYYY HH:mm:ss */
function formatDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
  } catch {
    return dateStr;
  }
}

function relativeDate(dateStr: string) {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "Previous 7 Days";
  return "Older";
}

function groupConversations(conversations: Conversation[]) {
  const groups: Record<string, Conversation[]> = {
    Today: [],
    Yesterday: [],
    "Previous 7 Days": [],
    Older: [],
  };
  for (const c of conversations) {
    groups[relativeDate(c.updated_at)].push(c);
  }
  return groups;
}

const QUICK_PROMPTS = [
  "Check my unemployment benefit claim status",
  "Request an extension on my benefit payment",
  "What documents do I need for my welfare claim?",
  "I need to update my personal details",
];

// Patterns indicating a case decision (approval/rejection/info request) from a reviewer
const DECISION_PATTERNS = ["approved", "not approved", "additional information"];

// How long (ms) to remember sent message content so Realtime echoes can be suppressed
const CONTENT_TRACKING_TIMEOUT_MS = 5000;
// Number of recent messages to check for content-based deduplication
const CONTENT_DEDUP_WINDOW = 3;
// Delay (ms) before clearing isSendingRef after a send, giving Realtime enough
// time to deliver the echo so it can be discarded as a duplicate.
const REALTIME_ECHO_SUPPRESSION_DELAY_MS = 1500;

// ─── EscalationCard ──────────────────────────────────────────────────────────

function EscalationCard({
  escalation,
  timestamp,
}: {
  escalation: EscalationMeta;
  timestamp: string;
}) {
  const riskColor =
    escalation.risk_label === "BLOCK"
      ? "text-red-400"
      : escalation.risk_label === "ESCALATE"
        ? "text-amber-400"
        : "text-green-400";
  const riskBg =
    escalation.risk_label === "BLOCK"
      ? "bg-red-500/15 border-red-500/30 text-red-300"
      : escalation.risk_label === "ESCALATE"
        ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
        : "bg-green-500/15 border-green-500/30 text-green-300";

  return (
    <div className="rounded-lg border border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-transparent space-y-3 p-3 -mx-1">
      <div className="flex items-center gap-2">
        <span className="text-lg">⏳</span>
        <span className="font-semibold text-amber-400">Request Under Review</span>
      </div>

      {escalation.case_id && !escalation.case_id.startsWith("evt_") && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Reference ID:</span>
          <span className="inline-flex items-center rounded border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 font-mono text-[11px] text-amber-300">
            {escalation.case_id}
          </span>
        </div>
      )}

      {(escalation.risk_label || escalation.risk_score !== undefined) && (
        <div className="flex items-center gap-2 flex-wrap">
          {escalation.risk_label && (
            <span className={`inline-flex items-center rounded-[3px] border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${riskBg}`}>
              {escalation.risk_label}
            </span>
          )}
          {escalation.risk_score !== undefined && (
            <span className={`text-xs font-medium ${riskColor}`} title="Gateway Risk Score — internal routing score used for case prioritization">
              Gateway Risk Score: {escalation.risk_score}/100
            </span>
          )}
        </div>
      )}

      {escalation.risk_rationale && (
        <div>
          <div className="text-[11px] text-muted-foreground font-medium mb-0.5">Rationale</div>
          <p className="text-xs text-foreground/80">{sanitizeRationale(escalation.risk_rationale)}</p>
        </div>
      )}

      {escalation.policy_refs && escalation.policy_refs.length > 0 && (
        <div>
          <div className="text-[11px] text-muted-foreground font-medium mb-1">Policy References</div>
          <div className="flex flex-wrap gap-1">
            {escalation.policy_refs.map((ref) => (
              <span
                key={ref}
                className="inline-flex items-center rounded border border-border bg-background/40 px-1.5 py-0.5 text-[10px]"
              >
                {ref}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground/80">
        Your request has been forwarded to a case officer for review. You will be notified when a
        decision is made.
      </p>

      <p className="text-[10px] text-muted-foreground/50">{formatDateTime(escalation.timestamp ?? timestamp)}</p>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ChatPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);

  const [displayName, setDisplayName] = React.useState("");
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [loadingConvs, setLoadingConvs] = React.useState(true);
  const [loadingMsgs, setLoadingMsgs] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = React.useState<string | null>(null);
  const [escalation, setEscalation] = React.useState<EscalationMeta | null>(null);

  const bottomRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const isSendingRef = React.useRef(false);
  const recentlySentContentRef = React.useRef<Set<string>>(new Set());

  // Auth check + load user info
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

  // Load conversations
  const loadConversations = React.useCallback(async () => {
    setLoadingConvs(true);
    try {
      const res = await fetch("/api/chats");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
      }
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  React.useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load messages for active conversation
  React.useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }
    // Don't refetch from DB if we just sent a message (messages are already in local state)
    if (isSendingRef.current) return;
    setLoadingMsgs(true);
    fetch(`/api/chats/${activeConvId}`)
      .then((r) => r.json())
      .then((data) => {
        const msgs: Message[] = data.messages ?? [];
        setMessages(msgs);
        // Restore escalation state from the most recent escalation metadata
        const lastEscalated = msgs.slice().reverse().find(
          (m) => m.role === "assistant" && m.metadata?.escalation,
        );
        if (lastEscalated?.metadata?.escalation) {
          setEscalation(lastEscalated.metadata.escalation);
        }
      })
      .catch(() => setMessages([]))
      .finally(() => setLoadingMsgs(false));
  }, [activeConvId]);

  // Auto-scroll on new messages
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // NOTE: Realtime requires the `chat_messages` table to have Realtime enabled
  // in the Supabase dashboard (Database → Replication → Realtime).
  React.useEffect(() => {
    if (!activeConvId) return;

    const channel = supabase
      .channel(`chat-messages-${activeConvId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${activeConvId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.role !== "assistant") return;

          // Skip messages that were just sent by our own sendMessage flow
          if (isSendingRef.current) return;
          if (recentlySentContentRef.current.has(newMsg.content)) {
            recentlySentContentRef.current.delete(newMsg.content);
            return;
          }

          // Avoid duplicates — check by id and by recent content
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            // Content-based dedup for the last few messages
            const recent = prev.slice(-CONTENT_DEDUP_WINDOW);
            if (recent.some((m) => m.role === "assistant" && m.content === newMsg.content)) return prev;
            return [...prev, newMsg];
          });

          // Only show toast for genuine out-of-band reviewer messages
          const content = newMsg.content.toLowerCase();
          // "escalat" intentionally matches both "escalate" and "escalated"
          const reviewPatterns = ["under review", "pending review", "high risk", "escalat"];
          if (DECISION_PATTERNS.some((p) => content.includes(p))) {
            // A case decision has arrived — dismiss the escalation banner
            setEscalation(null);
            if (content.includes("not approved")) {
              toast.error("❌ Your request was not approved");
            } else if (content.includes("approved")) {
              toast.success("✅ Your request has been approved");
            } else {
              toast.info("ℹ️ A reviewer has requested more information");
            }
          } else if (reviewPatterns.some((p) => content.includes(p))) {
            toast.info("🔔 Your request is being reviewed by a human reviewer");
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeConvId, supabase]);

  // Polling fallback for chat_messages: when an escalation is active, poll every 8 s
  // so the approval message appears even if Realtime is blocked by RLS.
  React.useEffect(() => {
    if (!activeConvId || !escalation) return;

    const pollInterval = setInterval(() => {
      fetch(`/api/chats/${activeConvId}`)
        .then((r) => r.json())
        .then((data) => {
          const fetched: Message[] = data.messages ?? [];
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newMsgs = fetched.filter((m) => !existingIds.has(m.id));
            if (newMsgs.length === 0) return prev;
            // Auto-dismiss escalation if an approval/rejection message arrived
            for (const m of newMsgs) {
              if (m.role === "assistant") {
                const c = m.content.toLowerCase();
                if (DECISION_PATTERNS.some((p) => c.includes(p))) {
                  setEscalation(null);
                  if (c.includes("not approved")) {
                    toast.error("❌ Your request was not approved");
                  } else if (c.includes("approved")) {
                    toast.success("✅ Your request has been approved");
                  } else {
                    toast.info("ℹ️ A reviewer has requested more information");
                  }
                  break;
                }
              }
            }
            return [...prev, ...newMsgs];
          });
        })
        .catch(() => {
          // Silently ignore poll errors
        });
    }, 8_000);

    return () => clearInterval(pollInterval);
  }, [activeConvId, escalation]);

  async function startNewChat() {
    setActiveConvId(null);
    setMessages([]);
    setInput("");
    setEscalation(null);
    setSidebarOpen(false);
  }

  async function selectConversation(id: string) {
    setActiveConvId(id);
    setEscalation(null);
    setSidebarOpen(false);
  }

  async function deleteConversation(id: string) {
    const res = await fetch(`/api/chats/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setDeleteConfirm(null);
      return;
    }
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConvId === id) {
      setActiveConvId(null);
      setMessages([]);
    }
    setDeleteConfirm(null);
  }

  async function sendMessage(text?: string) {
    const msgText = (text ?? input).trim();
    if (!msgText || loading) return;

    const userMsgId = crypto.randomUUID();
    const userMsg: Message = {
      id: userMsgId,
      role: "user",
      content: msgText,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    isSendingRef.current = true;

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msgText, history, conversation_id: activeConvId }),
      });
      const data = await res.json();

      const escalationData: EscalationMeta | undefined =
        data.escalated && data.case_id
          ? {
              case_id: data.case_id,
              risk_score: data.risk_score,
              risk_label: data.risk_label,
              risk_rationale: data.risk_rationale,
              policy_refs: data.policy_refs,
              recommended_action: data.recommended_action,
              timestamp: data.timestamp ?? new Date().toISOString(),
            }
          : undefined;

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply ?? "Sorry, I couldn't process your request. Please try again.",
        created_at: new Date().toISOString(),
        ...(escalationData ? { metadata: { escalation: escalationData } } : {}),
        ...(data.decision_trace ? { decision_trace: data.decision_trace as DecisionTraceData } : {}),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Track content so the Realtime handler can skip the echo of this message
      recentlySentContentRef.current.add(assistantMsg.content);
      setTimeout(() => recentlySentContentRef.current.delete(assistantMsg.content), CONTENT_TRACKING_TIMEOUT_MS);

      // Update active conversation id (may be newly created)
      if (data.conversation_id && data.conversation_id !== activeConvId) {
        setActiveConvId(data.conversation_id);
      }

      if (escalationData) {
        setEscalation(escalationData);
      }

      // Refresh conversation list to show new / updated titles
      await loadConversations();
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "I'm sorry, something went wrong. Please try again in a moment.",
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      // Delay clearing the sending flag so the Realtime echo arrives within the
      // suppression window and is discarded as a duplicate.
      setTimeout(() => { isSendingRef.current = false; }, REALTIME_ECHO_SUPPRESSION_DELAY_MS);
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

  // Build a Request ID map: sort all conversations by created_at ascending, assign sequential IDs
  const requestIdMap = React.useMemo(() => {
    const sorted = [...conversations].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const map = new Map<string, number>();
    sorted.forEach((c, i) => map.set(c.id, i + 1));
    return map;
  }, [conversations]);

  function getRequestId(num: number) {
    return `Request ID: #${String(num).padStart(5, "0")}`;
  }

  // Filtered conversations for sidebar search
  const filtered = conversations.filter((c) => {
    const reqId = getRequestId(requestIdMap.get(c.id) ?? 0).toLowerCase();
    const title = c.title.toLowerCase();
    const q = search.toLowerCase();
    return reqId.includes(q) || title.includes(q);
  });
  const groups = groupConversations(filtered);
  const groupOrder = ["Today", "Yesterday", "Previous 7 Days", "Older"] as const;

  // ─── Sidebar ─────────────────────────────────────────────────────────────

  const sidebar = (
    <aside className="flex flex-col h-full bg-background border-r border-border w-64 shrink-0">
      {/* New Request */}
      <div className="p-3 border-b border-border">
        <Button className="w-full justify-start gap-2" onClick={startNewChat}>
          <Plus className="w-4 h-4" />
          New Conversation
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search conversations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-muted/50 text-sm rounded-md pl-8 pr-3 py-1.5 outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-2">
        {loadingConvs ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8 px-4">
            {search ? "No conversations found." : "No conversations yet."}
          </p>
        ) : (
          groupOrder.map((group) =>
            groups[group].length === 0 ? null : (
              <div key={group} className="mb-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 py-1">
                  {group}
                </p>
                {groups[group].map((conv) => (
                  <div
                    key={conv.id}
                    className={`group flex items-center gap-1 px-3 py-2 cursor-pointer rounded-md mx-1 text-sm transition-colors ${
                      activeConvId === conv.id
                        ? "bg-primary/15 text-foreground"
                        : "hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => selectConversation(conv.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-xs font-semibold text-foreground/90">
                        {getRequestId(requestIdMap.get(conv.id) ?? 0)}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground leading-tight">
                        {conv.title}
                      </div>
                      <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {formatDateTime(conv.updated_at)}
                      </div>
                    </div>
                    {deleteConfirm === conv.id ? (
                      <div className="flex gap-1 shrink-0">
                        <button
                          className="text-destructive text-xs hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            void deleteConversation(conv.id);
                          }}
                        >
                          Delete
                        </button>
                        <button
                          className="text-muted-foreground text-xs hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="opacity-0 group-hover:opacity-100 shrink-0 text-muted-foreground hover:text-destructive transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm(conv.id);
                        }}
                        aria-label="Delete conversation"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
          )
        )}
      </div>

      {/* User info */}
      <div className="p-3 border-t border-border flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-secondary-foreground" />
        </div>
        <span className="flex-1 text-xs text-muted-foreground truncate">{displayName}</span>
        <button
          onClick={signOut}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">{sidebar}</div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="w-64 flex flex-col h-full z-50">{sidebar}</div>
          <div
            className="flex-1 bg-black/40"
            onClick={() => setSidebarOpen(false)}
          />
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar (mobile) */}
        <header className="md:hidden sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-border bg-background/90 backdrop-blur">
          <button onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Welfare Services Portal</span>
          </div>
        </header>

        {/* Desktop header */}
        <header className="hidden md:flex sticky top-0 z-10 items-center gap-3 px-6 py-3 border-b border-border bg-background/90 backdrop-blur">
          <Shield className="w-4 h-4 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight">Welfare Services Portal</p>
            <p className="text-xs text-muted-foreground leading-tight">
              Powered by ATLAS Governance Framework
            </p>
          </div>
        </header>

        {/* Escalation banner */}
        {escalation && (
          <div className="mx-auto w-full max-w-3xl px-4 pt-4">
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
              <span className="text-base shrink-0">⏳</span>
              <div className="flex-1 min-w-0">
                <span className="font-medium">
                  Your request has been escalated for review by a case officer.
                </span>{" "}
                You&apos;ll be notified when a decision is made.
                {escalation.case_id && !escalation.case_id.startsWith("evt_") && (
                  <span className="ml-2 inline-flex items-center rounded border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 font-mono text-[11px] text-amber-300">
                    Reference: {escalation.case_id}
                  </span>
                )}
                {(escalation.risk_label || escalation.risk_score !== undefined) && (
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    {escalation.risk_label && (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-300">
                        {escalation.risk_label}
                      </span>
                    )}
                    {escalation.risk_score !== undefined && (
                      <span className="text-xs opacity-80" title="Gateway Risk Score — internal routing score used for case prioritization">
                        Gateway Risk Score: {escalation.risk_score}/100
                      </span>
                    )}
                  </div>
                )}
                {escalation.risk_rationale && (
                  <p className="mt-1 text-xs opacity-70 line-clamp-2">
                    {sanitizeRationale(escalation.risk_rationale)}
                  </p>
                )}
                {escalation.timestamp && (
                  <p className="mt-1 text-[10px] opacity-50">{formatDateTime(escalation.timestamp)}</p>
                )}
              </div>
              <button
                onClick={() => setEscalation(null)}
                className="ml-auto shrink-0 text-amber-400/60 hover:text-amber-400 text-base leading-none"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Messages area */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
            {/* Empty state */}
            {!activeConvId && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[50vh] gap-6 text-center">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-2xl">
                  🏛️
                </div>
                <div>
                  <h1 className="text-2xl font-semibold mb-1">
                    Hello{displayName ? `, ${displayName}` : ""}
                  </h1>
                  <p className="text-muted-foreground">How can I help with your welfare benefits today?</p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => void sendMessage(prompt)}
                      className="text-sm rounded-xl border border-border bg-muted/40 hover:bg-muted px-4 py-3 text-left transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading messages indicator */}
            {loadingMsgs && (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Messages */}
            {messages.map((msg) => {
              // Use persisted metadata to determine if this is an escalation message.
              const msgEscalation = msg.role === "assistant" ? (msg.metadata?.escalation ?? null) : null;

              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="flex items-end shrink-0">
                      <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-sm">
                        🏛️
                      </div>
                    </div>
                  )}
                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : msgEscalation
                          ? "bg-muted text-foreground rounded-bl-sm border-l-2 border-amber-500"
                          : "bg-muted text-foreground rounded-bl-sm"
                    }`}
                  >
                    {msgEscalation ? (
                      <EscalationCard escalation={msgEscalation} timestamp={msg.created_at} />
                    ) : (
                      <p className="whitespace-pre-wrap">{stripInlineJson(msg.content)}</p>
                    )}
                    {msg.role === "assistant" && msg.decision_trace && (
                      <DecisionTrace trace={msg.decision_trace} />
                    )}
                    <div className="flex items-center justify-between mt-1 gap-2">
                      {msg.role === "assistant" && (
                        <p className="text-[10px] text-muted-foreground">Atlas</p>
                      )}
                      <p className={`text-[10px] ${msg.role === "user" ? "text-primary-foreground/60 ml-auto" : "text-muted-foreground/60"}`}>
                        {formatDateTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                  {msg.role === "user" && (
                    <div className="flex items-end shrink-0">
                      <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
                        <User className="w-4 h-4 text-secondary-foreground" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Typing indicator */}
            {loading && (
              <div className="flex gap-3 justify-start">
                <div className="flex items-end shrink-0">
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-sm">
                    🏛️
                  </div>
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
                  <span className="text-xs text-muted-foreground">Atlas is typing…</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </main>

        {/* Input area */}
        <div className="sticky bottom-0 border-t border-border bg-background/90 backdrop-blur">
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
              Atlas is an AI assistant. Responses are for guidance only and do not constitute legal
              advice.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
