"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Sparkles } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Avatar, Poster } from "@/components/ui";
import { BADGES, type Stats } from "@/lib/badges";
import { supabase } from "@/lib/supabase";
import type { Profile, WatchItem } from "@/lib/types";

export function FriendProfileModal({
  friend,
  onClose,
  onMessageFriend,
}: {
  friend: Profile | null;
  onClose: () => void;
  onMessageFriend?: (friendId: string) => void;
}) {
  const { user } = useAuth();
  const [friendItems, setFriendItems] = useState<WatchItem[]>([]);
  const [myItems, setMyItems] = useState<WatchItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState<"watched" | "to_watch">("watched");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!friend) return;
    setTab("watched");
    void loadFriendData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friend]);

  async function loadFriendData() {
    if (!friend) return;
    setLoading(true);

    const [
      { data: fItems },
      { data: mItems },
      { count: friendsCount },
      { count: groupsCount },
      { count: sentCount },
      { count: swipesCount },
    ] = await Promise.all([
      supabase.from("watch_items").select("*").eq("user_id", friend.id).order("created_at", { ascending: false }),
      user
        ? supabase.from("watch_items").select("*").eq("user_id", user.id)
        : Promise.resolve({ data: [] as WatchItem[] }),
      supabase
        .from("friendships")
        .select("*", { count: "exact", head: true })
        .eq("status", "accepted")
        .or(`requester_id.eq.${friend.id},addressee_id.eq.${friend.id}`),
      supabase.from("group_members").select("*", { count: "exact", head: true }).eq("user_id", friend.id),
      supabase.from("recommendations").select("*", { count: "exact", head: true }).eq("from_user_id", friend.id),
      supabase.from("swipes").select("*", { count: "exact", head: true }).eq("user_id", friend.id),
    ]);

    const items = (fItems as WatchItem[]) ?? [];
    setFriendItems(items);
    setMyItems((mItems as WatchItem[]) ?? []);

    const watchedList = items.filter((i) => i.status === "watched");
    const toWatchList = items.filter((i) => i.status === "to_watch");
    const ratedList = items.filter((i) => i.rating !== null && Number(i.rating) > 0);

    setStats({
      hasProfile: Boolean(friend.username || friend.full_name),
      swipes: swipesCount ?? 0,
      ratings: ratedList.length,
      toWatch: toWatchList.length,
      watched: watchedList.length,
      friends: friendsCount ?? 0,
      groups: groupsCount ?? 0,
      sent: sentCount ?? 0,
      matches: 0,
    });

    setLoading(false);
  }

  const compatibility = useMemo(() => {
    if (!friendItems.length || !myItems.length) return null;
    const myMap = new Map<string, WatchItem>();
    myItems.forEach((item) => myMap.set(`${item.media_type}:${item.tmdb_id}`, item));

    let sharedCount = 0;
    let totalScore = 0;

    friendItems.forEach((fItem) => {
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
  }, [friendItems, myItems]);

  const gemsToDiscover = useMemo(() => {
    const myKeys = new Set(myItems.map((i) => `${i.media_type}:${i.tmdb_id}`));
    return friendItems
      .filter((i) => i.status === "watched" && Number(i.rating ?? 0) >= 4 && !myKeys.has(`${i.media_type}:${i.tmdb_id}`))
      .slice(0, 4);
  }, [friendItems, myItems]);

  if (!friend) return null;

  const displayName = friend.username || friend.full_name || "Membre";
  const unlockedBadges = stats ? BADGES.filter((b) => b.value(stats) >= b.goal) : [];
  const visibleItems = friendItems.filter((i) => i.status === tab);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden border border-white/15 bg-[#0c0c0f] text-[#f4f1ea] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <span className="text-xs uppercase tracking-[0.2em] text-zinc-400">Profil membre</span>
          <button
            type="button"
            onClick={onClose}
            className="border border-white/15 px-2.5 py-1 text-xs text-zinc-400 hover:border-white/40 hover:text-white"
          >
            Fermer ✕
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto p-5 sm:p-6">
          {/* En-tête identité + compatibilité */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar name={displayName} url={friend.avatar_url} size={64} />
              <div>
                <h2 className="font-serif text-2xl text-[#f4f1ea]">{displayName}</h2>
                {friend.full_name && friend.username ? (
                  <p className="text-xs text-zinc-400">{friend.full_name}</p>
                ) : null}
                <p className="mt-1 text-sm text-zinc-300">{friend.bio || "Aucune bio renseignée."}</p>
              </div>
            </div>

            {onMessageFriend ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onMessageFriend(friend.id);
                }}
                className="inline-flex shrink-0 items-center justify-center gap-2 bg-[#f4f1ea] px-4 py-2 text-xs font-semibold text-[#09090b] hover:opacity-90"
              >
                <MessageCircle size={14} />
                Message direct
              </button>
            ) : null}
          </div>

          {/* Score de compatibilité ciné */}
          <div className="flex flex-wrap items-center justify-between gap-3 border border-emerald-500/30 bg-emerald-950/15 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Sparkles size={16} className="text-emerald-400" />
              <div>
                <p className="text-xs font-semibold text-emerald-300">
                  {compatibility
                    ? `${compatibility.pct} % compatibles ciné`
                    : "Compatibilité en cours de calcul"}
                </p>
                <p className="text-[11px] text-zinc-400">
                  {compatibility
                    ? `Basé sur ${compatibility.sharedCount} titre${compatibility.sharedCount > 1 ? "s" : ""} en commun`
                    : "Notez quelques films en commun pour révéler votre affinité"}
                </p>
              </div>
            </div>
            {stats ? (
              <div className="flex gap-4 text-center text-xs">
                <div>
                  <p className="font-semibold text-white">{stats.watched}</p>
                  <p className="text-[10px] uppercase text-zinc-500">Vus</p>
                </div>
                <div>
                  <p className="font-semibold text-white">{stats.toWatch}</p>
                  <p className="text-[10px] uppercase text-zinc-500">À voir</p>
                </div>
                <div>
                  <p className="font-semibold text-white">{stats.ratings}</p>
                  <p className="text-[10px] uppercase text-zinc-500">Notés</p>
                </div>
              </div>
            ) : null}
          </div>

          {/* Badges débloqués */}
          <div>
            <h3 className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
              Badges débloqués ({unlockedBadges.length}/{BADGES.length})
            </h3>
            {unlockedBadges.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {unlockedBadges.map((b) => (
                  <span
                    key={b.id}
                    className="border border-white/15 bg-white/[0.04] px-2.5 py-1 text-xs text-[#f4f1ea]"
                    title={b.detail}
                  >
                    {b.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">Aucun badge débloqué pour le moment.</p>
            )}
          </div>

          {/* Pépites recommandées automatiquement */}
          {gemsToDiscover.length > 0 ? (
            <div>
              <h3 className="text-[11px] uppercase tracking-[0.2em] text-emerald-400">
                Pépites qu&apos;il/elle a adorées (que tu n&apos;as pas vues)
              </h3>
              <div className="mt-2.5 grid grid-cols-4 gap-2.5">
                {gemsToDiscover.map((item) => (
                  <div key={item.id} className="space-y-1">
                    <div className="relative aspect-[2/3] overflow-hidden border border-white/10 bg-zinc-950">
                      <Poster path={item.poster_path} alt={item.title} className="h-full w-full" />
                      <span className="absolute right-1 top-1 bg-black/80 px-1 py-0.5 text-[10px] text-emerald-400">
                        {item.rating} ★
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-zinc-300">{item.title}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Listes de l'ami (Vus / À voir) */}
          <div>
            <div className="flex items-center gap-2 border-b border-white/10 pb-2.5">
              <button
                type="button"
                onClick={() => setTab("watched")}
                className={`px-3 py-1 text-xs ${
                  tab === "watched" ? "bg-[#f4f1ea] font-semibold text-[#09090b]" : "text-zinc-400 hover:text-white"
                }`}
              >
                Films &amp; séries vus ({friendItems.filter((i) => i.status === "watched").length})
              </button>
              <button
                type="button"
                onClick={() => setTab("to_watch")}
                className={`px-3 py-1 text-xs ${
                  tab === "to_watch" ? "bg-[#f4f1ea] font-semibold text-[#09090b]" : "text-zinc-400 hover:text-white"
                }`}
              >
                À voir ({friendItems.filter((i) => i.status === "to_watch").length})
              </button>
            </div>

            {loading ? (
              <p className="mt-4 text-xs text-zinc-500">Chargement de sa collection...</p>
            ) : visibleItems.length === 0 ? (
              <p className="mt-4 text-xs text-zinc-500">Aucun titre dans cette catégorie.</p>
            ) : (
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {visibleItems.map((item) => (
                  <div key={item.id} className="space-y-1">
                    <div className="relative aspect-[2/3] overflow-hidden border border-white/10 bg-zinc-950">
                      <Poster path={item.poster_path} alt={item.title} className="h-full w-full" />
                      {item.rating !== null && Number(item.rating) > 0 ? (
                        <span className="absolute right-1 top-1 bg-black/80 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                          {item.rating} ★
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-zinc-200">{item.title}</p>
                    {item.year ? <p className="text-[10px] text-zinc-500">{item.year}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}