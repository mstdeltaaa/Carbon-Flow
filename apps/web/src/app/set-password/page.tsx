import { Suspense } from "react";

import { SetPasswordForm } from "./set-password-form";

export default function SetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <Suspense>
        <SetPasswordForm />
      </Suspense>
    </main>
  );
}
