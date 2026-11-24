"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Clapperboard,
  Clock,
  Film,
  ImagePlus,
  Play,
  Plus,
  Search,
  Sparkles,
  Star,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Avatar, ErrorNote, Modal, Poster, buttonClass, ghostClass, inputClass } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { mapTmdb, tmdb } from "@/lib/tmdb";
import type { Profile, Title } from "@/lib/types";

type RsvpStatus = "going" | "maybe" | "declined";
type SessionPhase = "voting" | "live" | "completed";

type SessionProposal = {
  id: string;
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  year: string;
  proposedBy: string;
  votes: string[]; // userIds
};

type SessionPhotoEntry = {
  id: string;
  userId: string;
  url: string;
  caption?: string;
  createdAt: string;
};

type SessionReviewEntry = {
  userId: string;
  rating: number; // 1..5
  comment: string;
};

type WatchSession = {
  id: string;
  groupId: string;
  title: string;
  scheduledAt: string; // ISO string
  deadlineAt: string; // ISO string
  createdBy: string;
  phase: SessionPhase;
  startedAt?: string;
  completedAt?: string;
  rsvps: Record<string, RsvpStatus>;
  proposals: SessionProposal[];
  selectedTitleId: string | null;
  photos: SessionPhotoEntry[];
  reviews: Record<string, SessionReviewEntry>;
};

function formatCountdown(targetIso: string, nowMs: number) {
  const diff = new Date(targetIso).getTime() - nowMs;
  if (diff <= 0) return "C'est l'heure !";
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `J-${days} · ${hours}h ${mins}m`;
  return `${hours.toString().padStart(2, "0")}h : ${mins.toString().padStart(2, "0")}m : ${secs
    .toString()
    .padStart(2, "0")}s`;
}

