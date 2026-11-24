"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { TitleDetailModal } from "@/components/title-detail-modal";
import { ErrorNote, PageHeader, Poster, Stars, ghostClass } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import type { Profile, Recommendation, Title, WatchItem } from "@/lib/types";

type Tab = "received" | "to_watch" | "watched";

export function ListsView() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("received");
  const [items, setItems] = useState<WatchItem[]>([]);
  const [received, setReceived] = useState<Recommendation[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [selectedTitle, setSelectedTitle] = useState<Title | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [watchResult, memberships] = await Promise.all([
      supabase.from("watch_items").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("group_members").select("group_id").eq("user_id", user.id),
    ]);
    if (watchResult.error) setError(watchResult.error.message);
    else setItems((watchResult.data as WatchItem[]) ?? []);

    const groupIds = (memberships.data ?? []).map((row) => row.group_id as string);
    let recommendationQuery = supabase.from("recommendations").select("*").order("created_at", { ascending: false });
    recommendationQuery = groupIds.length
      ? recommendationQuery.or(`to_user_id.eq.${user.id},to_group_id.in.(${groupIds.join(",")})`)
      : recommendationQuery.eq("to_user_id", user.id);
    const recommendationResult = await recommendationQuery;
    if (recommendationResult.error) setError(recommendationResult.error.message);
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
    } else setPeople({});
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(item: WatchItem, status: WatchItem["status"]) {
    const { error: writeError } = await supabase
      .from("watch_items")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (writeError) setError(writeError.message);
    else setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, status } : row)));
  }

  async function setRating(item: WatchItem, rating: number) {
    const { error: writeError } = await supabase
      .from("watch_items")
      .update({ rating, status: "watched", updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (writeError) setError(writeError.message);
    else setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, rating, status: "watched" } : row)));
  }

  async function removeItem(item: WatchItem) {
    const { error: delError } = await supabase.from("watch_items").delete().eq("id", item.id);
    if (delError) setError(delError.message);
    else setItems((prev) => prev.filter((row) => row.id !== item.id));
  }

  async function keep(recommendation: Recommendation) {
    if (!user) return;
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
    if (writeError) setError(writeError.message);
    else void load();
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
  const tabs: { id: Tab; label: string }[] = [
    { id: "received", label: `Reçues (${received.length})` },
    { id: "to_watch", label: `À voir (${items.filter((i) => i.status === "to_watch").length})` },
    { id: "watched", label: `Vu (${items.filter((i) => i.status === "watched").length})` },
  ];

  return (
    <div>
      <PageHeader
        kicker="Mémoire"
        title="Listes"
        text="Cliquez sur un titre pour ouvrir sa fiche détaillée, ajuster votre note ou le retirer de votre liste."
      />
      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-3 py-1.5 text-sm ${tab === item.id ? "bg-[#f4f1ea] text-[#09090b]" : "border border-white/15 text-zinc-300"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <ErrorNote message={error} />
      {loading ? <p className="mt-6 text-sm text-zinc-500">Chargement…</p> : null}

      {tab === "received" ? (
        <div className="mt-6 space-y-3">
          {received.map((item) => {
            const sender = people[item.from_user_id];
            return (
              <article key={item.id} className="flex gap-4 border border-white/10 p-3">
                <button
                  type="button"
                  onClick={() => openTitle(item)}
                  className="h-24 w-16 shrink-0 overflow-hidden bg-zinc-950 transition hover:opacity-80"
                >
                  <Poster path={item.poster_path} alt={item.title} className="h-full w-full" />
                </button>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => openTitle(item)}
                    className="text-left font-serif text-2xl text-[#f4f1ea] hover:underline"
                  >
                    {item.title}
                  </button>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-500">
                    {item.media_type === "movie" ? "Film" : "Série"}
                    {item.year ? ` · ${item.year}` : ""}
                    {" · "}
                    <Link href={`/membre/${item.from_user_id}`} className="text-zinc-300 hover:underline">
                      {sender?.username || sender?.full_name || "Un ami"}
                    </Link>
                  </p>
                  {item.note ? <p className="mt-2 text-sm leading-6 text-zinc-400">{item.note}</p> : null}
                  <button type="button" className={`${ghostClass} mt-3 px-3 py-1.5 text-xs`} onClick={() => keep(item)}>
                    Ajouter à ma liste
                  </button>
                </div>
              </article>
            );
          })}
          {!loading && received.length === 0 ? <p className="text-sm text-zinc-500">Aucune recommandation reçue.</p> : null}
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {visible.map((item) => (
            <article key={item.id} className="flex gap-4 border border-white/10 p-3">
              <button
                type="button"
                onClick={() => openTitle(item)}
                className="h-24 w-16 shrink-0 overflow-hidden bg-zinc-950 transition hover:opacity-80"
              >
                <Poster path={item.poster_path} alt={item.title} className="h-full w-full" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openTitle(item)}
                    className="text-left font-serif text-2xl text-[#f4f1ea] hover:underline"
                  >
                    {item.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(item)}
                    className="inline-flex items-center gap-1 border border-white/10 px-2 py-1 text-[11px] text-zinc-400 hover:border-red-500/40 hover:text-red-400"
                    title="Retirer de la liste"
                  >
                    <Trash2 size={12} />
                    Retirer
                  </button>
                </div>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-500">
                  {item.media_type === "movie" ? "Film" : "Série"}
                  {item.year ? ` · ${item.year}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <Stars value={item.rating ?? 0} onChange={(rating) => setRating(item, rating)} />
                  <button
                    type="button"
                    className="text-xs uppercase tracking-[0.16em] text-zinc-400 hover:text-white"
                    onClick={() => setStatus(item, item.status === "watched" ? "to_watch" : "watched")}
                  >
                    {item.status === "watched" ? "Remettre à voir" : "Marquer vu"}
                  </button>
                </div>
              </div>
            </article>
          ))}
          {!loading && visible.length === 0 ? <p className="text-sm text-zinc-500">Cette liste est vide.</p> : null}
        </div>
      )}

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