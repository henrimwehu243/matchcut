"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Inbox, Loader2, Plus, RotateCcw, Swords, Trash2, Trophy } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { TitleDetailModal } from "@/components/title-detail-modal";
import { ErrorNote, Modal, Poster, Stars, buttonClass, ghostClass } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import type { Profile, Recommendation, Title, WatchItem } from "@/lib/types";

type Tab = "received" | "to_watch" | "watched";

type SoloDuelEntry = {
  key: string;
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  year: string;
  source: "to_watch" | "received";
  sourceLabel: string;
  watchItem?: WatchItem;
};

export function ListsView() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("received");
  const [items, setItems] = useState<WatchItem[]>([]);
  const [received, setReceived] = useState<Recommendation[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [selectedTitle, setSelectedTitle] = useState<Title | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [duelOpen, setDuelOpen] = useState(false);
  const [includeReceivedInDuel, setIncludeReceivedInDuel] = useState(false);
  const [duelPool, setDuelPool] = useState<SoloDuelEntry[]>([]);
  const [championIdx, setChampionIdx] = useState(0);
  const [challengerIdx, setChallengerIdx] = useState(1);
  const [duelWinner, setDuelWinner] = useState<SoloDuelEntry | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const [watchResult, memberships] = await Promise.all([
      supabase.from("watch_items").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("group_members").select("group_id").eq("user_id", user.id),
    ]);

    if (watchResult.error) {
      setError(watchResult.error.message);
    } else {
      setItems((watchResult.data as WatchItem[]) ?? []);
    }

    const groupIds = (memberships.data ?? []).map((row) => row.group_id as string);
    let recommendationQuery = supabase.from("recommendations").select("*").order("created_at", { ascending: false });
    recommendationQuery = groupIds.length
      ? recommendationQuery.or(`to_user_id.eq.${user.id},to_group_id.in.(${groupIds.join(",")})`)
      : recommendationQuery.eq("to_user_id", user.id);

    const recommendationResult = await recommendationQuery;
    if (recommendationResult.error) {
      setError(recommendationResult.error.message);
    }

    const incoming = ((recommendationResult.data as Recommendation[]) ?? []).filter((row) => row.from_user_id !== user.id);
    setReceived(incoming);

    const senderIds = [...new Set(incoming.map((row) => row.from_user_id))];
    if (senderIds.length) {
      const { data } = await supabase.from("profiles").select("*").in("id", senderIds);
      const map: Record<string, Profile> = {};
      ((data as Profile[]) ?? []).forEach((profile) => {
        map[profile.id] = profile;
      });
      setPeople(map);
    } else {
      setPeople({});
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const savedKeys = useMemo(() => {
    return new Set(items.map((row) => `${row.media_type}:${row.tmdb_id}`));
  }, [items]);

  const buildDuelEntries = useCallback(
    (withReceived: boolean): SoloDuelEntry[] => {
      const toWatchEntries: SoloDuelEntry[] = items
        .filter((row) => row.status === "to_watch")
        .map((row) => ({
          key: `${row.media_type}:${row.tmdb_id}`,
          tmdbId: row.tmdb_id,
          mediaType: row.media_type,
          title: row.title,
          posterPath: row.poster_path,
          year: row.year ?? "",
          source: "to_watch",
          sourceLabel: "Dans À voir",
          watchItem: row,
        }));

      const seen = new Set(toWatchEntries.map((e) => e.key));
      const extra: SoloDuelEntry[] = [];

      if (withReceived) {
        for (const rec of received) {
          const key = `${rec.media_type}:${rec.tmdb_id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const sender = people[rec.from_user_id];
          extra.push({
            key,
            tmdbId: rec.tmdb_id,
            mediaType: rec.media_type,
            title: rec.title,
            posterPath: rec.poster_path,
            year: rec.year ?? "",
            source: "received",
            sourceLabel: `Reçu · ${sender?.username || sender?.full_name || "Ami"}`,
          });
        }
      }

      return [...toWatchEntries, ...extra]
        .sort(() => Math.random() - 0.5)
        .slice(0, 8);
    },
    [items, received, people],
  );

  function launchSoloDuel(withReceived = includeReceivedInDuel) {
    const pool = buildDuelEntries(withReceived);
    setDuelPool(pool);
    setChampionIdx(0);
    setChallengerIdx(1);
    setDuelWinner(pool.length === 1 ? pool[0] : null);
    setDuelOpen(true);
  }

  function chooseDuelSide(side: "champion" | "challenger") {
    const winnerIndex = side === "champion" ? championIdx : challengerIdx;
    const nextIdx = challengerIdx + 1;
    if (nextIdx >= duelPool.length) {
      setDuelWinner(duelPool[winnerIndex] ?? null);
    } else {
      setChampionIdx(winnerIndex);
      setChallengerIdx(nextIdx);
    }
  }

  async function finalizeWinnerInToWatch(winner: SoloDuelEntry, markAsWatched = false) {
    if (!user) return;
    const existingWatch = items.find(
      (row) => row.media_type === winner.mediaType && row.tmdb_id === winner.tmdbId,
    );

    if (existingWatch) {
      if (markAsWatched && existingWatch.status !== "watched") {
        await supabase
          .from("watch_items")
          .update({ status: "watched", updated_at: new Date().toISOString() })
          .eq("id", existingWatch.id);
        setItems((prev) =>
          prev.map((row) => (row.id === existingWatch.id ? { ...row, status: "watched" } : row)),
        );
      }
      setDuelOpen(false);
      setNotice(
        markAsWatched
          ? `« ${winner.title} » versé aux titres vus.`
          : `Choix de la soirée : « ${winner.title} » est prêt dans À voir.`,
      );
      return;
    }

    const { error: writeError } = await supabase.from("watch_items").upsert(
      {
        user_id: user.id,
        tmdb_id: winner.tmdbId,
        media_type: winner.mediaType,
        title: winner.title,
        poster_path: winner.posterPath,
        year: winner.year || null,
        status: markAsWatched ? "watched" : "to_watch",
      },
      { onConflict: "user_id,tmdb_id,media_type", ignoreDuplicates: true },
    );

    if (writeError) {
      setError(writeError.message);
      return;
    }

    await load();
    setDuelOpen(false);
    setNotice(
      markAsWatched
        ? `« ${winner.title} » versé aux titres vus.`
        : `« ${winner.title} » ajouté à À voir pour ce soir.`,
    );
  }

  async function setStatus(item: WatchItem, status: WatchItem["status"]) {
    const key = `status:${item.id}`;
    if (busyKey) return;
    setBusyKey(key);
    setError(null);

    try {
      const { error: writeError } = await supabase
        .from("watch_items")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", item.id);
      if (writeError) {
        setError(writeError.message);
        return;
      }
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, status } : row)));
    } finally {
      setBusyKey(null);
    }
  }

  async function setRating(item: WatchItem, rating: number) {
    const key = `rating:${item.id}`;
    if (busyKey) return;
    setBusyKey(key);
    setError(null);

    try {
      const { error: writeError } = await supabase
        .from("watch_items")
        .update({ rating, status: "watched", updated_at: new Date().toISOString() })
        .eq("id", item.id);
      if (writeError) {
        setError(writeError.message);
        return;
      }
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, rating, status: "watched" } : row)));
    } finally {
      setBusyKey(null);
    }
  }

  async function removeItem(item: WatchItem) {
    const key = `remove:${item.id}`;
    if (busyKey) return;
    setBusyKey(key);
    setError(null);

    try {
      const { error: delError } = await supabase.from("watch_items").delete().eq("id", item.id);
      if (delError) {
        setError(delError.message);
        return;
      }
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      setNotice(`« ${item.title} » retiré de la collection.`);
    } finally {
      setBusyKey(null);
    }
  }

  async function keep(recommendation: Recommendation) {
    if (!user || busyKey) return;
    const key = `keep:${recommendation.id}`;
    setBusyKey(key);
    setError(null);

    try {
      const { error: writeError } = await supabase.from("watch_items").upsert(
        {
          user_id: user.id,
          tmdb_id: recommendation.tmdb_id,
          media_type: recommendation.media_type,
          title: recommendation.title,
          poster_path: recommendation.poster_path,
          year: recommendation.year,
          status: "to_watch",
        },
        { onConflict: "user_id,tmdb_id,media_type", ignoreDuplicates: true },
      );
      if (writeError) {
        setError(writeError.message);
        return;
      }
      setNotice(`« ${recommendation.title} » ajouté à À voir.`);
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  function openTitle(row: {
    tmdb_id: number;
    media_type: "movie" | "tv";
    title: string;
    poster_path: string | null;
    year: string | null;
  }) {
    setSelectedTitle({
      tmdbId: row.tmdb_id,
      mediaType: row.media_type,
      title: row.title,
      overview: "",
      posterPath: row.poster_path,
      year: row.year ?? "",
      genreIds: [],
      language: "",
      anime: false,
      popularity: 0,
    });
  }

  const visible = items.filter((item) => item.status === (tab === "watched" ? "watched" : "to_watch"));
  const toWatchCount = items.filter((i) => i.status === "to_watch").length;
  const watchedCount = items.filter((i) => i.status === "watched").length;
  const canLaunchSoloDuel = toWatchCount >= 2 || (includeReceivedInDuel && toWatchCount + received.length >= 2);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "received", label: "Reçues", count: received.length },
    { id: "to_watch", label: "À voir", count: toWatchCount },
    { id: "watched", label: "Déjà vus", count: watchedCount },
  ];

  return (
    <div className="space-y-14">
      <div className="border-b border-[#EAE6DE]/12 pb-10">
        <p className="mc-kicker">III — Collections</p>
        <div className="mt-3 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <h1 className="font-serif text-5xl leading-[0.98] tracking-tight text-[#EAE6DE] sm:text-6xl">
            Vos <span className="italic text-[#C49A58]">cahiers</span>
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-[#EAE6DE]/65">
            Conseils reçus de vos proches, œuvres gardées de côté et mémoire de vos visionnages.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-6 border-t border-[#EAE6DE]/10 pt-6">
          <div className="flex flex-wrap items-center gap-6">
            {tabs.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`inline-flex items-baseline gap-2 pb-1.5 transition ${
                    active
                      ? "border-b border-[#C49A58] text-[#EAE6DE]"
                      : "text-[#EAE6DE]/45 hover:text-[#EAE6DE]/85"
                  }`}
                >
                  <span className="mc-kicker text-[11px]">{item.label}</span>
                  <span className="font-serif text-lg italic text-[#C49A58]">{item.count}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-5">
            {tab === "to_watch" && toWatchCount >= 2 ? (
              <button
                type="button"
                onClick={() => launchSoloDuel(false)}
                className="mc-kicker inline-flex items-center gap-2 text-[#A3B99B] transition hover:text-[#EAE6DE]"
              >
                <Swords size={13} />
                <span>Trancher À voir</span>
              </button>
            ) : null}

            {toWatchCount >= 2 || received.length >= 2 ? (
              <button
                type="button"
                onClick={() => launchSoloDuel(includeReceivedInDuel)}
                className="inline-flex items-center gap-2 border-b border-[#C49A58]/60 pb-1 text-xs text-[#EAE6DE] transition hover:border-[#C49A58] hover:text-[#C49A58]"
              >
                <Swords size={13} className="text-[#C49A58]" />
                <span className="mc-kicker text-[#EAE6DE]">Duel de soirée</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <ErrorNote message={error} />
        {notice ? <p className="text-xs text-[#A3B99B]">{notice}</p> : null}
      </div>

      {loading ? (
        <div className="flex items-center gap-2.5 py-6 text-xs text-[#EAE6DE]/55">
          <Loader2 size={15} className="animate-spin text-[#C49A58]" />
          <span className="mc-kicker">Ouverture des cahiers…</span>
        </div>
      ) : null}

      {tab === "received" ? (
        <div className="grid grid-cols-1 gap-x-10 gap-y-10 md:grid-cols-2">
          {received.map((item) => {
            const sender = people[item.from_user_id];
            const alreadySaved = savedKeys.has(`${item.media_type}:${item.tmdb_id}`);
            const isKeeping = busyKey === `keep:${item.id}`;

            return (
              <article
                key={item.id}
                className="frame-zoom-in group flex gap-5 border-b border-[#EAE6DE]/12 pb-7"
              >
                <button
                  type="button"
                  onClick={() => openTitle(item)}
                  className="aspect-[2/3] w-24 shrink-0 overflow-hidden bg-[#202224]"
                >
                  <Poster
                    path={item.poster_path}
                    alt={item.title}
                    className="h-full w-full transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                </button>

                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <div>
                    <p className="mc-kicker text-[9px] text-[#EAE6DE]/50">
                      {item.media_type === "movie" ? "Film" : "Série"}
                      {item.year ? ` · ${item.year}` : ""} ·{" "}
                      <Link
                        href={`/membre/${item.from_user_id}`}
                        className="text-[#C49A58] hover:underline"
                      >
                        {sender?.username || sender?.full_name || "Un proche"}
                      </Link>
                    </p>
                    <button
                      type="button"
                      onClick={() => openTitle(item)}
                      className="mt-1 block text-left font-serif text-2xl leading-snug text-[#EAE6DE] transition hover:text-[#C49A58]"
                    >
                      {item.title}
                    </button>
                    {item.note ? (
                      <p className="mt-3 border-l border-[#A3B99B]/60 pl-3.5 font-serif text-base italic leading-relaxed text-[#EAE6DE]/75">
                        « {item.note} »
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    {alreadySaved ? (
                      <span className="mc-kicker inline-flex items-center gap-1.5 text-[10px] text-[#A3B99B]">
                        <Check size={12} />
                        Classé
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={Boolean(busyKey)}
                        onClick={() => void keep(item)}
                        className="mc-kicker inline-flex items-center gap-2 border border-[#EAE6DE]/25 px-3.5 py-1.5 text-[10px] text-[#EAE6DE] transition hover:border-[#C49A58] hover:text-[#C49A58] disabled:opacity-40"
                      >
                        {isKeeping ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        <span>Ajouter à À voir</span>
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}

          {!loading && received.length === 0 ? (
            <div className="col-span-full border-y border-[#EAE6DE]/12 py-14 text-center">
              <Inbox size={20} className="mx-auto text-[#EAE6DE]/40" />
              <p className="mt-3 font-serif text-2xl italic text-[#EAE6DE]/70">
                Aucune recommandation reçue pour l’instant.
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-7 gap-y-12 sm:grid-cols-3 lg:grid-cols-5">
          {visible.map((item) => {
            const isRemoving = busyKey === `remove:${item.id}`;
            const isChangingStatus = busyKey === `status:${item.id}`;
            const isWatched = item.status === "watched";

            return (
              <article
                key={item.id}
                className="frame-zoom-in group flex flex-col justify-between border-b border-[#EAE6DE]/10 pb-5"
              >
                <div>
                  <button
                    type="button"
                    onClick={() => openTitle(item)}
                    className="block aspect-[2/3] w-full overflow-hidden bg-[#202224] text-left focus:outline-none"
                  >
                    <Poster
                      path={item.poster_path}
                      alt={item.title}
                      className={`h-full w-full transition-transform duration-700 ease-out group-hover:scale-105 ${
                        isWatched ? "grayscale opacity-55" : ""
                      }`}
                    />
                  </button>

                  <div className="mt-3 flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => openTitle(item)}
                      className="min-w-0 flex-1 text-left focus:outline-none"
                    >
                      <p className="mc-kicker text-[9px] text-[#EAE6DE]/50">
                        {item.media_type === "movie" ? "Film" : "Série"}
                        {item.year ? ` · ${item.year}` : ""}
                      </p>
                      <h2
                        className={`mt-1 line-clamp-2 font-serif text-xl leading-snug transition ${
                          isWatched
                            ? "text-[#EAE6DE]/55 group-hover:text-[#EAE6DE]"
                            : "text-[#EAE6DE] group-hover:text-[#C49A58]"
                        }`}
                      >
                        {item.title}
                      </h2>
                    </button>

                    <button
                      type="button"
                      disabled={Boolean(busyKey)}
                      onClick={() => void removeItem(item)}
                      className="p-1 text-[#EAE6DE]/40 transition hover:text-[#EAE6DE] disabled:opacity-35"
                      title="Retirer"
                      aria-label={`Retirer ${item.title}`}
                    >
                      {isRemoving ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-2 border-t border-[#EAE6DE]/10 pt-2.5">
                  <Stars value={item.rating ?? 0} onChange={(rating) => void setRating(item, rating)} />
                  <button
                    type="button"
                    disabled={Boolean(busyKey)}
                    onClick={() => void setStatus(item, item.status === "watched" ? "to_watch" : "watched")}
                    className="mc-kicker text-left text-[9px] text-[#EAE6DE]/65 transition hover:text-[#C49A58] disabled:opacity-40"
                  >
                    {isChangingStatus
                      ? "…"
                      : item.status === "watched"
                        ? "Remettre à voir"
                        : "Marquer vu"}
                  </button>
                </div>
              </article>
            );
          })}

          {!loading && visible.length === 0 ? (
            <p className="col-span-full border-y border-[#EAE6DE]/12 py-14 text-center font-serif text-2xl italic text-[#EAE6DE]/55">
              Aucune œuvre dans ce cahier pour le moment.
            </p>
          ) : null}
        </div>
      )}

      <Modal open={duelOpen} title="Duel de soirée" onClose={() => setDuelOpen(false)}>
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-[#EAE6DE]/10 pb-3 text-xs">
          <label className="inline-flex cursor-pointer items-center gap-2 text-[#EAE6DE]/75">
            <input
              type="checkbox"
              checked={includeReceivedInDuel}
              onChange={(e) => {
                const next = e.target.checked;
                setIncludeReceivedInDuel(next);
                launchSoloDuel(next);
              }}
              className="accent-[#C49A58]"
            />
            <span>Inclure les recommandations reçues</span>
          </label>
          <button
            type="button"
            onClick={() => launchSoloDuel(includeReceivedInDuel)}
            className="mc-kicker inline-flex items-center gap-1 text-[10px] text-[#EAE6DE]/60 hover:text-[#C49A58]"
          >
            <RotateCcw size={11} />
            <span>Mélanger</span>
          </button>
        </div>

        {!canLaunchSoloDuel || duelPool.length < 2 ? (
          <div className="space-y-4 py-6 text-center text-sm text-[#EAE6DE]/65">
            <p>Il faut au moins deux titres dans À voir pour lancer un duel.</p>
            <Link href="/catalogue" onClick={() => setDuelOpen(false)} className={`inline-block ${buttonClass}`}>
              Explorer la Cinémathèque
            </Link>
          </div>
        ) : duelWinner ? (
          <div className="space-y-5 text-center">
            <div className="mc-kicker inline-flex items-center gap-1.5 text-[#C49A58]">
              <Trophy size={13} />
              <span>Choix retenu</span>
            </div>
            <div className="mx-auto aspect-[2/3] w-40 overflow-hidden bg-[#101112]">
              <Poster path={duelWinner.posterPath} alt={duelWinner.title} className="h-full w-full" />
            </div>
            <div>
              <h3 className="font-serif text-3xl text-[#EAE6DE]">{duelWinner.title}</h3>
              <p className="mc-kicker mt-1 text-[10px] text-[#EAE6DE]/50">
                {duelWinner.year ? `${duelWinner.year} · ` : ""}
                {duelWinner.sourceLabel}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => void finalizeWinnerInToWatch(duelWinner, false)}
                className={buttonClass}
              >
                Garder pour ce soir
              </button>
              <button
                type="button"
                onClick={() => void finalizeWinnerInToWatch(duelWinner, true)}
                className={ghostClass}
              >
                Marquer vu
              </button>
              <button type="button" onClick={() => launchSoloDuel(includeReceivedInDuel)} className={ghostClass}>
                Rejouer
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="mc-kicker text-[10px] text-[#C49A58]">
                Manche {challengerIdx} / {duelPool.length - 1}
              </span>
              <span className="mc-kicker text-[10px] text-[#EAE6DE]/50">Lequel retenez-vous ?</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { side: "champion" as const, entry: duelPool[championIdx] },
                { side: "challenger" as const, entry: duelPool[challengerIdx] },
              ].map(({ side, entry }) =>
                entry ? (
                  <button
                    key={`${side}-${entry.key}`}
                    type="button"
                    onClick={() => chooseDuelSide(side)}
                    className="group flex flex-col overflow-hidden border border-[#EAE6DE]/12 bg-[#101112]/60 p-2.5 text-left transition hover:border-[#C49A58]"
                  >
                    <div className="aspect-[2/3] w-full overflow-hidden bg-[#202224]">
                      <Poster
                        path={entry.posterPath}
                        alt={entry.title}
                        className="h-full w-full transition duration-500 group-hover:scale-105"
                      />
                    </div>
                    <p className="mt-3 line-clamp-2 font-serif text-lg leading-snug text-[#EAE6DE] group-hover:text-[#C49A58]">
                      {entry.title}
                    </p>
                    <p className="mc-kicker mt-1 text-[10px] text-[#EAE6DE]/50">{entry.sourceLabel}</p>
                  </button>
                ) : null,
              )}
            </div>
          </div>
        )}
      </Modal>

      <TitleDetailModal
        title={selectedTitle}
        onClose={() => {
          setSelectedTitle(null);
          void load();
        }}
      />
    </div>
  );
}