"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Award,
  Bookmark,
  Check,
  Clapperboard,
  Copy,
  Film,
  Heart,
  Loader2,
  Popcorn,
  Plus,
  Send,
  Share2,
  Sparkles,
  Star,
  Trophy,
  Users,
  X,
  ZoomIn,
} from "lucide-react";
import { BADGES, type BadgeDef, type Stats } from "@/lib/badges";
import { useAuth } from "@/components/auth-provider";
import { TitleDetailModal } from "@/components/title-detail-modal";
import { Avatar, ErrorNote, Modal, PageHeader, Poster, buttonClass, ghostClass, inputClass } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import type { Title, WatchItem } from "@/lib/types";

type FavoriteSlot = {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  year: string;
};

type CineSignatureState = {
  quote: string;
  mood: string;
  favorites: FavoriteSlot[];
};

const MOOD_PRESETS = [
  "Séances nocturnes · Films & thrillers",
  "Grand spectacle & animés d'auteur",
  "Séries addictives & fins inattendues",
  "Tout terrain · Curieux de tout",
] as const;

const EMPTY: Stats = {
  hasProfile: false,
  swipes: 0,
  ratings: 0,
  toWatch: 0,
  watched: 0,
  friends: 0,
  groups: 0,
  sent: 0,
  matches: 0,
};

export function BadgeIcon({ icon }: { icon: BadgeDef["icon"] }) {
  switch (icon) {
    case "clapper":
      return <Clapperboard size={18} />;
    case "star":
      return <Star size={18} />;
    case "bookmark":
      return <Bookmark size={18} />;
    case "users":
      return <Users size={18} />;
    case "popcorn":
      return <Popcorn size={18} />;
    case "heart":
      return <Heart size={18} />;
    case "trophy":
      return <Trophy size={18} />;
    case "send":
      return <Send size={18} />;
    case "film":
      return <Film size={18} />;
    default:
      return <Award size={18} />;
  }
}

