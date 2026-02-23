"use client";

import { useState } from "react";

type ChatMessage = {
    role: "user" | "assistant";
    content: string;
    created_at: string;
};

function fmtTs(iso: string) {
    try {
        const d = new Date(iso);
        return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    } catch {
        return "";
    }
}

function MarkdownText({ text }: { text: string }) {
    // Render **bold** and bullet points cleanly without a full MD library
    const lines = text.split("\n");
    return (
        <div className="space-y-1">
            {lines.map((line, i) => {
                if (line.startsWith("**") && line.endsWith("**")) {
                    return (
                        <p key={i} className="font-semibold text-sm mt-3 first:mt-0 text-foreground">
                            {line.slice(2, -2)}
                        </p>
                    );
                }
                if (line.startsWith("* ") || line.startsWith("- ")) {
                    return (
                        <div key={i} className="flex gap-2 text-sm text-muted-foreground">
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50 mt-[7px]" />
                            <span>{renderInlineBold(line.slice(2))}</span>
                        </div>
                    );
                }
                if (line.trim() === "") return <div key={i} className="h-1" />;
                return (
                    <p key={i} className="text-sm text-muted-foreground leading-relaxed">
                        {renderInlineBold(line)}
                    </p>
                );
            })}
        </div>
    );
}

function renderInlineBold(text: string): React.ReactNode {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={i} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
    });
}

export function ConversationContext({
    summary,
    messages,
}: {
    summary: string;
    messages: ChatMessage[];
}) {
    const [transcriptOpen, setTranscriptOpen] = useState(false);

    return (
        <div className="rounded-xl border border-border bg-background/40 p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Conversation Context</div>
                <span className="rounded-full border border-border/50 bg-background/60 px-2.5 py-0.5 text-xs text-muted-foreground">
                    {messages.length} message{messages.length !== 1 ? "s" : ""}
                </span>
            </div>

            {/* AI Summary */}
            <div className="rounded-lg border border-border/60 bg-gradient-to-b from-foreground/5 to-transparent p-4 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    AI Summary
                </div>
                <MarkdownText text={summary} />
            </div>

            {/* Collapsible transcript */}
            {messages.length > 0 && (
                <div className="space-y-2">
                    <button
                        onClick={() => setTranscriptOpen((o) => !o)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <svg
                            className={`h-3 w-3 transition-transform ${transcriptOpen ? "rotate-90" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        {transcriptOpen ? "Hide" : "Show"} full conversation
                    </button>

                    {transcriptOpen && (
                        <div className="max-h-[480px] overflow-y-auto rounded-lg border border-border/60 bg-background/30 p-4 space-y-3">
                            {messages.map((msg, idx) => {
                                const isUser = msg.role === "user";
                                return (
                                    <div
                                        key={idx}
                                        className={`flex flex-col gap-0.5 ${isUser ? "items-end" : "items-start"}`}
                                    >
                                        <div
                                            className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${isUser
                                                    ? "bg-foreground/10 text-foreground border border-border/40"
                                                    : "bg-background/60 border border-border/40 text-muted-foreground"
                                                }`}
                                        >
                                            {msg.content}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground/50 px-1">
                                            {isUser ? "Claimant" : "Atlas"} · {fmtTs(msg.created_at)}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
