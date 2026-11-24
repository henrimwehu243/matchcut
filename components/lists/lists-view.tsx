"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Film, Inbox, Loader2, Plus, RotateCcw, Swords, Trash2, Tv, Trophy } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { TitleDetailModal } from "@/components/title-detail-modal";
import { ErrorNote, Modal, PageHeader, Poster, Stars, buttonClass, ghostClass } from "@/components/ui";
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

  // Duel solo
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
          ? `« ${winner.title} » marqué comme vu.`
          : `Choix du soir : « ${winner.title} » est prêt dans ta liste À voir.`,
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
        ? `« ${winner.title} » ajouté à Vus.`
        : `« ${winner.title} » ajouté à ta liste À voir pour ce soir.`,
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
      setNotice(`« ${item.title} » retiré de votre liste.`);
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
      setNotice(`« ${recommendation.title} » ajouté à votre liste À voir.`);
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

  const tabs: { id: Tab; label: string }[] = [
    { id: "received", label: `Reçues (${received.length})` },
    { id: "to_watch", label: `À voir (${toWatchCount})` },
    { id: "watched", label: `Vus (${watchedCount})` },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          kicker="Ta cinémathèque perso"
          title="Listes"
          text="Retrouve les conseils de tes amis, les films à garder sous le coude et ceux que tu as déjà vus."
        />
        {toWatchCount >= 2 || received.length >= 2 ? (
          <button
            type="button"
            onClick={() => launchSoloDuel(includeReceivedInDuel)}
            className="mb-6 inline-flex items-center gap-2 rounded-2xl border border-amber-400/35 bg-amber-400/10 px-4 py-2 text-xs font-semibold text-amber-200 transition hover:border-amber-400/60"
          >
            <Swords size={15} className="text-amber-300" />
            <span>Duel solo</span>
          </button>
        ) : null}
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-[#f4f1ea] text-[#09090b] shadow-xs"
                    : "border border-white/12 bg-white/[0.02] text-zinc-300 hover:border-white/25 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {tab === "to_watch" && toWatchCount >= 2 ? (
          <button
            type="button"
            onClick={() => launchSoloDuel(false)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
          >
            <Swords size={14} />
            Trancher ma liste À voir
          </button>
        ) : null}
      </div>

      <div className="space-y-3">
        <ErrorNote message={error} />
        {notice ? <p className="text-sm text-emerald-400">{notice}</p> : null}
      </div>

      {loading ? (
        <div className="mt-8 flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 size={16} className="animate-spin" />
          Chargement de tes listes…
        </div>
      ) : null}

      {tab === "received" ? (
        <div className="mt-6 grid gap-3.5 md:grid-cols-2">
          {received.map((item) => {
            const sender = people[item.from_user_id];
            const alreadySaved = savedKeys.has(`${item.media_type}:${item.tmdb_id}`);
            const isKeeping = busyKey === `keep:${item.id}`;

            return (
              <article
                key={item.id}
                className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-3.5 transition hover:border-white/20"
              >
                <button
                  type="button"
                  onClick={() => openTitle(item)}
                  className="h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-900 transition hover:opacity-90"
                >
                  <Poster path={item.poster_path} alt={item.title} className="h-full w-full" />
                </button>
                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <div>
                    <button
                      type="button"
                      onClick={() => openTitle(item)}
                      className="text-left font-serif text-2xl leading-snug text-[#f4f1ea] transition hover:text-amber-200"
                    >
                      {item.title}
                    </button>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-0.5 text-zinc-300">
                        {item.media_type === "movie" ? <Film size={12} /> : <Tv size={12} />}
                        {item.media_type === "movie" ? "Film" : "Série"}
                      </span>
                      {item.year ? <span>{item.year}</span> : null}
                      <span>·</span>
                      <Link href={`/membre/${item.from_user_id}`} className="font-medium text-amber-300/90 hover:underline">
                        {sender?.username || sender?.full_name || "Un ami"}
                      </Link>
                    </div>
                    {item.note ? (
                      <p className="mt-2.5 rounded-xl bg-black/25 px-3 py-2 text-sm leading-relaxed text-zinc-300">
                        « {item.note} »
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-3">
                    {alreadySaved ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                        <Check size={14} />
                        Déjà dans tes listes
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={Boolean(busyKey)}
                        className={`${ghostClass} px-3 py-1.5 text-xs`}
                        onClick={() => void keep(item)}
                      >
                        {isKeeping ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                        Ajouter à À voir
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
          {!loading && received.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 py-12 text-center">
              <Inbox size={22} className="text-zinc-500" />
              <p className="mt-2 text-sm text-zinc-400">Aucune recommandation reçue pour l&apos;instant.</p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 grid gap-3.5 md:grid-cols-2">
          {visible.map((item) => {
            const isRemoving = busyKey === `remove:${item.id}`;
            const isChangingStatus = busyKey === `status:${item.id}`;

            return (
              <article
                key={item.id}
                className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-3.5 transition hover:border-white/20"
              >
                <button
                  type="button"
                  onClick={() => openTitle(item)}
                  className="h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-900 transition hover:opacity-90"
                >
                  <Poster path={item.poster_path} alt={item.title} className="h-full w-full" />
                </button>
                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openTitle(item)}
                        className="text-left font-serif text-2xl leading-snug text-[#f4f1ea] transition hover:text-amber-200"
                      >
                        {item.title}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busyKey)}
                        onClick={() => void removeItem(item)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-400 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40"
                        title="Retirer de la liste"
                      >
                        {isRemoving ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        Retirer
                      </button>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
                      <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-0.5 text-zinc-300">
                        {item.media_type === "movie" ? <Film size={12} /> : <Tv size={12} />}
                        {item.media_type === "movie" ? "Film" : "Série"}
                      </span>
                      {item.year ? <span>{item.year}</span> : null}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-1">
                    <Stars value={item.rating ?? 0} onChange={(rating) => void setRating(item, rating)} />
                    <button
                      type="button"
                      disabled={Boolean(busyKey)}
                      className="rounded-lg border border-white/12 bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:border-white/25 hover:text-white disabled:opacity-40"
                      onClick={() => void setStatus(item, item.status === "watched" ? "to_watch" : "watched")}
                    >
                      {isChangingStatus
                        ? "Mise à jour…"
                        : item.status === "watched"
                          ? "Remettre à voir"
                          : "Marquer vu"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          {!loading && visible.length === 0 ? (
            <p className="col-span-full rounded-2xl border border-dashed border-white/10 py-10 text-center text-sm text-zinc-500">
              Cette liste est vide pour le moment.
            </p>
          ) : null}
        </div>
      )}

      {/* Modale Duel solo */}
      <Modal open={duelOpen} title="Duel solo · Choix de la soirée" onClose={() => setDuelOpen(false)}>
        <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs">
          <label className="inline-flex cursor-pointer items-center gap-2 text-zinc-300">
            <input
              type="checkbox"
              checked={includeReceivedInDuel}
              onChange={(e) => {
                const next = e.target.checked;
                setIncludeReceivedInDuel(next);
                launchSoloDuel(next);
              }}
              className="accent-amber-400"
            />
            Inclure aussi les recommandations reçues
          </label>
          <button
            type="button"
            onClick={() => launchSoloDuel(includeReceivedInDuel)}
            className="inline-flex items-center gap-1 text-zinc-400 hover:text-white"
          >
            <RotateCcw size={12} />
            Mélanger
          </button>
        </div>

        {!canLaunchSoloDuel || duelPool.length < 2 ? (
          <div className="space-y-3 py-5 text-center text-sm text-zinc-400">
            <p>Il faut au moins 2 titres dans ta liste À voir (ou avec les reçus) pour lancer un duel.</p>
            <Link href="/catalogue" onClick={() => setDuelOpen(false)} className={`inline-block ${buttonClass}`}>
              Explorer le Catalogue
            </Link>
          </div>
        ) : duelWinner ? (
          <div className="space-y-4 text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/35 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">
              <Trophy size={13} />
              Gagnant de ta soirée
            </div>
            <div className="mx-auto w-40 overflow-hidden rounded-2xl border border-amber-300/40">
              <Poster path={duelWinner.posterPath} alt={duelWinner.title} className="aspect-[2/3] w-full" />
            </div>
            <div>
              <h3 className="font-serif text-2xl text-[#f4f1ea]">{duelWinner.title}</h3>
              <p className="mt-1 text-xs text-zinc-400">
                {duelWinner.year ? `${duelWinner.year} · ` : ""}
                {duelWinner.sourceLabel}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
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
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>
                Manche {challengerIdx} / {duelPool.length - 1}
              </span>
              <span>Choisis celui qui te tente le plus</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { side: "champion" as const, entry: duelPool[championIdx] },
                { side: "challenger" as const, entry: duelPool[challengerIdx] },
              ].map(({ side, entry }) =>
                entry ? (
                  <button
                    key={`${side}-${entry.key}`}
                    type="button"
                    onClick={() => chooseDuelSide(side)}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-white/15 bg-black/30 p-2.5 text-left transition hover:border-amber-300/60 hover:bg-white/[0.04]"
                  >
                    <div className="aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/10">
                      <Poster
                        path={entry.posterPath}
                        alt={entry.title}
                        className="h-full w-full transition duration-300 group-hover:scale-105"
                      />
                    </div>
                    <p className="mt-2.5 line-clamp-2 font-serif text-base leading-snug text-[#f4f1ea]">{entry.title}</p>
                    <p className="mt-1 text-[11px] text-amber-300/85">{entry.sourceLabel}</p>
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