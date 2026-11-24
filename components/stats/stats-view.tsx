"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Award,
  Clapperboard,
  Clock,
  Film,
  Flame,
  Loader2,
  Sparkles,
  Star,
  TrendingUp,
  Tv,
  UserCheck,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { TitleDetailModal } from "@/components/title-detail-modal";
import { ErrorNote, Poster, buttonClass, ghostClass } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import type { Title, WatchItem } from "@/lib/types";

type CreditCounter = {
  name: string;
  roleLabel: string;
  count: number;
  avgRatingSum: number;
  ratedCount: number;
  samplePoster: string | null;
};

type GenreStat = {
  id: number;
  name: string;
  count: number;
};

const GENRE_NAMES: Record<number, string> = {
  28: "Action",
  12: "Aventure",
  16: "Animation",
  35: "Comédie",
  80: "Crime",
  99: "Documentaire",
  18: "Drame",
  10751: "Famille",
  14: "Fantastique",
  36: "Histoire",
  27: "Horreur",
  10402: "Musique",
  9648: "Mystère",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "Téléfilm",
  53: "Thriller",
  10752: "Guerre",
  37: "Western",
  10759: "Action & Aventure",
  10762: "Jeunesse",
  10765: "SF & Fantastique",
  10766: "Soap",
  10768: "Guerre & Politique",
};

