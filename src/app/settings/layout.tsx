import React from "react";
import { ApproverTopbar } from "@/components/app/approver-topbar";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <ApproverTopbar />
      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </div>
  );
}
