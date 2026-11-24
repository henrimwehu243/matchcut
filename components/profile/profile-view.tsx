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
import { Avatar, ErrorNote, Modal, Poster, buttonClass, ghostClass, inputClass } from "@/components/ui";
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
      return <Clapperboard size={16} />;
    case "star":
      return <Star size={16} />;
    case "bookmark":
      return <Bookmark size={16} />;
    case "users":
      return <Users size={16} />;
    case "popcorn":
      return <Popcorn size={16} />;
    case "heart":
      return <Heart size={16} />;
    case "trophy":
      return <Trophy size={16} />;
    case "send":
      return <Send size={16} />;
    case "film":
      return <Film size={16} />;
    default:
      return <Award size={16} />;
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

  const [signatureQuote, setSignatureQuote] = useState("");
  const [signatureMood, setSignatureMood] = useState<string>(MOOD_PRESETS[0]);
  const [favorites, setFavorites] = useState<FavoriteSlot[]>([]);
  const [favoritePickerOpen, setFavoritePickerOpen] = useState(false);
  const [inspectTitle, setInspectTitle] = useState<Title | null>(null);

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
      setNotice("Portrait cadré et enregistré.");
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
    setNotice("Fiche et signature ciné enregistrées.");
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
          title: "Rejoignez-moi sur MatchCut",
          text: "Découvrons des films, séries et animés ensemble sur MatchCut :",
          url: link,
        });
      } catch {
        // annulé
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
    ["Proches", stats.friends],
    ["Cercles", stats.groups],
    ["Envois", stats.sent],
    ["Accords", stats.matches],
  ] as const;

  const inviteHandle = (profile?.username || username || "").trim().toLowerCase();
  const unlockedCount = BADGES.filter((b) => b.value(stats) >= b.goal).length;
  const recentToWatch = libraryItems.filter((w) => w.status === "to_watch").slice(0, 4);
  const recentWatched = libraryItems.filter((w) => w.status === "watched").slice(0, 4);

  return (
    <div className="space-y-20">
      {/* En-tête éditorial */}
      <div className="border-b border-[#EAE6DE]/12 pb-10">
        <p className="mc-kicker">VII — Fiche personnelle &amp; Signature</p>
        <div className="mt-3 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <h1 className="font-serif text-5xl leading-[0.98] tracking-tight text-[#EAE6DE] sm:text-6xl lg:text-7xl">
            Portrait <span className="italic text-[#C49A58]">ciné</span>
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-[#EAE6DE]/65">
            Votre ligne éditoriale, vos quatre œuvres épinglées, vos repères chiffrés et vos distinctions.
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <ErrorNote message={error} />
        {notice ? <p className="text-xs text-[#A3B99B]">{notice}</p> : null}
      </div>

      {/* Signature éditoriale & pellicule de 4 favoris */}
      <section className="editorial-enter border-b border-[#EAE6DE]/12 pb-16">
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-[#EAE6DE]/10 pb-8">
          <div className="flex items-center gap-5">
            <Avatar name={fullName || username || "M"} url={profile?.avatar_url} size={72} />
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="mc-kicker inline-flex items-center gap-1.5 text-[10px] text-[#C49A58]">
                  <Sparkles size={12} />
                  <span>Signature</span>
                </span>
                <span className="mc-kicker text-[10px] text-[#A3B99B]">{signatureMood}</span>
              </div>
              <h2 className="mt-1.5 font-serif text-4xl text-[#EAE6DE] sm:text-5xl">
                {fullName || username || "Cinéphile MatchCut"}
              </h2>
              {signatureQuote ? (
                <p className="mt-2 font-serif text-xl italic text-[#EAE6DE]/85">« {signatureQuote} »</p>
              ) : bio ? (
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#EAE6DE]/70">{bio}</p>
              ) : (
                <p className="mt-2 text-xs text-[#EAE6DE]/50">
                  Renseignez une phrase signature et épinglez jusqu’à quatre œuvres phares.
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setFavoritePickerOpen(true)}
            className="mc-kicker inline-flex items-center gap-2 border-b border-[#C49A58] pb-1.5 text-[10px] text-[#EAE6DE] transition hover:text-[#C49A58]"
          >
            <Plus size={13} className="text-[#C49A58]" />
            <span>Sélection ({favorites.length}/4)</span>
          </button>
        </div>

        <div className="mt-8">
          <div className="mb-6 flex items-baseline justify-between">
            <span className="mc-kicker text-[10px]">Quatre affiches de référence</span>
            <span className="mc-kicker text-[10px] text-[#EAE6DE]/45">
              {favorites.length > 0 ? "Cliquez pour ouvrir la fiche" : "Aucun titre épinglé"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[0, 1, 2, 3].map((slotIdx) => {
              const fav = favorites[slotIdx];
              const frameNumber = `0${slotIdx + 1}`;
              if (!fav) {
                return (
                  <button
                    key={frameNumber}
                    type="button"
                    onClick={() => setFavoritePickerOpen(true)}
                    className="group flex aspect-[2/3] flex-col items-center justify-center border border-dashed border-[#EAE6DE]/15 bg-[#202224]/30 p-4 text-center transition hover:border-[#C49A58]"
                  >
                    <span className="mc-kicker text-[10px] text-[#C49A58]">#{frameNumber}</span>
                    <Plus size={18} className="mt-3 text-[#EAE6DE]/40 transition group-hover:text-[#C49A58]" />
                    <span className="mc-kicker mt-2 text-[9px] text-[#EAE6DE]/50">Épingler</span>
                  </button>
                );
              }

              return (
                <div key={`${fav.mediaType}:${fav.tmdbId}`} className="frame-zoom-in group flex flex-col">
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
                    className="relative aspect-[2/3] w-full overflow-hidden bg-[#202224] text-left focus:outline-none"
                  >
                    <Poster
                      path={fav.posterPath}
                      alt={fav.title}
                      className="h-full w-full transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                    <span className="mc-kicker absolute left-2.5 top-2.5 bg-[#101112]/85 px-2 py-0.5 text-[10px] text-[#C49A58]">
                      #{frameNumber}
                    </span>
                  </button>
                  <div className="mt-2.5 flex items-center justify-between gap-2 border-b border-[#EAE6DE]/10 pb-2">
                    <p className="truncate font-serif text-lg text-[#EAE6DE] group-hover:text-[#C49A58]">
                      {fav.title}
                    </p>
                    <button
                      type="button"
                      onClick={() => toggleFavoriteTitle(fav)}
                      className="p-1 text-[#EAE6DE]/40 transition hover:text-[#EAE6DE]"
                      title="Retirer"
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

      {/* Formulaire d'identité + Repères & Invitation */}
      <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_300px]">
        <form onSubmit={save} className="space-y-6">
          <p className="mc-kicker text-[10px] text-[#C49A58]">Identité &amp; ligne éditoriale</p>

          <div className="flex items-center gap-5">
            <Avatar name={fullName || username || "M"} url={profile?.avatar_url} size={72} />
            <label className="mc-kicker cursor-pointer border-b border-[#EAE6DE]/30 pb-1 text-[10px] text-[#EAE6DE]/85 transition hover:border-[#C49A58] hover:text-[#C49A58]">
              <span>Choisir et cadrer un portrait</span>
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

          <label className="block text-xs text-[#EAE6DE]/75">
            <span className="mc-kicker text-[10px]">Nom</span>
            <input
              className={`${inputClass} mt-2 rounded-none border-x-0 border-t-0 border-b border-[#EAE6DE]/20 bg-transparent px-0 py-2 text-sm text-[#EAE6DE] focus:border-[#C49A58] focus:outline-none`}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </label>

          <label className="block text-xs text-[#EAE6DE]/75">
            <span className="mc-kicker text-[10px]">Pseudo</span>
            <input
              className={`${inputClass} mt-2 rounded-none border-x-0 border-t-0 border-b border-[#EAE6DE]/20 bg-transparent px-0 py-2 text-sm text-[#EAE6DE] focus:border-[#C49A58] focus:outline-none`}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          <label className="block text-xs text-[#EAE6DE]/75">
            <span className="mc-kicker text-[10px]">Orientation de visionnage</span>
            <select
              className="mt-2 w-full"
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

          <label className="block text-xs text-[#EAE6DE]/75">
            <span className="mc-kicker text-[10px]">Phrase signature</span>
            <input
              className={`${inputClass} mt-2 rounded-none border-x-0 border-t-0 border-b border-[#EAE6DE]/20 bg-transparent px-0 py-2 text-sm text-[#EAE6DE] placeholder:text-[#EAE6DE]/35 focus:border-[#C49A58] focus:outline-none`}
              value={signatureQuote}
              maxLength={140}
              placeholder="Ex. Thrillers nocturnes, animés marquants et séances à rallonge"
              onChange={(event) => setSignatureQuote(event.target.value)}
            />
          </label>

          <label className="block text-xs text-[#EAE6DE]/75">
            <span className="mc-kicker text-[10px]">Note biographique</span>
            <textarea
              className={`${inputClass} mt-2 min-h-24 rounded-none border-x-0 border-t-0 border-b border-[#EAE6DE]/20 bg-transparent px-0 py-2 text-sm text-[#EAE6DE] focus:border-[#C49A58] focus:outline-none`}
              value={bio}
              maxLength={280}
              onChange={(event) => setBio(event.target.value)}
            />
          </label>

          {since ? <p className="mc-kicker text-[10px] text-[#EAE6DE]/45">Membre depuis {since}</p> : null}

          <button type="submit" className={buttonClass} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : null}
            <span>Enregistrer</span>
          </button>
        </form>

        <aside className="space-y-10 border-t border-[#EAE6DE]/12 pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          {inviteHandle ? (
            <div className="border-b border-[#EAE6DE]/12 pb-8">
              <p className="mc-kicker text-[10px] text-[#A3B99B]">Invitation</p>
              <p className="mt-2 text-xs leading-relaxed text-[#EAE6DE]/65">
                Partagez ce lien : dès l’inscription d’un proche, la relation s’établit automatiquement.
              </p>
              <div className="mt-4 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={copyInviteLink}
                  className="mc-kicker inline-flex w-full items-center justify-center gap-2 bg-[#C49A58] px-4 py-2.5 text-[10px] font-semibold text-[#101112] transition hover:bg-[#d2aa6a]"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copied ? "Lien copié" : "Copier le lien"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void shareInviteLink()}
                  className="mc-kicker inline-flex w-full items-center justify-center gap-2 border border-[#EAE6DE]/20 px-4 py-2 text-[10px] text-[#EAE6DE]/80 transition hover:border-[#EAE6DE]"
                >
                  <Share2 size={13} />
                  <span>Partager</span>
                </button>
              </div>
            </div>
          ) : null}

          <div>
            <div className="flex items-center justify-between">
              <p className="mc-kicker text-[10px]">Repères chiffrés</p>
              {loadingStats ? <Loader2 size={12} className="animate-spin text-[#EAE6DE]/45" /> : null}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5">
              {figures.map(([label, value]) => (
                <div key={label} className="border-b border-[#EAE6DE]/10 pb-2.5">
                  <dt className="mc-kicker text-[9px] text-[#EAE6DE]/50">{label}</dt>
                  <dd className="mt-1 font-serif text-3xl text-[#EAE6DE]">
                    {loadingStats ? "…" : value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>
      </div>

      {/* Aperçu des collections */}
      <section className="border-t border-[#EAE6DE]/12 pt-16">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[#EAE6DE]/10 pb-6">
          <div>
            <p className="mc-kicker text-[10px]">Aperçu des cahiers</p>
            <h2 className="mt-1 font-serif text-4xl text-[#EAE6DE]">Collections récentes</h2>
          </div>
          <Link
            href="/listes"
            className="mc-kicker border-b border-[#EAE6DE]/30 pb-1 text-[10px] text-[#EAE6DE]/80 hover:border-[#C49A58] hover:text-[#C49A58]"
          >
            Voir toutes les collections
          </Link>
        </div>

        <div className="mt-8 grid gap-12 md:grid-cols-2">
          <div>
            <p className="mc-kicker mb-4 text-[10px] text-[#C49A58]">À voir ({stats.toWatch})</p>
            {recentToWatch.length > 0 ? (
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
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
                    className="group text-left focus:outline-none"
                  >
                    <div className="aspect-[2/3] w-full overflow-hidden bg-[#202224]">
                      <Poster
                        path={item.poster_path}
                        alt={item.title}
                        className="h-full w-full transition-transform duration-700 ease-out group-hover:scale-105"
                      />
                    </div>
                    <p className="mt-2 truncate font-serif text-base text-[#EAE6DE] group-hover:text-[#C49A58]">
                      {item.title}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="border-y border-[#EAE6DE]/10 py-8 text-center font-serif text-lg italic text-[#EAE6DE]/45">
                Aucun titre dans À voir.
              </p>
            )}
          </div>

          <div>
            <p className="mc-kicker mb-4 text-[10px] text-[#A3B99B]">Déjà vus ({stats.watched})</p>
            {recentWatched.length > 0 ? (
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
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
                    className="group text-left focus:outline-none"
                  >
                    <div className="aspect-[2/3] w-full overflow-hidden bg-[#202224]">
                      <Poster
                        path={item.poster_path}
                        alt={item.title}
                        className="h-full w-full grayscale opacity-60 transition-transform duration-700 ease-out group-hover:scale-105"
                      />
                    </div>
                    <p className="mt-2 truncate font-serif text-base text-[#EAE6DE]/60 group-hover:text-[#EAE6DE]">
                      {item.title}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="border-y border-[#EAE6DE]/10 py-8 text-center font-serif text-lg italic text-[#EAE6DE]/45">
                Aucun titre marqué comme vu.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Distinctions */}
      <section className="border-t border-[#EAE6DE]/12 pt-16">
        <p className="mc-kicker text-[10px]">
          Distinctions ({unlockedCount}/{BADGES.length})
        </p>
        <h2 className="mt-1 font-serif text-4xl text-[#EAE6DE]">Repères de parcours</h2>

        <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {BADGES.map((badge) => {
            const value = badge.value(stats);
            const unlocked = value >= badge.goal;
            return (
              <article
                key={badge.id}
                className={`border-t pt-4 transition ${
                  unlocked ? "border-[#C49A58]" : "border-[#EAE6DE]/10 opacity-50"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className={unlocked ? "text-[#C49A58]" : "text-[#EAE6DE]/45"}>
                      <BadgeIcon icon={badge.icon} />
                    </span>
                    <h3 className="font-serif text-2xl text-[#EAE6DE]">{badge.name}</h3>
                  </div>
                  <span className="mc-kicker text-[10px] text-[#EAE6DE]/55">
                    {Math.min(value, badge.goal)}/{badge.goal}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[#EAE6DE]/65">{badge.detail}</p>
                <p className="mc-kicker mt-3 text-[9px] text-[#A3B99B]">
                  {unlocked ? "Acquis" : "En cours"}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <Modal
        open={favoritePickerOpen}
        title="Quatre affiches de référence"
        onClose={() => setFavoritePickerOpen(false)}
      >
        <p className="mb-4 text-xs text-[#EAE6DE]/60">
          Sélectionnez jusqu’à quatre œuvres de vos collections ({favorites.length}/4).
        </p>
        {libraryItems.length === 0 ? (
          <div className="space-y-4 py-6 text-center text-sm text-[#EAE6DE]/65">
            <p>Ajoutez d’abord des titres dans vos collections pour les épingler ici.</p>
            <Link href="/catalogue" onClick={() => setFavoritePickerOpen(false)} className={`inline-block ${buttonClass}`}>
              Ouvrir la Cinémathèque
            </Link>
          </div>
        ) : (
          <div className="grid max-h-80 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
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
                  className={`flex flex-col overflow-hidden border p-2 text-left transition ${
                    isSelected
                      ? "border-[#C49A58] bg-[#C49A58]/15"
                      : "border-[#EAE6DE]/12 bg-[#101112]/60 hover:border-[#EAE6DE]/30"
                  }`}
                >
                  <div className="relative aspect-[2/3] w-full overflow-hidden">
                    <Poster path={item.poster_path} alt={item.title} className="h-full w-full" />
                    {isSelected ? (
                      <span className="mc-kicker absolute right-1.5 top-1.5 bg-[#C49A58] px-2 py-0.5 text-[9px] font-bold text-[#101112]">
                        Épinglé
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 line-clamp-1 font-serif text-base text-[#EAE6DE]">{item.title}</p>
                  <p className="mc-kicker text-[9px] text-[#EAE6DE]/50">{item.status === "watched" ? "Vu" : "À voir"}</p>
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={() => setFavoritePickerOpen(false)} className={buttonClass}>
            Terminé
          </button>
        </div>
      </Modal>

      {cropSourceUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#101112]/88 p-4 backdrop-blur-sm"
          onClick={closeCropper}
        >
          <div
            className="w-full max-w-md border border-[#EAE6DE]/15 bg-[#202224] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-3xl text-[#EAE6DE]">Cadrer le portrait</h2>
              <button
                type="button"
                onClick={closeCropper}
                className="p-1 text-[#EAE6DE]/55 hover:text-[#EAE6DE]"
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-1 text-xs text-[#EAE6DE]/60">
              Déplacez l’image et ajustez le zoom pour le médaillon.
            </p>

            <div className="mt-6 flex justify-center">
              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="relative h-60 w-60 cursor-grab overflow-hidden rounded-full border border-[#C49A58] bg-[#101112] active:cursor-grabbing"
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

            <div className="mt-6 space-y-2">
              <div className="flex items-center justify-between text-xs text-[#EAE6DE]/75">
                <span className="mc-kicker inline-flex items-center gap-1.5 text-[10px]">
                  <ZoomIn size={13} className="text-[#C49A58]" />
                  <span>Zoom</span>
                </span>
                <span className="mc-kicker text-[10px]">{Math.round(zoom * 100)} %</span>
              </div>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-full accent-[#C49A58]"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeCropper} className={ghostClass} disabled={busy}>
                Annuler
              </button>
              <button type="button" onClick={() => void confirmCroppedAvatar()} className={buttonClass} disabled={busy}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : null}
                <span>Valider</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <TitleDetailModal title={inspectTitle} onClose={() => setInspectTitle(null)} />
    </div>
  );
}