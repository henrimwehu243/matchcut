"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Info, RefreshCw, Sparkles, X } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { TitleDetailModal } from "@/components/title-detail-modal";
import { Avatar, ErrorNote, PageHeader, Poster } from "@/components/ui";
import { formatLabel, genreLabels, mapTmdb, tmdb } from "@/lib/tmdb";
import { supabase } from "@/lib/supabase";
import type { Group, Profile, Title } from "@/lib/types";

type FormatFilter = "auto" | "movie" | "tv" | "anime";

type MatchInfo = {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
};

type SmartTitle = Title & {
  priorityReason?: string;
};

type ActivityItem = {
  id: string;
  userId: string;
  profile?: Profile;
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  year: string;
  actionText: string;
  rating: number | null;
  comment: string | null;
  createdAt: string;
};

export function SwipeDeck() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState("");
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("auto");
  const [cards, setCards] = useState<SmartTitle[]>([]);
  const [index, setIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<"pass" | "validate" | null>(null);
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [inspectTitle, setInspectTitle] = useState<Title | null>(null);

  const startX = useRef(0);
  const shown = useRef(new Set<string>());
  const startedAt = useRef(new Date().toISOString());
  const fetchingRef = useRef(false);

  const current = cards[index];
  const upcoming = cards[index + 1];

  const reveal = useCallback((info: MatchInfo) => {
    const key = `${info.mediaType}:${info.tmdbId}`;
    if (shown.current.has(key)) return;
    shown.current.add(key);
    setMatch(info);
  }, []);

  const loadGroups = useCallback(async () => {
    if (!user) return;
    const { data: memberships, error: memberError } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id);
    if (memberError) {
      setError(memberError.message);
      return;
    }
    const ids = (memberships ?? []).map((row) => row.group_id as string);
    if (!ids.length) {
      setGroups([]);
      return;
    }
    const { data, error: groupError } = await supabase.from("groups").select("*").in("id", ids);
    if (groupError) setError(groupError.message);
    else setGroups((data as Group[]) ?? []);
  }, [user]);

  const loadFriendActivity = useCallback(async () => {
    if (!user) return;
    const { data: links } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    const friendIds = (links ?? []).map((row) =>
      row.requester_id === user.id ? (row.addressee_id as string) : (row.requester_id as string),
    );
    if (friendIds.length === 0) {
      setActivity([]);
      return;
    }

    const [{ data: profilesData }, { data: reviewsData }, { data: watchData }] = await Promise.all([
      supabase.from("profiles").select("*").in("id", friendIds),
      supabase
        .from("reviews")
        .select("*")
        .in("user_id", friendIds)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("watch_items")
        .select("*")
        .in("user_id", friendIds)
        .eq("status", "to_watch")
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    const profileMap: Record<string, Profile> = {};
    ((profilesData as Profile[]) ?? []).forEach((p) => {
      profileMap[p.id] = p;
    });

    const items: ActivityItem[] = [];

    (reviewsData ?? []).forEach((r) => {
      items.push({
        id: `rev-${r.id}`,
        userId: r.user_id,
        profile: profileMap[r.user_id],
        tmdbId: r.tmdb_id,
        mediaType: r.media_type,
        title: r.title,
        posterPath: null,
        year: "",
        actionText: r.comment ? "a critiqué" : "a vu et noté",
        rating: Number(r.rating),
        comment: r.comment,
        createdAt: r.created_at,
      });
    });

    (watchData ?? []).forEach((w) => {
      items.push({
        id: `watch-${w.id}`,
        userId: w.user_id,
        profile: profileMap[w.user_id],
        tmdbId: w.tmdb_id,
        mediaType: w.media_type,
        title: w.title,
        posterPath: w.poster_path,
        year: w.year ?? "",
        actionText: "veut voir",
        rating: null,
        comment: null,
        createdAt: w.created_at,
      });
    });

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setActivity(items.slice(0, 15));
  }, [user]);

  const loadCards = useCallback(
    async (startPage: number, replace: boolean) => {
      if (!user || fetchingRef.current) return;
      fetchingRef.current = true;
      setLoading(true);
      try {
        let swipeQuery = supabase.from("swipes").select("tmdb_id, media_type").eq("user_id", user.id);
        swipeQuery = groupId ? swipeQuery.eq("group_id", groupId) : swipeQuery.is("group_id", null);
        const { data: seen } = await swipeQuery;
        const seenKeys = new Set((seen ?? []).map((row) => `${row.media_type}:${row.tmdb_id}`));

        let targetUserIds = [user.id];
        if (groupId) {
          const { data: members } = await supabase.from("group_members").select("user_id").eq("group_id", groupId);
          if (members?.length) {
            targetUserIds = members.map((m) => m.user_id as string);
          }
        }

        const { data: wishlist } = await supabase
          .from("watch_items")
          .select("*")
          .in("user_id", targetUserIds)
          .order("created_at", { ascending: false })
          .limit(80);

        const toWatchRows = (wishlist ?? []).filter((w) => w.status === "to_watch");

        const priorityCards: SmartTitle[] = [];
        if (replace && startPage === 1) {
          const grouped = new Map<string, { row: (typeof toWatchRows)[number]; count: number }>();
          toWatchRows.forEach((row) => {
            if (formatFilter === "movie" && row.media_type !== "movie") return;
            if ((formatFilter === "tv" || formatFilter === "anime") && row.media_type !== "tv") return;
            const key = `${row.media_type}:${row.tmdb_id}`;
            if (seenKeys.has(key)) return;
            const prev = grouped.get(key);
            grouped.set(key, { row, count: (prev?.count ?? 0) + 1 });
          });

          const sortedWishlist = [...grouped.values()].sort((a, b) => b.count - a.count);
          sortedWishlist.slice(0, 4).forEach(({ row, count }) => {
            priorityCards.push({
              tmdbId: row.tmdb_id,
              mediaType: row.media_type,
              title: row.title,
              overview: "",
              posterPath: row.poster_path,
              year: row.year ?? "",
              genreIds: [],
              language: "",
              anime: false,
              popularity: 9999,
              priorityReason:
                groupId && count > 1
                  ? `Envie commune (${count} membres)`
                  : groupId
                  ? "Dans la liste d'un membre"
                  : "Dans ta liste À voir",
            });
          });
        }

        const allUserHistory = wishlist ?? [];
        const tvAffinities = allUserHistory.filter((i) => i.media_type === "tv").length;
        const movieAffinities = allUserHistory.filter((i) => i.media_type === "movie").length;
        const prefersAnimeAndSeries = tvAffinities > movieAffinities;

        const pattern: ("movie" | "tv" | "anime")[] =
          formatFilter === "movie"
            ? ["movie"]
            : formatFilter === "tv"
            ? ["tv"]
            : formatFilter === "anime"
            ? ["anime"]
            : prefersAnimeAndSeries
            ? ["anime", "movie", "tv", "anime"]
            : ["movie", "anime", "tv"];

        const priorityKeys = new Set(priorityCards.map((c) => `${c.mediaType}:${c.tmdbId}`));
        const seenInBatch = new Set<string>();
        const freshTmdb: SmartTitle[] = [];
        let currentPage = startPage;

        for (let attempt = 0; attempt < 6; attempt += 1) {
          const [rawMovies, rawShows, rawAnimes] = await Promise.all([
            formatFilter === "auto" || formatFilter === "movie"
              ? tmdb("discover/movie", { sort_by: "popularity.desc", page: String(currentPage), "vote_count.gte": "100" })
              : Promise.resolve([]),
            formatFilter === "auto" || formatFilter === "tv"
              ? tmdb("discover/tv", { sort_by: "popularity.desc", page: String(currentPage), "vote_count.gte": "100" })
              : Promise.resolve([]),
            formatFilter === "auto" || formatFilter === "anime"
              ? tmdb("discover/tv", {
                  sort_by: "popularity.desc",
                  page: String(currentPage),
                  with_genres: "16",
                  with_original_language: "ja",
                  "vote_count.gte": "20",
                })
              : Promise.resolve([]),
          ]);

          const moviesList = rawMovies
            .map((item) => mapTmdb(item, "movie"))
            .filter((t): t is Title => Boolean(t))
            .filter((t) => !t.anime);
          const showsList = rawShows
            .map((item) => mapTmdb(item, "tv"))
            .filter((t): t is Title => Boolean(t))
            .filter((t) => !t.anime);
          const animesList = rawAnimes
            .map((item) => mapTmdb(item, "tv"))
            .filter((t): t is Title => Boolean(t))
            .map((t) => ({ ...t, anime: true }));

          let mIdx = 0;
          let sIdx = 0;
          let aIdx = 0;
          const maxSteps = (moviesList.length + showsList.length + animesList.length) * 3;

          for (let step = 0; step < maxSteps; step += 1) {
            const slot = pattern[step % pattern.length];
            let candidate: Title | null = null;
            if (slot === "movie" && mIdx < moviesList.length) candidate = moviesList[mIdx++];
            else if (slot === "tv" && sIdx < showsList.length) candidate = showsList[sIdx++];
            else if (slot === "anime" && aIdx < animesList.length) candidate = animesList[aIdx++];

            if (candidate) {
              const key = `${candidate.mediaType}:${candidate.tmdbId}`;
              if (!seenKeys.has(key) && !priorityKeys.has(key) && !seenInBatch.has(key)) {
                seenInBatch.add(key);
                freshTmdb.push(candidate);
              }
            }
            if (mIdx >= moviesList.length && sIdx >= showsList.length && aIdx >= animesList.length) break;
          }

          currentPage += 1;
          if (freshTmdb.length >= 12) break;
        }

        const combined = [...priorityCards, ...freshTmdb];
        setCards((prev) => {
          if (replace) return combined;
          const existingKeys = new Set(prev.map((c) => `${c.mediaType}:${c.tmdbId}`));
          const uniqueAdded = combined.filter((c) => !existingKeys.has(`${c.mediaType}:${c.tmdbId}`));
          return [...prev, ...uniqueAdded];
        });
        if (replace) setIndex(0);
        setPage(currentPage);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Catalogue indisponible.");
      } finally {
        setLoading(false);
        fetchingRef.current = false;
      }
    },
    [formatFilter, groupId, user],
  );

  useEffect(() => {
    void loadGroups();
    void loadFriendActivity();
  }, [loadGroups, loadFriendActivity]);

  useEffect(() => {
    void loadCards(1, true);
  }, [loadCards]);

  useEffect(() => {
    if (!loading && cards.length > 0 && index >= cards.length - 5) {
      void loadCards(page, false);
    }
  }, [cards.length, index, loadCards, loading, page]);

  useEffect(() => {
    if (!groupId) return;
    const channel = supabase
      .channel(`swipes-${groupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "swipes", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const row = payload.new as {
            user_id?: string;
            decision?: string;
            tmdb_id?: number;
            media_type?: "movie" | "tv";
            title?: string;
            poster_path?: string | null;
          };
          if (row.user_id === user?.id || row.decision !== "validate" || !row.tmdb_id || !row.media_type) return;
          void checkMatch({
            tmdbId: row.tmdb_id,
            mediaType: row.media_type,
            title: row.title || "Titre",
            posterPath: row.poster_path ?? null,
            overview: "",
            year: "",
            genreIds: [],
            language: "",
            anime: false,
            popularity: 0,
          });
        },
      )
      .subscribe();

    const timer = window.setInterval(async () => {
      const { data } = await supabase
        .from("matches")
        .select("tmdb_id, media_type, title, poster_path")
        .eq("group_id", groupId)
        .gt("created_at", startedAt.current)
        .order("created_at", { ascending: false })
        .limit(1);
      const row = data?.[0];
      if (!row) return;
      reveal({
        tmdbId: row.tmdb_id,
        mediaType: row.media_type,
        title: row.title,
        posterPath: row.poster_path,
      });
    }, 6000);

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [groupId, reveal, user?.id]);

  async function checkMatch(title: Title) {
    if (!groupId) return;
    const { data: members, error: memberError } = await supabase.from("group_members").select("user_id").eq("group_id", groupId);
    if (memberError) {
      setError(memberError.message);
      return;
    }
    const memberIds = (members ?? []).map((row) => row.user_id as string);
    if (memberIds.length < 2) {
      setProgress("Un match demande au moins deux membres.");
      return;
    }
    const { data: likes, error: likeError } = await supabase
      .from("swipes")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("tmdb_id", title.tmdbId)
      .eq("media_type", title.mediaType)
      .eq("decision", "validate");
    if (likeError) {
      setError(likeError.message);
      return;
    }
    const liked = new Set((likes ?? []).map((row) => row.user_id as string));
    if (!memberIds.every((id) => liked.has(id))) {
      setProgress(`${liked.size}/${memberIds.length} membres ont validé`);
      return;
    }
    const { error: matchError } = await supabase.from("matches").insert({
      group_id: groupId,
      tmdb_id: title.tmdbId,
      media_type: title.mediaType,
      title: title.title,
      poster_path: title.posterPath,
    });
    if (matchError && matchError.code !== "23505") setError(matchError.message);
    setProgress(null);
    reveal({ tmdbId: title.tmdbId, mediaType: title.mediaType, title: title.title, posterPath: title.posterPath });
  }

  async function persist(title: Title, decision: "pass" | "validate") {
    if (!user) return;
    const payload = {
      user_id: user.id,
      group_id: groupId || null,
      tmdb_id: title.tmdbId,
      media_type: title.mediaType,
      title: title.title,
      poster_path: title.posterPath,
      decision,
    };
    let query = supabase
      .from("swipes")
      .select("id")
      .eq("user_id", user.id)
      .eq("tmdb_id", title.tmdbId)
      .eq("media_type", title.mediaType);
    query = groupId ? query.eq("group_id", groupId) : query.is("group_id", null);
    const { data: existing, error: readError } = await query.maybeSingle();
    if (readError) {
      setError(readError.message);
      return;
    }
    const write = existing
      ? await supabase.from("swipes").update({ decision }).eq("id", existing.id)
      : await supabase.from("swipes").insert(payload);
    if (write.error) {
      setError(write.error.message);
      return;
    }
    if (decision === "validate") {
      const { data: item } = await supabase
        .from("watch_items")
        .select("id")
        .eq("user_id", user.id)
        .eq("tmdb_id", title.tmdbId)
        .eq("media_type", title.mediaType)
        .maybeSingle();
      if (!item) {
        const { error: listError } = await supabase.from("watch_items").insert({
          user_id: user.id,
          tmdb_id: title.tmdbId,
          media_type: title.mediaType,
          title: title.title,
          poster_path: title.posterPath,
          year: title.year,
          status: "to_watch",
        });
        if (listError) setError(listError.message);
      }
      if (groupId) await checkMatch(title);
    }
  }

  function commit(decision: "pass" | "validate") {
    if (!current || leaving) return;
    setLeaving(decision);
    setDx(decision === "pass" ? -560 : 560);
    const title = current;
    window.setTimeout(() => {
      setIndex((value) => value + 1);
      setDx(0);
      setLeaving(null);
      setProgress(null);
    }, 280);
    void persist(title, decision);
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (leaving) return;
    setDragging(true);
    startX.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || leaving) return;
    setDx(event.clientX - startX.current);
  }

  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (dx > 120) commit("validate");
    else if (dx < -120) commit("pass");
    else setDx(0);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (inspectTitle) return;
      if (event.key === "ArrowLeft") commit("pass");
      if (event.key === "ArrowRight") commit("validate");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const passStrength = leaving === "pass" ? 1 : Math.min(1, Math.max(0, -dx / 120));
  const keepStrength = leaving === "validate" ? 1 : Math.min(1, Math.max(0, dx / 120));

  const formatPills: { id: FormatFilter; label: string }[] = [
    { id: "auto", label: "Mix adapté" },
    { id: "movie", label: "Films" },
    { id: "tv", label: "Séries" },
    { id: "anime", label: "Animés" },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        kicker="Séance"
        title="Décider"
        text="Glissez à gauche pour passer, à droite pour valider. Le mix alterne Films, Séries et Animés selon vos préférences."
      />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm text-zinc-400">
            Groupe
            <select
              className="mt-1.5 block w-48 border border-white/15 bg-[#09090b] px-3 py-2 text-sm text-zinc-100"
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
            >
              <option value="">Séance solo</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-1.5">
            {formatPills.map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setFormatFilter(pill.id)}
                className={`px-3 py-2 text-xs transition ${
                  formatFilter === pill.id
                    ? "bg-[#f4f1ea] font-semibold text-[#09090b]"
                    : "border border-white/15 text-zinc-300 hover:border-white/40"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm text-zinc-500">{progress}</p>
      </div>
      <ErrorNote message={error} />

      <div className="mt-8 flex flex-col items-center">
        <div className="relative h-[520px] w-[320px] max-w-full">
          {upcoming ? (
            <div className="absolute inset-0 scale-[0.96] border border-white/10 opacity-40">
              <Poster path={upcoming.posterPath} alt="" className="h-full w-full" />
            </div>
          ) : null}
          {current ? (
            <div
              className="absolute inset-0 cursor-grab overflow-hidden border border-white/10 bg-zinc-950 active:cursor-grabbing"
              style={{
                transform: `translateX(${dx}px) rotate(${dx / 18}deg)`,
                transition: dragging ? "none" : "transform 0.28s ease",
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <Poster path={current.posterPath} alt={current.title} className="h-full w-full" />

              <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2">
                {current.priorityReason ? (
                  <span className="inline-flex items-center gap-1 bg-emerald-500/90 px-2.5 py-1 text-[11px] font-semibold text-zinc-950 shadow">
                    <Sparkles size={12} />
                    {current.priorityReason}
                  </span>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setInspectTitle(current);
                  }}
                  className="inline-flex items-center gap-1 border border-white/20 bg-black/80 px-2.5 py-1 text-[11px] font-medium text-[#f4f1ea] backdrop-blur hover:border-white/50"
                >
                  <Info size={12} />
                  Infos &amp; avis
                </button>
              </div>

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#09090b] via-[#09090b]/85 to-transparent p-5 pt-24">
                <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-300">
                  {formatLabel(current)}
                  {current.year ? ` · ${current.year}` : ""}
                </p>
                <h2 className="mt-1 font-serif text-3xl leading-none tracking-tight text-[#f4f1ea]">{current.title}</h2>
                {current.genreIds.length > 0 ? (
                  <p className="mt-2 text-xs text-zinc-400">{genreLabels(current.genreIds).join(" · ")}</p>
                ) : null}
              </div>

              {passStrength > 0.05 ? (
                <span
                  className={`absolute left-5 top-14 border-[3px] border-red-500 px-3 py-1 font-serif text-2xl uppercase tracking-[0.16em] text-red-400 ${leaving === "pass" ? "stamp-in" : ""}`}
                  style={{ opacity: passStrength, transform: "rotate(-16deg)" }}
                >
                  Passer
                </span>
              ) : null}
              {keepStrength > 0.05 ? (
                <span
                  className={`absolute right-5 top-14 border-[3px] border-emerald-400 px-3 py-1 font-serif text-2xl uppercase tracking-[0.16em] text-emerald-300 ${leaving === "validate" ? "stamp-in" : ""}`}
                  style={{ opacity: keepStrength, transform: "rotate(14deg)" }}
                >
                  Valider
                </span>
              ) : null}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 border border-white/10 px-8 text-center text-sm leading-6 text-zinc-400">
              <p>{loading ? "Préparation de nouveaux titres…" : "Tu as parcouru tout ce paquet !"}</p>
              {!loading ? (
                <button
                  type="button"
                  onClick={() => void loadCards(page, false)}
                  className="inline-flex items-center gap-2 border border-white/25 bg-white/5 px-4 py-2 text-xs font-medium text-[#f4f1ea] hover:border-white/50"
                >
                  <RefreshCw size={13} />
                  Charger la suite
                </button>
              ) : null}
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center gap-5">
          <button
            type="button"
            aria-label="Passer"
            disabled={!current || Boolean(leaving)}
            onClick={() => commit("pass")}
            className="grid h-16 w-16 place-items-center rounded-full border border-red-500/60 text-red-400 transition hover:bg-red-500 hover:text-white disabled:opacity-40"
          >
            <X />
          </button>
          <button
            type="button"
            aria-label="Valider"
            disabled={!current || Boolean(leaving)}
            onClick={() => commit("validate")}
            className="grid h-16 w-16 place-items-center rounded-full border border-emerald-400/60 text-emerald-300 transition hover:bg-emerald-500 hover:text-white disabled:opacity-40"
          >
            <Check />
          </button>
        </div>
        {current?.overview ? <p className="mt-6 max-w-md text-center text-sm leading-6 text-zinc-400">{current.overview}</p> : null}
      </div>

      {activity.length > 0 ? (
        <section className="mt-14 border-t border-white/10 pt-8">
          <h2 className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Activité de tes amis</h2>
          <div className="mt-4 space-y-2.5">
            {activity.map((item) => {
              const friendName = item.profile?.username || item.profile?.full_name || "Un ami";
              return (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 border border-white/10 bg-white/[0.02] p-3.5 text-sm"
                >
                  <div className="flex items-start gap-3">
                    <Link href={`/membre/${item.userId}`} className="shrink-0 hover:opacity-80">
                      <Avatar name={friendName} url={item.profile?.avatar_url} size={34} />
                    </Link>
                    <div>
                      <p className="text-zinc-300">
                        <Link href={`/membre/${item.userId}`} className="font-semibold text-[#f4f1ea] hover:underline">
                          {friendName}
                        </Link>{" "}
                        <span className="text-zinc-400">{item.actionText}</span>{" "}
                        <button
                          type="button"
                          onClick={() =>
                            setInspectTitle({
                              tmdbId: item.tmdbId,
                              mediaType: item.mediaType,
                              title: item.title,
                              overview: "",
                              posterPath: item.posterPath,
                              year: item.year,
                              genreIds: [],
                              language: "",
                              anime: false,
                              popularity: 0,
                            })
                          }
                          className="font-serif text-base text-[#f4f1ea] underline-offset-2 hover:underline"
                        >
                          {item.title}
                        </button>
                        {item.rating !== null && item.rating > 0 ? (
                          <span className="ml-2 text-xs font-semibold text-emerald-400">{item.rating} / 5 ★</span>
                        ) : null}
                      </p>
                      {item.comment ? (
                        <p className="mt-1 border-l-2 border-emerald-500/40 pl-2.5 text-xs italic text-zinc-400">
                          « {item.comment} »
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {match ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6">
          <div className="rise-in w-full max-w-md border border-white/10 bg-[#0e0e11] p-6 text-center">
            <p className="text-[11px] uppercase tracking-[0.32em] text-rose-300">Match</p>
            <h2 className="mt-3 font-serif text-5xl tracking-tight text-[#f4f1ea]">Le groupe est d’accord</h2>
            <div className="mx-auto mt-6 h-72 w-48 overflow-hidden border border-white/10">
              <Poster path={match.posterPath} alt={match.title} className="h-full w-full" />
            </div>
            <p className="mt-4 font-serif text-2xl text-[#f4f1ea]">{match.title}</p>
            <p className="mt-2 text-sm text-zinc-400">Tous les membres ont validé ce titre.</p>
            <button type="button" className="mt-6 border border-white/20 px-5 py-2.5 text-sm" onClick={() => setMatch(null)}>
              Continuer
            </button>
          </div>
        </div>
      ) : null}

      <TitleDetailModal title={inspectTitle} onClose={() => setInspectTitle(null)} />
    </div>
  );
}