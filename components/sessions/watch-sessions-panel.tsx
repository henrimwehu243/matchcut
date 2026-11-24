"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
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
type SessionFilter = "active" | "completed";

type SessionProposal = {
  id: string;
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  year: string;
  proposedBy: string;
  votes: string[];
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
  rating: number;
  comment: string;
};

type WatchSession = {
  id: string;
  groupId: string;
  title: string;
  scheduledAt: string;
  deadlineAt: string;
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
  if (diff <= 0) return "C'est l'heure";
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
  const [sectionFilter, setSectionFilter] = useState<SessionFilter>("active");
  const [expandedArchives, setExpandedArchives] = useState<Record<string, boolean>>({});
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newScheduled, setNewScheduled] = useState(() => defaultDatePlusHours(24));
  const [newDeadline, setNewDeadline] = useState(() => defaultDatePlusHours(12));

  const [movieQuery, setMovieQuery] = useState("");
  const [movieResults, setMovieResults] = useState<Title[]>([]);
  const [searchingMovies, setSearchingMovies] = useState(false);

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
        const firstActive = parsed.find((s) => s.phase !== "completed") ?? parsed[0] ?? null;
        if (firstActive) {
          setActiveSessionId((prev) => prev ?? firstActive.id);
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

  const activeSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.phase !== "completed")
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [sessions],
  );

  const archivedSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.phase === "completed")
        .sort((a, b) => (b.completedAt || b.scheduledAt).localeCompare(a.completedAt || a.scheduledAt)),
    [sessions],
  );

  const activeSession = useMemo(
    () => activeSessions.find((s) => s.id === activeSessionId) ?? activeSessions[0] ?? null,
    [activeSessions, activeSessionId],
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
    if (uid === user?.id) return "Vous";
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
    setSectionFilter("active");
    setNewTitle("");
    setCreateOpen(false);
    onNotice?.(`Séance « ${created.title} » programmée pour ${groupName}.`);
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
    onNotice?.("La projection est lancée.");
  }

  async function handlePhotoUpload(sessionId: string, file: File | null) {
    if (!user || !file || uploadingPhoto) return;
    if (!file.type.startsWith("image/") || file.size > 6_000_000) {
      setError("Choisissez une image de moins de 6 Mo.");
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
    onNotice?.("Votre note de fin de séance est enregistrée.");
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
    setSectionFilter("completed");
    onNotice?.(
      winner
        ? `Séance archivée : « ${winner.title} » versé aux titres déjà vus.`
        : "Séance archivée.",
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
    if (list.length === 0) return { avg: null, count: 0, verdict: "En attente des appréciations" };
    const avg = Number((list.reduce((acc, r) => acc + r.rating, 0) / list.length).toFixed(1));
    const verdict =
      avg >= 4.3
        ? "Coup de cœur partagé"
        : avg >= 3.5
        ? "Séance validée par le cercle"
        : "Lectures partagées";
    return { avg, count: list.length, verdict };
  }, [activeSession]);

  return (
    <div className="editorial-enter space-y-10 border-t border-[#EAE6DE]/12 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-[#EAE6DE]/12 pb-8">
        <div>
          <p className="mc-kicker inline-flex items-center gap-2 text-[#C49A58]">
            <Clapperboard size={13} />
            <span>V — Séances de {groupName}</span>
          </p>
          <h3 className="mt-2 font-serif text-4xl text-[#EAE6DE] sm:text-5xl">
            Programme &amp; <span className="italic text-[#A3B99B]">archives</span>
          </h3>
        </div>

        <button type="button" onClick={() => setCreateOpen(true)} className={buttonClass}>
          <Plus size={14} />
          <span>Programmer</span>
        </button>
      </div>

      {/* Onglets de tri : Séances actives vs Archives compactes */}
      <div className="flex flex-wrap items-center gap-6 border-b border-[#EAE6DE]/10 pb-4">
        <button
          type="button"
          onClick={() => setSectionFilter("active")}
          className={`inline-flex items-baseline gap-2 pb-1 transition ${
            sectionFilter === "active"
              ? "border-b border-[#C49A58] text-[#EAE6DE]"
              : "text-[#EAE6DE]/45 hover:text-[#EAE6DE]/85"
          }`}
        >
          <span className="mc-kicker text-[10px]">À venir &amp; en cours</span>
          <span className="font-serif text-lg italic text-[#C49A58]">{activeSessions.length}</span>
        </button>

        <button
          type="button"
          onClick={() => setSectionFilter("completed")}
          className={`inline-flex items-baseline gap-2 pb-1 transition ${
            sectionFilter === "completed"
              ? "border-b border-[#C49A58] text-[#EAE6DE]"
              : "text-[#EAE6DE]/45 hover:text-[#EAE6DE]/85"
          }`}
        >
          <span className="mc-kicker inline-flex items-center gap-1.5 text-[10px]">
            <Archive size={11} />
            <span>Archivées</span>
          </span>
          <span className="font-serif text-lg italic text-[#A3B99B]">{archivedSessions.length}</span>
        </button>
      </div>

      <ErrorNote message={error} />

      {sectionFilter === "completed" ? (
        <div className="divide-y divide-[#EAE6DE]/10 border-b border-[#EAE6DE]/10">
          {archivedSessions.length === 0 ? (
            <p className="py-10 text-center font-serif text-xl italic text-[#EAE6DE]/50">
              Aucune séance archivée pour ce cercle.
            </p>
          ) : (
            archivedSessions.map((arch) => {
              const winner =
                arch.proposals.find((p) => p.id === arch.selectedTitleId) ??
                [...arch.proposals].sort((a, b) => b.votes.length - a.votes.length)[0] ??
                null;
              const revList = Object.values(arch.reviews);
              const avg =
                revList.length > 0
                  ? (revList.reduce((acc, r) => acc + r.rating, 0) / revList.length).toFixed(1)
                  : null;
              const isOpen = Boolean(expandedArchives[arch.id]);

              return (
                <div key={arch.id} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-baseline gap-4">
                      <span className="mc-kicker text-[9px] text-[#EAE6DE]/45">
                        {new Intl.DateTimeFormat("fr-FR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }).format(new Date(arch.completedAt || arch.scheduledAt))}
                      </span>
                      <h4 className="font-serif text-xl text-[#EAE6DE]">{arch.title}</h4>
                      {winner ? (
                        <span className="font-serif text-base italic text-[#C49A58]">— {winner.title}</span>
                      ) : null}
                      {avg ? (
                        <span className="mc-kicker text-[9px] text-[#A3B99B]">{avg}/5</span>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedArchives((prev) => ({ ...prev, [arch.id]: !prev[arch.id] }))
                      }
                      className="mc-kicker inline-flex items-center gap-1 text-[10px] text-[#EAE6DE]/60 hover:text-[#C49A58]"
                    >
                      <span>{isOpen ? "Replier" : "Détails"}</span>
                      {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  </div>

                  {isOpen ? (
                    <div className="mt-4 space-y-4 border-l border-[#EAE6DE]/15 pl-4 text-xs text-[#EAE6DE]/70">
                      {revList.length > 0 ? (
                        <div className="space-y-1.5">
                          {revList.map((r) => (
                            <p key={r.userId}>
                              <strong className="text-[#EAE6DE]">{personLabel(r.userId)}</strong> ({r.rating}/5)
                              {r.comment ? ` : « ${r.comment} »` : ""}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[#EAE6DE]/45">Aucune note enregistrée.</p>
                      )}
                      {arch.photos.length > 0 ? (
                        <div className="flex flex-wrap gap-3 pt-1">
                          {arch.photos.map((ph) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={ph.id}
                              src={ph.url}
                              alt="Cliché archivé"
                              className="h-16 w-24 object-cover"
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <>
          {activeSessions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-6">
              {activeSessions.map((s) => {
                const isSelected = activeSession?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveSessionId(s.id)}
                    className={`inline-flex items-baseline gap-2 pb-1 transition ${
                      isSelected
                        ? "border-b border-[#C49A58] text-[#EAE6DE]"
                        : "text-[#EAE6DE]/45 hover:text-[#EAE6DE]/85"
                    }`}
                  >
                    <span className="font-serif text-xl">{s.title}</span>
                    <span className="mc-kicker text-[9px] text-[#C49A58]">
                      {s.phase === "live" ? "En cours" : "Votes"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="border-y border-[#EAE6DE]/12 py-12 text-center">
              <p className="font-serif text-2xl italic text-[#EAE6DE]/75">
                Aucune séance en cours ou à venir.
              </p>
              <p className="mt-1.5 text-xs text-[#EAE6DE]/50">
                Programmez une nouvelle séance ou consultez vos séances archivées.
              </p>
            </div>
          )}

          {activeSession ? (
            <div className="space-y-12">
              <div className="grid gap-8 border-b border-[#EAE6DE]/12 pb-10 sm:grid-cols-3">
                <div>
                  <p className="mc-kicker inline-flex items-center gap-1.5 text-[10px] text-[#EAE6DE]/50">
                    <Calendar size={12} className="text-[#C49A58]" />
                    <span>Horaire</span>
                  </p>
                  <p className="mt-2 font-serif text-2xl text-[#EAE6DE]">
                    {new Intl.DateTimeFormat("fr-FR", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(activeSession.scheduledAt))}
                  </p>
                  <p className="mc-kicker mt-1 text-[10px] text-[#EAE6DE]/45">
                    Clôture :{" "}
                    {new Intl.DateTimeFormat("fr-FR", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(activeSession.deadlineAt))}
                  </p>
                </div>

                <div>
                  <p className="mc-kicker inline-flex items-center gap-1.5 text-[10px] text-[#C49A58]">
                    <Timer size={12} />
                    <span>Compte à rebours</span>
                  </p>
                  <p className="mt-2 font-serif text-3xl text-[#EAE6DE]">
                    {activeSession.phase === "live"
                      ? "En cours"
                      : formatCountdown(activeSession.scheduledAt, nowMs)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4 sm:justify-end">
                  {activeSession.phase === "voting" ? (
                    <button
                      type="button"
                      onClick={() => startSessionNow(activeSession.id)}
                      className="mc-kicker inline-flex items-center gap-2 bg-[#A3B99B] px-4 py-2.5 text-[10px] font-semibold text-[#101112] transition hover:bg-[#b5c9ad]"
                    >
                      <Play size={12} fill="currentColor" />
                      <span>Lancer</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void completeSessionAndArchive(activeSession)}
                    className={ghostClass}
                  >
                    <CheckCircle2 size={13} />
                    <span>Archiver</span>
                  </button>
                </div>
              </div>

              <div className="border-b border-[#EAE6DE]/12 pb-10">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h4 className="mc-kicker inline-flex items-center gap-1.5 text-[10px] text-[#EAE6DE]/65">
                    <Users size={13} className="text-[#C49A58]" />
                    <span>Présence</span>
                  </h4>
                  {user ? (
                    <div className="flex items-center gap-4">
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
                            className={`mc-kicker pb-1 text-[10px] transition ${
                              active
                                ? "border-b border-[#C49A58] text-[#C49A58]"
                                : "text-[#EAE6DE]/45 hover:text-[#EAE6DE]"
                            }`}
                          >
                            {lbl}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="mt-5 flex flex-wrap gap-6">
                  {allParticipants.map((uid) => {
                    const st = activeSession.rsvps[uid] ?? "maybe";
                    const statusLabel = st === "going" ? "Partant" : st === "declined" ? "Absent" : "Peut-être";
                    return (
                      <div key={uid} className="flex items-center gap-2.5 text-xs">
                        <Avatar name={personLabel(uid)} url={people[uid]?.avatar_url} size={28} />
                        <span className="font-serif text-lg text-[#EAE6DE]">{personLabel(uid)}</span>
                        <span
                          className={`mc-kicker text-[9px] ${
                            st === "going" ? "text-[#A3B99B]" : st === "declined" ? "text-[#EAE6DE]/40" : "text-[#C49A58]"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-b border-[#EAE6DE]/12 pb-10">
                <div className="flex flex-wrap items-baseline justify-between gap-4">
                  <h4 className="mc-kicker inline-flex items-center gap-1.5 text-[10px] text-[#EAE6DE]/65">
                    <Film size={13} className="text-[#C49A58]" />
                    <span>Propositions &amp; votes ({activeSession.proposals.length})</span>
                  </h4>
                  {winningProposal ? (
                    <span className="font-serif text-lg italic text-[#C49A58]">
                      En tête : {winningProposal.title} ({winningProposal.votes.length} vote
                      {winningProposal.votes.length > 1 ? "s" : ""})
                    </span>
                  ) : null}
                </div>

                {activeSession.phase === "voting" ? (
                  <div className="relative mt-5 max-w-xl">
                    <Search size={14} className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-[#EAE6DE]/45" />
                    <input
                      className={`${inputClass} rounded-none border-x-0 border-t-0 border-b border-[#EAE6DE]/20 bg-transparent py-2 pl-7 pr-4 text-sm text-[#EAE6DE] placeholder:text-[#EAE6DE]/35 focus:border-[#C49A58] focus:outline-none`}
                      value={movieQuery}
                      onChange={(e) => setMovieQuery(e.target.value)}
                      placeholder="Proposer une œuvre…"
                    />
                    {searchingMovies ? <p className="mc-kicker mt-2 text-[10px]">Recherche…</p> : null}
                    {movieResults.length > 0 ? (
                      <div className="mt-3 grid gap-3 border border-[#EAE6DE]/15 bg-[#202224] p-3 sm:grid-cols-2">
                        {movieResults.map((t) => (
                          <button
                            key={`${t.mediaType}:${t.tmdbId}`}
                            type="button"
                            onClick={() => addProposal(activeSession.id, t)}
                            className="flex items-center gap-3 border-b border-[#EAE6DE]/10 pb-2.5 text-left transition hover:border-[#C49A58]"
                          >
                            <div className="aspect-[2/3] w-8 shrink-0 overflow-hidden bg-[#101112]">
                              <Poster path={t.posterPath} alt={t.title} className="h-full w-full" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-serif text-base text-[#EAE6DE]">{t.title}</p>
                              <p className="mc-kicker text-[9px] text-[#EAE6DE]/45">{t.year || "Œuvre"}</p>
                            </div>
                            <Plus size={14} className="text-[#C49A58]" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {activeSession.proposals.length > 0 ? (
                  <div className="mt-7 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                    {activeSession.proposals.map((prop) => {
                      const voted = user ? prop.votes.includes(user.id) : false;
                      const isWinner = winningProposal?.id === prop.id;
                      return (
                        <div
                          key={prop.id}
                          className={`flex items-center gap-4 border-b pb-4 ${
                            isWinner ? "border-[#C49A58]" : "border-[#EAE6DE]/12"
                          }`}
                        >
                          <div className="aspect-[2/3] w-14 shrink-0 overflow-hidden bg-[#202224]">
                            <Poster path={prop.posterPath} alt={prop.title} className="h-full w-full" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-serif text-xl text-[#EAE6DE]">{prop.title}</p>
                            <p className="mc-kicker text-[9px] text-[#EAE6DE]/45">Par {personLabel(prop.proposedBy)}</p>
                            {activeSession.phase === "voting" ? (
                              <button
                                type="button"
                                onClick={() => toggleVote(activeSession.id, prop.id)}
                                className={`mc-kicker mt-2 px-3 py-1 text-[10px] transition ${
                                  voted
                                    ? "bg-[#C49A58] font-semibold text-[#101112]"
                                    : "border border-[#EAE6DE]/20 text-[#EAE6DE]/80 hover:border-[#C49A58] hover:text-[#C49A58]"
                                }`}
                              >
                                {voted ? `Retenu (${prop.votes.length})` : `Voter (${prop.votes.length})`}
                              </button>
                            ) : (
                              <p className="mc-kicker mt-1.5 text-[10px] text-[#C49A58]">
                                {prop.votes.length} vote{prop.votes.length > 1 ? "s" : ""}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <div className="border-b border-[#EAE6DE]/12 pb-10">
                <div className="flex items-center justify-between">
                  <h4 className="mc-kicker inline-flex items-center gap-1.5 text-[10px] text-[#EAE6DE]/65">
                    <Clock size={13} className="text-[#C49A58]" />
                    <span>Clichés ({activeSession.photos.length})</span>
                  </h4>
                  <label className="mc-kicker inline-flex cursor-pointer items-center gap-1.5 text-[10px] text-[#EAE6DE]/80 transition hover:text-[#C49A58]">
                    <ImagePlus size={13} />
                    <span>{uploadingPhoto ? "Envoi…" : "Ajouter"}</span>
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
                  <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
                    {activeSession.photos.map((ph) => (
                      <figure key={ph.id} className="group space-y-2">
                        <div className="aspect-video overflow-hidden bg-[#202224]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={ph.url}
                            alt="Cliché de séance"
                            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                          />
                        </div>
                        <figcaption className="mc-kicker text-[9px] text-[#EAE6DE]/45">
                          Par {personLabel(ph.userId)}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : null}
              </div>

              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-4">
                  <h4 className="mc-kicker inline-flex items-center gap-1.5 text-[10px] text-[#EAE6DE]/65">
                    <Sparkles size={13} className="text-[#C49A58]" />
                    <span>Notes &amp; bilan</span>
                  </h4>
                  {collectiveSummary && collectiveSummary.avg !== null ? (
                    <span className="font-serif text-xl italic text-[#C49A58]">
                      Moyenne {collectiveSummary.avg}/5 · {collectiveSummary.verdict}
                    </span>
                  ) : null}
                </div>

                <div className="mt-5 grid gap-5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setMyRating(star)}
                        className={`p-1 transition ${
                          myRating >= star ? "text-[#C49A58]" : "text-[#EAE6DE]/25 hover:text-[#EAE6DE]/55"
                        }`}
                        aria-label={`Noter ${star} sur 5`}
                      >
                        <Star size={17} fill={myRating >= star ? "currentColor" : "none"} />
                      </button>
                    ))}
                  </div>
                  <input
                    className={`${inputClass} rounded-none border-x-0 border-t-0 border-b border-[#EAE6DE]/20 bg-transparent px-0 py-2 text-sm text-[#EAE6DE] placeholder:text-[#EAE6DE]/35 focus:border-[#C49A58] focus:outline-none`}
                    value={myComment}
                    onChange={(e) => setMyComment(e.target.value)}
                    placeholder="Votre impression…"
                  />
                  <button type="button" onClick={() => saveReview(activeSession.id)} className={ghostClass}>
                    Enregistrer
                  </button>
                </div>

                {Object.values(activeSession.reviews).length > 0 ? (
                  <div className="mt-6 divide-y divide-[#EAE6DE]/10 border-t border-[#EAE6DE]/10">
                    {Object.values(activeSession.reviews).map((rev) => (
                      <div key={rev.userId} className="flex items-start justify-between gap-4 py-4 text-xs">
                        <div>
                          <span className="font-serif text-lg text-[#EAE6DE]">{personLabel(rev.userId)}</span>
                          {rev.comment ? (
                            <p className="mt-1 font-serif text-base italic text-[#EAE6DE]/70">« {rev.comment} »</p>
                          ) : null}
                        </div>
                        <span className="mc-kicker shrink-0 text-[10px] text-[#C49A58]">{rev.rating} / 5</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}

      <Modal open={createOpen} title="Programmer une séance" onClose={() => setCreateOpen(false)}>
        <form onSubmit={createSession} className="space-y-5">
          <label className="block text-xs text-[#EAE6DE]/80">
            <span className="mc-kicker">Intitulé</span>
            <input
              className={`${inputClass} mt-2 w-full`}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Ex. Séance du vendredi soir"
              required
            />
          </label>
          <label className="block text-xs text-[#EAE6DE]/80">
            <span className="mc-kicker">Date et heure</span>
            <input
              type="datetime-local"
              className={`${inputClass} mt-2 w-full`}
              value={newScheduled}
              onChange={(e) => setNewScheduled(e.target.value)}
              required
            />
          </label>
          <label className="block text-xs text-[#EAE6DE]/80">
            <span className="mc-kicker">Clôture des votes</span>
            <input
              type="datetime-local"
              className={`${inputClass} mt-2 w-full`}
              value={newDeadline}
              onChange={(e) => setNewDeadline(e.target.value)}
              required
            />
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className={ghostClass}>
              Annuler
            </button>
            <button type="submit" className={buttonClass} disabled={newTitle.trim().length < 2}>
              Programmer
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}