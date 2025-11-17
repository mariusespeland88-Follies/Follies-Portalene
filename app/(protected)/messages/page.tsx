import { Suspense } from "react";
import MessagesClient from "./MessagesClient";

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-6xl px-4 py-8 text-neutral-900">
          Laster meldinger…
        </main>
      }
    >
      <MessagesClient />
    </Suspense>
  );
}
