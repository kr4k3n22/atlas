import React, { Suspense } from "react";
import UserLoginClient from "./login-client";

function Fallback() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Fallback />}>
      <UserLoginClient />
    </Suspense>
  );
}