function defaultDatePlusHours(hours: number) {
  const d = new Date(Date.now() + hours * 3600 * 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function WatchSessionsPanel({
  groupId,
  groupName,
  memberIds,
  people,
  onNotice,
}: {
  groupId: string;
  groupName: string;
  memberIds: string[];
  people: Record<string, Profile>;
  onNotice?: (msg: string) => void;
}) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<WatchSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Création de session
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newScheduled, setNewScheduled] = useState(() => defaultDatePlusHours(24));
  const [newDeadline, setNewDeadline] = useState(() => defaultDatePlusHours(12));

  // Recherche TMDB pour proposer un titre
  const [movieQuery, setMovieQuery] = useState("");
  const [movieResults, setMovieResults] = useState<Title[]>([]);
  const [searchingMovies, setSearchingMovies] = useState(false);

  // Notation post-séance
  const [myRating, setMyRating] = useState<number>(4);
  const [myComment, setMyComment] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storageKey = `matchcut_watch_sessions_${groupId}`;

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const loadSessions = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as WatchSession[];
        setSessions(parsed);
        if (parsed.length > 0) {
          setActiveSessionId((prev) => prev ?? parsed[0].id);
        }
      } else {
        setSessions([]);
        setActiveSessionId(null);
      }
    } catch {
      setSessions([]);
    }
  }, [storageKey]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  function saveSessions(next: WatchSession[]) {
    setSessions(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    }
  }

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? sessions[0] ?? null,
    [sessions, activeSessionId],
  );

  useEffect(() => {
    if (!user || !activeSession) return;
    const existing = activeSession.reviews[user.id];
    if (existing) {
      setMyRating(existing.rating);
      setMyComment(existing.comment);
    } else {
      setMyRating(4);
      setMyComment("");
    }
  }, [activeSession, user]);

  // Recherche TMDB pour proposer un film/série
  useEffect(() => {
    const q = movieQuery.trim();
    if (q.length < 2) {
      setMovieResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchingMovies(true);
      try {
        const raw = await tmdb("search/multi", { query: q, page: "1" });
        if (cancelled) return;
        const mapped = raw
          .map((item) => mapTmdb(item))
          .filter((item): item is Title => Boolean(item))
          .slice(0, 6);
        setMovieResults(mapped);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setSearchingMovies(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [movieQuery]);

  function personLabel(uid: string) {
    if (uid === user?.id) return "Moi";
    const p = people[uid];
    return p?.username || p?.full_name || "Membre";
  }

  function mutateSession(sessionId: string, updater: (s: WatchSession) => WatchSession) {
    const next = sessions.map((s) => (s.id === sessionId ? updater(s) : s));
    saveSessions(next);
  }

  function createSession(e: React.FormEvent) {
    e.preventDefault();
    if (!user || newTitle.trim().length < 2) return;
    const scheduledIso = new Date(newScheduled).toISOString();
    const deadlineIso = new Date(newDeadline).toISOString();
    const created: WatchSession = {
      id: `sess_${Date.now()}`,
      groupId,
      title: newTitle.trim(),
      scheduledAt: scheduledIso,
      deadlineAt: deadlineIso,
      createdBy: user.id,
      phase: "voting",
      rsvps: { [user.id]: "going" },
      proposals: [],
      selectedTitleId: null,
      photos: [],
      reviews: {},
    };
    const next = [created, ...sessions];
    saveSessions(next);
    setActiveSessionId(created.id);
    setNewTitle("");
    setCreateOpen(false);
    onNotice?.(`Session « ${created.title} » créée pour ${groupName}.`);
  }

  function setRsvp(sessionId: string, status: RsvpStatus) {
    if (!user) return;
    mutateSession(sessionId, (s) => ({
      ...s,
      rsvps: { ...s.rsvps, [user.id]: status },
    }));
  }

  function addProposal(sessionId: string, titleObj: Title) {
    if (!user) return;
    mutateSession(sessionId, (s) => {
      const propId = `${titleObj.mediaType}:${titleObj.tmdbId}`;
      if (s.proposals.some((p) => p.id === propId)) return s;
      const newProp: SessionProposal = {
        id: propId,
        tmdbId: titleObj.tmdbId,
        mediaType: titleObj.mediaType,
        title: titleObj.title,
        posterPath: titleObj.posterPath,
        year: titleObj.year,
        proposedBy: user.id,
        votes: [user.id],
      };
      const updatedProposals = [...s.proposals, newProp];
      const top = [...updatedProposals].sort((a, b) => b.votes.length - a.votes.length)[0];
      return {
        ...s,
        proposals: updatedProposals,
        selectedTitleId: s.selectedTitleId ?? top?.id ?? null,
      };
    });
    setMovieQuery("");
    setMovieResults([]);
  }

  function toggleVote(sessionId: string, propId: string) {
    if (!user) return;
    mutateSession(sessionId, (s) => {
      const updatedProposals = s.proposals.map((p) => {
        if (p.id !== propId) return p;
        const hasVoted = p.votes.includes(user.id);
        return {
          ...p,
          votes: hasVoted ? p.votes.filter((id) => id !== user.id) : [...p.votes, user.id],
        };
      });
      const leader = [...updatedProposals].sort((a, b) => b.votes.length - a.votes.length)[0];
      return {
        ...s,
        proposals: updatedProposals,
        selectedTitleId: leader ? leader.id : null,
      };
    });
  }

  function startSessionNow(sessionId: string) {
    mutateSession(sessionId, (s) => {
      const leader = [...s.proposals].sort((a, b) => b.votes.length - a.votes.length)[0];
      return {
        ...s,
        phase: "live",
        startedAt: new Date().toISOString(),
        selectedTitleId: s.selectedTitleId ?? leader?.id ?? null,
      };
    });
    onNotice?.("La séance a démarré ! Bon visionnage.");
  }

  async function handlePhotoUpload(sessionId: string, file: File | null) {
    if (!user || !file || uploadingPhoto) return;
    if (!file.type.startsWith("image/") || file.size > 6_000_000) {
      setError("Choisis une image de moins de 6 Mo.");
      return;
    }
    setUploadingPhoto(true);
    setError(null);
    try {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `sessions/${groupId}/${user.id}/${Date.now()}.${ext}`;
      let finalUrl = "";
      const uploaded = await supabase.storage.from("session-photos").upload(path, file, { contentType: file.type });
      if (!uploaded.error) {
        const { data } = supabase.storage.from("session-photos").getPublicUrl(path);
        finalUrl = data.publicUrl;
      } else {
        finalUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
          reader.readAsDataURL(file);
        });
      }
      if (!finalUrl) return;
      mutateSession(sessionId, (s) => ({
        ...s,
        photos: [
          ...s.photos,
          {
            id: `ph_${Date.now()}`,
            userId: user.id,
            url: finalUrl,
            createdAt: new Date().toISOString(),
          },
        ],
      }));
    } finally {
      setUploadingPhoto(false);
    }
  }

  function saveReview(sessionId: string) {
    if (!user) return;
    mutateSession(sessionId, (s) => ({
      ...s,
      reviews: {
        ...s.reviews,
        [user.id]: {
          userId: user.id,
          rating: myRating,
          comment: myComment.trim(),
        },
      },
    }));
    onNotice?.("Ta note de fin de séance a été enregistrée.");
  }

  async function completeSessionAndArchive(session: WatchSession) {
    const winner =
      session.proposals.find((p) => p.id === session.selectedTitleId) ??
      [...session.proposals].sort((a, b) => b.votes.length - a.votes.length)[0] ??
      null;

    mutateSession(session.id, (s) => ({
      ...s,
      phase: "completed",
      completedAt: new Date().toISOString(),
      selectedTitleId: winner?.id ?? s.selectedTitleId,
    }));

    if (user && winner) {
      const reviewEntries = Object.values(session.reviews);
      const avg =
        reviewEntries.length > 0
          ? Number((reviewEntries.reduce((acc, r) => acc + r.rating, 0) / reviewEntries.length).toFixed(1))
          : null;

      await supabase.from("watch_items").upsert(
        {
          user_id: user.id,
          tmdb_id: winner.tmdbId,
          media_type: winner.mediaType,
          title: winner.title,
          poster_path: winner.posterPath,
          year: winner.year,
          status: "watched",
          rating: avg,
        },
        { onConflict: "user_id,tmdb_id,media_type" },
      );
    }
    onNotice?.(
      winner
        ? `Session clôturée : « ${winner.title} » est ajouté à tes titres Vus avec le bilan collectif.`
        : "Session clôturée.",
    );
  }

  const allParticipants = useMemo(() => {
    const set = new Set<string>(memberIds);
    if (user) set.add(user.id);
    if (activeSession) {
      Object.keys(activeSession.rsvps).forEach((id) => set.add(id));
    }
    return [...set];
  }, [memberIds, user, activeSession]);

  const winningProposal = useMemo(() => {
    if (!activeSession || activeSession.proposals.length === 0) return null;
    if (activeSession.selectedTitleId) {
      const found = activeSession.proposals.find((p) => p.id === activeSession.selectedTitleId);
      if (found) return found;
    }
    return [...activeSession.proposals].sort((a, b) => b.votes.length - a.votes.length)[0] ?? null;
  }, [activeSession]);

  const collectiveSummary = useMemo(() => {
    if (!activeSession) return null;
    const list = Object.values(activeSession.reviews);
    if (list.length === 0) return { avg: null, count: 0, verdict: "En attente des notes des participants" };
    const avg = Number((list.reduce((acc, r) => acc + r.rating, 0) / list.length).toFixed(1));
    const verdict =
      avg >= 4.3
        ? "Unanimité / Coup de cœur collectif"
        : avg >= 3.5
        ? "Séance réussie et validée par le groupe"
        : "Avis partagés sur la séance";
    return { avg, count: list.length, verdict };
  }, [activeSession]);

  return (
    <div className="space-y-5 rounded-2xl border border-amber-300/25 bg-gradient-to-br from-[#15120e] via-[#0d0d11] to-[#09090b] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-amber-300">
            <Clapperboard size={13} />
            Mode Session
          </span>
          <h3 className="mt-1 font-serif text-2xl text-[#f4f1ea]">Séances de {groupName}</h3>
          <p className="text-xs text-zinc-400">
            Planifie une soirée, votez pour le film, lancez le compte à rebours et archivez le bilan ensemble.
          </p>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} className={buttonClass}>
          <Plus size={15} />
          Nouvelle session
        </button>
      </div>

      <ErrorNote message={error} />

      {sessions.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sessions.map((s) => {
            const isSelected = activeSession?.id === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSessionId(s.id)}
                className={`shrink-0 rounded-xl border px-3.5 py-2 text-left text-xs transition ${
                  isSelected
                    ? "border-amber-300 bg-amber-300/15 font-semibold text-[#f4f1ea]"
                    : "border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/25"
                }`}
              >
                <span>{s.title}</span>
                <span className="ml-2 rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] text-amber-200">
                  {s.phase === "completed" ? "Archivée" : s.phase === "live" ? "En cours" : "Votes"}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/15 bg-black/25 p-6 text-center">
          <p className="text-sm text-zinc-300">Aucune session planifiée pour l&apos;instant.</p>
          <p className="mt-1 text-xs text-zinc-400">
            Crée une session avec une date et une deadline pour inviter le groupe à proposer et voter.
          </p>
        </div>
      )}

      {activeSession ? (
        <div className="space-y-6">
          {/* En-tête de session + Compte à rebours + Deadline */}
          <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/35 p-4 sm:grid-cols-3">
            <div>
              <p className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
                <Calendar size={13} className="text-amber-300" />
                Date de séance
              </p>
              <p className="mt-1 text-sm font-semibold text-[#f4f1ea]">
                {new Intl.DateTimeFormat("fr-FR", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(activeSession.scheduledAt))}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Deadline vote :{" "}
                {new Intl.DateTimeFormat("fr-FR", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(activeSession.deadlineAt))}
              </p>
            </div>

            <div>
              <p className="inline-flex items-center gap-1.5 text-[11px] text-amber-200">
                <Timer size={13} className="text-amber-300" />
                Compte à rebours
              </p>
              <p className="mt-1 font-mono text-xl font-bold text-amber-200">
                {activeSession.phase === "completed"
                  ? "Terminée"
                  : activeSession.phase === "live"
                  ? "Séance lancée"
                  : formatCountdown(activeSession.scheduledAt, nowMs)}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {activeSession.phase === "voting" ? (
                <button
                  type="button"
                  onClick={() => startSessionNow(activeSession.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-400 px-3.5 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-300"
                >
                  <Play size={14} fill="currentColor" />
                  La séance a commencé
                </button>
              ) : null}
              {activeSession.phase !== "completed" ? (
                <button
                  type="button"
                  onClick={() => void completeSessionAndArchive(activeSession)}
                  className={ghostClass}
                >
                  <CheckCircle2 size={14} />
                  Clôturer &amp; archiver
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                  <Trophy size={13} />
                  Ajouté aux Vus
                </span>
              )}
            </div>
          </div>

          {/* Présence / inscription des participants */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-300">
                <Users size={14} className="text-amber-300" />
                Participants &amp; présence
              </h4>
              {user && activeSession.phase !== "completed" ? (
                <div className="flex gap-1.5 text-xs">
                  {(
                    [
                      ["going", "Partant"],
                      ["maybe", "Peut-être"],
                      ["declined", "Absent"],
                    ] as const
                  ).map(([st, lbl]) => {
                    const active = activeSession.rsvps[user.id] === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setRsvp(activeSession.id, st)}
                        className={`rounded-lg border px-2.5 py-1 transition ${
                          active
                            ? "border-amber-300 bg-amber-300 text-zinc-950 font-semibold"
                            : "border-white/15 text-zinc-300 hover:border-white/30"
                        }`}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {allParticipants.map((uid) => {
                const st = activeSession.rsvps[uid] ?? "maybe";
                const badgeText = st === "going" ? "✓ Partant" : st === "declined" ? "✕ Absent" : "? Peut-être";
                return (
                  <div
                    key={uid}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs"
                  >
                    <Avatar name={personLabel(uid)} url={people[uid]?.avatar_url} size={24} />
                    <span className="text-zinc-200">{personLabel(uid)}</span>
                    <span
                      className={`text-[10px] font-semibold ${
                        st === "going" ? "text-emerald-300" : st === "declined" ? "text-rose-300" : "text-amber-200"
                      }`}
                    >
                      {badgeText}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Propositions & Votes */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-300">
                <Film size={14} className="text-amber-300" />
                Choix du film &amp; votes ({activeSession.proposals.length})
              </h4>
              {winningProposal ? (
                <span className="text-xs font-medium text-amber-200">
                  En tête : <strong>{winningProposal.title}</strong> ({winningProposal.votes.length} vote
                  {winningProposal.votes.length > 1 ? "s" : ""})
                </span>
              ) : null}
            </div>

            {activeSession.phase === "voting" ? (
              <div className="relative mt-3">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  className={`${inputClass} pl-9 text-xs`}
                  value={movieQuery}
                  onChange={(e) => setMovieQuery(e.target.value)}
                  placeholder="Proposer un film, une série ou un animé (ex. Interstellar, Dune…)"
                />
                {searchingMovies ? <p className="mt-1.5 text-[11px] text-zinc-500">Recherche…</p> : null}
                {movieResults.length > 0 ? (
                  <div className="mt-2 grid gap-2 rounded-xl border border-white/15 bg-zinc-950 p-2 sm:grid-cols-2">
                    {movieResults.map((t) => (
                      <button
                        key={`${t.mediaType}:${t.tmdbId}`}
                        type="button"
                        onClick={() => addProposal(activeSession.id, t)}
                        className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.02] p-2 text-left transition hover:border-amber-300/50"
                      >
                        <div className="h-11 w-8 shrink-0 overflow-hidden rounded">
                          <Poster path={t.posterPath} alt={t.title} className="h-full w-full" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-[#f4f1ea]">{t.title}</p>
                          <p className="text-[10px] text-zinc-400">{t.year || "Titre"}</p>
                        </div>
                        <Plus size={14} className="text-amber-300" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeSession.proposals.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {activeSession.proposals.map((prop) => {
                  const voted = user ? prop.votes.includes(user.id) : false;
                  const isWinner = winningProposal?.id === prop.id;
                  return (
                    <div
                      key={prop.id}
                      className={`flex items-center gap-3 rounded-xl border p-2.5 ${
                        isWinner ? "border-amber-300/55 bg-amber-300/10" : "border-white/10 bg-black/30"
                      }`}
                    >
                      <div className="h-14 w-10 shrink-0 overflow-hidden rounded-lg border border-white/10">
                        <Poster path={prop.posterPath} alt={prop.title} className="h-full w-full" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-serif text-sm text-[#f4f1ea]">{prop.title}</p>
                        <p className="text-[10px] text-zinc-400">Par {personLabel(prop.proposedBy)}</p>
                        {activeSession.phase === "voting" ? (
                          <button
                            type="button"
                            onClick={() => toggleVote(activeSession.id, prop.id)}
                            className={`mt-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                              voted
                                ? "bg-amber-300 text-zinc-950"
                                : "border border-white/15 bg-white/[0.04] text-zinc-200 hover:border-amber-300/40"
                            }`}
                          >
                            {voted ? `Voté (${prop.votes.length})` : `Voter (${prop.votes.length})`}
                          </button>
                        ) : (
                          <p className="mt-1 text-[11px] font-semibold text-amber-300">{prop.votes.length} vote(s)</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-xs text-zinc-500">Aucun titre proposé pour l&apos;instant.</p>
            )}
          </div>

          {/* Photos de séance */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between">
              <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-300">
                <Clock size={14} className="text-amber-300" />
                Photos de séance ({activeSession.photos.length})
              </h4>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-200 hover:border-white/35">
                <ImagePlus size={13} />
                <span>{uploadingPhoto ? "Envoi..." : "Ajouter une photo"}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={uploadingPhoto}
                  onChange={(e) => {
                    void handlePhotoUpload(activeSession.id, e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {activeSession.photos.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {activeSession.photos.map((ph) => (
                  <figure key={ph.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ph.url} alt="Photo de séance" className="aspect-video w-full object-cover" />
                    <figcaption className="px-2.5 py-1.5 text-[10px] text-zinc-400">
                      Par {personLabel(ph.userId)}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-zinc-500">Partage une photo de la séance, du popcorn ou de l&apos;ambiance.</p>
            )}
          </div>

          {/* Notes individuelles & Bilan collectif */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-300">
                <Sparkles size={14} className="text-amber-300" />
                Notes &amp; bilan collectif
              </h4>
              {collectiveSummary && collectiveSummary.avg !== null ? (
                <span className="rounded-full border border-amber-300/35 bg-amber-300/10 px-3 py-0.5 text-xs font-semibold text-amber-200">
                  Moyenne : {collectiveSummary.avg}/5 · {collectiveSummary.verdict}
                </span>
              ) : null}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setMyRating(star)}
                    className={`rounded-lg p-1.5 transition ${
                      myRating >= star ? "text-amber-300" : "text-zinc-600 hover:text-zinc-400"
                    }`}
                    aria-label={`Noter ${star} sur 5`}
                  >
                    <Star size={18} fill={myRating >= star ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
              <input
                className={`${inputClass} text-xs`}
                value={myComment}
                onChange={(e) => setMyComment(e.target.value)}
                placeholder="Ton ressenti rapide après la séance…"
              />
              <button type="button" onClick={() => saveReview(activeSession.id)} className={ghostClass}>
                Enregistrer ma note
              </button>
            </div>

            {Object.values(activeSession.reviews).length > 0 ? (
              <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
                {Object.values(activeSession.reviews).map((rev) => (
                  <div
                    key={rev.userId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-[#f4f1ea]">{personLabel(rev.userId)}</span>
                      {rev.comment ? <p className="mt-0.5 text-zinc-300">{rev.comment}</p> : null}
                    </div>
                    <span className="shrink-0 font-bold text-amber-300">{rev.rating} / 5 ★</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Modale de création de session */}
      <Modal open={createOpen} title="Créer une session de visionnage" onClose={() => setCreateOpen(false)}>
        <form onSubmit={createSession} className="space-y-4">
          <label className="block text-xs text-zinc-300">
            Nom de la session
            <input
              className={`${inputClass} mt-1.5`}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Ex. Soirée cinéma du vendredi"
              required
            />
          </label>
          <label className="block text-xs text-zinc-300">
            Date et heure de la séance
            <input
              type="datetime-local"
              className={`${inputClass} mt-1.5`}
              value={newScheduled}
              onChange={(e) => setNewScheduled(e.target.value)}
              required
            />
          </label>
          <label className="block text-xs text-zinc-300">
            Deadline pour proposer et voter
            <input
              type="datetime-local"
              className={`${inputClass} mt-1.5`}
              value={newDeadline}
              onChange={(e) => setNewDeadline(e.target.value)}
              required
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className={ghostClass}>
              Annuler
            </button>
            <button type="submit" className={buttonClass} disabled={newTitle.trim().length < 2}>
              Créer la session
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}