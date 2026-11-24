"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Search, Shuffle } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { TitleDetailModal } from "@/components/title-detail-modal";
import { ErrorNote, Modal, PageHeader, Poster, buttonClass, ghostClass, inputClass } from "@/components/ui";
import { DECADES, GENRES, formatLabel, genreLabels, inDecade, mapTmdb, tmdb } from "@/lib/tmdb";
import { supabase } from "@/lib/supabase";
import type { Group, Profile, Title } from "@/lib/types";

type Format = "all" | "movie" | "tv" | "anime";
type SortBy = "shuffle" | "popularity" | "rating_desc" | "alpha_asc" | "alpha_desc" | "year_desc" | "year_asc" | "short_first";

function seededScore(seed: number, key: string) {
  let hash = seed * 2654435761;
  for (let i = 0; i < key.length; i += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 2246822519);
  }
  return (hash >>> 0) / 4294967295;
}

export function CatalogueView() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [shuffleSeed, setShuffleSeed] = useState<number>(() => Math.floor(Math.random() * 1_000_000) + 1);

  const [format, setFormat] = useState<Format>("all");
  const [genre, setGenre] = useState<number | null>(null);
  const [decade, setDecade] = useState("all");
  const [sortBy, setSortBy] = useState<SortBy>("shuffle");
  const [hideInLists, setHideInLists] = useState(false);
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
  const [tastePrefs, setTastePrefs] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<Title[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [recommend, setRecommend] = useState<Title | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<Title | null>(null);

  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(`matchcut_taste_prefs_${user.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setTastePrefs(parsed.map((item) => String(item).toLowerCase()));
        }
      }
    } catch {
      // ignore malformed local storage
    }

    void (async () => {
      const { data } = await supabase
        .from("watch_items")
        .select("tmdb_id, media_type")
        .eq("user_id", user.id);
      if (data) {
        setExistingKeys(new Set(data.map((row) => `${row.media_type}:${row.tmdb_id}`)));
      }
    })();
  }, [user]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void search(1, true);
    }, 280);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, format, genre, decade, sortBy, shuffleSeed]);

  const formats: { id: Format; label: string }[] = [
    { id: "all", label: "Tout" },
    { id: "movie", label: "Films" },
    { id: "tv", label: "Séries" },
    { id: "anime", label: "Animés" },
  ];

  const hasActiveFilters =
    query.trim().length > 0 ||
    format !== "all" ||
    genre !== null ||
    decade !== "all" ||
    sortBy !== "shuffle" ||
    hideInLists;

  function resetFilters() {
    setQuery("");
    setFormat("all");
    setGenre(null);
    setDecade("all");
    setSortBy("shuffle");
    setHideInLists(false);
    setNotice(null);
    setShuffleSeed(Math.floor(Math.random() * 1_000_000) + 1);
  }

  function triggerFreshShuffle() {
    setSortBy("shuffle");
    setShuffleSeed(Math.floor(Math.random() * 1_000_000) + 1);
  }

  async function search(nextPage: number, replace: boolean) {
    setLoading(true);
    setError(null);
    try {
      const genreIds = [genre, format === "anime" ? 16 : null].filter((value): value is number => value !== null);
      const tmdbSort =
        sortBy === "rating_desc"
          ? "vote_average.desc"
          : sortBy === "year_desc"
          ? "primary_release_date.desc"
          : sortBy === "year_asc"
          ? "primary_release_date.asc"
          : "popularity.desc";

      const effectivePage =
        replace && sortBy === "shuffle" && !query.trim() && nextPage === 1
          ? ((shuffleSeed % 4) + 1)
          : nextPage;

      const base: Record<string, string> = { page: String(effectivePage), sort_by: tmdbSort };
      if (sortBy === "rating_desc") base["vote_count.gte"] = "250";
      if (genreIds.length) base.with_genres = genreIds.join(",");
      if (format === "anime") base.with_original_language = "ja";

      const term = query.trim();
      let raw: Awaited<ReturnType<typeof tmdb>> = [];

      if (term) {
        const path = format === "movie" ? "search/movie" : format === "tv" || format === "anime" ? "search/tv" : "search/multi";
        raw = await tmdb(path, { query: term, page: String(nextPage) });
        if (format === "anime") {
          const films = await tmdb("search/movie", { query: term, page: String(nextPage) });
          raw = [...raw, ...films];
        }
      } else if (format === "movie") {
        raw = await tmdb("discover/movie", { ...base, ...dateParams("movie", decade) });
      } else if (format === "tv") {
        const tvSort =
          tmdbSort === "primary_release_date.desc"
            ? "first_air_date.desc"
            : tmdbSort === "primary_release_date.asc"
            ? "first_air_date.asc"
            : tmdbSort;
        raw = await tmdb("discover/tv", { ...base, sort_by: tvSort, ...dateParams("tv", decade) });
      } else {
        const tvSort =
          tmdbSort === "primary_release_date.desc"
            ? "first_air_date.desc"
            : tmdbSort === "primary_release_date.asc"
            ? "first_air_date.asc"
            : tmdbSort;
        const [movies, shows] = await Promise.all([
          tmdb("discover/movie", { ...base, ...dateParams("movie", decade) }),
          tmdb("discover/tv", { ...base, sort_by: tvSort, ...dateParams("tv", decade) }),
        ]);
        raw = [...movies.map((item) => ({ ...item, media_type: "movie" })), ...shows.map((item) => ({ ...item, media_type: "tv" }))];
      }

      const mapped = raw
        .map((item) => mapTmdb(item))
        .filter((item): item is Title => Boolean(item))
        .filter((item) => (format === "movie" ? item.mediaType === "movie" && !item.anime : true))
        .filter((item) => (format === "tv" ? item.mediaType === "tv" : true))
        .filter((item) => (format === "anime" ? item.anime || (item.genreIds.includes(16) && item.language === "ja") : true))
        .filter((item) => (genre ? item.genreIds.includes(genre) : true))
        .filter((item) => inDecade(item.year, decade));

      const unique = new Map<string, Title>();
      mapped.forEach((item) => unique.set(`${item.mediaType}:${item.tmdbId}`, item));
      const list = [...unique.values()];
      setResults((prev) => (replace ? list : dedupe([...prev, ...list])));
      setPage(nextPage);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Recherche impossible.");
    } finally {
      setLoading(false);
    }
  }

  const filteredAndSortedResults = useMemo(() => {
    const filtered = hideInLists
      ? results.filter((item) => {
          const key = `${item.mediaType}:${item.tmdbId}`;
          return !existingKeys.has(key) && !saved.has(key);
        })
      : results;

    const copy = [...filtered];
    switch (sortBy) {
      case "rating_desc":
        return copy.sort((a, b) => (b.voteAverage ?? 0) - (a.voteAverage ?? 0));
      case "alpha_asc":
        return copy.sort((a, b) => a.title.localeCompare(b.title, "fr"));
      case "alpha_desc":
        return copy.sort((a, b) => b.title.localeCompare(a.title, "fr"));
      case "year_desc":
        return copy.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
      case "year_asc":
        return copy.sort((a, b) => Number(a.year || 9999) - Number(b.year || 9999));
      case "short_first":
        return copy.sort((a, b) => (a.mediaType === b.mediaType ? 0 : a.mediaType === "movie" ? -1 : 1));
      case "popularity":
        return copy.sort((a, b) => b.popularity - a.popularity);
      case "shuffle":
      default: {
        return copy.sort((a, b) => {
          const keyA = `${a.mediaType}:${a.tmdbId}`;
          const keyB = `${b.mediaType}:${b.tmdbId}`;
          let scoreA = seededScore(shuffleSeed, keyA);
          let scoreB = seededScore(shuffleSeed, keyB);
          if (tastePrefs.length > 0 && !query.trim() && genre === null) {
            const hayA = `${a.title.toLowerCase()} ${genreLabels(a.genreIds).join(" ").toLowerCase()}`;
            const hayB = `${b.title.toLowerCase()} ${genreLabels(b.genreIds).join(" ").toLowerCase()}`;
            if (tastePrefs.some((pref) => hayA.includes(pref.split(" (")[0]))) scoreA += 0.25;
            if (tastePrefs.some((pref) => hayB.includes(pref.split(" (")[0]))) scoreB += 0.25;
          }
          return scoreB - scoreA;
        });
      }
    }
  }, [results, hideInLists, existingKeys, saved, sortBy, shuffleSeed, tastePrefs, query, genre]);

  async function addToList(title: Title) {
    if (!user) return;
    setNotice(null);
    const key = `${title.mediaType}:${title.tmdbId}`;
    const { error: writeError } = await supabase.from("watch_items").upsert(
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
    if (writeError) {
      setError(writeError.message);
      return;
    }
    setSaved((prev) => new Set(prev).add(key));
    setExistingKeys((prev) => new Set(prev).add(key));
    setNotice(`${title.title} a été ajouté à votre liste.`);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          kicker="Recherche"
          title="Catalogue"
          text="Cliquez sur un film, une série ou un animé pour voir sa durée, son réalisateur, son casting et les avis de vos amis."
        />
        <button
          type="button"
          onClick={triggerFreshShuffle}
          className="mb-6 inline-flex items-center gap-2 rounded-2xl border border-amber-300/35 bg-amber-300/10 px-4 py-2 text-xs font-semibold text-amber-200 transition hover:border-amber-300/60"
        >
          <Shuffle size={14} />
          Mélanger la sélection
        </button>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            className={`${inputClass} pl-10`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un titre"
            aria-label="Rechercher un titre"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {formats.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFormat(item.id)}
              className={`rounded-xl px-3.5 py-1.5 text-sm transition ${
                format === item.id
                  ? "bg-[#f4f1ea] font-medium text-[#09090b]"
                  : "border border-white/15 text-zinc-300 hover:border-white/30"
              }`}
            >
              {item.label}
            </button>
          ))}
          <select
            className="rounded-xl border border-white/15 bg-[#09090b] px-3 py-1.5 text-sm text-zinc-200"
            value={decade}
            onChange={(event) => setDecade(event.target.value)}
            aria-label="Décennie"
          >
            <option value="all">Toutes les années</option>
            {DECADES.map((value) => (
              <option key={value} value={value}>
                {value}s
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-white/15 bg-[#09090b] px-3 py-1.5 text-sm text-zinc-200"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortBy)}
            aria-label="Trier par"
          >
            <option value="shuffle">Trier : Aléatoire</option>
            <option value="popularity">Trier : Popularité</option>
            <option value="rating_desc">Trier : Mieux notés</option>
            <option value="alpha_asc">Trier : Alphabétique (A → Z)</option>
            <option value="alpha_desc">Trier : Alphabétique (Z → A)</option>
            <option value="year_desc">Trier : Plus récents</option>
            <option value="year_asc">Trier : Plus anciens</option>
            <option value="short_first">Trier : Films courts avant séries</option>
          </select>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/12 bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 hover:border-white/25">
            <input
              type="checkbox"
              checked={hideInLists}
              onChange={(event) => setHideInLists(event.target.checked)}
              className="accent-amber-400"
            />
            Masquer ceux déjà dans mes listes
          </label>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className={`${ghostClass} inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs`}
            >
              <RotateCcw size={13} />
              Réinitialiser
            </button>
          ) : null}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setGenre(null)}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-sm transition ${
              genre === null ? "bg-white/12 font-medium text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Tous les genres
          </button>
          {GENRES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setGenre(item.id === genre ? null : item.id)}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-sm transition ${
                genre === item.id ? "bg-white/12 font-medium text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
        <div className="space-y-2">
          <ErrorNote message={error} />
          {notice ? <p className="text-sm text-emerald-400">{notice}</p> : null}
        </div>
        {!loading && filteredAndSortedResults.length > 0 ? (
          <span>
            {filteredAndSortedResults.length} titre{filteredAndSortedResults.length > 1 ? "s" : ""} affiché
            {filteredAndSortedResults.length > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {filteredAndSortedResults.map((title) => {
          const key = `${title.mediaType}:${title.tmdbId}`;
          const isSaved = saved.has(key) || existingKeys.has(key);
          return (
            <article key={key} className="flex flex-col">
              <button
                type="button"
                onClick={() => setSelectedTitle(title)}
                className="group text-left focus:outline-none"
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-white/10 bg-zinc-950 transition group-hover:border-white/40">
                  <Poster path={title.posterPath} alt={title.title} className="h-full w-full transition duration-300 group-hover:scale-105" />
                  {title.voteAverage && title.voteAverage > 0 ? (
                    <span className="absolute right-2 top-2 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-medium text-[#f4f1ea]">
                      ★ {title.voteAverage.toFixed(1)}
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-3 font-serif text-xl leading-tight text-[#f4f1ea] group-hover:underline">{title.title}</h2>
              </button>
              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-500">
                {formatLabel(title)}
                {title.year ? ` · ${title.year}` : ""}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{genreLabels(title.genreIds).join(" · ")}</p>
              <div className="mt-3 flex gap-2">
                <button type="button" className={`${ghostClass} flex-1 px-2 py-2 text-xs`} onClick={() => void addToList(title)}>
                  {isSaved ? "Dans la liste" : "Ajouter"}
                </button>
                <button type="button" className={`${ghostClass} flex-1 px-2 py-2 text-xs`} onClick={() => setRecommend(title)}>
                  Recommander
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {!loading && filteredAndSortedResults.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
          <p className="text-sm text-zinc-400">Aucun titre pour ces filtres.</p>
          {hasActiveFilters ? (
            <button type="button" onClick={resetFilters} className={`${ghostClass} mt-3 inline-flex items-center gap-1.5 text-xs`}>
              <RotateCcw size={13} />
              Réinitialiser les filtres
            </button>
          ) : null}
        </div>
      ) : null}

      {results.length > 0 ? (
        <button type="button" className={`${buttonClass} mt-8`} disabled={loading} onClick={() => void search(page + 1, false)}>
          {loading ? "Recherche…" : "Plus de titres"}
        </button>
      ) : loading ? (
        <p className="mt-8 text-sm text-zinc-500">Recherche en cours…</p>
      ) : null}

      <TitleDetailModal
        title={selectedTitle}
        onClose={() => setSelectedTitle(null)}
        onAddToList={(t) => {
          void addToList(t);
          setSelectedTitle(null);
        }}
        onRecommend={(t) => {
          setSelectedTitle(null);
          setRecommend(t);
        }}
      />

      <RecommendDialog title={recommend} onClose={() => setRecommend(null)} onDone={(message) => setNotice(message)} onError={setError} />
    </div>
  );
}

function dedupe(list: Title[]) {
  const unique = new Map<string, Title>();
  list.forEach((item) => unique.set(`${item.mediaType}:${item.tmdbId}`, item));
  return [...unique.values()];
}

function dateParams(kind: "movie" | "tv", decade: string): Record<string, string> {
  if (decade === "all") return {};
  const start = Number(decade);
  const gte = `${start}-01-01`;
  const lte = `${start + 9}-12-31`;
  return kind === "movie"
    ? { "primary_release_date.gte": gte, "primary_release_date.lte": lte }
    : { "first_air_date.gte": gte, "first_air_date.lte": lte };
}

function RecommendDialog({
  title,
  onClose,
  onDone,
  onError,
}: {
  title: Title | null;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!title || !user) return;
    setTarget("");
    setNote("");
    void (async () => {
      const { data: links } = await supabase
        .from("friendships")
        .select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
      const ids = (links ?? []).map((row) => (row.requester_id === user.id ? row.addressee_id : row.requester_id));
      if (ids.length) {
        const { data } = await supabase.from("profiles").select("*").in("id", ids);
        setFriends((data as Profile[]) ?? []);
      } else setFriends([]);
      const { data: memberships } = await supabase.from("group_members").select("group_id").eq("user_id", user.id);
      const groupIds = (memberships ?? []).map((row) => row.group_id as string);
      if (groupIds.length) {
        const { data } = await supabase.from("groups").select("*").in("id", groupIds);
        setGroups((data as Group[]) ?? []);
      } else setGroups([]);
    })();
  }, [title, user]);

  const options = useMemo(
    () => [
      ...friends.map((friend) => ({ id: `user:${friend.id}`, label: friend.username || friend.full_name || "Ami" })),
      ...groups.map((group) => ({ id: `group:${group.id}`, label: `Groupe · ${group.name}` })),
    ],
    [friends, groups],
  );

  async function send() {
    if (!user || !title || !target) return;
    setBusy(true);
    const [kind, id] = target.split(":");
    const { error } = await supabase.from("recommendations").insert({
      from_user_id: user.id,
      to_user_id: kind === "user" ? id : null,
      to_group_id: kind === "group" ? id : null,
      tmdb_id: title.tmdbId,
      media_type: title.mediaType,
      title: title.title,
      poster_path: title.posterPath,
      year: title.year,
      note: note.trim() || null,
    });
    setBusy(false);
    if (error) {
      onError(error.message);
      return;
    }
    onDone(`${title.title} a été recommandé.`);
    onClose();
  }

  return (
    <Modal open={Boolean(title)} title="Recommander" onClose={onClose}>
      <p className="text-sm text-zinc-400">{title?.title}</p>
      <label className="mt-4 block text-sm text-zinc-300">
        Destinataire
        <select className={`${inputClass} mt-2`} value={target} onChange={(event) => setTarget(event.target.value)}>
          <option value="">Choisir un ami ou un groupe</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-4 block text-sm text-zinc-300">
        Mot d’accompagnement
        <textarea className={`${inputClass} mt-2 min-h-24`} value={note} onChange={(event) => setNote(event.target.value)} maxLength={280} />
      </label>
      {options.length === 0 ? <p className="mt-3 text-sm text-zinc-500">Ajoutez d’abord un ami ou un groupe.</p> : null}
      <button type="button" className={`${buttonClass} mt-5`} disabled={!target || busy} onClick={send}>
        Envoyer
      </button>
    </Modal>
  );
}