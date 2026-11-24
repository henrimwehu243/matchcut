"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Film, Trash2, Users } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Poster, buttonClass, ghostClass, inputClass } from "@/components/ui";
import { formatLabel, genreLabels, tmdbDetails } from "@/lib/tmdb";
import { supabase } from "@/lib/supabase";
import type { Profile, Review, ReviewReaction, ReviewReply, Title } from "@/lib/types";

const QUICK_REACTIONS = ["Tellement d'accord", "T'abuses", "Spoiler !"];

type ExtraMeta = {
  runtime: number | null;
  seasons: number | null;
  episodes: number | null;
  director: string | null;
  cast: string[];
  overview: string | null;
};

function formatDuration(minutes: number | null) {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}min` : ""}` : `${m} min`;
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-emerald-400" aria-label={`${rating} sur 5`}>
      {[1, 2, 3, 4, 5].map((index) => {
        const full = rating >= index;
        const half = !full && rating >= index - 0.5;
        return (
          <span key={index} className="relative inline-block w-3.5 text-sm leading-none">
            <span className="text-zinc-700">★</span>
            {full ? (
              <span className="absolute inset-0 text-emerald-400">★</span>
            ) : half ? (
              <span className="absolute inset-0 w-1/2 overflow-hidden text-emerald-400">★</span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

function LetterboxdStarPicker({ value, onChange }: { value: number; onChange: (val: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="inline-flex items-center gap-1 rounded border border-white/10 bg-zinc-950 px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => onChange(0)}
          className={`mr-1 px-1.5 py-0.5 text-[11px] transition ${
            value === 0 ? "bg-white/15 text-white" : "text-zinc-500 hover:text-zinc-300"
          }`}
          title="0 étoile"
        >
          0
        </button>
        {[1, 2, 3, 4, 5].map((star) => {
          const full = value >= star;
          const half = !full && value >= star - 0.5;
          return (
            <div key={star} className="relative h-7 w-7 select-none">
              <span className="pointer-events-none flex h-full w-full items-center justify-center text-2xl text-zinc-700">
                ★
              </span>
              {full ? (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl text-emerald-400">
                  ★
                </span>
              ) : half ? (
                <span className="pointer-events-none absolute inset-y-0 left-0 flex w-1/2 items-center overflow-hidden text-2xl text-emerald-400">
                  ★
                </span>
              ) : null}
              <button
                type="button"
                aria-label={`${star - 0.5} étoiles`}
                onClick={() => onChange(star - 0.5)}
                className="absolute inset-y-0 left-0 w-1/2 cursor-pointer"
              />
              <button
                type="button"
                aria-label={`${star} étoiles`}
                onClick={() => onChange(star)}
                className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
              />
            </div>
          );
        })}
      </div>
      <span className="text-xs font-medium text-emerald-400">{value > 0 ? `${value} / 5` : "Sans étoile"}</span>
    </div>
  );
}

export function TitleDetailModal({
  title,
  onClose,
  onAddToList,
  onRecommend,
}: {
  title: Title | null;
  onClose: () => void;
  onAddToList?: (title: Title) => void;
  onRecommend?: (title: Title) => void;
}) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reactions, setReactions] = useState<ReviewReaction[]>([]);
  const [replies, setReplies] = useState<ReviewReply[]>([]);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [friendWatchlistIds, setFriendWatchlistIds] = useState<Set<string>>(new Set());
  const [meta, setMeta] = useState<ExtraMeta | null>(null);

  const [rating, setRating] = useState<number>(4);
  const [comment, setComment] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [inviteFriendId, setInviteFriendId] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!title) return;
    setFeedback(null);
    setInviteOpen(false);
    setInviteFriendId("");
    setMeta(null);
    void loadAllData();
    void loadExtraMeta(title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  async function loadExtraMeta(t: Title) {
    try {
      const raw = await tmdbDetails(t.mediaType, t.tmdbId);
      if (!raw) return;

      const credits = (raw.credits as { crew?: { job?: string; name?: string }[]; cast?: { name?: string }[] }) ?? {};
      const crew = Array.isArray(credits.crew) ? credits.crew : [];
      const castArr = Array.isArray(credits.cast) ? credits.cast : [];
      const directorObj = crew.find((c) => c.job === "Director");
      const createdBy = Array.isArray(raw.created_by)
        ? (raw.created_by as { name?: string }[]).map((c) => c.name).filter(Boolean)
        : [];

      const runtimeVal =
        typeof raw.runtime === "number"
          ? raw.runtime
          : Array.isArray(raw.episode_run_time) && typeof raw.episode_run_time[0] === "number"
          ? raw.episode_run_time[0]
          : null;

      setMeta({
        runtime: runtimeVal,
        seasons: typeof raw.number_of_seasons === "number" ? raw.number_of_seasons : null,
        episodes: typeof raw.number_of_episodes === "number" ? raw.number_of_episodes : null,
        director: directorObj?.name || (createdBy.length > 0 ? createdBy.join(", ") : null),
        cast: castArr
          .slice(0, 4)
          .map((c) => c.name || "")
          .filter(Boolean),
        overview: typeof raw.overview === "string" && raw.overview.trim() ? raw.overview : null,
      });
    } catch {
      // Silencieux si indisponible
    }
  }

  async function loadAllData() {
    if (!title) return;
    setLoading(true);

    let friendProfiles: Profile[] = [];
    if (user) {
      const { data: links } = await supabase
        .from("friendships")
        .select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
      const ids = (links ?? []).map((row) => (row.requester_id === user.id ? row.addressee_id : row.requester_id));
      if (ids.length) {
        const [{ data: profs }, { data: wItems }] = await Promise.all([
          supabase.from("profiles").select("*").in("id", ids),
          supabase
            .from("watch_items")
            .select("user_id, status")
            .in("user_id", ids)
            .eq("tmdb_id", title.tmdbId)
            .eq("media_type", title.mediaType)
            .eq("status", "to_watch"),
        ]);
        friendProfiles = (profs as Profile[]) ?? [];
        setFriendWatchlistIds(new Set((wItems ?? []).map((w) => w.user_id as string)));
      } else {
        setFriendWatchlistIds(new Set());
      }
    }
    setFriends(friendProfiles);

    const { data: revData } = await supabase
      .from("reviews")
      .select("*, profiles(username, full_name)")
      .eq("tmdb_id", title.tmdbId)
      .eq("media_type", title.mediaType)
      .order("created_at", { ascending: false });

    const list = (revData as Review[]) ?? [];
    setReviews(list);

    if (user) {
      const mine = list.find((r) => r.user_id === user.id);
      if (mine) {
        setRating(Number(mine.rating));
        setComment(mine.comment ?? "");
      } else {
        setRating(4);
        setComment("");
      }
    }

    const reviewIds = list.map((r) => r.id);
    if (reviewIds.length > 0) {
      const [{ data: reactData }, { data: repData }] = await Promise.all([
        supabase.from("review_reactions").select("*").in("review_id", reviewIds),
        supabase
          .from("review_replies")
          .select("*, profiles(username, full_name)")
          .in("review_id", reviewIds)
          .order("created_at", { ascending: true }),
      ]);
      setReactions((reactData as ReviewReaction[]) ?? []);
      setReplies((repData as ReviewReply[]) ?? []);
    } else {
      setReactions([]);
      setReplies([]);
    }

    setLoading(false);
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !title) return;
    setSaving(true);
    setFeedback(null);

    const { error: revErr } = await supabase.from("reviews").upsert(
      {
        user_id: user.id,
        tmdb_id: title.tmdbId,
        media_type: title.mediaType,
        title: title.title,
        rating,
        comment: comment.trim() || null,
      },
      { onConflict: "user_id,tmdb_id,media_type" },
    );

    if (revErr) {
      setFeedback(`Erreur : ${revErr.message}`);
      setSaving(false);
      return;
    }

    await supabase.from("watch_items").upsert(
      {
        user_id: user.id,
        tmdb_id: title.tmdbId,
        media_type: title.mediaType,
        title: title.title,
        poster_path: title.posterPath,
        year: title.year,
        status: "watched",
        rating,
      },
      { onConflict: "user_id,tmdb_id,media_type" },
    );

    setSaving(false);
    setFeedback("Note et avis enregistrés (marqué comme Vu) !");
    await loadAllData();
  }

  async function deleteReview(reviewId: string) {
    if (!user) return;
    const { error: delErr } = await supabase.from("reviews").delete().eq("id", reviewId).eq("user_id", user.id);
    if (delErr) {
      setFeedback(`Erreur : ${delErr.message}`);
      return;
    }
    setRating(4);
    setComment("");
    setFeedback("Ton avis a bien été supprimé.");
    await loadAllData();
  }

  async function toggleReaction(reviewId: string, emoji: string) {
    if (!user) return;
    const existing = reactions.find((r) => r.review_id === reviewId && r.user_id === user.id && r.emoji === emoji);
    if (existing) {
      await supabase.from("review_reactions").delete().eq("id", existing.id);
    } else {
      await supabase.from("review_reactions").insert({ review_id: reviewId, user_id: user.id, emoji });
    }
    await loadAllData();
  }

  async function sendReply(reviewId: string) {
    if (!user) return;
    const text = (replyDrafts[reviewId] ?? "").trim();
    if (!text) return;
    await supabase.from("review_replies").insert({ review_id: reviewId, user_id: user.id, body: text });
    setReplyDrafts((prev) => ({ ...prev, [reviewId]: "" }));
    await loadAllData();
  }

  async function sendWatchInvite() {
    if (!user || !title || !inviteFriendId) return;
    const { error } = await supabase.from("direct_messages").insert({
      sender_id: user.id,
      receiver_id: inviteFriendId,
      body: `Chaud pour regarder ${title.title} ensemble ?`,
      tmdb_id: title.tmdbId,
      media_type: title.mediaType,
      movie_title: title.title,
      poster_path: title.posterPath,
      invite_status: "pending",
    });
    if (error) {
      setFeedback(`Erreur : ${error.message}`);
      return;
    }
    setInviteOpen(false);
    setFeedback("Invitation « On se le regarde ? » envoyée en message privé !");
  }

  if (!title) return null;

  const friendIdsSet = new Set(friends.map((f) => f.id));
  const friendReviews = reviews.filter((r) => friendIdsSet.has(r.user_id));
  const sortedReviews = [...friendReviews, ...reviews.filter((r) => !friendIdsSet.has(r.user_id))];
  const myReview = user ? reviews.find((r) => r.user_id === user.id) : null;

  const ratedReviews = reviews.filter((r) => Number(r.rating) > 0);
  const avgMatchCut =
    ratedReviews.length > 0
      ? (ratedReviews.reduce((sum, r) => sum + Number(r.rating), 0) / ratedReviews.length).toFixed(1)
      : null;

  const durationText = formatDuration(meta?.runtime ?? null);
  const synopsisText = meta?.overview || title.overview || "Aucun synopsis disponible en français pour ce titre.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden border border-white/15 bg-[#0c0c0f] text-[#f4f1ea] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <span className="text-xs uppercase tracking-[0.2em] text-zinc-400">
            {formatLabel(title)}
            {title.year ? ` · ${title.year}` : ""}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="border border-white/15 px-2.5 py-1 text-xs text-zinc-400 hover:border-white/40 hover:text-white"
          >
            Fermer ✕
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row">
            <div className="mx-auto w-36 shrink-0 overflow-hidden border border-white/15 bg-zinc-950 sm:mx-0 sm:w-44">
              <Poster path={title.posterPath} alt={title.title} className="aspect-[2/3] w-full" />
            </div>

            <div className="flex-1 space-y-3">
              <h2 className="font-serif text-2xl leading-tight text-[#f4f1ea] sm:text-3xl">{title.title}</h2>

              {/* Durée / Saisons / Épisodes / Genres */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                {title.mediaType === "movie" && durationText ? (
                  <span className="inline-flex items-center gap-1 font-medium text-amber-300">
                    <Clock size={13} />
                    {durationText}
                  </span>
                ) : null}
                {title.mediaType === "tv" && (meta?.seasons || meta?.episodes) ? (
                  <span className="inline-flex items-center gap-1 font-medium text-amber-300">
                    <Film size={13} />
                    {meta.seasons ? `${meta.seasons} saison${meta.seasons > 1 ? "s" : ""}` : ""}
                    {meta.seasons && meta.episodes ? " · " : ""}
                    {meta.episodes ? `${meta.episodes} épisodes` : ""}
                  </span>
                ) : null}
                {title.genreIds.length > 0 ? (
                  <span className="uppercase tracking-wider">{genreLabels(title.genreIds, 4).join(" · ")}</span>
                ) : null}
              </div>

              {/* Réalisateur & Casting */}
              {meta?.director || (meta?.cast && meta.cast.length > 0) ? (
                <div className="space-y-1 border-l-2 border-white/15 pl-3 text-xs text-zinc-400">
                  {meta.director ? (
                    <p>
                      <span className="text-zinc-500">
                        {title.mediaType === "movie" ? "Réalisation : " : "Création : "}
                      </span>
                      <span className="text-zinc-200">{meta.director}</span>
                    </p>
                  ) : null}
                  {meta.cast.length > 0 ? (
                    <p className="flex items-start gap-1">
                      <Users size={12} className="mt-0.5 shrink-0 text-zinc-500" />
                      <span>
                        <span className="text-zinc-500">Avec : </span>
                        <span className="text-zinc-300">{meta.cast.join(", ")}</span>
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2.5 pt-1">
                <div className="border border-white/10 bg-white/[0.03] px-3 py-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">Note TMDB</p>
                  <p className="text-sm font-semibold text-[#f4f1ea]">
                    {title.voteAverage && title.voteAverage > 0 ? `${title.voteAverage.toFixed(1)} / 10` : "N/A"}
                  </p>
                </div>
                <div className="border border-white/10 bg-white/[0.03] px-3 py-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">Note MatchCut</p>
                  <p className="text-sm font-semibold text-emerald-400">
                    {avgMatchCut ? `${avgMatchCut} / 5 (${ratedReviews.length})` : "Aucune note"}
                  </p>
                </div>
              </div>

              <p className="text-sm leading-relaxed text-zinc-300">{synopsisText}</p>

              <div className="flex flex-wrap gap-2 pt-2">
                {onAddToList ? (
                  <button type="button" className={`${ghostClass} px-3 py-1.5 text-xs`} onClick={() => onAddToList(title)}>
                    + Ma liste
                  </button>
                ) : null}
                {onRecommend ? (
                  <button type="button" className={`${ghostClass} px-3 py-1.5 text-xs`} onClick={() => onRecommend(title)}>
                    Recommander
                  </button>
                ) : null}
                {user ? (
                  <button
                    type="button"
                    className="border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
                    onClick={() => setInviteOpen((v) => !v)}
                  >
                    On se le regarde ?
                  </button>
                ) : null}
              </div>

              {inviteOpen ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 border border-emerald-500/30 bg-emerald-950/20 p-3">
                  <select
                    className="border border-white/15 bg-[#09090b] px-2.5 py-1.5 text-xs text-white"
                    value={inviteFriendId}
                    onChange={(e) => setInviteFriendId(e.target.value)}
                  >
                    <option value="">Choisir un ami à inviter...</option>
                    {friends.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.username || f.full_name || "Ami"}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!inviteFriendId}
                    onClick={sendWatchInvite}
                    className="bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 disabled:opacity-40"
                  >
                    Envoyer l&apos;invitation
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {friends.length > 0 && (friendReviews.length > 0 || friendWatchlistIds.size > 0) ? (
            <div className="border border-white/10 bg-white/[0.03] p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Dans ton cercle d&apos;amis</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {friendReviews.map((fr) => (
                  <Link
                    key={fr.id}
                    href={`/membre/${fr.user_id}`}
                    onClick={onClose}
                    className="inline-flex items-center gap-1.5 border border-white/10 bg-zinc-900 px-2.5 py-1 text-xs hover:border-white/30"
                  >
                    <span className="font-medium text-white hover:underline">
                      {fr.profiles?.username || fr.profiles?.full_name || "Ami"}
                    </span>
                    <span className="text-zinc-400">a vu</span>
                    {Number(fr.rating) > 0 ? <StarDisplay rating={Number(fr.rating)} /> : null}
                  </Link>
                ))}
                {friends
                  .filter((f) => friendWatchlistIds.has(f.id) && !friendReviews.some((r) => r.user_id === f.id))
                  .map((f) => (
                    <Link
                      key={f.id}
                      href={`/membre/${f.id}`}
                      onClick={onClose}
                      className="inline-flex items-center gap-1.5 border border-white/10 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 hover:border-white/30"
                    >
                      <span className="font-medium text-white hover:underline">{f.username || f.full_name || "Ami"}</span>{" "}
                      l&apos;a dans sa liste À voir
                    </Link>
                  ))}
              </div>
            </div>
          ) : null}

          <hr className="border-white/10" />

          {user ? (
            <form onSubmit={submitReview} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-serif text-lg text-[#f4f1ea]">Ta note &amp; ton avis</h3>
                <LetterboxdStarPicker value={rating} onChange={setRating} />
              </div>
              <textarea
                className={`${inputClass} min-h-20 text-sm`}
                placeholder="Écris ton avis pour tes amis (enregistre la note et marque automatiquement comme Vu)..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={500}
              />
              {feedback ? <p className="text-xs text-emerald-400">{feedback}</p> : null}
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" className={`${buttonClass} text-xs`} disabled={saving}>
                  {saving ? "Enregistrement..." : myReview ? "Mettre à jour mon avis" : "Publier (Marquer comme Vu)"}
                </button>
                {myReview ? (
                  <button
                    type="button"
                    onClick={() => deleteReview(myReview.id)}
                    className="inline-flex items-center gap-1.5 border border-red-500/30 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 size={13} />
                    Supprimer mon avis
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}

          <div className="space-y-3">
            <h3 className="font-serif text-lg text-[#f4f1ea]">Avis ({sortedReviews.length})</h3>
            {loading ? (
              <p className="text-xs text-zinc-500">Chargement...</p>
            ) : sortedReviews.length === 0 ? (
              <p className="text-xs text-zinc-500">Aucun avis pour l&apos;instant. Lance la discussion !</p>
            ) : (
              <div className="space-y-3">
                {sortedReviews.map((rev) => {
                  const isFriend = friendIdsSet.has(rev.user_id);
                  const isMine = user?.id === rev.user_id;
                  const revReactions = reactions.filter((r) => r.review_id === rev.id);
                  const revReplies = replies.filter((r) => r.review_id === rev.id);

                  return (
                    <div
                      key={rev.id}
                      className={`border p-3.5 ${
                        isFriend ? "border-emerald-500/30 bg-emerald-950/10" : "border-white/10 bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Link
                            href={isMine ? "/profil" : `/membre/${rev.user_id}`}
                            onClick={onClose}
                            className="text-xs font-semibold text-[#f4f1ea] hover:underline"
                          >
                            {rev.profiles?.username || rev.profiles?.full_name || "Membre"}
                          </Link>
                          {isFriend ? (
                            <span className="bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">Ami</span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3">
                          {Number(rev.rating) > 0 ? (
                            <StarDisplay rating={Number(rev.rating)} />
                          ) : (
                            <span className="text-[11px] text-zinc-500">Vu</span>
                          )}
                          {isMine ? (
                            <button
                              type="button"
                              onClick={() => deleteReview(rev.id)}
                              className="text-zinc-500 hover:text-red-400"
                              title="Supprimer cet avis"
                            >
                              <Trash2 size={13} />
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {rev.comment ? <p className="mt-2 text-sm leading-relaxed text-zinc-200">{rev.comment}</p> : null}

                      {user ? (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          {QUICK_REACTIONS.map((label) => {
                            const count = revReactions.filter((r) => r.emoji === label).length;
                            const active = revReactions.some((r) => r.emoji === label && r.user_id === user.id);
                            return (
                              <button
                                key={label}
                                type="button"
                                onClick={() => toggleReaction(rev.id, label)}
                                className={`border px-2 py-0.5 text-[11px] transition ${
                                  active
                                    ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-200"
                                    : "border-white/10 text-zinc-400 hover:border-white/30 hover:text-zinc-200"
                                }`}
                              >
                                {label} {count > 0 ? `(${count})` : ""}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}

                      {revReplies.length > 0 ? (
                        <div className="mt-3 space-y-1.5 border-l-2 border-white/10 pl-3">
                          {revReplies.map((rep) => (
                            <div key={rep.id} className="text-xs">
                              <span className="font-semibold text-zinc-200">
                                {rep.profiles?.username || rep.profiles?.full_name || "Membre"} :{" "}
                              </span>
                              <span className="text-zinc-400">{rep.body}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {user ? (
                        <div className="mt-2.5 flex gap-2">
                          <input
                            type="text"
                            placeholder="Répondre à cet avis..."
                            value={replyDrafts[rev.id] ?? ""}
                            onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [rev.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void sendReply(rev.id);
                              }
                            }}
                            className="flex-1 border border-white/10 bg-zinc-950 px-2.5 py-1 text-xs text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => sendReply(rev.id)}
                            className="border border-white/15 px-2.5 py-1 text-xs text-zinc-300 hover:border-white/40"
                          >
                            Répondre
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}