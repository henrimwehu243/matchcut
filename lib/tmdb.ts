import type { Title } from "@/lib/types";

export const GENRES: { id: number; label: string }[] = [
  { id: 28, label: "Action" },
  { id: 12, label: "Aventure" },
  { id: 16, label: "Animation" },
  { id: 35, label: "Comédie" },
  { id: 80, label: "Crime" },
  { id: 99, label: "Documentaire" },
  { id: 18, label: "Drame" },
  { id: 14, label: "Fantastique" },
  { id: 36, label: "Histoire" },
  { id: 27, label: "Horreur" },
  { id: 9648, label: "Mystère" },
  { id: 10749, label: "Romance" },
  { id: 878, label: "Science-fiction" },
  { id: 53, label: "Thriller" },
  { id: 10752, label: "Guerre" },
];

export const DECADES = ["2020", "2010", "2000", "1990", "1980", "1970"];

type Raw = {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  original_language?: string;
  popularity?: number;
  vote_average?: number;
};

export function posterUrl(path: string | null, size: "w342" | "w780" = "w780") {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export function formatLabel(title: Pick<Title, "anime" | "mediaType">) {
  if (title.anime) return "Animé";
  return title.mediaType === "movie" ? "Film" : "Série";
}

export function genreLabels(ids: number[], limit = 3) {
  return ids
    .map((id) => GENRES.find((genre) => genre.id === id)?.label)
    .filter((label): label is string => Boolean(label))
    .slice(0, limit);
}

export function mapTmdb(item: Raw, forcedType?: "movie" | "tv"): Title | null {
  const mediaType = forcedType || (item.media_type === "tv" || item.name ? "tv" : item.title ? "movie" : "");
  if (mediaType !== "movie" && mediaType !== "tv") return null;
  if (!forcedType && item.media_type && item.media_type !== "movie" && item.media_type !== "tv") return null;
  const date = item.release_date || item.first_air_date || "";
  const genreIds = item.genre_ids ?? [];
  const language = item.original_language ?? "";
  return {
    tmdbId: item.id,
    mediaType,
    title: item.title || item.name || "Sans titre",
    overview: item.overview || "",
    posterPath: item.poster_path ?? null,
    year: date.slice(0, 4),
    genreIds,
    language,
    anime: genreIds.includes(16) && language === "ja",
    popularity: item.popularity ?? 0,
    voteAverage: typeof item.vote_average === "number" ? item.vote_average : undefined,
  };
}

export async function tmdb(path: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ path, ...params });
  const response = await fetch(`/api/tmdb?${query.toString()}`);
  const payload = (await response.json()) as { results?: Raw[]; status_message?: string; error?: string };
  if (!response.ok) {
    throw new Error(payload.error || payload.status_message || "Le catalogue est indisponible.");
  }
  return payload.results ?? [];
}

export async function tmdbDetails(mediaType: "movie" | "tv", id: number) {
  const query = new URLSearchParams({
    path: `${mediaType}/${id}`,
    append_to_response: "credits",
  });
  const response = await fetch(`/api/tmdb?${query.toString()}`);
  if (!response.ok) return null;
  return (await response.json()) as Record<string, unknown>;
}

export function inDecade(year: string, decade: string) {
  if (decade === "all") return true;
  if (!year) return false;
  const value = Number(year);
  const start = Number(decade);
  return value >= start && value <= start + 9;
}