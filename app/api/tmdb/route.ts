const ALLOWED = new Set(["search/multi", "search/movie", "search/tv", "discover/movie", "discover/tv"]);

const PASS = new Set([
  "query",
  "page",
  "sort_by",
  "with_genres",
  "with_original_language",
  "primary_release_date.gte",
  "primary_release_date.lte",
  "first_air_date.gte",
  "first_air_date.lte",
  "vote_count.gte",
  "append_to_response",
]);

function isAllowedPath(path: string) {
  if (ALLOWED.has(path)) return true;
  return /^(movie|tv)\/\d+$/.test(path);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const path = url.searchParams.get("path") ?? "";
  if (!isAllowedPath(path)) {
    return Response.json({ error: "Recherche refusée." }, { status: 400 });
  }

  const key = process.env.TMDB_API_KEY;
  if (!key) {
    return Response.json({ error: "Clé TMDB manquante." }, { status: 500 });
  }

  const params = new URLSearchParams({
    api_key: key,
    language: "fr-FR",
    include_adult: "false",
  });
  url.searchParams.forEach((value, name) => {
    if (PASS.has(name) && value) params.set(name, value);
  });

  const response = await fetch(`https://api.themoviedb.org/3/${path}?${params.toString()}`, {
    cache: "no-store",
  });
  const payload = await response.json();
  return Response.json(payload, { status: response.status });
}