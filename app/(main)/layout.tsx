"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Shell } from "@/components/shell";
import { supabase } from "@/lib/supabase";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    async function processPendingInvite() {
      if (!user) return;
      const pendingUsername = localStorage.getItem("matchcut_pending_invite");
      if (!pendingUsername) return;

      const { data: inviter } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", pendingUsername.toLowerCase())
        .maybeSingle();

      if (!inviter || inviter.id === user.id) {
        localStorage.removeItem("matchcut_pending_invite");
        return;
      }

      const { data: existing } = await supabase
        .from("friendships")
        .select("id, status")
        .or(
          `and(requester_id.eq.${inviter.id},addressee_id.eq.${user.id}),and(requester_id.eq.${user.id},addressee_id.eq.${inviter.id})`,
        )
        .maybeSingle();

      if (existing) {
        if (existing.status !== "accepted") {
          await supabase.from("friendships").update({ status: "accepted" }).eq("id", existing.id);
        }
      } else {
        await supabase.from("friendships").insert({
          requester_id: inviter.id,
          addressee_id: user.id,
          status: "accepted",
        });
      }

      localStorage.removeItem("matchcut_pending_invite");
    }

    void processPendingInvite();
  }, [user]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-zinc-500">Ouverture de la salle…</div>
    );
  }

  return <Shell>{children}</Shell>;
}