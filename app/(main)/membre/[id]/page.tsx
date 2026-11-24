"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, MessageCircle, Sparkles } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { BadgeIcon } from "@/components/profile/profile-view";
import { TitleDetailModal } from "@/components/title-detail-modal";
import { Avatar, ErrorNote, Poster } from "@/components/ui";
import { BADGES, type Stats } from "@/lib/badges";
import { supabase } from "@/lib/supabase";
import type { Profile, Title, WatchItem } from "@/lib/types";

export default function MemberProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const memberId = params?.id;

  const [member, setMember] = useState<Profile | null>(null);
  const [memberItems, setMemberItems] = useState<WatchItem[]>([]);
  const [myItems, setMyItems] = useState<WatchItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState<"watched" | "to_watch">("watched");
  const [selectedTitle, setSelectedTitle] = useState<Title | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && memberId && user.id === memberId) {
      router.replace("/profil");
    }
  }, [user, memberId, router]);

  const loadData = useCallback(async () => {
    if (!memberId) return;
    setLoading(true);
    setError(null);

    const { data: prof, error: profErr } = await supabase.from("profiles").select("*").eq("id", memberId).maybeSingle();
    if (profErr || !prof) {
      setError(profErr?.message || "Membre introuvable.");
      setLoading(false);
      return;
    }
    setMember(prof as Profile);

    const [
      { data: fItems },
      { data: mItems },
      { count: friendsCount },
      { count: groupsCount },
      { count: sentCount },
      { count: swipesCount },
      { data: memberships },
    ] = await Promise.all([
      supabase.from("watch_items").select("*").eq("user_id", memberId).order("created_at", { ascending: false }),
      user
        ? supabase.from("watch_items").select("*").eq("user_id", user.id)
        : Promise.resolve({ data: [] as WatchItem[] }),
      supabase
        .from("friendships")
        .select("*", { count: "exact", head: true })
        .eq("status", "accepted")
        .or(`requester_id.eq.${memberId},addressee_id.eq.${memberId}`),
      supabase.from("group_members").select("*", { count: "exact", head: true }).eq("user_id", memberId),
      supabase.from("recommendations").select("*", { count: "exact", head: true }).eq("from_user_id", memberId),
      supabase.from("swipes").select("*", { count: "exact", head: true }).eq("user_id", memberId),
      supabase.from("group_members").select("group_id").eq("user_id", memberId),
    ]);

    const items = (fItems as WatchItem[]) ?? [];
    setMemberItems(items);
    setMyItems((mItems as WatchItem[]) ?? []);

    const groupIds = (memberships ?? []).map((r) => r.group_id as string);
    let matchesCount = 0;
    if (groupIds.length > 0) {
      const { count } = await supabase.from("matches").select("*", { count: "exact", head: true }).in("group_id", groupIds);
      matchesCount = count ?? 0;
    }

    const watchedList = items.filter((i) => i.status === "watched");
    const toWatchList = items.filter((i) => i.status === "to_watch");
    const ratedList = items.filter((i) => i.rating !== null && Number(i.rating) > 0);

    setStats({
      hasProfile: Boolean(prof.username || prof.full_name),
      swipes: swipesCount ?? 0,
      ratings: ratedList.length,
      toWatch: toWatchList.length,
      watched: watchedList.length,
      friends: friendsCount ?? 0,
      groups: groupsCount ?? 0,
      sent: sentCount ?? 0,
      matches: matchesCount,
    });

    setLoading(false);
  }, [memberId, user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const compatibility = useMemo(() => {
    if (!memberItems.length || !myItems.length) return null;
    const myMap = new Map<string, WatchItem>();
    myItems.forEach((item) => myMap.set(`${item.media_type}:${item.tmdb_id}`, item));

    let sharedCount = 0;
    let totalScore = 0;

    memberItems.forEach((fItem) => {
      const key = `${fItem.media_type}:${fItem.tmdb_id}`;
      const mine = myMap.get(key);
      if (!mine) return;
      sharedCount += 1;
      if (fItem.rating !== null && mine.rating !== null) {
        const diff = Math.abs(Number(fItem.rating) - Number(mine.rating));
        totalScore += Math.max(0, 1 - diff / 5);
      } else {
        totalScore += 0.8;
      }
    });

    if (sharedCount === 0) return null;
    const pct = Math.min(99, Math.max(35, Math.round((totalScore / sharedCount) * 100)));
    return { pct, sharedCount };
  }, [memberItems, myItems]);

  const gemsToDiscover = useMemo(() => {
    const myKeys = new Set(myItems.map((i) => `${i.media_type}:${i.tmdb_id}`));
    return memberItems
      .filter((i) => i.status === "watched" && Number(i.rating ?? 0) >= 4 && !myKeys.has(`${i.media_type}:${i.tmdb_id}`))
      .slice(0, 5);
  }, [memberItems, myItems]);

  function openWatchItem(item: WatchItem) {
    setSelectedTitle({
      tmdbId: item.tmdb_id,
      mediaType: item.media_type,
      title: item.title,
      overview: "",
      posterPath: item.poster_path,
      year: item.year ?? "",
      genreIds: [],
      language: "",
      anime: false,
      popularity: 0,
    });
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Chargement du profil...</p>;
  }

  if (error || !member) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-zinc-400 hover:text-white"
        >
          <ArrowLeft size={14} />
          Retour
        </button>
        <ErrorNote message={error || "Profil introuvable."} />
      </div>
    );
  }

  const displayName = member.username || member.full_name || "Membre";
  const since = member.created_at
    ? new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(member.created_at))
    : null;
  const unlockedBadges = stats ? BADGES.filter((b) => b.value(stats) >= b.goal) : [];
  const visibleItems = memberItems.filter((i) => i.status === tab);

  return (
    <div className="max-w-5xl space-y-10">
      <div>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-zinc-400 hover:text-white"
        >
          <ArrowLeft size={14} />
          Retour
        </button>
      </div>

      {/* En-tête identité + message direct */}
      <header className="flex flex-col gap-6 border-b border-white/10 pb-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-5">
          <Avatar name={displayName} url={member.avatar_url} size={88} />
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Membre MatchCut</p>
            <h1 className="mt-1 font-serif text-4xl text-[#f4f1ea]">{displayName}</h1>
            {member.full_name && member.username ? (
              <p className="mt-0.5 text-sm text-zinc-400">{member.full_name}</p>
            ) : null}
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-300">
              {member.bio || "Aucune bio renseignée."}
            </p>
            {since ? <p className="mt-2 text-xs uppercase tracking-[0.16em] text-zinc-500">Membre depuis {since}</p> : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => router.push(`/groupes?dm=${member.id}`)}
          className="inline-flex shrink-0 items-center justify-center gap-2 bg-[#f4f1ea] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[#09090b] hover:opacity-90"
        >
          <MessageCircle size={15} />
          Envoyer un message
        </button>
      </header>

      {/* Compatibilité ciné & statistiques */}
      <section className="flex flex-wrap items-center justify-between gap-4 border border-emerald-500/30 bg-emerald-950/15 px-5 py-4">
        <div className="flex items-center gap-3">
          <Sparkles size={20} className="text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-emerald-300">
              {compatibility ? `${compatibility.pct} % compatibles ciné` : "Compatibilité en cours de calcul"}
            </p>
            <p className="text-xs text-zinc-400">
              {compatibility
                ? `Basé sur ${compatibility.sharedCount} titre${compatibility.sharedCount > 1 ? "s" : ""} en commun`
                : "Notez quelques films en commun pour révéler votre affinité"}
            </p>
          </div>
        </div>
        {stats ? (
          <div className="flex gap-6 text-center">
            <div>
              <p className="font-serif text-2xl text-[#f4f1ea]">{stats.watched}</p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Vus</p>
            </div>
            <div>
              <p className="font-serif text-2xl text-[#f4f1ea]">{stats.toWatch}</p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">À voir</p>
            </div>
            <div>
              <p className="font-serif text-2xl text-[#f4f1ea]">{stats.ratings}</p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Notés</p>
            </div>
            <div>
              <p className="font-serif text-2xl text-[#f4f1ea]">{stats.friends}</p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Amis</p>
            </div>
          </div>
        ) : null}
      </section>

      {/* Trophées et badges débloqués */}
      <section>
        <h2 className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">
          Trophées débloqués ({unlockedBadges.length}/{BADGES.length})
        </h2>
        {unlockedBadges.length > 0 ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {unlockedBadges.map((badge) => (
              <article key={badge.id} className={`border px-4 py-3 ${badge.accent}`}>
                <div className="flex items-center gap-2.5">
                  <BadgeIcon icon={badge.icon} />
                  <h3 className="font-serif text-xl text-[#f4f1ea]">{badge.name}</h3>
                </div>
                <p className="mt-1 text-xs text-zinc-300">{badge.detail}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">Aucun trophée débloqué pour le moment.</p>
        )}
      </section>

      {/* Pépites à découvrir */}
      {gemsToDiscover.length > 0 ? (
        <section>
          <h2 className="text-[11px] uppercase tracking-[0.22em] text-emerald-400">
            Pépites qu&apos;il/elle a adorées (que tu n&apos;as pas vues)
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
            {gemsToDiscover.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openWatchItem(item)}
                className="group space-y-1.5 text-left"
              >
                <div className="relative aspect-[2/3] overflow-hidden border border-white/10 bg-zinc-950 transition group-hover:border-white/40">
                  <Poster path={item.poster_path} alt={item.title} className="h-full w-full transition duration-300 group-hover:scale-105" />
                  <span className="absolute right-1.5 top-1.5 bg-black/80 px-1.5 py-0.5 text-[11px] font-medium text-emerald-400">
                    {item.rating} ★
                  </span>
                </div>
                <p className="truncate font-serif text-lg text-[#f4f1ea] group-hover:underline">{item.title}</p>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Collection Vus / À voir cliquable */}
      <section>
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <button
            type="button"
            onClick={() => setTab("watched")}
            className={`px-3.5 py-1.5 text-xs ${
              tab === "watched" ? "bg-[#f4f1ea] font-semibold text-[#09090b]" : "border border-white/15 text-zinc-300"
            }`}
          >
            Films &amp; séries vus ({memberItems.filter((i) => i.status === "watched").length})
          </button>
          <button
            type="button"
            onClick={() => setTab("to_watch")}
            className={`px-3.5 py-1.5 text-xs ${
              tab === "to_watch" ? "bg-[#f4f1ea] font-semibold text-[#09090b]" : "border border-white/15 text-zinc-300"
            }`}
          >
            À voir ({memberItems.filter((i) => i.status === "to_watch").length})
          </button>
        </div>

        {visibleItems.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-500">Aucun titre dans cette catégorie.</p>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
            {visibleItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openWatchItem(item)}
                className="group space-y-1.5 text-left"
              >
                <div className="relative aspect-[2/3] overflow-hidden border border-white/10 bg-zinc-950 transition group-hover:border-white/40">
                  <Poster path={item.poster_path} alt={item.title} className="h-full w-full transition duration-300 group-hover:scale-105" />
                  {item.rating !== null && Number(item.rating) > 0 ? (
                    <span className="absolute right-1.5 top-1.5 bg-black/80 px-1.5 py-0.5 text-[11px] font-medium text-emerald-400">
                      {item.rating} ★
                    </span>
                  ) : null}
                </div>
                <p className="truncate font-serif text-lg text-[#f4f1ea] group-hover:underline">{item.title}</p>
                {item.year ? <p className="text-xs text-zinc-500">{item.year}</p> : null}
              </button>
            ))}
          </div>
        )}
      </section>

      <TitleDetailModal title={selectedTitle} onClose={() => setSelectedTitle(null)} />
    </div>
  );
}