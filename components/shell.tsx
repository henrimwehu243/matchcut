"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bookmark, CircleUser, Clapperboard, Library, LogOut, Users } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";

const LINKS = [
  { href: "/decider", label: "Décider", icon: Clapperboard },
  { href: "/catalogue", label: "Catalogue", icon: Library },
  { href: "/listes", label: "Listes", icon: Bookmark },
  { href: "/groupes", label: "Groupes", icon: Users },
  { href: "/profil", label: "Profil", icon: CircleUser },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const name = profile?.full_name || profile?.username || "Membre";
  const [socialBadge, setSocialBadge] = useState(0);
  const [listsBadge, setListsBadge] = useState(0);

  const refreshBadges = useCallback(async () => {
    if (!user) return;

    // 1. Messages directs non lus + demandes d'amis en attente
    const [{ count: unreadDms }, { count: pendingFriends }, { data: profData }] = await Promise.all([
      supabase
        .from("direct_messages")
        .select("*", { count: "exact", head: true })
        .eq("receiver_id", user.id)
        .is("read_at", null),
      supabase
        .from("friendships")
        .select("*", { count: "exact", head: true })
        .eq("addressee_id", user.id)
        .eq("status", "pending"),
      supabase.from("profiles").select("last_seen_social").eq("id", user.id).single(),
    ]);

    const lastSeen = (profData?.last_seen_social as string | null) ?? "1970-01-01T00:00:00Z";

    // 2. Nouvelles réactions ou réponses reçues sur mes avis
    const { data: myReviews } = await supabase.from("reviews").select("id").eq("user_id", user.id);
    const myReviewIds = (myReviews ?? []).map((r) => r.id as string);
    let newInteractions = 0;

    if (myReviewIds.length > 0) {
      const [{ count: newReacts }, { count: newReplies }] = await Promise.all([
        supabase
          .from("review_reactions")
          .select("*", { count: "exact", head: true })
          .in("review_id", myReviewIds)
          .neq("user_id", user.id)
          .gt("created_at", lastSeen),
        supabase
          .from("review_replies")
          .select("*", { count: "exact", head: true })
          .in("review_id", myReviewIds)
          .neq("user_id", user.id)
          .gt("created_at", lastSeen),
      ]);
      newInteractions = (newReacts ?? 0) + (newReplies ?? 0);
    }

    // 3. Recommandations reçues récemment
    const { count: newRecs } = await supabase
      .from("recommendations")
      .select("*", { count: "exact", head: true })
      .eq("to_user_id", user.id)
      .gt("created_at", lastSeen);

    setSocialBadge((unreadDms ?? 0) + (pendingFriends ?? 0) + newInteractions);
    setListsBadge(newRecs ?? 0);
  }, [user]);

  useEffect(() => {
    void refreshBadges();
    const timer = window.setInterval(() => void refreshBadges(), 5000);
    return () => window.clearInterval(timer);
  }, [refreshBadges]);

  useEffect(() => {
    if (!user) return;
    if (pathname === "/groupes" || pathname === "/listes") {
      void supabase
        .from("profiles")
        .update({ last_seen_social: new Date().toISOString() })
        .eq("id", user.id)
        .then(() => void refreshBadges());
    }
  }, [pathname, user, refreshBadges]);

  async function logout() {
    await signOut();
    router.replace("/login");
  }

  function badgeCount(href: string) {
    if (href === "/groupes") return socialBadge;
    if (href === "/listes") return listsBadge;
    return 0;
  }

  return (
    <div className="flex min-h-screen flex-1 bg-[#09090b]">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/10 md:flex">
        <div className="px-6 py-8">
          <Link href="/decider" className="font-serif text-3xl tracking-tight text-[#f4f1ea]">
            MatchCut
          </Link>
          <p className="mt-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">Salle de montage</p>
          <p className="mt-6 truncate text-sm text-zinc-300">{name}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            const Icon = link.icon;
            const count = badgeCount(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center justify-between px-3 py-2.5 text-sm ${
                  active ? "bg-white/10 text-[#f4f1ea]" : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon size={16} />
                  {link.label}
                </span>
                {count > 0 ? (
                  <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    {count > 99 ? "99+" : count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={logout}
          className="m-3 flex items-center gap-3 px-3 py-2.5 text-left text-sm text-zinc-400 hover:text-zinc-100"
        >
          <LogOut size={16} />
          Déconnexion
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 md:hidden">
          <p className="font-serif text-2xl text-[#f4f1ea]">MatchCut</p>
          <button type="button" onClick={logout} className="text-zinc-400" aria-label="Déconnexion">
            <LogOut size={18} />
          </button>
        </div>
        <main className="flex-1 px-5 py-8 pb-24 md:px-10 md:pb-10">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-white/10 bg-[#09090b]/95 backdrop-blur md:hidden">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          const Icon = link.icon;
          const count = badgeCount(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`relative flex flex-col items-center gap-1 py-2.5 text-[10px] uppercase tracking-[0.14em] ${
                active ? "text-[#f4f1ea]" : "text-zinc-500"
              }`}
            >
              <span className="relative">
                <Icon size={16} />
                {count > 0 ? (
                  <span className="absolute -right-2.5 -top-1.5 rounded-full bg-red-600 px-1 text-[9px] font-bold leading-tight text-white">
                    {count}
                  </span>
                ) : null}
              </span>
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}