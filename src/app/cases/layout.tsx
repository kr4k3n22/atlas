import React from "react";
import { ApproverTopbar } from "@/components/app/approver-topbar";

export default function CasesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <ApproverTopbar />
      <main className="w-full">{children}</main>
    </div>
  );
}
