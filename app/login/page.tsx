import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-[70vh] flex items-center justify-center text-neutral-500">Laster …</div>}>
      <LoginForm />
    </Suspense>
  );
}
