"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type Props = {
  caseId: string;
};

export default function DecisionPanel({ caseId }: Props) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function submit(decision: "APPROVE" | "REJECT" | "REQUEST_INFO") {
    setMsg(null);

    const res = await fetch(`/api/cases/${caseId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision,
        comment: note.trim() ? note.trim() : undefined,
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      setMsg(`Decision failed (${res.status}). ${t}`.trim());
      return;
    }

    const updated = await res.json().catch(() => null);
    setMsg(updated ? `Saved. New status: ${updated.status}` : "Saved.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        Approve executes the action. Reject blocks it. Request info pauses review.
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="text-sm font-semibold">Notes (Optional)</div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a short note for the audit trail."
          className="min-h-[90px]"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Button disabled={isPending} onClick={() => submit("APPROVE")} className="bg-green-600 hover:bg-green-600">
          Approve
        </Button>
        <Button disabled={isPending} onClick={() => submit("REJECT")} variant="destructive">
          Reject
        </Button>
        <Button disabled={isPending} onClick={() => submit("REQUEST_INFO")} variant="secondary">
          Request info
        </Button>
      </div>

      {msg ? <div className="text-xs text-muted-foreground">{msg}</div> : null}
    </div>
  );
}
