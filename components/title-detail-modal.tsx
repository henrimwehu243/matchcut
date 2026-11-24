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
  return h > 0 ? `${h} h ${m > 0 ? `${m.toString().padStart(2, "0")}` : ""}` : `${m} min`;
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[#C49A58]" aria-label={`${rating} sur 5`}>
      {[1, 2, 3, 4, 5].map((index) => {
        const full = rating >= index;
        const half = !full && rating >= index - 0.5;
        return (
          <span key={index} className="relative inline-block w-3.5 text-sm leading-none">
            <span className="text-[#EAE6DE]/20">★</span>
            {full ? (
              <span className="absolute inset-0 text-[#C49A58]">★</span>
            ) : half ? (
              <span className="absolute inset-0 w-1/2 overflow-hidden text-[#C49A58]">★</span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

function LetterboxdStarPicker({ value, onChange }: { value: number; onChange: (val: number) => void }) {
  return (
    <div className="flex items-center gap-4">
      <div className="inline-flex items-center gap-1 border-b border-[#EAE6DE]/15 pb-1">
        <button
          type="button"
          onClick={() => onChange(0)}
          className={`mc-kicker mr-1.5 px-1.5 py-0.5 text-[10px] transition ${
            value === 0 ? "bg-[#C49A58] font-semibold text-[#101112]" : "text-[#EAE6DE]/45 hover:text-[#EAE6DE]"
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
              <span className="pointer-events-none flex h-full w-full items-center justify-center text-2xl text-[#EAE6DE]/20">
                ★
              </span>
              {full ? (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl text-[#C49A58]">
                  ★
                </span>
              ) : half ? (
                <span className="pointer-events-none absolute inset-y-0 left-0 flex w-1/2 items-center overflow-hidden text-2xl text-[#C49A58]">
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
      <span className="mc-kicker text-[10px] text-[#C49A58]">
        {value > 0 ? `${value} / 5` : "Sans note"}
      </span>
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
    setFeedback("Note et avis enregistrés (versé aux titres vus).");
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
    setFeedback("Avis supprimé.");
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
      body: `On se le fait : ${title.title} ?`,
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
    setFeedback("« On se le fait ? » envoyé en message privé !");
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
  const synopsisText =
    meta?.overview || title.overview || "Aucun synopsis disponible en français pour cette œuvre.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#101112]/88 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="editorial-enter relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden border border-[#EAE6DE]/15 bg-[#101112] text-[#EAE6DE]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#EAE6DE]/12 bg-[#202224]/50 px-6 py-4">
          <span className="mc-kicker text-[10px] text-[#C49A58]">
            Fiche d’œuvre · {formatLabel(title)}
            {title.year ? ` · ${title.year}` : ""}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="mc-kicker border-b border-[#EAE6DE]/30 pb-0.5 text-[10px] text-[#EAE6DE]/75 transition hover:border-[#C49A58] hover:text-[#EAE6DE]"
          >
            Fermer
          </button>
        </div>

        <div className="space-y-10 overflow-y-auto px-6 py-8 sm:px-10">
          <div className="flex flex-col gap-8 border-b border-[#EAE6DE]/12 pb-10 sm:flex-row">
            <div className="frame-zoom-in mx-auto w-44 shrink-0 overflow-hidden bg-[#202224] sm:mx-0 sm:w-52">
              <Poster path={title.posterPath} alt={title.title} className="aspect-[2/3] w-full" />
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              <p className="mc-kicker text-[10px] text-[#A3B99B]">
                {title.genreIds.length > 0 ? genreLabels(title.genreIds, 4).join("  /  ") : formatLabel(title)}
              </p>

              <h2 className="font-serif text-4xl leading-[1.02] tracking-tight text-[#EAE6DE] sm:text-5xl">
                {title.title}
              </h2>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-[#EAE6DE]/10 py-3 text-xs">
                {title.mediaType === "movie" && durationText ? (
                  <span className="mc-kicker inline-flex items-center gap-1.5 text-[10px] text-[#C49A58]">
                    <Clock size={12} />
                    <span>{durationText}</span>
                  </span>
                ) : null}
                {title.mediaType === "tv" && (meta?.seasons || meta?.episodes) ? (
                  <span className="mc-kicker inline-flex items-center gap-1.5 text-[10px] text-[#C49A58]">
                    <Film size={12} />
                    <span>
                      {meta.seasons ? `${meta.seasons} saison${meta.seasons > 1 ? "s" : ""}` : ""}
                      {meta.seasons && meta.episodes ? " · " : ""}
                      {meta.episodes ? `${meta.episodes} épisodes` : ""}
                    </span>
                  </span>
                ) : null}
                <span className="mc-kicker text-[10px] text-[#EAE6DE]/65">
                  TMDB :{" "}
                  <strong className="text-[#EAE6DE]">
                    {title.voteAverage && title.voteAverage > 0 ? `${title.voteAverage.toFixed(1)}/10` : "—"}
                  </strong>
                </span>
                <span className="mc-kicker text-[10px] text-[#A3B99B]">
                  Cercle :{" "}
                  <strong>
                    {avgMatchCut ? `${avgMatchCut}/5 (${ratedReviews.length})` : "Aucune note"}
                  </strong>
                </span>
              </div>

              {meta?.director || (meta?.cast && meta.cast.length > 0) ? (
                <div className="space-y-1.5 border-l border-[#C49A58]/60 pl-4 text-xs text-[#EAE6DE]/75">
                  {meta.director ? (
                    <p>
                      <span className="mc-kicker mr-2 text-[9px] text-[#EAE6DE]/45">
                        {title.mediaType === "movie" ? "Réalisation" : "Création"}
                      </span>
                      <span className="font-serif text-lg text-[#EAE6DE]">{meta.director}</span>
                    </p>
                  ) : null}
                  {meta.cast.length > 0 ? (
                    <p className="flex items-start gap-1.5">
                      <Users size={12} className="mt-1 shrink-0 text-[#EAE6DE]/45" />
                      <span>
                        <span className="mc-kicker mr-1.5 text-[9px] text-[#EAE6DE]/45">Avec</span>
                        <span className="text-[#EAE6DE]/80">{meta.cast.join(", ")}</span>
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : null}

              <p className="pt-1 text-sm leading-relaxed text-[#EAE6DE]/80">{synopsisText}</p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                {onAddToList ? (
                  <button
                    type="button"
                    className={`${ghostClass} px-3.5 py-2 text-xs`}
                    onClick={() => onAddToList(title)}
                  >
                    + À voir
                  </button>
                ) : null}
                {onRecommend ? (
                  <button
                    type="button"
                    className={`${ghostClass} px-3.5 py-2 text-xs`}
                    onClick={() => onRecommend(title)}
                  >
                    Recommander
                  </button>
                ) : null}
                {user ? (
                  <button
                    type="button"
                    className="mc-kicker border-b border-[#A3B99B] pb-1 text-[10px] text-[#A3B99B] transition hover:text-[#EAE6DE]"
                    onClick={() => setInviteOpen((v) => !v)}
                  >
                    On se le fait ?
                  </button>
                ) : null}
              </div>

              {inviteOpen ? (
                <div className="mt-3 space-y-2 border-t border-[#EAE6DE]/12 pt-4">
                  <p className="mc-kicker text-[10px] text-[#A3B99B]">On se le fait ?</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      className="py-1.5 text-xs"
                      value={inviteFriendId}
                      onChange={(e) => setInviteFriendId(e.target.value)}
                    >
                      <option value="">Choisir un ami…</option>
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
                      className="mc-kicker bg-[#A3B99B] px-3.5 py-2 text-[10px] font-semibold text-[#101112] disabled:opacity-40"
                    >
                      Envoyer
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {friends.length > 0 && (friendReviews.length > 0 || friendWatchlistIds.size > 0) ? (
            <div className="border-b border-[#EAE6DE]/12 pb-8">
              <p className="mc-kicker text-[10px] text-[#C49A58]">Dans votre cercle</p>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
                {friendReviews.map((fr) => (
                  <Link
                    key={fr.id}
                    href={`/membre/${fr.user_id}`}
                    onClick={onClose}
                    className="inline-flex items-center gap-2 border-b border-[#EAE6DE]/15 pb-1 hover:border-[#C49A58]"
                  >
                    <span className="font-serif text-base text-[#EAE6DE]">
                      {fr.profiles?.username || fr.profiles?.full_name || "Ami"}
                    </span>
                    <span className="mc-kicker text-[9px] text-[#EAE6DE]/50">a vu</span>
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
                      className="inline-flex items-center gap-2 border-b border-[#EAE6DE]/15 pb-1 text-[#EAE6DE]/75 hover:border-[#A3B99B]"
                    >
                      <span className="font-serif text-base text-[#EAE6DE]">
                        {f.username || f.full_name || "Ami"}
                      </span>
                      <span className="mc-kicker text-[9px] text-[#A3B99B]">l’a dans À voir</span>
                    </Link>
                  ))}
              </div>
            </div>
          ) : null}

          {user ? (
            <form onSubmit={submitReview} className="space-y-4 border-b border-[#EAE6DE]/12 pb-10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-serif text-2xl text-[#EAE6DE]">Votre note &amp; impression</h3>
                <LetterboxdStarPicker value={rating} onChange={setRating} />
              </div>
              <textarea
                className={`${inputClass} min-h-20 rounded-none border-x-0 border-t-0 border-b border-[#EAE6DE]/20 bg-transparent px-0 py-2 text-sm text-[#EAE6DE] placeholder:text-[#EAE6DE]/35 focus:border-[#C49A58] focus:outline-none`}
                placeholder="Écrivez quelques lignes sur la réalisation, le jeu, l’atmosphère…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={500}
              />
              {feedback ? <p className="text-xs text-[#A3B99B]">{feedback}</p> : null}
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <button type="submit" className={buttonClass} disabled={saving}>
                  <span>{saving ? "Enregistrement…" : myReview ? "Mettre à jour" : "Publier (Marquer vu)"}</span>
                </button>
                {myReview ? (
                  <button
                    type="button"
                    onClick={() => deleteReview(myReview.id)}
                    className="mc-kicker inline-flex items-center gap-1.5 text-[10px] text-[#EAE6DE]/50 hover:text-[#EAE6DE]"
                  >
                    <Trash2 size={12} />
                    <span>Supprimer</span>
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}

          <div className="space-y-6">
            <div className="flex items-baseline justify-between">
              <h3 className="font-serif text-3xl text-[#EAE6DE]">Notes &amp; échanges</h3>
              <span className="mc-kicker text-[10px]">{sortedReviews.length} contribution{sortedReviews.length > 1 ? "s" : ""}</span>
            </div>

            {loading ? (
              <p className="mc-kicker text-[10px]">Chargement…</p>
            ) : sortedReviews.length === 0 ? (
              <p className="font-serif text-lg italic text-[#EAE6DE]/50">
                Aucun avis publié pour cette œuvre pour l’instant.
              </p>
            ) : (
              <div className="divide-y divide-[#EAE6DE]/10 border-t border-[#EAE6DE]/10">
                {sortedReviews.map((rev) => {
                  const isFriend = friendIdsSet.has(rev.user_id);
                  const isMine = user?.id === rev.user_id;
                  const revReactions = reactions.filter((r) => r.review_id === rev.id);
                  const revReplies = replies.filter((r) => r.review_id === rev.id);

                  return (
                    <article key={rev.id} className="space-y-3 py-6">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Link
                            href={isMine ? "/profil" : `/membre/${rev.user_id}`}
                            onClick={onClose}
                            className="font-serif text-xl text-[#EAE6DE] hover:text-[#C49A58]"
                          >
                            {rev.profiles?.username || rev.profiles?.full_name || "Membre"}
                          </Link>
                          {isFriend ? (
                            <span className="mc-kicker text-[9px] text-[#A3B99B]">Proche</span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-3">
                          {Number(rev.rating) > 0 ? (
                            <StarDisplay rating={Number(rev.rating)} />
                          ) : (
                            <span className="mc-kicker text-[9px] text-[#EAE6DE]/45">Vu</span>
                          )}
                          {isMine ? (
                            <button
                              type="button"
                              onClick={() => deleteReview(rev.id)}
                              className="p-1 text-[#EAE6DE]/40 hover:text-[#EAE6DE]"
                              title="Supprimer cet avis"
                            >
                              <Trash2 size={13} />
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {rev.comment ? (
                        <p className="border-l border-[#C49A58]/50 pl-4 font-serif text-lg italic leading-relaxed text-[#EAE6DE]/80">
                          « {rev.comment} »
                        </p>
                      ) : null}

                      {user ? (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {QUICK_REACTIONS.map((label) => {
                            const count = revReactions.filter((r) => r.emoji === label).length;
                            const active = revReactions.some((r) => r.emoji === label && r.user_id === user.id);
                            return (
                              <button
                                key={label}
                                type="button"
                                onClick={() => toggleReaction(rev.id, label)}
                                className={`mc-kicker border px-2.5 py-1 text-[9px] transition ${
                                  active
                                    ? "border-[#C49A58] bg-[#C49A58]/15 text-[#EAE6DE]"
                                    : "border-[#EAE6DE]/12 text-[#EAE6DE]/55 hover:border-[#EAE6DE]/30 hover:text-[#EAE6DE]"
                                }`}
                              >
                                {label} {count > 0 ? `(${count})` : ""}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}

                      {revReplies.length > 0 ? (
                        <div className="mt-3 space-y-1.5 border-l border-[#EAE6DE]/15 pl-4">
                          {revReplies.map((rep) => (
                            <div key={rep.id} className="text-xs">
                              <span className="font-semibold text-[#EAE6DE]">
                                {rep.profiles?.username || rep.profiles?.full_name || "Membre"} :{" "}
                              </span>
                              <span className="text-[#EAE6DE]/65">{rep.body}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {user ? (
                        <div className="mt-3 flex gap-3">
                          <input
                            type="text"
                            placeholder="Répondre à cette impression…"
                            value={replyDrafts[rev.id] ?? ""}
                            onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [rev.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void sendReply(rev.id);
                              }
                            }}
                            className="flex-1 rounded-none border-x-0 border-t-0 border-b border-[#EAE6DE]/15 bg-transparent px-0 py-1 text-xs text-[#EAE6DE] placeholder:text-[#EAE6DE]/35 focus:border-[#C49A58] focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => sendReply(rev.id)}
                            className="mc-kicker text-[10px] text-[#EAE6DE]/70 hover:text-[#C49A58]"
                          >
                            Répondre
                          </button>
                        </div>
                      ) : null}
                    </article>
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