export function ProfileView() {
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [libraryItems, setLibraryItems] = useState<WatchItem[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Signature cinématographique (devise + ambiance + top 4 favoris façon pellicule)
  const [signatureQuote, setSignatureQuote] = useState("");
  const [signatureMood, setSignatureMood] = useState<string>(MOOD_PRESETS[0]);
  const [favorites, setFavorites] = useState<FavoriteSlot[]>([]);
  const [favoritePickerOpen, setFavoritePickerOpen] = useState(false);
  const [inspectTitle, setInspectTitle] = useState<Title | null>(null);

  // État pour le recadrage + zoom de la photo de profil
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const [cropFileType, setCropFileType] = useState<string>("image/jpeg");
  const [zoom, setZoom] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; startX: number; startY: number } | null>(null);
  const cropImageRef = useRef<HTMLImageElement | null>(null);

  const loadSignature = useCallback(async () => {
    if (!user) return;
    let loaded: CineSignatureState | null = null;

    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(`matchcut_cine_signature_${user.id}`);
        if (raw) {
          loaded = JSON.parse(raw) as CineSignatureState;
        }
      } catch {
        // ignore
      }
    }

    const { data: profRow } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    const rowObj = (profRow ?? {}) as Record<string, unknown>;
    const dbQuote = typeof rowObj.signature_quote === "string" ? rowObj.signature_quote : null;
    const dbMood = typeof rowObj.signature_mood === "string" ? rowObj.signature_mood : null;
    const dbFavs = Array.isArray(rowObj.favorite_titles) ? (rowObj.favorite_titles as FavoriteSlot[]) : null;

    setSignatureQuote(dbQuote ?? loaded?.quote ?? "");
    setSignatureMood(dbMood ?? loaded?.mood ?? MOOD_PRESETS[0]);
    setFavorites((dbFavs ?? loaded?.favorites ?? []).slice(0, 4));
  }, [user]);

  function saveSignatureLocal(next: CineSignatureState) {
    if (!user || typeof window === "undefined") return;
    window.localStorage.setItem(`matchcut_cine_signature_${user.id}`, JSON.stringify(next));
  }

  async function persistSignature(next: CineSignatureState) {
    if (!user) return;
    saveSignatureLocal(next);
    setSignatureQuote(next.quote);
    setSignatureMood(next.mood);
    setFavorites(next.favorites.slice(0, 4));

    // Tentative optionnelle si les colonnes existent côté Supabase (ignorée sans erreur sinon)
    await supabase
      .from("profiles")
      .update({
        signature_quote: next.quote,
        signature_mood: next.mood,
        favorite_titles: next.favorites.slice(0, 4),
      } as Record<string, unknown>)
      .eq("id", user.id);
  }

  function toggleFavoriteTitle(slot: FavoriteSlot) {
    setFavorites((prev) => {
      const exists = prev.some((item) => item.mediaType === slot.mediaType && item.tmdbId === slot.tmdbId);
      const updated = exists
        ? prev.filter((item) => !(item.mediaType === slot.mediaType && item.tmdbId === slot.tmdbId))
        : prev.length >= 4
        ? prev
        : [...prev, slot];
      const nextState: CineSignatureState = {
        quote: signatureQuote,
        mood: signatureMood,
        favorites: updated,
      };
      void persistSignature(nextState);
      return updated;
    });
  }

  useEffect(() => {
    setFullName(profile?.full_name || "");
    setUsername(profile?.username || "");
    setBio(profile?.bio || "");
  }, [profile]);

  useEffect(() => {
    void loadSignature();
  }, [loadSignature]);

  useEffect(() => {
    return () => {
      if (cropSourceUrl) {
        URL.revokeObjectURL(cropSourceUrl);
      }
    };
  }, [cropSourceUrl]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoadingStats(true);

    void (async () => {
      const [swipes, ratings, watchAll, friends, groups, sent, memberships] = await Promise.all([
        supabase.from("swipes").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("watch_items").select("id", { count: "exact", head: true }).eq("user_id", user.id).not("rating", "is", null),
        supabase.from("watch_items").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(60),
        supabase
          .from("friendships")
          .select("id", { count: "exact", head: true })
          .eq("status", "accepted")
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
        supabase.from("group_members").select("group_id").eq("user_id", user.id),
        supabase.from("recommendations").select("id", { count: "exact", head: true }).eq("from_user_id", user.id),
        supabase.from("group_members").select("group_id").eq("user_id", user.id),
      ]);
      if (!active) return;

      const firstError = [
        swipes.error,
        ratings.error,
        watchAll.error,
        friends.error,
        groups.error,
        sent.error,
        memberships.error,
      ].find(Boolean);
      if (firstError) setError(firstError.message);

      const allWatchRows = (watchAll.data as WatchItem[]) ?? [];
      setLibraryItems(allWatchRows);

      const toWatchCount = allWatchRows.filter((w) => w.status === "to_watch").length;
      const watchedCount = allWatchRows.filter((w) => w.status === "watched").length;

      const groupIds = (memberships.data ?? []).map((row) => row.group_id as string);
      let matches = 0;
      if (groupIds.length) {
        const matchResult = await supabase.from("matches").select("id", { count: "exact", head: true }).in("group_id", groupIds);
        if (!active) return;
        if (matchResult.error) setError(matchResult.error.message);
        matches = matchResult.count ?? 0;
      }

      setStats({
        hasProfile: Boolean(profile),
        swipes: swipes.count ?? 0,
        ratings: ratings.count ?? 0,
        toWatch: toWatchCount,
        watched: watchedCount,
        friends: friends.count ?? 0,
        groups: groups.data?.length ?? 0,
        sent: sent.count ?? 0,
        matches,
      });
      setLoadingStats(false);
    })();

    return () => {
      active = false;
    };
  }, [profile, user]);

  function openCropper(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 8_000_000) {
      setError("Choisissez une image valide de moins de 8 Mo.");
      return;
    }
    if (cropSourceUrl) {
      URL.revokeObjectURL(cropSourceUrl);
    }
    setError(null);
    setNotice(null);
    setCropFileType(file.type === "image/png" ? "image/png" : "image/jpeg");
    setZoom(1.15);
    setOffset({ x: 0, y: 0 });
    setCropSourceUrl(URL.createObjectURL(file));
  }

  function closeCropper() {
    if (cropSourceUrl) {
      URL.revokeObjectURL(cropSourceUrl);
    }
    setCropSourceUrl(null);
    setDragging(false);
    dragStartRef.current = null;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    dragStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: offset.x,
      startY: offset.y,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || !dragStartRef.current) return;
    const dx = event.clientX - dragStartRef.current.pointerX;
    const dy = event.clientY - dragStartRef.current.pointerY;
    const maxShift = 110 * zoom;
    setOffset({
      x: Math.max(-maxShift, Math.min(maxShift, dragStartRef.current.startX + dx)),
      y: Math.max(-maxShift, Math.min(maxShift, dragStartRef.current.startY + dy)),
    });
  }

  function handlePointerUp() {
    setDragging(false);
    dragStartRef.current = null;
  }

  async function confirmCroppedAvatar() {
    if (!user || !cropImageRef.current || busy) return;
    setBusy(true);
    setError(null);

    try {
      const img = cropImageRef.current;
      const previewSize = 240;
      const outputSize = 512;
      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setError("Impossible de préparer le recadrage de l'image.");
        return;
      }

      const scaleRatio = outputSize / previewSize;
      const baseScale = Math.max(previewSize / img.naturalWidth, previewSize / img.naturalHeight);
      const drawWidth = img.naturalWidth * baseScale * zoom * scaleRatio;
      const drawHeight = img.naturalHeight * baseScale * zoom * scaleRatio;
      const centerX = outputSize / 2 + offset.x * scaleRatio;
      const centerY = outputSize / 2 + offset.y * scaleRatio;

      ctx.clearRect(0, 0, outputSize, outputSize);
      ctx.drawImage(img, centerX - drawWidth / 2, centerY - drawHeight / 2, drawWidth, drawHeight);

      const mime = cropFileType === "image/png" ? "image/png" : "image/jpeg";
      const ext = mime === "image/png" ? "png" : "jpg";

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), mime, 0.9);
      });

      if (!blob) {
        setError("La création de l'image recadrée a échoué.");
        return;
      }

      const path = `${user.id}/${Date.now()}.${ext}`;
      const uploaded = await supabase.storage.from("avatars").upload(path, blob, { contentType: mime, upsert: true });
      if (uploaded.error) {
        setError(uploaded.error.message);
        return;
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: writeError } = await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
      if (writeError) {
        setError(writeError.message);
        return;
      }

      await refreshProfile();
      closeCropper();
      setNotice("Photo cadrée et enregistrée.");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!user || busy) return;
    const handle = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
      setError("Le pseudo doit contenir 3 à 20 lettres minuscules, chiffres ou tirets bas.");
      return;
    }
    if (fullName.trim().length < 2) {
      setError("Indiquez votre nom.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    if (handle !== profile?.username) {
      const availability = await supabase.rpc("username_available", { name: handle });
      if (!availability.error && availability.data === false) {
        setBusy(false);
        setError("Ce pseudo est déjà pris.");
        return;
      }
    }
    const { error: writeError } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim(), username: handle, bio: bio.trim(), updated_at: new Date().toISOString() })
      .eq("id", user.id);
    if (writeError) {
      setBusy(false);
      setError(writeError.message);
      return;
    }
    await persistSignature({
      quote: signatureQuote.trim(),
      mood: signatureMood,
      favorites,
    });
    setBusy(false);
    await refreshProfile();
    setNotice("Profil et signature ciné mis à jour.");
  }

  function getInviteUrl() {
    const handle = (profile?.username || username || "").trim().toLowerCase();
    if (!handle || typeof window === "undefined") return null;
    return `${window.location.origin}/invite/${encodeURIComponent(handle)}`;
  }

  function copyInviteLink() {
    const link = getInviteUrl();
    if (!link) return;
    void navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  async function shareInviteLink() {
    const link = getInviteUrl();
    if (!link) return;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Rejoins-moi sur MatchCut",
          text: "Viens choisir nos films et séries ensemble sur MatchCut :",
          url: link,
        });
      } catch {
        // L'utilisateur a annulé le partage natif
      }
    } else {
      copyInviteLink();
    }
  }

  const since = profile?.created_at
    ? new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(profile.created_at))
    : null;

  const figures = [
    ["Décisions", stats.swipes],
    ["À voir", stats.toWatch],
    ["Vus", stats.watched],
    ["Notes", stats.ratings],
    ["Amis", stats.friends],
    ["Groupes", stats.groups],
    ["Envois", stats.sent],
    ["Matchs", stats.matches],
  ] as const;

  const inviteHandle = (profile?.username || username || "").trim().toLowerCase();
  const unlockedCount = BADGES.filter((b) => b.value(stats) >= b.goal).length;
  const recentToWatch = libraryItems.filter((w) => w.status === "to_watch").slice(0, 4);
  const recentWatched = libraryItems.filter((w) => w.status === "watched").slice(0, 4);

  return (
    <div className="max-w-5xl">
      <PageHeader
        kicker="Carte de projection"
        title="Profil cinématographique"
        text="Ta signature ciné, tes favoris épinglés, tes listes, tes trophées et ta fiche personnelle."
      />

      <div className="mb-6 space-y-3">
        <ErrorNote message={error} />
        {notice ? <p className="text-sm text-emerald-400">{notice}</p> : null}
      </div>

      {/* Signature Cinématographique éditoriale */}
      <section className="mb-10 overflow-hidden rounded-3xl border border-amber-300/20 bg-gradient-to-br from-[#161310] via-[#0e0e12] to-[#09090b] p-6 shadow-2xl sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-4">
            <Avatar name={fullName || username || "M"} url={profile?.avatar_url} size={64} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-200">
                  <Sparkles size={11} />
                  Signature Ciné
                </span>
                <span className="text-xs text-zinc-400">{signatureMood}</span>
              </div>
              <h2 className="mt-1.5 font-serif text-3xl text-[#f4f1ea]">
                {fullName || username || "Cinéphile MatchCut"}
              </h2>
              {signatureQuote ? (
                <p className="mt-1 font-serif text-base italic text-amber-100/90">« {signatureQuote} »</p>
              ) : bio ? (
                <p className="mt-1 max-w-xl text-sm text-zinc-300">{bio}</p>
              ) : (
                <p className="mt-1 text-xs text-zinc-400">
                  Ajoute une phrase signature et épingle jusqu&apos;à 4 favoris pour donner du relief à ta carte.
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setFavoritePickerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/40 bg-amber-300/10 px-3.5 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-300/20"
          >
            <Plus size={14} />
            Choisir mes favoris ({favorites.length}/4)
          </button>
        </div>

        {/* Pellicule des 4 favoris numérotés */}
        <div className="mt-5">
          <div className="mb-3 flex items-center justify-between text-xs text-zinc-400">
            <span className="font-semibold uppercase tracking-widest text-zinc-400">Pellicule favorite</span>
            <span>{favorites.length > 0 ? "Clique sur une affiche pour voir la fiche" : "Aucun favori épinglé"}</span>
          </div>
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            {[0, 1, 2, 3].map((slotIdx) => {
              const fav = favorites[slotIdx];
              const frameNumber = `0${slotIdx + 1}`;
              if (!fav) {
                return (
                  <button
                    key={frameNumber}
                    type="button"
                    onClick={() => setFavoritePickerOpen(true)}
                    className="group flex aspect-[2/3] flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.015] p-4 text-center transition hover:border-amber-300/45 hover:bg-white/[0.03]"
                  >
                    <span className="font-mono text-xs text-amber-300/70">#{frameNumber}</span>
                    <Plus size={20} className="mt-2 text-zinc-500 transition group-hover:text-amber-300" />
                    <span className="mt-2 text-xs text-zinc-400">Épingler un favori</span>
                  </button>
                );
              }

              return (
                <div
                  key={`${fav.mediaType}:${fav.tmdbId}`}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/15 bg-zinc-950 transition hover:border-amber-300/50"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setInspectTitle({
                        tmdbId: fav.tmdbId,
                        mediaType: fav.mediaType,
                        title: fav.title,
                        overview: "",
                        posterPath: fav.posterPath,
                        year: fav.year,
                        genreIds: [],
                        language: "",
                        anime: false,
                        popularity: 0,
                      })
                    }
                    className="relative aspect-[2/3] w-full overflow-hidden text-left"
                  >
                    <Poster
                      path={fav.posterPath}
                      alt={fav.title}
                      className="h-full w-full transition duration-300 group-hover:scale-105"
                    />
                    <span className="absolute left-2 top-2 rounded-md border border-white/20 bg-black/75 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-200 backdrop-blur-xs">
                      #{frameNumber}
                    </span>
                  </button>
                  <div className="flex items-center justify-between gap-1.5 bg-zinc-950/95 px-3 py-2.5">
                    <p className="truncate font-serif text-sm text-[#f4f1ea]">{fav.title}</p>
                    <button
                      type="button"
                      onClick={() => toggleFavoriteTitle(fav)}
                      className="rounded-md p-1 text-zinc-500 hover:bg-white/10 hover:text-rose-300"
                      title="Retirer des favoris"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_290px]">
        <form onSubmit={save} className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Identité &amp; signature</h3>
          <div className="flex items-center gap-4">
            <Avatar name={fullName || username || "M"} url={profile?.avatar_url} size={76} />
            <label className="cursor-pointer rounded-xl border border-white/15 bg-white/[0.03] px-3.5 py-2 text-sm text-zinc-200 transition hover:border-white/35">
              Choisir et cadrer une photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  openCropper(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          <label className="block text-sm text-zinc-300">
            Nom
            <input className={`${inputClass} mt-2`} value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </label>
          <label className="block text-sm text-zinc-300">
            Pseudo
            <input className={`${inputClass} mt-2`} value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label className="block text-sm text-zinc-300">
            Ambiance ciné
            <select
              className={`${inputClass} mt-2`}
              value={signatureMood}
              onChange={(event) => setSignatureMood(event.target.value)}
            >
              {MOOD_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-zinc-300">
            Phrase signature
            <input
              className={`${inputClass} mt-2`}
              value={signatureQuote}
              maxLength={140}
              placeholder="Ex. Thrillers nocturnes, animés marquants et séances à rallonge"
              onChange={(event) => setSignatureQuote(event.target.value)}
            />
          </label>
          <label className="block text-sm text-zinc-300">
            Bio
            <textarea
              className={`${inputClass} mt-2 min-h-24`}
              value={bio}
              maxLength={280}
              onChange={(event) => setBio(event.target.value)}
            />
          </label>
          {since ? <p className="text-xs text-zinc-500">Membre depuis {since}</p> : null}
          <button type="submit" className={buttonClass} disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            Enregistrer le profil
          </button>
        </form>

        <aside className="space-y-8">
          {inviteHandle ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.05] p-4">
              <h2 className="text-xs font-semibold text-emerald-300">Inviter un ami</h2>
              <p className="mt-1.5 text-xs leading-5 text-zinc-300">
                Partage ce lien : dès que ton ami crée son compte, vous êtes ajoutés en amis.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={copyInviteLink}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#f4f1ea] px-3 py-2.5 text-xs font-semibold text-[#09090b] transition hover:bg-white"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Lien copié !" : "Copier mon lien d’invitation"}
                </button>
                <button
                  type="button"
                  onClick={() => void shareInviteLink()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-white/35"
                >
                  <Share2 size={14} />
                  Partager
                </button>
              </div>
            </div>
          ) : null}

          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-zinc-400">Statistiques</h2>
              {loadingStats ? <Loader2 size={13} className="animate-spin text-zinc-500" /> : null}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2.5">
              {figures.map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
                  <dt className="text-xs text-zinc-400">{label}</dt>
                  <dd className="mt-0.5 font-serif text-3xl text-[#f4f1ea]">{loadingStats ? "…" : value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>
      </div>

      {/* Aperçu des listes (À voir & Vus) */}
      <section className="mt-12 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl text-[#f4f1ea]">Mes listes</h2>
            <p className="text-xs text-zinc-400">
              {stats.toWatch} titre{stats.toWatch > 1 ? "s" : ""} à voir · {stats.watched} vu{stats.watched > 1 ? "s" : ""}
            </p>
          </div>
          <Link href="/listes" className={`${ghostClass} px-3.5 py-2 text-xs`}>
            Ouvrir toutes mes listes
          </Link>
        </div>

        <div className="mt-5 grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-amber-300/90">À voir récemment</h3>
            {recentToWatch.length > 0 ? (
              <div className="grid grid-cols-4 gap-2.5">
                {recentToWatch.map((item) => (
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
                    className="group overflow-hidden rounded-xl border border-white/10 bg-zinc-950 text-left transition hover:border-amber-300/40"
                  >
                    <div className="aspect-[2/3] w-full overflow-hidden">
                      <Poster path={item.poster_path} alt={item.title} className="h-full w-full" />
                    </div>
                    <p className="truncate px-2 py-1.5 font-serif text-xs text-[#f4f1ea]">{item.title}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-zinc-500">
                Aucun titre dans À voir pour l&apos;instant.
              </p>
            )}
          </div>

          <div>
            <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-emerald-300/90">Derniers titres vus</h3>
            {recentWatched.length > 0 ? (
              <div className="grid grid-cols-4 gap-2.5">
                {recentWatched.map((item) => (
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
                    className="group overflow-hidden rounded-xl border border-white/10 bg-zinc-950 text-left transition hover:border-emerald-300/40"
                  >
                    <div className="aspect-[2/3] w-full overflow-hidden">
                      <Poster path={item.poster_path} alt={item.title} className="h-full w-full" />
                    </div>
                    <p className="truncate px-2 py-1.5 font-serif text-xs text-[#f4f1ea]">{item.title}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-zinc-500">
                Aucun titre marqué comme vu pour l&apos;instant.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Trophées & badges */}
      <section className="mt-12">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Trophées &amp; badges ({unlockedCount}/{BADGES.length})
          </h2>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BADGES.map((badge) => {
            const value = badge.value(stats);
            const unlocked = value >= badge.goal;
            return (
              <article
                key={badge.id}
                className={`rounded-2xl border px-4 py-4 transition ${
                  unlocked ? badge.accent : "border-white/10 bg-white/[0.015] opacity-60"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className={unlocked ? "" : "text-zinc-500"}>
                      <BadgeIcon icon={badge.icon} />
                    </span>
                    <h3 className="font-serif text-2xl text-[#f4f1ea]">{badge.name}</h3>
                  </div>
                  <span className="text-xs font-medium opacity-85">
                    {Math.min(value, badge.goal)}/{badge.goal}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-300">{badge.detail}</p>
                <p className="mt-3 text-xs font-semibold">{unlocked ? "✦ Débloqué" : "En cours"}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* Modale de sélection des 4 favoris */}
      <Modal
        open={favoritePickerOpen}
        title="Pellicule favorite (jusqu'à 4 titres)"
        onClose={() => setFavoritePickerOpen(false)}
      >
        <p className="mb-4 text-xs text-zinc-400">
          Clique sur un titre de tes listes pour l&apos;épingler ou le retirer de ta signature ciné ({favorites.length}/4).
        </p>
        {libraryItems.length === 0 ? (
          <div className="space-y-3 py-6 text-center text-sm text-zinc-400">
            <p>Ajoute d&apos;abord des films ou séries dans tes listes pour les épingler ici.</p>
            <Link href="/catalogue" onClick={() => setFavoritePickerOpen(false)} className={`inline-block ${buttonClass}`}>
              Explorer le Catalogue
            </Link>
          </div>
        ) : (
          <div className="grid max-h-80 grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-3">
            {libraryItems.map((item) => {
              const isSelected = favorites.some((f) => f.mediaType === item.media_type && f.tmdbId === item.tmdb_id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    toggleFavoriteTitle({
                      tmdbId: item.tmdb_id,
                      mediaType: item.media_type,
                      title: item.title,
                      posterPath: item.poster_path,
                      year: item.year ?? "",
                    })
                  }
                  className={`flex flex-col overflow-hidden rounded-xl border p-2 text-left transition ${
                    isSelected
                      ? "border-amber-300 bg-amber-300/15"
                      : "border-white/10 bg-black/25 hover:border-white/30"
                  }`}
                >
                  <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg">
                    <Poster path={item.poster_path} alt={item.title} className="h-full w-full" />
                    {isSelected ? (
                      <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-bold text-zinc-950">
                        Favori
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 line-clamp-1 font-serif text-sm text-[#f4f1ea]">{item.title}</p>
                  <p className="text-[10px] text-zinc-400">{item.status === "watched" ? "Vu" : "À voir"}</p>
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={() => setFavoritePickerOpen(false)} className={buttonClass}>
            Terminé
          </button>
        </div>
      </Modal>

      {/* Recadrage avatar */}
      {cropSourceUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
          onClick={closeCropper}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/15 bg-zinc-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl text-[#f4f1ea]">Cadrer la photo</h2>
              <button
                type="button"
                onClick={closeCropper}
                className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Faites glisser l&apos;image et ajustez le zoom pour le médaillon rond.
            </p>

            <div className="mt-5 flex justify-center">
              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="relative h-60 w-60 cursor-grab overflow-hidden rounded-full border-2 border-amber-400/70 bg-zinc-900 active:cursor-grabbing"
                style={{ touchAction: "none" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={cropImageRef}
                  src={cropSourceUrl}
                  alt="Aperçu de cadrage"
                  draggable={false}
                  className="pointer-events-none h-full w-full select-none object-cover"
                  style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                    transformOrigin: "center center",
                  }}
                />
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span className="inline-flex items-center gap-1.5">
                  <ZoomIn size={14} className="text-amber-400" />
                  Zoom
                </span>
                <span>{Math.round(zoom * 100)} %</span>
              </div>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-full accent-amber-400"
              />
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button type="button" onClick={closeCropper} className={ghostClass} disabled={busy}>
                Annuler
              </button>
              <button type="button" onClick={() => void confirmCroppedAvatar()} className={buttonClass} disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : null}
                Valider la photo
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <TitleDetailModal title={inspectTitle} onClose={() => setInspectTitle(null)} />
    </div>
  );
}