"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/decider" : "/login");
  }, [loading, user, router]);

  return (
    <main className="grid min-h-screen place-items-center">
      <div className="text-center">
        <p className="font-serif text-5xl tracking-tight text-[#f4f1ea]">MatchCut</p>
        <p className="mt-3 text-sm text-zinc-500">Ouverture de la salle…</p>
      </div>
    </main>
  );
}
