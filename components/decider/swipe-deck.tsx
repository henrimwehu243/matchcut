"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  Info,
  RefreshCw,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { TitleDetailModal } from "@/components/title-detail-modal";
import { Avatar, ErrorNote, Poster } from "@/components/ui";
import { formatLabel, genreLabels, mapTmdb, tmdb } from "@/lib/tmdb";
import { supabase } from "@/lib/supabase";
import type { Group, Profile, Title } from "@/lib/types";

type FormatFilter = "auto" | "movie" | "tv" | "anime";

type MatchInfo = {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  partnerLabel?: string;
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
  const [friends, setFriends] = useState<Profile[]>([]);
  // "solo" | "all_friends" | "group:<id>"
  const [sessionScope, setSessionScope] = useState<string>("solo");
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("auto");
  const [cards, setCards] = useState<SmartTitle[]>([]);
  const [index, setIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<"pass" | "validate" | null>(null);
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [matchBurstKey, setMatchBurstKey] = useState(0);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [justSavedKey, setJustSavedKey] = useState<string | null>(null);

  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [inspectTitle, setInspectTitle] = useState<Title | null>(null);

  const startX = useRef(0);
  const shown = useRef(new Set<string>());
  const sessionStart = useRef(new Date(Date.now() - 10_000).toISOString());
  const fetchingRef = useRef(false);
  const checkingMatchRef = useRef(new Set<string>());
  const committingRef = useRef(false);

  const isAllFriends = sessionScope === "all_friends";
  const activeGroupId = sessionScope.startsWith("group:") ? sessionScope.replace("group:", "") : "";
  const activeGroupName = groups.find((g) => g.id === activeGroupId)?.name;

  const heroTitle = cards[0] ?? null;
  const deckCards = heroTitle ? cards.slice(1) : [];
  const current = deckCards[index] ?? null;
  const upcoming = deckCards[index + 1] ?? null;
  const sidePair = deckCards.slice(index + 2, index + 4);
  const horizontalReel = deckCards.slice(index + 4, index + 10);

  const reveal = useCallback((info: MatchInfo) => {
    const key = `${info.mediaType}:${info.tmdbId}`;
    if (shown.current.has(key)) return;
    shown.current.add(key);
    setMatchBurstKey((k) => k + 1);
    setMatch(info);
  }, []);

  const loadCirclesAndFriends = useCallback(async () => {
    if (!user) return;
    const [{ data: memberships, error: memberError }, { data: links }] = await Promise.all([
      supabase.from("group_members").select("group_id").eq("user_id", user.id),
      supabase
        .from("friendships")
        .select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    ]);

    if (memberError) {
      setError(memberError.message);
      return;
    }

    const ids = (memberships ?? []).map((row) => row.group_id as string);
    if (!ids.length) {
      setGroups([]);
    } else {
      const { data, error: groupError } = await supabase.from("groups").select("*").in("id", ids);
      if (groupError) setError(groupError.message);
      else setGroups((data as Group[]) ?? []);
    }

    const friendIds = (links ?? []).map((row) =>
      row.requester_id === user.id ? (row.addressee_id as string) : (row.requester_id as string),
    );
    if (!friendIds.length) {
      setFriends([]);
    } else {
      const { data: profs } = await supabase.from("profiles").select("*").in("id", friendIds);
      setFriends((profs as Profile[]) ?? []);
    }
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
        .limit(10),
      supabase
        .from("watch_items")
        .select("*")
        .in("user_id", friendIds)
        .eq("status", "to_watch")
        .order("created_at", { ascending: false })
        .limit(10),
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
        actionText: r.comment ? "a écrit sur" : "a noté",
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
        actionText: "a ajouté à sa liste",
        rating: null,
        comment: null,
        createdAt: w.created_at,
      });
    });

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setActivity(items.slice(0, 7));
  }, [user]);

  const loadCards = useCallback(
    async (startPage: number, replace: boolean) => {
      if (!user || fetchingRef.current) return;
      fetchingRef.current = true;
      setLoading(true);
      try {
        let tastePrefs: string[] = [];
        if (typeof window !== "undefined") {
          try {
            const rawPrefs = window.localStorage.getItem(`matchcut_taste_prefs_${user.id}`);
            if (rawPrefs) {
              const parsed = JSON.parse(rawPrefs);
              if (Array.isArray(parsed)) {
                tastePrefs = parsed.map((item) => String(item).toLowerCase().split(" (")[0]);
              }
            }
          } catch {
            // ignore malformed local storage
          }
        }

        let swipeQuery = supabase.from("swipes").select("tmdb_id, media_type").eq("user_id", user.id);
        swipeQuery = activeGroupId ? swipeQuery.eq("group_id", activeGroupId) : swipeQuery.is("group_id", null);

        const [{ data: seen }, { data: myWatchItems }] = await Promise.all([
          swipeQuery,
          supabase
            .from("watch_items")
            .select("tmdb_id, media_type, status")
            .eq("user_id", user.id),
        ]);

        const excludedKeys = new Set<string>([
          ...(seen ?? []).map((row) => `${row.media_type}:${row.tmdb_id}`),
          ...(myWatchItems ?? []).map((row) => `${row.media_type}:${row.tmdb_id}`),
        ]);

        let targetUserIds = [user.id];
        if (activeGroupId) {
          const { data: members } = await supabase
            .from("group_members")
            .select("user_id")
            .eq("group_id", activeGroupId);
          if (members?.length) {
            targetUserIds = members.map((m) => m.user_id as string);
          }
        } else if (isAllFriends && friends.length > 0) {
          targetUserIds = [user.id, ...friends.map((f) => f.id)];
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
            if (excludedKeys.has(key)) return;
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
                activeGroupId && count > 1
                  ? `Envie commune (${count} membres)`
                  : isAllFriends && count > 1
                  ? `Envie partagée (${count} proches)`
                  : activeGroupId
                  ? "Dans la liste d'un membre"
                  : isAllFriends
                  ? "Dans la liste d'un ami"
                  : "À découvrir",
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
              ? tmdb("discover/movie", {
                  sort_by: "popularity.desc",
                  page: String(currentPage),
                  "vote_count.gte": "100",
                })
              : Promise.resolve([]),
            formatFilter === "auto" || formatFilter === "tv"
              ? tmdb("discover/tv", {
                  sort_by: "popularity.desc",
                  page: String(currentPage),
                  "vote_count.gte": "100",
                })
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
              if (!excludedKeys.has(key) && !priorityKeys.has(key) && !seenInBatch.has(key)) {
                seenInBatch.add(key);
                const labels = genreLabels(candidate.genreIds).map((g) => g.toLowerCase());
                const haystack = `${candidate.title.toLowerCase()} ${labels.join(" ")}`;
                const matchedPref = tastePrefs.find((pref) => pref && haystack.includes(pref));
                freshTmdb.push(
                  matchedPref ? { ...candidate, priorityReason: "Selon votre sensibilité" } : candidate,
                );
              }
            }
            if (mIdx >= moviesList.length && sIdx >= showsList.length && aIdx >= animesList.length) break;
          }

          currentPage += 1;
          if (freshTmdb.length >= 16) break;
        }

        freshTmdb.sort((a, b) => (b.priorityReason ? 1 : 0) - (a.priorityReason ? 1 : 0));

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
    [activeGroupId, formatFilter, friends, isAllFriends, user],
  );

  const checkGroupMatch = useCallback(
    async (targetGroupId: string, title: Title) => {
      if (!targetGroupId) return;
      const lockKey = `group:${targetGroupId}:${title.mediaType}:${title.tmdbId}`;
      if (checkingMatchRef.current.has(lockKey)) return;
      checkingMatchRef.current.add(lockKey);

      try {
        const { data: members, error: memberError } = await supabase
          .from("group_members")
          .select("user_id")
          .eq("group_id", targetGroupId);
        if (memberError) {
          setError(memberError.message);
          return;
        }

        const memberIds = Array.from(new Set((members ?? []).map((row) => row.user_id as string)));
        if (memberIds.length < 2) {
          setProgress("Un accord demande au moins deux membres.");
          return;
        }

        const { data: likes, error: likeError } = await supabase
          .from("swipes")
          .select("user_id")
          .eq("group_id", targetGroupId)
          .eq("tmdb_id", title.tmdbId)
          .eq("media_type", title.mediaType)
          .eq("decision", "validate")
          .in("user_id", memberIds);

        if (likeError) {
          setError(likeError.message);
          return;
        }

        const likedIds = new Set((likes ?? []).map((row) => row.user_id as string));
        const allValidated = memberIds.every((id) => likedIds.has(id));

        if (!allValidated) {
          setProgress(`${likedIds.size}/${memberIds.length} membres ont retenu ce titre`);
          return;
        }

        const { error: matchError } = await supabase.from("matches").insert({
          group_id: targetGroupId,
          tmdb_id: title.tmdbId,
          media_type: title.mediaType,
          title: title.title,
          poster_path: title.posterPath,
        });
        if (matchError && matchError.code !== "23505") {
          setError(matchError.message);
          return;
        }

        setProgress(null);
        reveal({
          tmdbId: title.tmdbId,
          mediaType: title.mediaType,
          title: title.title,
          posterPath: title.posterPath,
          partnerLabel: activeGroupName ? `Cercle · ${activeGroupName}` : "Le cercle",
        });
      } finally {
        checkingMatchRef.current.delete(lockKey);
      }
    },
    [activeGroupName, reveal],
  );

  const checkAllFriendsMatch = useCallback(
    async (title: Title) => {
      if (!user || friends.length === 0) return;
      const lockKey = `friends:${title.mediaType}:${title.tmdbId}`;
      if (checkingMatchRef.current.has(lockKey)) return;
      checkingMatchRef.current.add(lockKey);

      try {
        const friendIds = friends.map((f) => f.id);
        const { data: friendLikes, error: likeError } = await supabase
          .from("swipes")
          .select("user_id")
          .in("user_id", friendIds)
          .eq("tmdb_id", title.tmdbId)
          .eq("media_type", title.mediaType)
          .eq("decision", "validate");

        if (likeError) {
          setError(likeError.message);
          return;
        }

        const matchedFriendIds = Array.from(new Set((friendLikes ?? []).map((r) => r.user_id as string)));
        if (matchedFriendIds.length === 0) return;

        const matchedNames = matchedFriendIds.map((id) => {
          const p = friends.find((f) => f.id === id);
          return p?.username || p?.full_name || "un ami";
        });

        setProgress(null);
        reveal({
          tmdbId: title.tmdbId,
          mediaType: title.mediaType,
          title: title.title,
          posterPath: title.posterPath,
          partnerLabel:
            matchedNames.length === 1
              ? `Match avec ${matchedNames[0]}`
              : `Match avec ${matchedNames.slice(0, 2).join(" & ")}${
                  matchedNames.length > 2 ? ` (+${matchedNames.length - 2})` : ""
                }`,
        });
      } finally {
        checkingMatchRef.current.delete(lockKey);
      }
    },
    [friends, reveal, user],
  );

  useEffect(() => {
    void loadCirclesAndFriends();
    void loadFriendActivity();
  }, [loadCirclesAndFriends, loadFriendActivity]);

  useEffect(() => {
    sessionStart.current = new Date(Date.now() - 10_000).toISOString();
    setProgress(null);
    void loadCards(1, true);
  }, [loadCards]);

  useEffect(() => {
    if (!loading && deckCards.length > 0 && index >= deckCards.length - 5) {
      void loadCards(page, false);
    }
  }, [deckCards.length, index, loadCards, loading, page]);

  useEffect(() => {
    if (!activeGroupId) return;

    const handleSwipeEvent = (payload: { new: unknown }) => {
      const row = payload.new as {
        user_id?: string;
        decision?: string;
        tmdb_id?: number;
        media_type?: "movie" | "tv";
        title?: string;
        poster_path?: string | null;
      };
      if (row.decision !== "validate" || !row.tmdb_id || !row.media_type) return;
      void checkGroupMatch(activeGroupId, {
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
    };

    const channel = supabase
      .channel(`swipes-${activeGroupId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "swipes", filter: `group_id=eq.${activeGroupId}` },
        handleSwipeEvent,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "swipes", filter: `group_id=eq.${activeGroupId}` },
        handleSwipeEvent,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "matches", filter: `group_id=eq.${activeGroupId}` },
        (payload) => {
          const m = payload.new as {
            tmdb_id?: number;
            media_type?: "movie" | "tv";
            title?: string;
            poster_path?: string | null;
          };
          if (!m.tmdb_id || !m.media_type) return;
          setProgress(null);
          reveal({
            tmdbId: m.tmdb_id,
            mediaType: m.media_type,
            title: m.title || "Titre",
            posterPath: m.poster_path ?? null,
            partnerLabel: activeGroupName ? `Cercle · ${activeGroupName}` : "Le cercle",
          });
        },
      )
      .subscribe();

    const timer = window.setInterval(async () => {
      const { data } = await supabase
        .from("matches")
        .select("tmdb_id, media_type, title, poster_path")
        .eq("group_id", activeGroupId)
        .gt("created_at", sessionStart.current)
        .order("created_at", { ascending: false })
        .limit(3);
      for (const row of data ?? []) {
        reveal({
          tmdbId: row.tmdb_id,
          mediaType: row.media_type,
          title: row.title,
          posterPath: row.poster_path,
          partnerLabel: activeGroupName ? `Cercle · ${activeGroupName}` : "Le cercle",
        });
      }
    }, 4000);

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [activeGroupId, activeGroupName, checkGroupMatch, reveal]);

  async function addTitleToWatchlist(title: Title) {
    if (!user) return;
    const key = `${title.mediaType}:${title.tmdbId}`;
    setSavedNotice(null);
    setJustSavedKey(key);
    window.setTimeout(() => {
      setJustSavedKey((curr) => (curr === key ? null : curr));
    }, 1600);

    const { error: listError } = await supabase.from("watch_items").upsert(
      {
        user_id: user.id,
        tmdb_id: title.tmdbId,
        media_type: title.mediaType,
        title: title.title,
        poster_path: title.posterPath,
        year: title.year,
        status: "to_watch",
      },
      { onConflict: "user_id,tmdb_id,media_type", ignoreDuplicates: true },
    );
    if (listError) {
      setError(listError.message);
      return;
    }
    setSavedNotice(`« ${title.title} » ajouté à vos titres à voir.`);
  }

  async function persist(title: Title, decision: "pass" | "validate") {
    if (!user) return;
    const payload = {
      user_id: user.id,
      group_id: activeGroupId || null,
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
    query = activeGroupId ? query.eq("group_id", activeGroupId) : query.is("group_id", null);

    const { data: existing, error: readError } = await query.maybeSingle();
    if (readError) {
      setError(readError.message);
      return;
    }

    const write = existing
      ? await supabase.from("swipes").update({ decision }).eq("id", existing.id)
      : await supabase.from("swipes").insert(payload);

    if (write.error && write.error.code !== "23505") {
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
        if (listError && listError.code !== "23505") setError(listError.message);
      }

      if (activeGroupId) {
        await checkGroupMatch(activeGroupId, title);
      } else if (isAllFriends) {
        await checkAllFriendsMatch(title);
      }
    } else if (activeGroupId) {
      setProgress(null);
    }
  }

  function commit(decision: "pass" | "validate") {
    if (!current || leaving || committingRef.current) return;
    committingRef.current = true;
    setLeaving(decision);
    setDx(decision === "pass" ? -560 : 560);
    const title = current;
    window.setTimeout(() => {
      setIndex((value) => value + 1);
      setDx(0);
      setLeaving(null);
      setProgress(null);
      committingRef.current = false;
    }, 280);
    void persist(title, decision);
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (leaving || committingRef.current) return;
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
      if (inspectTitle || match) return;
      if (event.key === "ArrowLeft") commit("pass");
      if (event.key === "ArrowRight") commit("validate");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const passStrength = leaving === "pass" ? 1 : Math.min(1, Math.max(0, -dx / 120));
  const keepStrength = leaving === "validate" ? 1 : Math.min(1, Math.max(0, dx / 120));

  const formatOptions: { id: FormatFilter; label: string }[] = [
    { id: "auto", label: "Tout" },
    { id: "movie", label: "Films" },
    { id: "tv", label: "Séries" },
    { id: "anime", label: "Animés" },
  ];

  const heroSaved = heroTitle ? justSavedKey === `${heroTitle.mediaType}:${heroTitle.tmdbId}` : false;

  return (
    <div className="space-y-20">
      <section className="editorial-enter space-y-8">
        <div className="flex flex-col justify-between gap-6 border-b border-[#EAE6DE]/12 pb-8 lg:flex-row lg:items-end">
          <div>
            <p className="mc-kicker">I — À la Une</p>
            <h1 className="mt-2 font-serif text-5xl leading-[0.98] tracking-tight text-[#EAE6DE] sm:text-6xl">
              À <span className="italic text-[#C49A58]">l’honneur</span>
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-4">
              {formatOptions.map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setFormatFilter(pill.id)}
                  className={`mc-kicker pb-1 transition ${
                    formatFilter === pill.id
                      ? "border-b border-[#C49A58] text-[#EAE6DE]"
                      : "text-[#EAE6DE]/45 hover:text-[#EAE6DE]/85"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            <select
              aria-label="Périmètre de match"
              value={sessionScope}
              onChange={(event) => setSessionScope(event.target.value)}
            >
              <option value="solo">En solo</option>
              <option value="all_friends">Tous mes amis ({friends.length})</option>
              {groups.map((group) => (
                <option key={group.id} value={`group:${group.id}`}>
                  Cercle · {group.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <ErrorNote message={error} />
          {progress ? <p className="mc-kicker text-[#C49A58]">{progress}</p> : null}
          {savedNotice ? <p className="text-xs text-[#A3B99B]">{savedNotice}</p> : null}
        </div>

        {heroTitle ? (
          <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-12 md:gap-12">
            <div className="md:col-span-5">
              <div className="aspect-[2/3] w-full overflow-hidden bg-[#202224]">
                <Poster
                  path={heroTitle.posterPath}
                  alt={heroTitle.title}
                  className="frame-zoom-in h-full w-full transition-transform duration-700 ease-out hover:scale-105"
                />
              </div>
            </div>

            <div className="space-y-5 md:col-span-7">
              <p className="mc-kicker text-[#A3B99B]">
                {heroTitle.priorityReason || "À l’honneur"}
              </p>
              <p className="mc-kicker text-[#EAE6DE]/50">
                {formatLabel(heroTitle)}
                {heroTitle.year ? ` · ${heroTitle.year}` : ""}
                {heroTitle.voteAverage && heroTitle.voteAverage > 0
                  ? ` · ${heroTitle.voteAverage.toFixed(1)}/10`
                  : ""}
              </p>
              <h2 className="font-serif text-4xl leading-[1.02] tracking-tight text-[#EAE6DE] sm:text-6xl">
                {heroTitle.title}
              </h2>
              {heroTitle.genreIds.length > 0 ? (
                <p className="text-xs tracking-wide text-[#C49A58]">
                  {genreLabels(heroTitle.genreIds).join("  /  ")}
                </p>
              ) : null}
              {heroTitle.overview ? (
                <p className="line-clamp-4 text-sm leading-relaxed text-[#EAE6DE]/75">
                  {heroTitle.overview}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-6 border-t border-[#EAE6DE]/12 pt-5">
                <button
                  type="button"
                  onClick={() => setInspectTitle(heroTitle)}
                  className="inline-flex items-center gap-2 bg-[#C49A58] px-5 py-2.5 text-xs font-semibold text-[#101112] transition hover:bg-[#d2aa6a]"
                >
                  <span className="mc-kicker text-[#101112]">Lire la fiche</span>
                  <ArrowUpRight size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => void addTitleToWatchlist(heroTitle)}
                  className={`inline-flex items-center gap-2 border-b pb-1 text-xs transition ${
                    heroSaved
                      ? "scale-105 border-[#A3B99B] text-[#A3B99B]"
                      : "border-[#EAE6DE]/35 text-[#EAE6DE]/85 hover:border-[#C49A58] hover:text-[#C49A58]"
                  }`}
                >
                  {heroSaved ? <Check size={13} className="animate-bounce" /> : <Bookmark size={13} />}
                  <span className="mc-kicker text-inherit">
                    {heroSaved ? "Mis de côté" : "Mettre de côté"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="border-t border-[#EAE6DE]/12 pt-12">
        <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <p className="mc-kicker">Décision rapide</p>
            <h2 className="mt-1 font-serif text-3xl text-[#EAE6DE] sm:text-4xl">
              Retenir ou <span className="italic text-[#A3B99B]">laisser passer</span>
            </h2>
          </div>
          <p className="mc-kicker text-[10px] text-[#EAE6DE]/45">
            Glissez ou cliquez · Flèches ← / →
          </p>
        </div>

        <div className="flex flex-col items-center">
          <div className="relative aspect-[2/3] w-[280px] max-w-full sm:w-[300px]">
            {upcoming ? (
              <div className="absolute inset-0 translate-x-2.5 translate-y-2 overflow-hidden bg-[#202224] opacity-25">
                <Poster path={upcoming.posterPath} alt="" className="h-full w-full" />
              </div>
            ) : null}

            {current ? (
              <div
                className="relative h-full w-full cursor-grab overflow-hidden bg-[#202224] active:cursor-grabbing"
                style={{
                  transform: `translateX(${dx}px) rotate(${dx / 20}deg)`,
                  transition: dragging ? "none" : "transform 0.28s ease",
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <Poster
                  path={current.posterPath}
                  alt={current.title}
                  className="h-full w-full transition-transform duration-700"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#101112] via-[#101112]/65 to-transparent" />

                <div className="absolute inset-x-3.5 top-3.5 flex items-center justify-between gap-2">
                  {current.priorityReason ? (
                    <span className="mc-kicker bg-[#101112]/85 px-2.5 py-1 text-[9px] text-[#C49A58]">
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
                    className="inline-flex items-center gap-1 bg-[#101112]/85 px-2.5 py-1 text-[11px] text-[#EAE6DE] transition hover:text-[#C49A58]"
                  >
                    <Info size={12} />
                    <span>Fiche</span>
                  </button>
                </div>

                <div className="absolute inset-x-4 bottom-4">
                  <p className="mc-kicker text-[9px] text-[#EAE6DE]/60">
                    {formatLabel(current)}
                    {current.year ? ` · ${current.year}` : ""}
                  </p>
                  <h3 className="mt-1 font-serif text-2xl leading-tight text-[#EAE6DE]">
                    {current.title}
                  </h3>
                </div>

                {passStrength > 0.05 ? (
                  <span
                    className={`mc-kicker absolute left-4 top-14 border border-[#e06c60] bg-[#101112]/85 px-3 py-1 text-xs text-[#e06c60] ${
                      leaving === "pass" ? "stamp-in" : ""
                    }`}
                    style={{ opacity: passStrength }}
                  >
                    Passer
                  </span>
                ) : null}
                {keepStrength > 0.05 ? (
                  <span
                    className={`mc-kicker absolute right-4 top-14 border border-[#5ab68c] bg-[#101112]/85 px-3 py-1 text-xs text-[#5ab68c] ${
                      leaving === "validate" ? "stamp-in" : ""
                    }`}
                    style={{ opacity: keepStrength }}
                  >
                    Retenir
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 border-y border-[#EAE6DE]/15 px-6 text-center text-sm text-[#EAE6DE]/65">
                <p>{loading ? "Préparation des titres…" : "Sélection parcourue."}</p>
                {!loading ? (
                  <button
                    type="button"
                    onClick={() => void loadCards(page, false)}
                    className="mc-kicker inline-flex items-center gap-2 border border-[#EAE6DE]/25 px-4 py-2 text-[#EAE6DE] hover:border-[#C49A58]"
                  >
                    <RefreshCw size={12} />
                    <span>Suite</span>
                  </button>
                ) : null}
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center gap-8">
            <button
              type="button"
              aria-label="Passer"
              disabled={!current || Boolean(leaving)}
              onClick={() => commit("pass")}
              className="flex h-13 w-13 items-center justify-center rounded-full border border-[#e06c60] bg-[#e06c60]/15 text-[#e06c60] transition hover:bg-[#e06c60] hover:text-[#101112] disabled:opacity-35"
            >
              <X size={20} />
            </button>
            <button
              type="button"
              aria-label="Valider"
              disabled={!current || Boolean(leaving)}
              onClick={() => commit("validate")}
              className="flex h-13 w-13 items-center justify-center rounded-full border border-[#5ab68c] bg-[#5ab68c]/15 text-[#5ab68c] transition hover:bg-[#5ab68c] hover:text-[#101112] disabled:opacity-35"
            >
              <Check size={20} />
            </button>
          </div>
        </div>
      </section>

      {sidePair.length === 2 ? (
        <section className="border-t border-[#EAE6DE]/12 pt-16">
          <div className="mb-8 flex items-baseline justify-between">
            <div>
              <p className="mc-kicker">En contrechamp</p>
              <h2 className="mt-1 font-serif text-3xl text-[#EAE6DE]">Deux pistes en regard</h2>
            </div>
            <Link
              href="/catalogue"
              className="mc-kicker inline-flex items-center gap-1.5 text-[#EAE6DE]/70 hover:text-[#C49A58]"
            >
              <span>Cinémathèque</span>
              <ArrowRight size={12} />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            {sidePair.map((item) => (
              <article key={`${item.mediaType}-${item.tmdbId}`} className="group space-y-3">
                <button
                  type="button"
                  onClick={() => setInspectTitle(item)}
                  className="block aspect-[2/3] w-full overflow-hidden bg-[#202224] text-left focus:outline-none"
                >
                  <Poster
                    path={item.posterPath}
                    alt={item.title}
                    className="h-full w-full transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                </button>
                <p className="mc-kicker text-[10px] text-[#EAE6DE]/50">
                  {formatLabel(item)}
                  {item.year ? ` · ${item.year}` : ""}
                </p>
                <h3 className="font-serif text-2xl leading-snug text-[#EAE6DE] transition group-hover:text-[#C49A58]">
                  {item.title}
                </h3>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {horizontalReel.length > 0 ? (
        <section className="border-t border-[#EAE6DE]/12 pt-16">
          <div className="mb-8">
            <p className="mc-kicker">À découvrir</p>
            <h2 className="mt-1 font-serif text-3xl text-[#EAE6DE]">
              Pellicule &amp; <span className="italic text-[#C49A58]">variations</span>
            </h2>
          </div>

          <div className="flex gap-6 overflow-x-auto pb-4">
            {horizontalReel.map((item) => (
              <article key={`${item.mediaType}-${item.tmdbId}`} className="group w-48 shrink-0 space-y-2.5 sm:w-52">
                <button
                  type="button"
                  onClick={() => setInspectTitle(item)}
                  className="block aspect-[2/3] w-full overflow-hidden bg-[#202224] text-left focus:outline-none"
                >
                  <Poster
                    path={item.posterPath}
                    alt={item.title}
                    className="h-full w-full transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                </button>
                <div className="border-b border-[#EAE6DE]/10 pb-2">
                  <p className="mc-kicker text-[9px] text-[#EAE6DE]/50">
                    {formatLabel(item)}
                    {item.year ? ` · ${item.year}` : ""}
                  </p>
                  <h3 className="mt-1 line-clamp-1 font-serif text-lg text-[#EAE6DE] transition group-hover:text-[#C49A58]">
                    {item.title}
                  </h3>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activity.length > 0 ? (
        <section className="border-t border-[#EAE6DE]/12 pt-16">
          <p className="mc-kicker">Chronique du cercle</p>
          <h2 className="mt-1 font-serif text-3xl text-[#EAE6DE]">Notes &amp; passages</h2>

          <div className="mt-6 divide-y divide-[#EAE6DE]/10 border-t border-[#EAE6DE]/10">
            {activity.map((item) => {
              const friendName = item.profile?.username || item.profile?.full_name || "Un ami";
              return (
                <div key={item.id} className="flex items-start gap-4 py-5">
                  <Link href={`/membre/${item.userId}`} className="mt-1 shrink-0 hover:opacity-80">
                    <Avatar name={friendName} url={item.profile?.avatar_url} size={32} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed text-[#EAE6DE]/80">
                      <Link
                        href={`/membre/${item.userId}`}
                        className="font-semibold text-[#EAE6DE] hover:text-[#C49A58]"
                      >
                        {friendName}
                      </Link>{" "}
                      <span className="text-[#EAE6DE]/55">{item.actionText}</span>{" "}
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
                        className="font-serif text-xl text-[#EAE6DE] underline-offset-4 hover:text-[#C49A58] hover:underline"
                      >
                        {item.title}
                      </button>
                      {item.rating !== null && item.rating > 0 ? (
                        <span className="mc-kicker ml-3 text-[10px] text-[#C49A58]">
                          {item.rating}/5
                        </span>
                      ) : null}
                    </p>
                    {item.comment ? (
                      <p className="mt-2 border-l border-[#A3B99B]/60 pl-4 font-serif text-lg italic text-[#EAE6DE]/70">
                        « {item.comment} »
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {match ? (
        <div
          key={matchBurstKey}
          className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-[#101112]/90 p-6 backdrop-blur-md"
        >
          <div
            className="pointer-events-none absolute h-96 w-96 rounded-full opacity-25 blur-3xl animate-pulse"
            style={{
              background:
                "radial-gradient(circle, rgba(196,154,88,0.85) 0%, rgba(163,185,155,0.45) 55%, transparent 75%)",
            }}
          />

          <div className="editorial-enter relative w-full max-w-md border border-[#C49A58]/45 bg-[#202224] p-8 text-center shadow-2xl">
            <p className="mc-kicker animate-bounce text-[#C49A58]">
              {match.partnerLabel || "Accord validé"}
            </p>
            <h2 className="mt-2 font-serif text-4xl text-[#EAE6DE] sm:text-5xl">
              C’est un <span className="italic text-[#A3B99B]">match</span>
            </h2>
            <div className="mx-auto mt-6 aspect-[2/3] w-44 overflow-hidden border border-[#C49A58]/50 bg-[#101112] shadow-lg ring-4 ring-[#C49A58]/15">
              <Poster
                path={match.posterPath}
                alt={match.title}
                className="frame-zoom-in h-full w-full"
              />
            </div>
            <p className="mt-5 font-serif text-2xl text-[#EAE6DE]">{match.title}</p>
            <p className="mt-1.5 text-xs text-[#EAE6DE]/65">
              La séance est validée : vous avez retenu le même titre.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/groupes"
                onClick={() => setMatch(null)}
                className="mc-kicker border border-[#EAE6DE]/25 px-4 py-2.5 text-[#EAE6DE] transition hover:border-[#C49A58] hover:text-[#C49A58]"
              >
                Ouvrir le cercle
              </Link>
              <button
                type="button"
                className="mc-kicker bg-[#C49A58] px-5 py-2.5 font-semibold text-[#101112] transition hover:bg-[#d2aa6a]"
                onClick={() => setMatch(null)}
              >
                Continuer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <TitleDetailModal title={inspectTitle} onClose={() => setInspectTitle(null)} />
    </div>
  );
}