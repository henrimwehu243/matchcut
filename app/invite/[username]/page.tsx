"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Check, UserPlus } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Avatar, ErrorNote } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

function InviteContent() {
  const params = useParams<{ username: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const rawUsername = decodeURIComponent(params.username || "").toLowerCase();
  const [inviter, setInviter] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"idle" | "done" | "already" | "self">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadInviter() {
      if (!rawUsername) return;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", rawUsername)
        .maybeSingle();
      setInviter((data as Profile) ?? null);
      setLoading(false);
    }
    void loadInviter();
  }, [rawUsername]);

  const acceptInvite = async (inviterId: string, currentUserId: string) => {
    if (inviterId === currentUserId) {
      setStatus("self");
      return;
    }

    const { data: existing } = await supabase
      .from("friendships")
      .select("id, status")
      .or(
        `and(requester_id.eq.${inviterId},addressee_id.eq.${currentUserId}),and(requester_id.eq.${currentUserId},addressee_id.eq.${inviterId})`,
      )
      .maybeSingle();

    if (existing) {
      if (existing.status !== "accepted") {
        await supabase.from("friendships").update({ status: "accepted" }).eq("id", existing.id);
      }
      setStatus("already");
      return;
    }

    const { error: insertError } = await supabase.from("friendships").insert({
      requester_id: inviterId,
      addressee_id: currentUserId,
      status: "accepted",
    });

    if (insertError && insertError.code !== "23505") {
      setError(insertError.message);
      return;
    }

    localStorage.removeItem("matchcut_pending_invite");
    setStatus("done");
  };

  useEffect(() => {
    if (!authLoading && user && inviter) {
      void acceptInvite(inviter.id, user.id);
    }
  }, [authLoading, inviter, user]);

  function handleJoin(target: "/signup" | "/login") {
    localStorage.setItem("matchcut_pending_invite", rawUsername);
    router.push(target);
  }

  return (
    <div className="w-full max-w-md border border-white/10 bg-white/[0.02] p-8 text-center">
      <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-400">Invitation MatchCut</p>

      {loading ? (
        <p className="mt-6 text-sm text-zinc-400">Chargement de l’invitation…</p>
      ) : !inviter ? (
        <div className="mt-6">
          <h1 className="font-serif text-3xl">Lien introuvable</h1>
          <p className="mt-2 text-sm text-zinc-400">Ce pseudo n’existe pas ou le lien a expiré.</p>
          <button
            type="button"
            onClick={() => router.push("/decider")}
            className="mt-6 border border-white/20 px-5 py-2.5 text-sm"
          >
            Aller sur MatchCut
          </button>
        </div>
      ) : (
        <div className="mt-6 flex flex-col items-center">
          <Avatar name={inviter.username || inviter.full_name || "Membre"} url={inviter.avatar_url} size={72} />
          <h1 className="mt-4 font-serif text-3xl leading-tight">
            {inviter.full_name || inviter.username} t’invite sur MatchCut
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Choisissez ensemble vos prochains films, séries et animés entre potes.
          </p>

          <ErrorNote message={error} />

          {!user ? (
            <div className="mt-7 flex w-full flex-col gap-3">
              <button
                type="button"
                onClick={() => handleJoin("/signup")}
                className="flex w-full items-center justify-center gap-2 bg-[#f4f1ea] px-5 py-3 text-sm font-semibold text-[#09090b] transition hover:opacity-90"
              >
                <UserPlus size={16} />
                Créer mon compte et l’ajouter
              </button>
              <button
                type="button"
                onClick={() => handleJoin("/login")}
                className="w-full border border-white/20 px-5 py-2.5 text-sm text-zinc-300 hover:border-white/50"
              >
                J’ai déjà un compte
              </button>
            </div>
          ) : status === "self" ? (
            <div className="mt-6">
              <p className="text-sm text-zinc-400">C’est ton propre lien d’invitation ! Partage-le à tes amis.</p>
              <button
                type="button"
                onClick={() => router.push("/decider")}
                className="mt-5 bg-[#f4f1ea] px-5 py-2.5 text-sm font-semibold text-[#09090b]"
              >
                Retourner sur l’app
              </button>
            </div>
          ) : (
            <div className="mt-6">
              <p className="inline-flex items-center gap-2 text-sm font-medium text-emerald-400">
                <Check size={16} />
                {status === "already"
                  ? `Vous êtes déjà amis avec ${inviter.username} !`
                  : `Tu es maintenant ami avec ${inviter.username} !`}
              </p>
              <button
                type="button"
                onClick={() => router.push("/decider")}
                className="mt-5 block w-full bg-[#f4f1ea] px-5 py-3 text-sm font-semibold text-[#09090b]"
              >
                Commencer à swiper
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function InvitePage() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#09090b] p-6 text-[#f4f1ea]">
      <Suspense fallback={<p className="text-sm text-zinc-400">Chargement de l’invitation…</p>}>
        <InviteContent />
      </Suspense>
    </div>
  );
}