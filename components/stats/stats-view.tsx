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
import { ErrorNote, PageHeader, Poster, buttonClass, ghostClass } from "@/components/ui";
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

  // Enrichissement optionnel via TMDB pour genres, réalisateurs et acteurs récurrents sur les titres vus
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
                  roleLabel: "Acteur / Casting",
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
                  roleLabel: dir.job === "Director" ? "Réalisateur" : "Création",
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
            // ignore network error on individual item
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

    // Estimation indicative du temps passé : ~110 min par film vu, ~220 min (~4-5 épisodes) par série/animé vu
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
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          kicker="Rapport de saison · Scouting"
          title="Statistiques"
          text="Ton bilan de visionnage, le temps estimé, tes genres dominants et les têtes d'affiche de ta cinémathèque."
        />
        <div className="mb-6 flex gap-2">
          <Link href="/listes" className={ghostClass}>
            Mes listes
          </Link>
          <Link href="/decider" className={buttonClass}>
            Lancer une session
          </Link>
        </div>
      </div>

      <ErrorNote message={error} />

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-zinc-400">
          <Loader2 size={16} className="animate-spin" />
          Analyse de tes données de visionnage…
        </div>
      ) : (
        <>
          {/* Bandeau KPI style Football Manager */}
          <section className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.015] p-4">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Films vus</span>
                <Film size={15} className="text-amber-300" />
              </div>
              <p className="mt-2 font-serif text-4xl text-[#f4f1ea]">{metrics.moviesWatchedCount}</p>
              <p className="mt-1 text-xs text-zinc-400">{metrics.toWatchCount} encore en liste À voir</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.015] p-4">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Séries / Animés vus</span>
                <Tv size={15} className="text-emerald-300" />
              </div>
              <p className="mt-2 font-serif text-4xl text-[#f4f1ea]">{metrics.seriesWatchedCount}</p>
              <p className="mt-1 text-xs text-zinc-400">{metrics.watchedCount} titres marqués vus au total</p>
            </div>

            <div className="rounded-2xl border border-amber-300/25 bg-gradient-to-b from-amber-300/[0.07] to-white/[0.015] p-4">
              <div className="flex items-center justify-between text-xs text-amber-200/90">
                <span>Temps estimé</span>
                <Clock size={15} className="text-amber-300" />
              </div>
              <p className="mt-2 font-serif text-4xl text-[#f4f1ea]">{formatDurationMinutes(metrics.estimatedMinutes)}</p>
              <p className="mt-1 text-xs text-zinc-400">Estimation indicative (~1h50 / film, ~3h40 / série)</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.015] p-4">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Note moyenne</span>
                <Star size={15} className="text-amber-300" />
              </div>
              <p className="mt-2 font-serif text-4xl text-[#f4f1ea]">
                {metrics.avgRating}
                {metrics.avgRating !== "—" ? <span className="text-xl text-zinc-400"> / 5</span> : null}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Sur {metrics.ratedCount} note{metrics.ratedCount > 1 ? "s" : ""} · {swipesCount} swipes · {matchesCount} matchs
              </p>
            </div>
          </section>

          {/* Graphiques : Répartition formats + Genres préférés + Distribution des notes */}
          <section className="grid gap-6 lg:grid-cols-3">
            {/* Graphique SVG : Répartition Films vs Séries */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-xl text-[#f4f1ea]">Répartition des formats</h2>
                <Clapperboard size={16} className="text-zinc-400" />
              </div>
              <p className="mt-1 text-xs text-zinc-400">Part des titres vus par type d&apos;œuvre.</p>

              {metrics.watchedCount > 0 ? (
                <div className="mt-5 flex items-center gap-5">
                  <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0 -rotate-90">
                    <circle
                      cx="60"
                      cy="60"
                      r="44"
                      fill="none"
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth="14"
                    />
                    <circle
                      cx="60"
                      cy="60"
                      r="44"
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth="14"
                      strokeDasharray={`${(metrics.moviesWatchedCount / metrics.watchedCount) * 276.46} 276.46`}
                    />
                  </svg>
                  <div className="flex-1 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 text-zinc-200">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                        Films
                      </span>
                      <span className="font-semibold text-[#f4f1ea]">
                        {metrics.moviesWatchedCount} (
                        {Math.round((metrics.moviesWatchedCount / metrics.watchedCount) * 100)} %)
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 text-zinc-200">
                        <span className="h-2.5 w-2.5 rounded-full bg-zinc-600" />
                        Séries / Animés
                      </span>
                      <span className="font-semibold text-[#f4f1ea]">
                        {metrics.seriesWatchedCount} (
                        {Math.round((metrics.seriesWatchedCount / metrics.watchedCount) * 100)} %)
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-6 rounded-xl border border-dashed border-white/10 py-8 text-center text-xs text-zinc-500">
                  Marque des titres comme « Vus » pour voir la répartition.
                </p>
              )}
            </div>

            {/* Graphique : Genres préférés */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-xl text-[#f4f1ea]">Genres dominants</h2>
                <Flame size={16} className="text-amber-300" />
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                {scoutingLoading ? "Lecture des genres sur tes titres vus…" : "Tes familles d'histoires les plus vues."}
              </p>

              {genreStats.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {genreStats.map((g) => (
                    <div key={g.id} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-200">{g.name}</span>
                        <span className="font-medium text-amber-200">{g.count}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-black/40">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400"
                          style={{ width: `${Math.round((g.count / maxGenreCount) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-6 rounded-xl border border-dashed border-white/10 py-8 text-center text-xs text-zinc-500">
                  {scoutingLoading
                    ? "Chargement des genres…"
                    : "Ajoute des titres vus (ou configure la clé TMDB) pour afficher tes genres."}
                </p>
              )}
            </div>

            {/* Graphique : Répartition des notes */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-xl text-[#f4f1ea]">Courbe de notes</h2>
                <TrendingUp size={16} className="text-emerald-300" />
              </div>
              <p className="mt-1 text-xs text-zinc-400">Distribution de tes étoiles (1 à 5).</p>

              <div className="mt-5 flex h-32 items-end justify-between gap-2 px-2">
                {metrics.ratingBuckets.map((b) => {
                  const heightPct = Math.max(8, Math.round((b.count / maxRatingBucket) * 100));
                  return (
                    <div key={b.star} className="flex flex-1 flex-col items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-zinc-300">{b.count}</span>
                      <div className="flex h-20 w-full items-end rounded-lg bg-black/35 p-1">
                        <div
                          className="w-full rounded-md bg-amber-300/85 transition-all"
                          style={{ height: `${heightPct}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-zinc-400">{b.star}★</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Rapport de scouting : Réalisateurs & Acteurs récurrents */}
          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-serif text-2xl text-[#f4f1ea]">Réalisateurs / Créateurs les plus vus</h2>
                  <p className="text-xs text-zinc-400">Ceux qui reviennent le plus souvent dans tes séances vues.</p>
                </div>
                <Award size={18} className="text-amber-300" />
              </div>

              {topDirectors.length > 0 ? (
                <div className="mt-4 space-y-2.5">
                  {topDirectors.map((dir, i) => (
                    <div
                      key={dir.name}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs font-bold text-amber-300">#{i + 1}</span>
                        {dir.samplePoster ? (
                          <div className="h-11 w-8 overflow-hidden rounded-md border border-white/10">
                            <Poster path={dir.samplePoster} alt={dir.name} className="h-full w-full" />
                          </div>
                        ) : null}
                        <div>
                          <p className="text-sm font-semibold text-[#f4f1ea]">{dir.name}</p>
                          <p className="text-[11px] text-zinc-400">{dir.roleLabel}</p>
                        </div>
                      </div>
                      <span className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-zinc-200">
                        {dir.count} titre{dir.count > 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-dashed border-white/10 py-8 text-center text-xs text-zinc-500">
                  {scoutingLoading ? "Analyse du générique…" : "Pas encore assez de titres vus pour dégager un réalisateur."}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-serif text-2xl text-[#f4f1ea]">Acteurs / Visages récurrents</h2>
                  <p className="text-xs text-zinc-400">Têtes d&apos;affiche les plus présentes sur ton écran.</p>
                </div>
                <UserCheck size={18} className="text-emerald-300" />
              </div>

              {topActors.length > 0 ? (
                <div className="mt-4 space-y-2.5">
                  {topActors.map((act, i) => (
                    <div
                      key={act.name}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs font-bold text-emerald-300">#{i + 1}</span>
                        {act.samplePoster ? (
                          <div className="h-11 w-8 overflow-hidden rounded-md border border-white/10">
                            <Poster path={act.samplePoster} alt={act.name} className="h-full w-full" />
                          </div>
                        ) : null}
                        <div>
                          <p className="text-sm font-semibold text-[#f4f1ea]">{act.name}</p>
                          <p className="text-[11px] text-zinc-400">{act.roleLabel}</p>
                        </div>
                      </div>
                      <span className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-zinc-200">
                        {act.count} titre{act.count > 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-dashed border-white/10 py-8 text-center text-xs text-zinc-500">
                  {scoutingLoading ? "Analyse du casting…" : "Pas encore assez de titres vus pour dégager un acteur."}
                </p>
              )}
            </div>
          </section>

          {/* Séries favorites & titres les mieux notés */}
          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl text-[#f4f1ea]">Séries / Animés en tête</h2>
                <Sparkles size={16} className="text-amber-300" />
              </div>
              {metrics.favoriteSeries.length > 0 ? (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                      className="group overflow-hidden rounded-xl border border-white/10 bg-zinc-950 text-left transition hover:border-amber-300/40"
                    >
                      <div className="aspect-[2/3] w-full overflow-hidden">
                        <Poster path={s.poster_path} alt={s.title} className="h-full w-full" />
                      </div>
                      <p className="truncate px-2 py-1.5 font-serif text-xs text-[#f4f1ea]">{s.title}</p>
                      {s.rating ? (
                        <p className="px-2 pb-2 text-[10px] font-semibold text-amber-300">{s.rating} ★</p>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-dashed border-white/10 py-8 text-center text-xs text-zinc-500">
                  Aucune série marquée comme vue pour le moment.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl text-[#f4f1ea]">Meilleures notes de ta fiche</h2>
                <Activity size={16} className="text-emerald-300" />
              </div>
              {metrics.bestRatedTitles.length > 0 ? (
                <div className="mt-4 space-y-2.5">
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
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 p-2.5 text-left transition hover:border-white/25"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="h-11 w-8 shrink-0 overflow-hidden rounded-md border border-white/10">
                          <Poster path={item.poster_path} alt={item.title} className="h-full w-full" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-serif text-base text-[#f4f1ea]">{item.title}</p>
                          <p className="text-[11px] text-zinc-400">
                            {item.media_type === "movie" ? "Film" : "Série"}
                            {item.year ? ` · ${item.year}` : ""}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-lg bg-amber-300/15 px-2.5 py-1 text-xs font-bold text-amber-200">
                        {item.rating} ★
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-dashed border-white/10 py-8 text-center text-xs text-zinc-500">
                  Note des films ou séries dans tes listes pour bâtir ton palmarès.
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