function formatDurationMinutes(totalMinutes: number) {
  if (totalMinutes <= 0) return "0 min";
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} h`;
  return `${hours} h ${mins.toString().padStart(2, "0")}`;
}

export function StatsView() {
  const { user } = useAuth();
  const [watchItems, setWatchItems] = useState<WatchItem[]>([]);
  const [swipesCount, setSwipesCount] = useState(0);
  const [matchesCount, setMatchesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scoutingLoading, setScoutingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [genreStats, setGenreStats] = useState<GenreStat[]>([]);
  const [topDirectors, setTopDirectors] = useState<CreditCounter[]>([]);
  const [topActors, setTopActors] = useState<CreditCounter[]>([]);
  const [inspectTitle, setInspectTitle] = useState<Title | null>(null);

  const loadBaseStats = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const [watchRes, swipeRes, memberRes] = await Promise.all([
        supabase.from("watch_items").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
        supabase.from("swipes").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("group_members").select("group_id").eq("user_id", user.id),
      ]);

      if (watchRes.error) {
        setError(watchRes.error.message);
      } else {
        setWatchItems((watchRes.data as WatchItem[]) ?? []);
      }

      setSwipesCount(swipeRes.count ?? 0);

      const gIds = (memberRes.data ?? []).map((r) => r.group_id as string);
      if (gIds.length > 0) {
        const { count } = await supabase.from("matches").select("id", { count: "exact", head: true }).in("group_id", gIds);
        setMatchesCount(count ?? 0);
      } else {
        setMatchesCount(0);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadBaseStats();
  }, [loadBaseStats]);

  useEffect(() => {
    const watchedOnes = watchItems.filter((w) => w.status === "watched").slice(0, 14);
    const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;

    if (!watchedOnes.length || !apiKey) {
      setGenreStats([]);
      setTopDirectors([]);
      setTopActors([]);
      return;
    }

    let cancelled = false;
    setScoutingLoading(true);

    void (async () => {
      const genreMap = new Map<number, number>();
      const directorMap = new Map<string, CreditCounter>();
      const actorMap = new Map<string, CreditCounter>();

      await Promise.all(
        watchedOnes.map(async (item) => {
          try {
            const type = item.media_type === "tv" ? "tv" : "movie";
            const [detailResp, creditsResp] = await Promise.all([
              fetch(`https://api.themoviedb.org/3/${type}/${item.tmdb_id}?api_key=${apiKey}&language=fr-FR`),
              fetch(`https://api.themoviedb.org/3/${type}/${item.tmdb_id}/credits?api_key=${apiKey}&language=fr-FR`),
            ]);

            if (detailResp.ok) {
              const detailJson = (await detailResp.json()) as {
                genres?: { id: number; name: string }[];
              };
              (detailJson.genres ?? []).forEach((g) => {
                genreMap.set(g.id, (genreMap.get(g.id) ?? 0) + 1);
              });
            }

            if (creditsResp.ok) {
              const creditsJson = (await creditsResp.json()) as {
                cast?: { name: string }[];
                crew?: { name: string; job?: string }[];
              };

              const ratingVal = typeof item.rating === "number" ? item.rating : 0;
              const hasRating = typeof item.rating === "number" && item.rating > 0;

              (creditsJson.cast ?? []).slice(0, 4).forEach((actor) => {
                const prev = actorMap.get(actor.name) ?? {
                  name: actor.name,
                  roleLabel: "Interprète",
                  count: 0,
                  avgRatingSum: 0,
                  ratedCount: 0,
                  samplePoster: item.poster_path,
                };
                actorMap.set(actor.name, {
                  ...prev,
                  count: prev.count + 1,
                  avgRatingSum: prev.avgRatingSum + (hasRating ? ratingVal : 0),
                  ratedCount: prev.ratedCount + (hasRating ? 1 : 0),
                  samplePoster: prev.samplePoster ?? item.poster_path,
                });
              });

              const directors = (creditsJson.crew ?? []).filter(
                (c) => c.job === "Director" || c.job === "Creator" || c.job === "Executive Producer",
              );
              directors.slice(0, 2).forEach((dir) => {
                const prev = directorMap.get(dir.name) ?? {
                  name: dir.name,
                  roleLabel: dir.job === "Director" ? "Réalisation" : "Création",
                  count: 0,
                  avgRatingSum: 0,
                  ratedCount: 0,
                  samplePoster: item.poster_path,
                };
                directorMap.set(dir.name, {
                  ...prev,
                  count: prev.count + 1,
                  avgRatingSum: prev.avgRatingSum + (hasRating ? ratingVal : 0),
                  ratedCount: prev.ratedCount + (hasRating ? 1 : 0),
                  samplePoster: prev.samplePoster ?? item.poster_path,
                });
              });
            }
          } catch {
            // ignore
          }
        }),
      );

      if (cancelled) return;

      const sortedGenres: GenreStat[] = [...genreMap.entries()]
        .map(([id, count]) => ({
          id,
          name: GENRE_NAMES[id] ?? `Genre #${id}`,
          count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      setGenreStats(sortedGenres);
      setTopDirectors(
        [...directorMap.values()]
          .sort((a, b) => b.count - a.count || b.avgRatingSum - a.avgRatingSum)
          .slice(0, 4),
      );
      setTopActors(
        [...actorMap.values()]
          .sort((a, b) => b.count - a.count || b.avgRatingSum - a.avgRatingSum)
          .slice(0, 4),
      );
      setScoutingLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [watchItems]);

  const metrics = useMemo(() => {
    const watched = watchItems.filter((w) => w.status === "watched");
    const toWatch = watchItems.filter((w) => w.status === "to_watch");
    const moviesWatched = watched.filter((w) => w.media_type === "movie");
    const seriesWatched = watched.filter((w) => w.media_type === "tv");

    const estimatedMinutes = moviesWatched.length * 110 + seriesWatched.length * 220;

    const rated = watchItems.filter((w) => typeof w.rating === "number" && w.rating > 0);
    const avgRating =
      rated.length > 0
        ? (rated.reduce((acc, item) => acc + (item.rating ?? 0), 0) / rated.length).toFixed(1)
        : "—";

    const favoriteSeries = [...seriesWatched]
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 4);

    const bestRatedTitles = [...rated]
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 5);

    const ratingBuckets = [1, 2, 3, 4, 5].map((star) => ({
      star,
      count: rated.filter((r) => Math.round(r.rating ?? 0) === star).length,
    }));

    return {
      watchedCount: watched.length,
      toWatchCount: toWatch.length,
      moviesWatchedCount: moviesWatched.length,
      seriesWatchedCount: seriesWatched.length,
      estimatedMinutes,
      avgRating,
      ratedCount: rated.length,
      favoriteSeries,
      bestRatedTitles,
      ratingBuckets,
    };
  }, [watchItems]);

  const maxGenreCount = Math.max(1, ...genreStats.map((g) => g.count));
  const maxRatingBucket = Math.max(1, ...metrics.ratingBuckets.map((b) => b.count));

  return (
    <div className="space-y-20">
      {/* En-tête éditorial */}
      <div className="border-b border-[#EAE6DE]/12 pb-10">
        <p className="mc-kicker">VI — Carnet &amp; Repères</p>
        <div className="mt-3 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <h1 className="font-serif text-5xl leading-[0.98] tracking-tight text-[#EAE6DE] sm:text-6xl lg:text-7xl">
            Chronique <span className="italic text-[#C49A58]">chiffrée</span>
          </h1>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/listes" className={ghostClass}>
              Collections
            </Link>
            <Link href="/decider" className={buttonClass}>
              À la Une
            </Link>
          </div>
        </div>
      </div>

      <ErrorNote message={error} />

      {loading ? (
        <div className="flex items-center gap-2.5 py-12 text-xs text-[#EAE6DE]/55">
          <Loader2 size={15} className="animate-spin text-[#C49A58]" />
          <span className="mc-kicker">Lecture des archives…</span>
        </div>
      ) : (
        <>
          {/* Repères majeurs en ligne éditoriale */}
          <section className="editorial-enter grid gap-8 border-b border-[#EAE6DE]/12 pb-14 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border-t border-[#EAE6DE]/20 pt-4">
              <div className="flex items-center justify-between">
                <span className="mc-kicker text-[10px]">Films vus</span>
                <Film size={14} className="text-[#C49A58]" />
              </div>
              <p className="mt-2 font-serif text-5xl text-[#EAE6DE]">{metrics.moviesWatchedCount}</p>
              <p className="mc-kicker mt-2 text-[10px] text-[#EAE6DE]/45">
                {metrics.toWatchCount} dans À voir
              </p>
            </div>

            <div className="border-t border-[#EAE6DE]/20 pt-4">
              <div className="flex items-center justify-between">
                <span className="mc-kicker text-[10px]">Séries &amp; animés vus</span>
                <Tv size={14} className="text-[#A3B99B]" />
              </div>
              <p className="mt-2 font-serif text-5xl text-[#EAE6DE]">{metrics.seriesWatchedCount}</p>
              <p className="mc-kicker mt-2 text-[10px] text-[#EAE6DE]/45">
                {metrics.watchedCount} œuvres vues au total
              </p>
            </div>

            <div className="border-t border-[#C49A58] pt-4">
              <div className="flex items-center justify-between">
                <span className="mc-kicker text-[10px] text-[#C49A58]">Temps estimé</span>
                <Clock size={14} className="text-[#C49A58]" />
              </div>
              <p className="mt-2 font-serif text-5xl text-[#EAE6DE]">
                {formatDurationMinutes(metrics.estimatedMinutes)}
              </p>
              <p className="mc-kicker mt-2 text-[10px] text-[#EAE6DE]/45">
                Estimation indicative
              </p>
            </div>

            <div className="border-t border-[#EAE6DE]/20 pt-4">
              <div className="flex items-center justify-between">
                <span className="mc-kicker text-[10px]">Appréciation moyenne</span>
                <Star size={14} className="text-[#C49A58]" />
              </div>
              <p className="mt-2 font-serif text-5xl text-[#EAE6DE]">
                {metrics.avgRating}
                {metrics.avgRating !== "—" ? <span className="text-2xl italic text-[#EAE6DE]/50"> / 5</span> : null}
              </p>
              <p className="mc-kicker mt-2 text-[10px] text-[#EAE6DE]/45">
                {metrics.ratedCount} note{metrics.ratedCount > 1 ? "s" : ""} · {swipesCount} choix · {matchesCount} accords
              </p>
            </div>
          </section>

          {/* Répartition des formats · Genres · Courbe des notes */}
          <section className="grid gap-12 border-b border-[#EAE6DE]/12 pb-16 lg:grid-cols-3">
            <div className="space-y-5">
              <div className="flex items-baseline justify-between border-b border-[#EAE6DE]/10 pb-3">
                <h2 className="font-serif text-2xl text-[#EAE6DE]">Formats</h2>
                <Clapperboard size={14} className="text-[#EAE6DE]/45" />
              </div>
              <p className="text-xs text-[#EAE6DE]/55">Part des œuvres vues selon leur nature.</p>

              {metrics.watchedCount > 0 ? (
                <div className="flex items-center gap-6 pt-2">
                  <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0 -rotate-90">
                    <circle
                      cx="60"
                      cy="60"
                      r="44"
                      fill="none"
                      stroke="rgba(234, 230, 222, 0.1)"
                      strokeWidth="12"
                    />
                    <circle
                      cx="60"
                      cy="60"
                      r="44"
                      fill="none"
                      stroke="#C49A58"
                      strokeWidth="12"
                      strokeDasharray={`${(metrics.moviesWatchedCount / metrics.watchedCount) * 276.46} 276.46`}
                    />
                  </svg>
                  <div className="flex-1 space-y-3 text-xs">
                    <div className="flex items-center justify-between border-b border-[#EAE6DE]/10 pb-2">
                      <span className="inline-flex items-center gap-2 text-[#EAE6DE]">
                        <span className="h-2 w-2 rounded-full bg-[#C49A58]" />
                        Films
                      </span>
                      <span className="font-serif text-lg text-[#EAE6DE]">
                        {metrics.moviesWatchedCount}{" "}
                        <span className="mc-kicker text-[9px] text-[#EAE6DE]/50">
                          ({Math.round((metrics.moviesWatchedCount / metrics.watchedCount) * 100)}%)
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 text-[#EAE6DE]">
                        <span className="h-2 w-2 rounded-full bg-[#A3B99B]" />
                        Séries / Animés
                      </span>
                      <span className="font-serif text-lg text-[#EAE6DE]">
                        {metrics.seriesWatchedCount}{" "}
                        <span className="mc-kicker text-[9px] text-[#EAE6DE]/50">
                          ({Math.round((metrics.seriesWatchedCount / metrics.watchedCount) * 100)}%)
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="border-y border-[#EAE6DE]/10 py-8 text-center font-serif text-lg italic text-[#EAE6DE]/45">
                  Marquez des œuvres comme vues pour révéler la répartition.
                </p>
              )}
            </div>

            <div className="space-y-5">
              <div className="flex items-baseline justify-between border-b border-[#EAE6DE]/10 pb-3">
                <h2 className="font-serif text-2xl text-[#EAE6DE]">Genres dominants</h2>
                <Flame size={14} className="text-[#C49A58]" />
              </div>
              <p className="text-xs text-[#EAE6DE]/55">
                {scoutingLoading ? "Lecture des genres…" : "Registres les plus présents dans vos visionnages."}
              </p>

              {genreStats.length > 0 ? (
                <div className="space-y-4 pt-1">
                  {genreStats.map((g) => (
                    <div key={g.id} className="space-y-1.5">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="font-serif text-lg text-[#EAE6DE]">{g.name}</span>
                        <span className="mc-kicker text-[10px] text-[#C49A58]">{g.count}</span>
                      </div>
                      <div className="h-px w-full bg-[#EAE6DE]/12">
                        <div
                          className="h-px bg-[#C49A58]"
                          style={{ width: `${Math.round((g.count / maxGenreCount) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="border-y border-[#EAE6DE]/10 py-8 text-center font-serif text-lg italic text-[#EAE6DE]/45">
                  {scoutingLoading ? "Analyse en cours…" : "Aucun genre répertorié pour l’instant."}
                </p>
              )}
            </div>

            <div className="space-y-5">
              <div className="flex items-baseline justify-between border-b border-[#EAE6DE]/10 pb-3">
                <h2 className="font-serif text-2xl text-[#EAE6DE]">Courbe des notes</h2>
                <TrendingUp size={14} className="text-[#A3B99B]" />
              </div>
              <p className="text-xs text-[#EAE6DE]/55">Répartition de vos étoiles (1 à 5).</p>

              <div className="flex h-36 items-end justify-between gap-3 pt-4">
                {metrics.ratingBuckets.map((b) => {
                  const heightPct = Math.max(8, Math.round((b.count / maxRatingBucket) * 100));
                  return (
                    <div key={b.star} className="flex flex-1 flex-col items-center gap-2">
                      <span className="font-serif text-base text-[#EAE6DE]">{b.count}</span>
                      <div className="flex h-20 w-full items-end border-b border-[#EAE6DE]/20 px-1">
                        <div
                          className="w-full bg-[#A3B99B]/80 transition-all"
                          style={{ height: `${heightPct}%` }}
                        />
                      </div>
                      <span className="mc-kicker text-[10px] text-[#EAE6DE]/50">{b.star}★</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Réalisateurs & Interprètes récurrents */}
          <section className="grid gap-14 border-b border-[#EAE6DE]/12 pb-16 lg:grid-cols-2">
            <div className="space-y-6">
              <div className="flex items-baseline justify-between border-b border-[#EAE6DE]/10 pb-4">
                <div>
                  <p className="mc-kicker text-[10px] text-[#C49A58]">Mise en scène</p>
                  <h2 className="mt-1 font-serif text-3xl text-[#EAE6DE]">Réalisateurs récurrents</h2>
                </div>
                <Award size={16} className="text-[#C49A58]" />
              </div>

              {topDirectors.length > 0 ? (
                <div className="divide-y divide-[#EAE6DE]/10">
                  {topDirectors.map((dir, i) => (
                    <div key={dir.name} className="flex items-center justify-between gap-4 py-4">
                      <div className="flex items-center gap-4">
                        <span className="font-serif text-lg italic text-[#C49A58]">0{i + 1}</span>
                        {dir.samplePoster ? (
                          <div className="aspect-[2/3] w-10 overflow-hidden bg-[#202224]">
                            <Poster path={dir.samplePoster} alt={dir.name} className="h-full w-full" />
                          </div>
                        ) : null}
                        <div>
                          <p className="font-serif text-2xl text-[#EAE6DE]">{dir.name}</p>
                          <p className="mc-kicker text-[9px] text-[#EAE6DE]/45">{dir.roleLabel}</p>
                        </div>
                      </div>
                      <span className="mc-kicker text-[10px] text-[#EAE6DE]/75">
                        {dir.count} titre{dir.count > 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="border-y border-[#EAE6DE]/10 py-8 text-center font-serif text-lg italic text-[#EAE6DE]/45">
                  {scoutingLoading ? "Lecture du générique…" : "Pas encore assez de titres vus."}
                </p>
              )}
            </div>

            <div className="space-y-6">
              <div className="flex items-baseline justify-between border-b border-[#EAE6DE]/10 pb-4">
                <div>
                  <p className="mc-kicker text-[10px] text-[#A3B99B]">Distribution</p>
                  <h2 className="mt-1 font-serif text-3xl text-[#EAE6DE]">Interprètes en vue</h2>
                </div>
                <UserCheck size={16} className="text-[#A3B99B]" />
              </div>

              {topActors.length > 0 ? (
                <div className="divide-y divide-[#EAE6DE]/10">
                  {topActors.map((act, i) => (
                    <div key={act.name} className="flex items-center justify-between gap-4 py-4">
                      <div className="flex items-center gap-4">
                        <span className="font-serif text-lg italic text-[#A3B99B]">0{i + 1}</span>
                        {act.samplePoster ? (
                          <div className="aspect-[2/3] w-10 overflow-hidden bg-[#202224]">
                            <Poster path={act.samplePoster} alt={act.name} className="h-full w-full" />
                          </div>
                        ) : null}
                        <div>
                          <p className="font-serif text-2xl text-[#EAE6DE]">{act.name}</p>
                          <p className="mc-kicker text-[9px] text-[#EAE6DE]/45">{act.roleLabel}</p>
                        </div>
                      </div>
                      <span className="mc-kicker text-[10px] text-[#EAE6DE]/75">
                        {act.count} titre{act.count > 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="border-y border-[#EAE6DE]/10 py-8 text-center font-serif text-lg italic text-[#EAE6DE]/45">
                  {scoutingLoading ? "Lecture du casting…" : "Pas encore assez de titres vus."}
                </p>
              )}
            </div>
          </section>

          {/* Séries en tête & Palmarès des notes */}
          <section className="grid gap-14 lg:grid-cols-2">
            <div className="space-y-6">
              <div className="flex items-baseline justify-between border-b border-[#EAE6DE]/10 pb-4">
                <h2 className="font-serif text-3xl text-[#EAE6DE]">Séries &amp; animés en tête</h2>
                <Sparkles size={15} className="text-[#C49A58]" />
              </div>
              {metrics.favoriteSeries.length > 0 ? (
                <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                  {metrics.favoriteSeries.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setInspectTitle({
                          tmdbId: s.tmdb_id,
                          mediaType: s.media_type,
                          title: s.title,
                          overview: "",
                          posterPath: s.poster_path,
                          year: s.year ?? "",
                          genreIds: [],
                          language: "",
                          anime: false,
                          popularity: 0,
                        })
                      }
                      className="group text-left focus:outline-none"
                    >
                      <div className="aspect-[2/3] w-full overflow-hidden bg-[#202224]">
                        <Poster
                          path={s.poster_path}
                          alt={s.title}
                          className="h-full w-full transition-transform duration-700 ease-out group-hover:scale-105"
                        />
                      </div>
                      <p className="mt-2.5 truncate font-serif text-lg text-[#EAE6DE] group-hover:text-[#C49A58]">
                        {s.title}
                      </p>
                      {s.rating ? (
                        <p className="mc-kicker mt-0.5 text-[9px] text-[#C49A58]">{s.rating} / 5</p>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="border-y border-[#EAE6DE]/10 py-8 text-center font-serif text-lg italic text-[#EAE6DE]/45">
                  Aucune série marquée comme vue pour l’instant.
                </p>
              )}
            </div>

            <div className="space-y-6">
              <div className="flex items-baseline justify-between border-b border-[#EAE6DE]/10 pb-4">
                <h2 className="font-serif text-3xl text-[#EAE6DE]">Meilleures notes</h2>
                <Activity size={15} className="text-[#A3B99B]" />
              </div>
              {metrics.bestRatedTitles.length > 0 ? (
                <div className="divide-y divide-[#EAE6DE]/10 border-b border-[#EAE6DE]/10">
                  {metrics.bestRatedTitles.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setInspectTitle({
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
                        })
                      }
                      className="flex w-full items-center justify-between gap-4 py-3.5 text-left transition hover:opacity-85"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="aspect-[2/3] w-10 shrink-0 overflow-hidden bg-[#202224]">
                          <Poster path={item.poster_path} alt={item.title} className="h-full w-full" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-serif text-xl text-[#EAE6DE]">{item.title}</p>
                          <p className="mc-kicker text-[9px] text-[#EAE6DE]/45">
                            {item.media_type === "movie" ? "Film" : "Série"}
                            {item.year ? ` · ${item.year}` : ""}
                          </p>
                        </div>
                      </div>
                      <span className="mc-kicker shrink-0 text-[10px] text-[#C49A58]">{item.rating} / 5</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="border-y border-[#EAE6DE]/10 py-8 text-center font-serif text-lg italic text-[#EAE6DE]/45">
                  Notez des œuvres dans vos collections pour bâtir votre palmarès.
                </p>
              )}
            </div>
          </section>
        </>
      )}

      <TitleDetailModal title={inspectTitle} onClose={() => setInspectTitle(null)} />
    </div>
  );
}