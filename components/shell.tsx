"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bookmark,
  CalendarClock,
  CircleUser,
  Clapperboard,
  Film,
  Library,
  LogOut,
  Palette,
  Users,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Avatar } from "@/components/ui";
import { supabase } from "@/lib/supabase";

const LINKS = [
  { href: "/decider", label: "Décider", icon: Clapperboard },
  { href: "/catalogue", label: "Catalogue", icon: Library },
  { href: "/listes", label: "Listes", icon: Bookmark },
  { href: "/groupes", label: "Groupes", icon: Users },
  { href: "/sessions", label: "Sessions", icon: CalendarClock },
  { href: "/statistiques", label: "Stats", icon: BarChart3 },
  { href: "/profil", label: "Profil", icon: CircleUser },
];

const THEMES = [
  { id: "cinema", label: "Cinéma", bg: "#111115", accent: "#f59e0b", dot: "bg-amber-400" },
  { id: "velours", label: "Velours", bg: "#141016", accent: "#fb7185", dot: "bg-rose-400" },
  { id: "nuit", label: "Nuit", bg: "#0e131a", accent: "#38bdf8", dot: "bg-sky-400" },
  { id: "foret", label: "Sauge", bg: "#0f1412", accent: "#34d399", dot: "bg-emerald-400" },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const name = profile?.full_name || profile?.username || "Membre";
  const [socialBadge, setSocialBadge] = useState(0);
  const [listsBadge, setListsBadge] = useState(0);
  const [themeId, setThemeId] = useState<string>("cinema");

  useEffect(() => {
    const saved = window.localStorage.getItem("mc-theme");
    if (saved && THEMES.some((t) => t.id === saved)) {
      setThemeId(saved);
    }
  }, []);

  useEffect(() => {
    const current = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
    document.documentElement.style.setProperty("--mc-bg", current.bg);
    document.documentElement.style.setProperty("--mc-accent", current.accent);
    window.localStorage.setItem("mc-theme", current.id);
  }, [themeId]);

  const refreshBadges = useCallback(async () => {
    if (!user) return;

    const [{ count: unreadDms }, { count: pendingFriends }, { data: profData }, { data: memberships }] =
      await Promise.all([
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
        supabase.from("profiles").select("last_seen_social").eq("id", user.id).maybeSingle(),
        supabase.from("group_members").select("group_id").eq("user_id", user.id),
      ]);

    const lastSeen = (profData?.last_seen_social as string | null) ?? "1970-01-01T00:00:00Z";
    const groupIds = (memberships ?? []).map((m) => m.group_id as string);

    const [{ data: myReviews }, { count: newGroupMessages }] = await Promise.all([
      supabase.from("reviews").select("id").eq("user_id", user.id),
      groupIds.length > 0
        ? supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .in("group_id", groupIds)
            .neq("user_id", user.id)
            .gt("created_at", lastSeen)
        : Promise.resolve({ count: 0 }),
    ]);

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

    let recQuery = supabase
      .from("recommendations")
      .select("*", { count: "exact", head: true })
      .neq("from_user_id", user.id)
      .gt("created_at", lastSeen);
    recQuery = groupIds.length
      ? recQuery.or(`to_user_id.eq.${user.id},to_group_id.in.(${groupIds.join(",")})`)
      : recQuery.eq("to_user_id", user.id);

    const { count: newRecs } = await recQuery;

    setSocialBadge(
      (unreadDms ?? 0) +
        (pendingFriends ?? 0) +
        (newGroupMessages ?? 0) +
        newInteractions,
    );
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
    <div className="flex min-h-screen flex-1 text-[#f4f1ea]" style={{ backgroundColor: "var(--mc-bg)" }}>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/[0.08] bg-black/20 px-4 py-6 md:flex">
        <div className="px-2">
          <Link href="/decider" className="inline-flex items-center gap-2.5 font-serif text-3xl tracking-tight text-[#f4f1ea]">
            <span
              className="grid h-8 w-8 place-items-center rounded-xl text-zinc-950"
              style={{ backgroundColor: "var(--mc-accent)" }}
            >
              <Film size={17} />
            </span>
            MatchCut
          </Link>
        </div>

        <nav className="mt-8 flex flex-1 flex-col gap-1.5">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            const Icon = link.icon;
            const count = badgeCount(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-white/[0.09] text-[#f4f1ea] shadow-xs"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon size={17} style={active ? { color: "var(--mc-accent)" } : undefined} />
                  {link.label}
                </span>
                {count > 0 ? (
                  <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold leading-none text-white">
                    {count > 99 ? "99+" : count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 space-y-3 border-t border-white/[0.08] pt-4">
          <div className="flex items-center justify-between px-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
              <Palette size={13} />
              Ambiance
            </span>
            <div className="flex items-center gap-1.5">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  title={t.label}
                  onClick={() => setThemeId(t.id)}
                  className={`h-4 w-4 rounded-full transition ${t.dot} ${
                    themeId === t.id ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-zinc-950" : "opacity-60 hover:opacity-100"
                  }`}
                />
              ))}
            </div>
          </div>

          <Link
            href="/profil"
            className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.05]"
          >
            <Avatar name={name} url={profile?.avatar_url} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[#f4f1ea]">{name}</p>
              <p className="truncate text-xs text-zinc-500">Mon espace</p>
            </div>
          </Link>

          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-100"
          >
            <LogOut size={15} />
            Déconnexion
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4 md:hidden">
          <Link href="/decider" className="inline-flex items-center gap-2 font-serif text-2xl text-[#f4f1ea]">
            <span
              className="grid h-7 w-7 place-items-center rounded-lg text-zinc-950"
              style={{ backgroundColor: "var(--mc-accent)" }}
            >
              <Film size={15} />
            </span>
            MatchCut
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  title={t.label}
                  onClick={() => setThemeId(t.id)}
                  className={`h-3.5 w-3.5 rounded-full ${t.dot} ${
                    themeId === t.id ? "ring-2 ring-white" : "opacity-60"
                  }`}
                />
              ))}
            </div>
            <button type="button" onClick={logout} className="text-zinc-400" aria-label="Déconnexion">
              <LogOut size={18} />
            </button>
          </div>
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 pb-24 md:px-10 md:pb-12">{children}</main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-7 border-t border-white/[0.08] backdrop-blur-md md:hidden"
        style={{ backgroundColor: "color-mix(in srgb, var(--mc-bg) 90%, transparent)" }}
      >
        {LINKS.map((link) => {
          const active = pathname === link.href;
          const Icon = link.icon;
          const count = badgeCount(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium ${
                active ? "text-[#f4f1ea]" : "text-zinc-500"
              }`}
            >
              <span className="relative">
                <Icon size={17} style={active ? { color: "var(--mc-accent)" } : undefined} />
                {count > 0 ? (
                  <span className="absolute -right-2.5 -top-1.5 rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-tight text-white">
                    {count > 99 ? "99+" : count}
                  </span>
                ) : null}
              </span>
              <span className="truncate">{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}