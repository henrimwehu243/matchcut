"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  Check,
  Eye,
  RotateCcw,
  Search,
  Send,
  Shuffle,
  SlidersHorizontal,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { TitleDetailModal } from "@/components/title-detail-modal";
import { ErrorNote, Modal, Poster, buttonClass, ghostClass, inputClass } from "@/components/ui";
import { DECADES, GENRES, formatLabel, genreLabels, inDecade, mapTmdb, tmdb } from "@/lib/tmdb";
import { supabase } from "@/lib/supabase";
import type { Group, Profile, Title } from "@/lib/types";

type Format = "all" | "movie" | "tv" | "anime";
type SortBy =
  | "shuffle"
  | "popularity"
  | "rating_desc"
  | "alpha_asc"
  | "alpha_desc"
  | "year_desc"
  | "year_asc"
  | "short_first";
type WatchStatus = "to_watch" | "watched";

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
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [format, setFormat] = useState<Format>("all");
  const [genre, setGenre] = useState<number | null>(null);
  const [decade, setDecade] = useState("all");
  const [sortBy, setSortBy] = useState<SortBy>("shuffle");
  const [hideInLists, setHideInLists] = useState(false);
  const [watchStatuses, setWatchStatuses] = useState<Record<string, WatchStatus>>({});
  const [tastePrefs, setTastePrefs] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<Title[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
        .select("tmdb_id, media_type, status")
        .eq("user_id", user.id);
      if (data) {
        const map: Record<string, WatchStatus> = {};
        data.forEach((row) => {
          const k = `${row.media_type}:${row.tmdb_id}`;
          map[k] = row.status === "watched" ? "watched" : "to_watch";
        });
        setWatchStatuses(map);
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

  const activeFilterCount =
    (format !== "all" ? 1 : 0) +
    (genre !== null ? 1 : 0) +
    (decade !== "all" ? 1 : 0) +
    (sortBy !== "shuffle" ? 1 : 0) +
    (hideInLists ? 1 : 0);

  const hasActiveFilters = query.trim().length > 0 || activeFilterCount > 0;

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
      const genreIds = [genre, format === "anime" ? 16 : null].filter(
        (value): value is number => value !== null,
      );
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
        const path =
          format === "movie"
            ? "search/movie"
            : format === "tv" || format === "anime"
            ? "search/tv"
            : "search/multi";
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
        raw = [
          ...movies.map((item) => ({ ...item, media_type: "movie" })),
          ...shows.map((item) => ({ ...item, media_type: "tv" })),
        ];
      }

      const mapped = raw
        .map((item) => mapTmdb(item))
        .filter((item): item is Title => Boolean(item))
        .filter((item) => (format === "movie" ? item.mediaType === "movie" && !item.anime : true))
        .filter((item) => (format === "tv" ? item.mediaType === "tv" : true))
        .filter((item) =>
          format === "anime" ? item.anime || (item.genreIds.includes(16) && item.language === "ja") : true,
        )
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
          return !watchStatuses[key];
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
  }, [results, hideInLists, watchStatuses, sortBy, shuffleSeed, tastePrefs, query, genre]);

  async function setWatchStatus(title: Title, status: WatchStatus) {
    if (!user) return;
    setNotice(null);
    const key = `${title.mediaType}:${title.tmdbId}`;
    const currentStatus = watchStatuses[key];

    if (currentStatus === status) {
      const { error: deleteError } = await supabase
        .from("watch_items")
        .delete()
        .eq("user_id", user.id)
        .eq("tmdb_id", title.tmdbId)
        .eq("media_type", title.mediaType);

      if (deleteError) {
        setError(deleteError.message);
        return;
      }

      setWatchStatuses((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setNotice(`${title.title} retiré des collections.`);
      return;
    }

    const { error: writeError } = await supabase.from("watch_items").upsert(
      {
        user_id: user.id,
        tmdb_id: title.tmdbId,
        media_type: title.mediaType,
        title: title.title,
        poster_path: title.posterPath,
        year: title.year,
        status,
      },
      { onConflict: "user_id,tmdb_id,media_type" },
    );

    if (writeError) {
      setError(writeError.message);
      return;
    }

    setWatchStatuses((prev) => ({ ...prev, [key]: status }));
    setNotice(
      status === "watched"
        ? `${title.title} marqué comme déjà vu.`
        : `${title.title} ajouté à « À voir ».`,
    );
  }

  return (
    <div className="space-y-16">
      <div className="border-b border-[#EAE6DE]/12 pb-10">
        <p className="mc-kicker">II — Cinémathèque</p>
        <div className="mt-3 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <h1 className="font-serif text-5xl leading-[0.98] tracking-tight text-[#EAE6DE] sm:text-6xl">
            Les <span className="italic text-[#C49A58]">affiches</span> du répertoire
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-[#EAE6DE]/65">
            Films, séries et animés en accès continu. Classez en un clic ce que vous voulez voir ou avez déjà vu.
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-[#EAE6DE]/45"
            />
            <input
              className={`${inputClass} rounded-none border-x-0 border-t-0 border-b border-[#EAE6DE]/20 bg-transparent py-2.5 pl-7 pr-4 text-sm text-[#EAE6DE] placeholder:text-[#EAE6DE]/35 focus:border-[#C49A58] focus:outline-none`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un titre…"
              aria-label="Rechercher un titre"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-4">
              {formats.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFormat(item.id)}
                  className={`mc-kicker pb-1 transition ${
                    format === item.id
                      ? "border-b border-[#C49A58] text-[#EAE6DE]"
                      : "text-[#EAE6DE]/45 hover:text-[#EAE6DE]/85"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setFiltersOpen((prev) => !prev)}
              className="mc-kicker inline-flex items-center gap-2 border-l border-[#EAE6DE]/15 pl-4 text-[#EAE6DE]/80 transition hover:text-[#C49A58]"
            >
              <SlidersHorizontal size={13} className="text-[#C49A58]" />
              <span>Filtres{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</span>
            </button>

            <button
              type="button"
              onClick={triggerFreshShuffle}
              className="mc-kicker inline-flex items-center gap-1.5 text-[#A3B99B] transition hover:text-[#EAE6DE]"
            >
              <Shuffle size={13} />
              <span>Renouveler</span>
            </button>
          </div>
        </div>

        {filtersOpen ? (
          <div className="editorial-enter mt-8 space-y-5 border-t border-[#EAE6DE]/10 pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <select
                value={decade}
                onChange={(event) => setDecade(event.target.value)}
                aria-label="Décennie"
              >
                <option value="all">Toutes les décennies</option>
                {DECADES.map((value) => (
                  <option key={value} value={value}>
                    Années {value}
                  </option>
                ))}
              </select>

              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortBy)}
                aria-label="Trier par"
              >
                <option value="shuffle">Sélection variée</option>
                <option value="popularity">Popularité</option>
                <option value="rating_desc">Mieux notés</option>
                <option value="alpha_asc">Titre (A → Z)</option>
                <option value="alpha_desc">Titre (Z → A)</option>
                <option value="year_desc">Plus récents</option>
                <option value="year_asc">Plus anciens</option>
                <option value="short_first">Films avant séries</option>
              </select>

              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[#EAE6DE]/75 hover:text-[#EAE6DE]">
                <input
                  type="checkbox"
                  checked={hideInLists}
                  onChange={(event) => setHideInLists(event.target.checked)}
                  className="accent-[#A3B99B]"
                />
                <span>Masquer les titres déjà classés</span>
              </label>

              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mc-kicker ml-auto inline-flex items-center gap-1.5 text-[#C49A58] hover:underline"
                >
                  <RotateCcw size={12} />
                  Réinitialiser
                </button>
              ) : null}
            </div>

            <div className="flex gap-4 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setGenre(null)}
                className={`shrink-0 text-xs transition ${
                  genre === null ? "font-medium text-[#C49A58]" : "text-[#EAE6DE]/45 hover:text-[#EAE6DE]"
                }`}
              >
                Tous les genres
              </button>
              {GENRES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setGenre(item.id === genre ? null : item.id)}
                  className={`shrink-0 text-xs transition ${
                    genre === item.id ? "font-medium text-[#C49A58]" : "text-[#EAE6DE]/45 hover:text-[#EAE6DE]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <ErrorNote message={error} />
          {notice ? <p className="text-xs text-[#A3B99B]">{notice}</p> : null}
        </div>
        {!loading && filteredAndSortedResults.length > 0 ? (
          <span className="mc-kicker text-[10px]">
            Répertoire continu · Page {page}
          </span>
        ) : null}
      </div>

      {/* Grille régulière, aérée et homogène d'affiches verticales avec zoom lent */}
      <div className="grid grid-cols-2 gap-x-7 gap-y-14 sm:grid-cols-3 lg:grid-cols-5">
        {filteredAndSortedResults.map((title, index) => {
          const key = `${title.mediaType}:${title.tmdbId}`;
          const status = watchStatuses[key];
          const isWatched = status === "watched";
          const isToWatch = status === "to_watch";

          return (
            <article
              key={key}
              style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
              className="frame-zoom-in group flex flex-col"
            >
              <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#202224]">
                <button
                  type="button"
                  onClick={() => setSelectedTitle(title)}
                  className="block h-full w-full text-left focus:outline-none"
                >
                  <Poster
                    path={title.posterPath}
                    alt={title.title}
                    className={`h-full w-full transition-transform duration-700 ease-out group-hover:scale-105 ${
                      isWatched ? "grayscale opacity-55" : ""
                    }`}
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#101112] via-[#101112]/45 to-transparent" />
                </button>

                <div className="absolute inset-x-2.5 bottom-2.5 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void setWatchStatus(title, "to_watch")}
                    className={`inline-flex flex-1 items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-medium transition ${
                      isToWatch
                        ? "bg-[#C49A58] font-semibold text-[#101112]"
                        : "bg-[#101112]/80 text-[#EAE6DE] hover:bg-[#101112] hover:text-[#C49A58]"
                    }`}
                  >
                    <Bookmark size={11} />
                    <span>À voir</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void setWatchStatus(title, "watched")}
                    className={`inline-flex flex-1 items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-medium transition ${
                      isWatched
                        ? "bg-[#A3B99B] font-semibold text-[#101112]"
                        : "bg-[#101112]/80 text-[#EAE6DE] hover:bg-[#101112] hover:text-[#A3B99B]"
                    }`}
                  >
                    {isWatched ? <Check size={11} /> : <Eye size={11} />}
                    <span>Vu</span>
                  </button>
                </div>
              </div>

              <div className="mt-3.5 flex items-start justify-between gap-2 border-b border-[#EAE6DE]/10 pb-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedTitle(title)}
                  className="min-w-0 flex-1 text-left focus:outline-none"
                >
                  <p className="mc-kicker text-[9px] text-[#EAE6DE]/50">
                    {formatLabel(title)}
                    {title.year ? ` · ${title.year}` : ""}
                    {title.voteAverage && title.voteAverage > 0 ? ` · ${title.voteAverage.toFixed(1)}` : ""}
                  </p>
                  <h2
                    className={`mt-1 line-clamp-2 font-serif text-xl leading-snug transition ${
                      isWatched
                        ? "text-[#EAE6DE]/55 group-hover:text-[#EAE6DE]"
                        : "text-[#EAE6DE] group-hover:text-[#C49A58]"
                    }`}
                  >
                    {title.title}
                  </h2>
                </button>

                <button
                  type="button"
                  onClick={() => setRecommend(title)}
                  title="Recommander"
                  aria-label={`Recommander ${title.title}`}
                  className="mt-0.5 shrink-0 p-1 text-[#EAE6DE]/40 transition hover:text-[#C49A58]"
                >
                  <Send size={13} />
                </button>
              </div>

              <p className="mt-1.5 line-clamp-1 text-xs text-[#EAE6DE]/45">
                {genreLabels(title.genreIds).join(" · ")}
              </p>
            </article>
          );
        })}
      </div>

      {!loading && filteredAndSortedResults.length === 0 ? (
        <div className="border-y border-[#EAE6DE]/12 py-16 text-center">
          <p className="font-serif text-2xl italic text-[#EAE6DE]/75">
            Aucune œuvre ne correspond à cette sélection.
          </p>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className={`${ghostClass} mt-5 inline-flex items-center gap-2`}
            >
              <RotateCcw size={13} />
              Réinitialiser les filtres
            </button>
          ) : null}
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="border-t border-[#EAE6DE]/12 pt-8">
          <button
            type="button"
            className="mc-kicker inline-flex items-center gap-3 border border-[#EAE6DE]/25 px-6 py-3 text-[#EAE6DE] transition hover:border-[#C49A58] hover:text-[#C49A58]"
            disabled={loading}
            onClick={() => void search(page + 1, false)}
          >
            <span>{loading ? "Chargement…" : "Feuilleter la suite"}</span>
          </button>
        </div>
      ) : loading ? (
        <p className="mc-kicker">Ouverture des archives…</p>
      ) : null}

      <TitleDetailModal
        title={selectedTitle}
        onClose={() => setSelectedTitle(null)}
        onAddToList={(t) => {
          void setWatchStatus(t, "to_watch");
          setSelectedTitle(null);
        }}
        onRecommend={(t) => {
          setSelectedTitle(null);
          setRecommend(t);
        }}
      />

      <RecommendDialog
        title={recommend}
        onClose={() => setRecommend(null)}
        onDone={(message) => setNotice(message)}
        onError={setError}
      />
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
      const ids = (links ?? []).map((row) =>
        row.requester_id === user.id ? row.addressee_id : row.requester_id,
      );
      if (ids.length) {
        const { data } = await supabase.from("profiles").select("*").in("id", ids);
        setFriends((data as Profile[]) ?? []);
      } else setFriends([]);
      const { data: memberships } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id);
      const groupIds = (memberships ?? []).map((row) => row.group_id as string);
      if (groupIds.length) {
        const { data } = await supabase.from("groups").select("*").in("id", groupIds);
        setGroups((data as Group[]) ?? []);
      } else setGroups([]);
    })();
  }, [title, user]);

  const options = useMemo(
    () => [
      ...friends.map((friend) => ({
        id: `user:${friend.id}`,
        label: friend.username || friend.full_name || "Ami",
      })),
      ...groups.map((group) => ({ id: `group:${group.id}`, label: `Cercle · ${group.name}` })),
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
    <Modal open={Boolean(title)} title="Recommander une œuvre" onClose={onClose}>
      <p className="font-serif text-2xl italic text-[#EAE6DE]">{title?.title}</p>
      <label className="mt-5 block text-xs text-[#EAE6DE]/80">
        <span className="mc-kicker">Destinataire</span>
        <select
          className={`${inputClass} mt-2 w-full`}
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        >
          <option value="">Choisir un proche ou un cercle</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-5 block text-xs text-[#EAE6DE]/80">
        <span className="mc-kicker">Mot d’accompagnement</span>
        <textarea
          className={`${inputClass} mt-2 min-h-24 w-full`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={280}
        />
      </label>
      {options.length === 0 ? (
        <p className="mt-3 text-xs text-[#EAE6DE]/50">Ajoutez d’abord un ami ou un cercle.</p>
      ) : null}
      <button type="button" className={`${buttonClass} mt-6`} disabled={!target || busy} onClick={send}>
        Transmettre
      </button>
    </Modal>
  );
}