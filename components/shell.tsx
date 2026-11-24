"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  BarChart3,
  Bookmark,
  CalendarClock,
  CircleUser,
  Clapperboard,
  Eye,
  Gamepad2,
  Library,
  LogOut,
  Menu,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Avatar } from "@/components/ui";
import { supabase } from "@/lib/supabase";

const LINKS = [
  { num: "I", href: "/decider", label: "À la Une", note: "Sélection & séance", icon: Clapperboard },
  { num: "II", href: "/catalogue", label: "Cinémathèque", note: "Films, séries & animés", icon: Library },
  { num: "III", href: "/listes", label: "Collections", note: "À voir, vus & recos", icon: Bookmark },
  { num: "IV", href: "/groupes", label: "Cercles", note: "Proches & échanges", icon: Users },
  { num: "V", href: "/sessions", label: "Séances", note: "Soirées & votes", icon: CalendarClock },
  { num: "VI", href: "/statistiques", label: "Carnet", note: "Repères & chiffres", icon: BarChart3 },
  { num: "VII", href: "/profil", label: "Profil", note: "Fiche personnelle", icon: CircleUser },
  { num: "VIII", href: "/jeu", label: "Jeu", note: "Imposteur & mini-jeux", icon: Gamepad2 },
];

const MOODS = [
  { id: "editorial", label: "Ambre", bg: "#101112", accent: "#C49A58", swatch: "bg-[#C49A58]" },
  { id: "sauge", label: "Sauge", bg: "#101112", accent: "#A3B99B", swatch: "bg-[#A3B99B]" },
  { id: "os", label: "Blanc cassé", bg: "#101112", accent: "#EAE6DE", swatch: "bg-[#EAE6DE]" },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const name = profile?.full_name || profile?.username || "Membre";
  const [socialBadge, setSocialBadge] = useState(0);
  const [listsBadge, setListsBadge] = useState(0);
  const [moodId, setMoodId] = useState<string>("editorial");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("mc-mood");
    if (saved && MOODS.some((m) => m.id === saved)) {
      setMoodId(saved);
    }
  }, []);

  useEffect(() => {
    const current = MOODS.find((m) => m.id === moodId) ?? MOODS[0];
    document.documentElement.style.setProperty("--mc-bg", current.bg);
    document.documentElement.style.setProperty("--mc-accent", current.accent);
    window.localStorage.setItem("mc-mood", current.id);
  }, [moodId]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

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
    setDrawerOpen(false);
    await signOut();
    router.replace("/login");
  }

  function badgeCount(href: string) {
    if (href === "/groupes") return socialBadge;
    if (href === "/listes") return listsBadge;
    return 0;
  }

  const totalAlerts = socialBadge + listsBadge;
  const currentSection = LINKS.find((l) => l.href === pathname);

  return (
    <div
      className="flex min-h-screen flex-1 flex-col bg-[#101112] text-[#EAE6DE]"
      style={{ backgroundColor: "var(--mc-bg)" }}
    >
      <header className="sticky top-0 z-40 border-b border-[#EAE6DE]/10 bg-[#101112]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6 md:px-12">
          <div className="flex items-baseline gap-5">
            <Link
              href="/decider"
              className="font-serif text-2xl italic tracking-tight text-[#EAE6DE] transition hover:text-[#C49A58] sm:text-3xl"
            >
              MatchCut
            </Link>
            {currentSection ? (
              <span className="mc-kicker hidden border-l border-[#EAE6DE]/15 pl-5 text-[#EAE6DE]/50 sm:inline">
                {currentSection.num} — {currentSection.label}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-5">
            <Link
              href="/listes"
              className="mc-kicker hidden items-center gap-2 text-[#EAE6DE]/70 transition hover:text-[#EAE6DE] md:inline-flex"
            >
              <span>Collections</span>
              {listsBadge > 0 ? (
                <span className="h-1.5 w-1.5 rounded-full bg-[#C49A58]" />
              ) : null}
            </Link>

            <button
              type="button"
              onClick={() => setDrawerOpen((prev) => !prev)}
              aria-expanded={drawerOpen}
              aria-label={drawerOpen ? "Fermer le sommaire" : "Ouvrir le sommaire"}
              className="inline-flex items-center gap-3 py-1.5 text-[#EAE6DE] transition hover:text-[#C49A58]"
            >
              <span className="mc-kicker text-[#EAE6DE]/75">
                {drawerOpen ? "Fermer" : "Sommaire"}
              </span>
              {drawerOpen ? <X size={17} /> : <Menu size={17} />}
              {!drawerOpen && totalAlerts > 0 ? (
                <span className="rounded-full bg-[#C49A58] px-1.5 py-0.5 text-[10px] font-bold leading-none text-[#101112]">
                  {totalAlerts > 99 ? "99+" : totalAlerts}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </header>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-between overflow-y-auto bg-[#101112]/98 px-6 py-7 backdrop-blur-xl md:px-14 md:py-10">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between border-b border-[#EAE6DE]/12 pb-6">
            <div>
              <p className="font-serif text-3xl italic text-[#EAE6DE]">MatchCut</p>
              <p className="mc-kicker mt-1 text-[#EAE6DE]/45">Revue &amp; Cinémathèque</p>
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="inline-flex items-center gap-2.5 border-b border-[#EAE6DE]/30 pb-1 text-[#EAE6DE] transition hover:border-[#C49A58] hover:text-[#C49A58]"
            >
              <span className="mc-kicker text-[#EAE6DE]">Fermer</span>
              <X size={16} />
            </button>
          </div>

          <nav className="mx-auto my-auto grid w-full max-w-6xl grid-cols-1 gap-x-14 py-8 md:grid-cols-2">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              const Icon = link.icon;
              const count = badgeCount(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setDrawerOpen(false)}
                  className={`group flex items-baseline justify-between border-b py-5 transition ${
                    active
                      ? "border-[#C49A58] text-[#EAE6DE]"
                      : "border-[#EAE6DE]/10 text-[#EAE6DE]/65 hover:border-[#EAE6DE]/30 hover:text-[#EAE6DE]"
                  }`}
                >
                  <div className="flex items-baseline gap-5">
                    <span
                      className="font-serif text-lg italic"
                      style={{ color: active ? "var(--mc-accent)" : undefined }}
                    >
                      {link.num}.
                    </span>
                    <div>
                      <span className="font-serif text-4xl tracking-tight sm:text-5xl">
                        {link.label}
                      </span>
                      <span className="mc-kicker ml-4 hidden text-[#EAE6DE]/40 sm:inline">
                        {link.note}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {count > 0 ? (
                      <span className="rounded-full bg-[#C49A58] px-2 py-0.5 text-[10px] font-bold text-[#101112]">
                        {count > 99 ? "99+" : count}
                      </span>
                    ) : null}
                    <Icon
                      size={16}
                      className="opacity-55 transition group-hover:opacity-100"
                      style={active ? { color: "var(--mc-accent)" } : undefined}
                    />
                    <ArrowUpRight
                      size={16}
                      className="text-[#EAE6DE]/35 transition duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#EAE6DE]"
                    />
                  </div>
                </Link>
              );
            })}
          </nav>

          <div className="mx-auto flex w-full max-w-6xl flex-col justify-between gap-6 border-t border-[#EAE6DE]/12 pt-6 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-6">
              <Link
                href="/listes"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex items-center gap-2 text-xs text-[#EAE6DE]/80 transition hover:text-[#A3B99B]"
              >
                <Bookmark size={14} className="text-[#A3B99B]" />
                <span className="mc-kicker text-[#EAE6DE]/80">À voir</span>
              </Link>
              <Link
                href="/listes"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex items-center gap-2 text-xs text-[#EAE6DE]/80 transition hover:text-[#C49A58]"
              >
                <Eye size={14} className="text-[#C49A58]" />
                <span className="mc-kicker text-[#EAE6DE]/80">Déjà vus</span>
              </Link>

              <div className="flex items-center gap-2.5">
                <span className="mc-kicker text-[#EAE6DE]/45">Accent</span>
                {MOODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    title={m.label}
                    onClick={() => setMoodId(m.id)}
                    className={`h-3.5 w-3.5 rounded-full transition ${m.swatch} ${
                      moodId === m.id
                        ? "scale-125 ring-2 ring-[#EAE6DE] ring-offset-2 ring-offset-[#101112]"
                        : "opacity-55 hover:opacity-100"
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-5">
              <Link
                href="/profil"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 transition hover:opacity-85"
              >
                <Avatar name={name} url={profile?.avatar_url} size={30} />
                <div>
                  <p className="text-sm font-medium text-[#EAE6DE]">{name}</p>
                  <p className="mc-kicker text-[10px] text-[#EAE6DE]/45">Membre</p>
                </div>
              </Link>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-1.5 text-xs text-[#EAE6DE]/55 transition hover:text-[#EAE6DE]"
              >
                <LogOut size={14} />
                <span className="mc-kicker text-[#EAE6DE]/55">Quitter</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 md:px-12 md:py-20">
        {children}
      </main>
    </div>
  );
}