"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Award,
  Camera,
  Check,
  Clock,
  Flame,
  Heart,
  ImagePlus,
  LogOut,
  MessageCircle,
  Palette,
  Pencil,
  Reply,
  Send,
  Settings,
  Shield,
  SmilePlus,
  Sparkles,
  Swords,
  Trophy,
  UserPlus,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Avatar, ErrorNote, Modal, PageHeader, Poster, buttonClass, ghostClass, inputClass } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import type { ChatMessage, DirectMessage, Friendship, Group, Profile, SessionPhoto } from "@/lib/types";

type ReactionsMap = Record<string, string[]>;

type ReplyMeta = {
  id: string;
  authorName: string;
  preview: string;
};

type FeedItem =
  | {
      kind: "message";
      id: string;
      created_at: string;
      user_id: string;
      body: string;
      reactions?: ReactionsMap;
      replyTo?: ReplyMeta | null;
    }
  | {
      kind: "photo";
      id: string;
      created_at: string;
      user_id: string;
      image_url: string;
      caption: string | null;
      mediaKind?: "image" | "video";
      replyTo?: ReplyMeta | null;
    };

type ExtendedDirectMessage = DirectMessage & {
  reactions?: ReactionsMap;
};

type ActiveChat = { kind: "group"; id: string } | { kind: "dm"; friendId: string };

type MutualSuggestion = {
  profile: Profile;
  mutualCount: number;
};

type CompatibilityInfo = {
  score: number;
  commonCount: number;
  label: string;
};

type BadgeTier = {
  id: string;
  title: string;
  tierLabel: "Bronze" | "Argent" | "Or" | "Platine" | "Verrouillé";
  level: number;
  current: number;
  nextTarget: number | null;
  description: string;
};

type DuelMode = "common" | "favorites";

type DuelCandidate = {
  key: string;
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  year: string;
  sourceNote: string;
  isMyPick?: boolean;
};

type EveningPrefs = {
  vibe: string;
  formatPref: string;
  maxRuntime: string;
};

type ChatThemeId = "cinema" | "amber" | "emerald" | "velours" | "nuit";

const CHAT_THEMES: {
  id: ChatThemeId;
  label: string;
  panelClass: string;
  bubbleMineClass: string;
  pillClass: string;
}[] = [
  {
    id: "cinema",
    label: "Cinéma",
    panelClass: "bg-[#0b0b0e]",
    bubbleMineClass: "bg-amber-300/15 text-[#f4f1ea] border-amber-300/30",
    pillClass: "bg-amber-400",
  },
  {
    id: "amber",
    label: "Ambre",
    panelClass: "bg-[#120e09]",
    bubbleMineClass: "bg-amber-500/20 text-amber-50 border-amber-400/40",
    pillClass: "bg-orange-400",
  },
  {
    id: "emerald",
    label: "Émeraude",
    panelClass: "bg-[#09120f]",
    bubbleMineClass: "bg-emerald-500/20 text-emerald-50 border-emerald-400/40",
    pillClass: "bg-emerald-400",
  },
  {
    id: "velours",
    label: "Velours",
    panelClass: "bg-[#130c12]",
    bubbleMineClass: "bg-rose-500/20 text-rose-50 border-rose-400/40",
    pillClass: "bg-rose-400",
  },
  {
    id: "nuit",
    label: "Nuit",
    panelClass: "bg-[#090e15]",
    bubbleMineClass: "bg-sky-500/20 text-sky-50 border-sky-400/40",
    pillClass: "bg-sky-400",
  },
];

const QUICK_REACTIONS = ["🔥", "🎬", "😂", "👍"] as const;

function formatDayLabel(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((today - target) / 86_400_000);
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function isSameAuthorCluster(prevCreatedAt: string, prevUserId: string, currCreatedAt: string, currUserId: string) {
  if (prevUserId !== currUserId) return false;
  const diffMs = Math.abs(new Date(currCreatedAt).getTime() - new Date(prevCreatedAt).getTime());
  return diffMs < 4 * 60 * 1000;
}

function computeTierBadge(
  id: string,
  title: string,
  current: number,
  thresholds: [number, number, number, number],
  unitLabel: string,
): BadgeTier {
  const [t1, t2, t3, t4] = thresholds;
  if (current >= t4) {
    return { id, title, tierLabel: "Platine", level: 4, current, nextTarget: null, description: `${current} ${unitLabel}` };
  }
  if (current >= t3) {
    return { id, title, tierLabel: "Or", level: 3, current, nextTarget: t4, description: `${current}/${t4} ${unitLabel}` };
  }
  if (current >= t2) {
    return { id, title, tierLabel: "Argent", level: 2, current, nextTarget: t3, description: `${current}/${t3} ${unitLabel}` };
  }
  if (current >= t1) {
    return { id, title, tierLabel: "Bronze", level: 1, current, nextTarget: t2, description: `${current}/${t2} ${unitLabel}` };
  }
  return { id, title, tierLabel: "Verrouillé", level: 0, current, nextTarget: t1, description: `${current}/${t1} ${unitLabel}` };
}

function encodeReplyPrefix(reply: ReplyMeta, body: string) {
  const payload = JSON.stringify({
    id: reply.id,
    authorName: reply.authorName,
    preview: reply.preview.slice(0, 120),
  });
  return `[[MC_REPLY:${encodeURIComponent(payload)}]]\n${body}`;
}

function decodeReplyBody(rawBody: string): { replyTo: ReplyMeta | null; cleanBody: string } {
  const match = rawBody.match(/^\[\[MC_REPLY:([^\]]+)\]\]\n([\s\S]*)$/);
  if (!match) return { replyTo: null, cleanBody: rawBody };
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1])) as ReplyMeta;
    if (parsed && typeof parsed.preview === "string") {
      return { replyTo: parsed, cleanBody: match[2] };
    }
  } catch {
    // ignore
  }
  return { replyTo: null, cleanBody: rawBody };
}

function isVideoUrl(url: string, caption?: string | null) {
  if (caption?.startsWith("video:")) return true;
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

export function GroupsView() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const initialDm = searchParams?.get("dm");

  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Profile[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [mutualSuggestions, setMutualSuggestions] = useState<MutualSuggestion[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);

  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [dmFeed, setDmFeed] = useState<ExtendedDirectMessage[]>([]);
  const [unreadByFriend, setUnreadByFriend] = useState<Record<string, number>>({});
  const [localReactions, setLocalReactions] = useState<Record<string, ReactionsMap>>({});
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<ReplyMeta | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);

  const [chatThemes, setChatThemes] = useState<Record<string, ChatThemeId>>({});

  const [compatibilityByUser, setCompatibilityByUser] = useState<Record<string, CompatibilityInfo>>({});
  const [badges, setBadges] = useState<BadgeTier[]>([]);
  const [badgesOpen, setBadgesOpen] = useState(false);

  const [duelOpen, setDuelOpen] = useState(false);
  const [duelMode, setDuelMode] = useState<DuelMode>("common");
  const [duelCandidates, setDuelCandidates] = useState<DuelCandidate[]>([]);
  const [selectedFavoriteKeys, setSelectedFavoriteKeys] = useState<string[]>([]);
  const [pickingFavorites, setPickingFavorites] = useState(false);
  const [duelPool, setDuelPool] = useState<DuelCandidate[]>([]);
  const [duelChampionIdx, setDuelChampionIdx] = useState(0);
  const [duelChallengerIdx, setDuelChallengerIdx] = useState(1);
  const [duelWinner, setDuelWinner] = useState<DuelCandidate | null>(null);
  const [duelLoading, setDuelLoading] = useState(false);

  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [groupMembersMeta, setGroupMembersMeta] = useState<{ user_id: string; role: string }[]>([]);
  const [renameDraft, setRenameDraft] = useState("");
  const [friendToAddId, setFriendToAddId] = useState("");
  const [uploadingGroupAvatar, setUploadingGroupAvatar] = useState(false);
  const [eveningPrefsByGroup, setEveningPrefsByGroup] = useState<Record<string, EveningPrefs>>({});

  const [draft, setDraft] = useState("");
  const [groupName, setGroupName] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [busyFriendAction, setBusyFriendAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);
  const sendingMessageRef = useRef(false);
  const creatingGroupRef = useRef(false);
  const reactionColumnSupportedRef = useRef<boolean | null>(null);

  const activeChatKey = useMemo(() => {
    if (!activeChat) return null;
    return activeChat.kind === "group" ? `group:${activeChat.id}` : `dm:${activeChat.friendId}`;
  }, [activeChat]);

  const currentChatTheme = useMemo(() => {
    const id = activeChatKey ? chatThemes[activeChatKey] ?? "cinema" : "cinema";
    return CHAT_THEMES.find((t) => t.id === id) ?? CHAT_THEMES[0];
  }, [activeChatKey, chatThemes]);

  useEffect(() => {
    if (initialDm) {
      setActiveChat({ kind: "dm", friendId: initialDm });
    }
  }, [initialDm]);

  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    try {
      const savedReacts = window.localStorage.getItem(`matchcut_reactions_${user.id}`);
      if (savedReacts) setLocalReactions(JSON.parse(savedReacts) as Record<string, ReactionsMap>);
    } catch {
      // ignore
    }
    try {
      const savedThemes = window.localStorage.getItem(`matchcut_chat_themes_${user.id}`);
      if (savedThemes) setChatThemes(JSON.parse(savedThemes) as Record<string, ChatThemeId>);
    } catch {
      // ignore
    }
    try {
      const savedPrefs = window.localStorage.getItem(`matchcut_evening_prefs_${user.id}`);
      if (savedPrefs) setEveningPrefsByGroup(JSON.parse(savedPrefs) as Record<string, EveningPrefs>);
    } catch {
      // ignore
    }
  }, [user]);

  function selectChatTheme(themeId: ChatThemeId) {
    if (!user || !activeChatKey) return;
    setChatThemes((prev) => {
      const next = { ...prev, [activeChatKey]: themeId };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`matchcut_chat_themes_${user.id}`, JSON.stringify(next));
      }
      return next;
    });
  }

  function updateEveningPrefs(patch: Partial<EveningPrefs>) {
    if (!user || activeChat?.kind !== "group") return;
    const gid = activeChat.id;
    setEveningPrefsByGroup((prev) => {
      const current = prev[gid] ?? {
        vibe: "Thriller & suspens",
        formatPref: "Film (≤ 2h15)",
        maxRuntime: "Soirée tranquille",
      };
      const next = { ...prev, [gid]: { ...current, ...patch } };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`matchcut_evening_prefs_${user.id}`, JSON.stringify(next));
      }
      return next;
    });
  }

  const loadUnreadDms = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("direct_messages")
      .select("sender_id")
      .eq("receiver_id", user.id)
      .is("read_at", null);
    const counts: Record<string, number> = {};
    (data ?? []).forEach((row) => {
      const sid = row.sender_id as string;
      counts[sid] = (counts[sid] ?? 0) + 1;
    });
    setUnreadByFriend(counts);
  }, [user]);

  const loadCompatibilityAndBadges = useCallback(
    async (acceptedFriendIds: string[]) => {
      if (!user) return;
      const allRelevantIds = [user.id, ...acceptedFriendIds];

      const [
        { data: swipesRows },
        { data: watchRows },
        { count: reviewsCount },
        { count: matchesCount },
        { count: groupMsgCount },
        { count: dmMsgCount },
      ] = await Promise.all([
        supabase
          .from("swipes")
          .select("user_id, tmdb_id, media_type, decision")
          .in("user_id", allRelevantIds)
          .eq("decision", "validate")
          .limit(800),
        supabase
          .from("watch_items")
          .select("user_id, tmdb_id, media_type")
          .in("user_id", allRelevantIds)
          .limit(800),
        supabase.from("reviews").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("matches").select("id", { count: "exact", head: true }),
        supabase.from("messages").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("direct_messages").select("id", { count: "exact", head: true }).eq("sender_id", user.id),
      ]);

      const likesByUser: Record<string, Set<string>> = {};
      allRelevantIds.forEach((id) => {
        likesByUser[id] = new Set();
      });

      (swipesRows ?? []).forEach((r) => {
        const uid = r.user_id as string;
        if (likesByUser[uid]) likesByUser[uid].add(`${r.media_type}:${r.tmdb_id}`);
      });
      (watchRows ?? []).forEach((r) => {
        const uid = r.user_id as string;
        if (likesByUser[uid]) likesByUser[uid].add(`${r.media_type}:${r.tmdb_id}`);
      });

      const mySet = likesByUser[user.id] ?? new Set<string>();
      const compatMap: Record<string, CompatibilityInfo> = {};

      acceptedFriendIds.forEach((fid) => {
        const theirSet = likesByUser[fid] ?? new Set<string>();
        if (mySet.size === 0 || theirSet.size === 0) {
          compatMap[fid] = { score: 50, commonCount: 0, label: "Nouveau duo" };
          return;
        }
        let intersection = 0;
        mySet.forEach((key) => {
          if (theirSet.has(key)) intersection += 1;
        });
        const minSize = Math.min(mySet.size, theirSet.size);
        const ratio = intersection / Math.max(1, minSize);
        const score = Math.min(99, Math.max(28, Math.round(35 + ratio * 65)));
        const label =
          score >= 82
            ? "Âmes sœurs ciné"
            : score >= 65
            ? "Très proches"
            : score >= 48
            ? "Bon équilibre"
            : "Complémentaires";
        compatMap[fid] = { score, commonCount: intersection, label };
      });
      setCompatibilityByUser(compatMap);

      const myLikesCount = mySet.size;
      const totalMessages = (groupMsgCount ?? 0) + (dmMsgCount ?? 0);

      setBadges([
        computeTierBadge("explorer", "Explorateur d'écran", myLikesCount, [10, 35, 90, 200], "titres validés"),
        computeTierBadge("critic", "Plume critique", reviewsCount ?? 0, [3, 12, 30, 75], "avis publiés"),
        computeTierBadge("matcher", "Chasseur de matchs", matchesCount ?? 0, [2, 8, 20, 50], "matchs"),
        computeTierBadge("social", "Animateur de salle", totalMessages, [15, 60, 180, 500], "messages"),
        computeTierBadge("circle", "Cercle ciné", acceptedFriendIds.length, [2, 5, 12, 25], "amis"),
      ]);
    },
    [user],
  );

  const loadSocial = useCallback(async () => {
    if (!user) return;
    const { data: links, error: linkError } = await supabase
      .from("friendships")
      .select("*")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .order("created_at", { ascending: false });
    if (linkError) {
      setError(linkError.message);
      return;
    }
    const rows = (links as Friendship[]) ?? [];
    setFriendships(rows);

    const myAcceptedFriendIds = rows
      .filter((row) => row.status === "accepted")
      .map((row) => (row.requester_id === user.id ? row.addressee_id : row.requester_id));

    const blockedOrKnownIds = new Set<string>([
      user.id,
      ...rows.flatMap((row) => [row.requester_id, row.addressee_id]),
    ]);

    const ids = [...new Set(rows.flatMap((row) => [row.requester_id, row.addressee_id]).filter((id) => id !== user.id))];
    if (ids.length) {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, bio, updated_at, created_at")
        .in("id", ids);
      const map: Record<string, Profile> = {};
      ((data as Profile[]) ?? []).forEach((profile) => {
        map[profile.id] = profile;
      });
      setPeople((prev) => ({ ...prev, ...map }));
    }

    if (myAcceptedFriendIds.length > 0) {
      const { data: secondHopRows } = await supabase
        .from("friendships")
        .select("requester_id, addressee_id, status")
        .eq("status", "accepted")
        .or(
          myAcceptedFriendIds
            .map((fid) => `requester_id.eq.${fid},addressee_id.eq.${fid}`)
            .join(","),
        );

      const myFriendSet = new Set(myAcceptedFriendIds);
      const mutualCounter: Record<string, Set<string>> = {};

      ((secondHopRows as Friendship[]) ?? []).forEach((edge) => {
        const a = edge.requester_id;
        const b = edge.addressee_id;
        if (myFriendSet.has(a) && !blockedOrKnownIds.has(b)) {
          if (!mutualCounter[b]) mutualCounter[b] = new Set();
          mutualCounter[b].add(a);
        }
        if (myFriendSet.has(b) && !blockedOrKnownIds.has(a)) {
          if (!mutualCounter[a]) mutualCounter[a] = new Set();
          mutualCounter[a].add(b);
        }
      });

      const candidateIds = Object.keys(mutualCounter)
        .sort((x, y) => mutualCounter[y].size - mutualCounter[x].size)
        .slice(0, 6);

      if (candidateIds.length > 0) {
        const { data: candidateProfiles } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url, bio, updated_at, created_at")
          .in("id", candidateIds);

        const list: MutualSuggestion[] = ((candidateProfiles as Profile[]) ?? [])
          .map((p) => ({
            profile: p,
            mutualCount: mutualCounter[p.id]?.size ?? 0,
          }))
          .filter((item) => item.mutualCount > 0)
          .sort((a, b) => b.mutualCount - a.mutualCount);

        setMutualSuggestions(list);
        setPeople((prev) => {
          const next = { ...prev };
          list.forEach((item) => {
            next[item.profile.id] = item.profile;
          });
          return next;
        });
      } else {
        setMutualSuggestions([]);
      }
    } else {
      setMutualSuggestions([]);
    }

    const { data: memberships, error: memberError } = await supabase.from("group_members").select("group_id").eq("user_id", user.id);
    if (memberError) {
      setError(memberError.message);
      return;
    }
    const groupIds = (memberships ?? []).map((row) => row.group_id as string);
    if (!groupIds.length) {
      setGroups([]);
    } else {
      const { data: groupRows, error: groupError } = await supabase
        .from("groups")
        .select("*")
        .in("id", groupIds)
        .order("created_at", { ascending: false });
      if (groupError) setError(groupError.message);
      else setGroups((groupRows as Group[]) ?? []);
    }

    await Promise.all([loadUnreadDms(), loadCompatibilityAndBadges(myAcceptedFriendIds)]);
  }, [user, loadUnreadDms, loadCompatibilityAndBadges]);

  const loadGroupMembers = useCallback(async (gId: string) => {
    const { data } = await supabase.from("group_members").select("user_id, role").eq("group_id", gId);
    const rows = ((data as { user_id: string; role?: string }[]) ?? []).map((r) => ({
      user_id: r.user_id,
      role: r.role || "member",
    }));
    setGroupMembersMeta(rows);
    const mIds = rows.map((r) => r.user_id);
    if (mIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, bio, updated_at, created_at")
        .in("id", mIds);
      setPeople((prev) => {
        const next = { ...prev };
        ((profs as Profile[]) ?? []).forEach((p) => {
          next[p.id] = p;
        });
        return next;
      });
    }
  }, []);

  const loadGroupFeed = useCallback(async (groupId: string) => {
    const [messages, photos] = await Promise.all([
      supabase.from("messages").select("*").eq("group_id", groupId).order("created_at", { ascending: true }).limit(150),
      supabase.from("session_photos").select("*").eq("group_id", groupId).order("created_at", { ascending: true }).limit(80),
    ]);
    if (messages.error) setError(messages.error.message);
    if (photos.error) setError(photos.error.message);
    const items: FeedItem[] = [
      ...((messages.data as (ChatMessage & { reactions?: ReactionsMap })[]) ?? []).map((row) => {
        const decoded = decodeReplyBody(row.body);
        return {
          kind: "message" as const,
          id: row.id,
          created_at: row.created_at,
          user_id: row.user_id,
          body: decoded.cleanBody,
          replyTo: decoded.replyTo,
          reactions: row.reactions,
        };
      }),
      ...((photos.data as SessionPhoto[]) ?? []).map((row) => {
        const isVid = isVideoUrl(row.image_url, row.caption);
        return {
          kind: "photo" as const,
          id: row.id,
          created_at: row.created_at,
          user_id: row.user_id,
          image_url: row.image_url,
          caption: row.caption,
          mediaKind: isVid ? ("video" as const) : ("image" as const),
        };
      }),
    ].sort((a, b) => a.created_at.localeCompare(b.created_at));
    setFeed(items);
    const authorIds = [...new Set(items.map((item) => item.user_id))];
    if (authorIds.length) {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, bio, updated_at, created_at")
        .in("id", authorIds);
      setPeople((prev) => {
        const next = { ...prev };
        ((data as Profile[]) ?? []).forEach((profile) => {
          next[profile.id] = profile;
        });
        return next;
      });
    }
  }, []);

  const loadDmFeed = useCallback(
    async (friendId: string) => {
      if (!user) return;
      const { data, error: dmErr } = await supabase
        .from("direct_messages")
        .select("*")
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`)
        .order("created_at", { ascending: true })
        .limit(150);
      if (dmErr) {
        setError(dmErr.message);
        return;
      }
      const list = (data as ExtendedDirectMessage[]) ?? [];
      setDmFeed(list);

      const unreadIds = list.filter((m) => m.receiver_id === user.id && !m.read_at).map((m) => m.id);
      if (unreadIds.length > 0) {
        await supabase.from("direct_messages").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
        void loadUnreadDms();
      }
    },
    [user, loadUnreadDms],
  );

  useEffect(() => {
    void loadSocial();
  }, [loadSocial]);

  useEffect(() => {
    setGroupSettingsOpen(false);
    setReactionPickerFor(null);
    setReplyDraft(null);
    if (!activeChat) return;
    if (activeChat.kind === "group") {
      const currentG = groups.find((g) => g.id === activeChat.id);
      setRenameDraft(currentG?.name ?? "");
      setFriendToAddId("");
      void loadGroupFeed(activeChat.id);
      void loadGroupMembers(activeChat.id);

      const channel = supabase
        .channel(`group-chat-${activeChat.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "messages", filter: `group_id=eq.${activeChat.id}` },
          () => void loadGroupFeed(activeChat.id),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "session_photos", filter: `group_id=eq.${activeChat.id}` },
          () => void loadGroupFeed(activeChat.id),
        )
        .subscribe();

      const timer = window.setInterval(() => void loadGroupFeed(activeChat.id), 4500);
      return () => {
        window.clearInterval(timer);
        void supabase.removeChannel(channel);
      };
    } else {
      void loadDmFeed(activeChat.friendId);
      const channel = supabase
        .channel(`dm-chat-${activeChat.friendId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "direct_messages" },
          () => void loadDmFeed(activeChat.friendId),
        )
        .subscribe();

      const timer = window.setInterval(() => void loadDmFeed(activeChat.friendId), 4000);
      return () => {
        window.clearInterval(timer);
        void supabase.removeChannel(channel);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat, loadGroupFeed, loadGroupMembers, loadDmFeed]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [feed.length, dmFeed.length]);

  useEffect(() => {
    if (!user) return;
    const handle = window.setTimeout(async () => {
      const term = query.trim();
      if (term.length < 2) {
        setFound([]);
        return;
      }
      const { data, error: searchError } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, bio, updated_at, created_at")
        .ilike("username", `%${term}%`)
        .neq("id", user.id)
        .limit(8);
      if (searchError) setError(searchError.message);
      else setFound((data as Profile[]) ?? []);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query, user]);

  const accepted = friendships.filter((row) => row.status === "accepted");
  const incoming = friendships.filter((row) => row.status === "pending" && row.addressee_id === user?.id);
  const outgoingRows = friendships.filter((row) => row.status === "pending" && row.requester_id === user?.id);
  const outgoing = new Set(outgoingRows.map((row) => row.addressee_id));
  const friendIds = new Set(accepted.map((row) => (row.requester_id === user?.id ? row.addressee_id : row.requester_id)));
  const activeGroup = activeChat?.kind === "group" ? groups.find((group) => group.id === activeChat.id) ?? null : null;
  const activeFriend = activeChat?.kind === "dm" ? people[activeChat.friendId] ?? null : null;
  const names = useMemo(() => people, [people]);
  const groupMemberIds = useMemo(() => groupMembersMeta.map((m) => m.user_id), [groupMembersMeta]);

  const myRoleInGroup = useMemo(() => {
    if (!activeGroup || !user) return "member";
    if (activeGroup.created_by === user.id) return "owner";
    return groupMembersMeta.find((m) => m.user_id === user.id)?.role || "member";
  }, [activeGroup, groupMembersMeta, user]);

  const canManageRoles = myRoleInGroup === "owner" || myRoleInGroup === "admin";

  const activeEveningPrefs: EveningPrefs = activeGroup
    ? eveningPrefsByGroup[activeGroup.id] ?? {
        vibe: "Thriller & suspens",
        formatPref: "Film (≤ 2h15)",
        maxRuntime: "Soirée tranquille",
      }
    : { vibe: "Thriller & suspens", formatPref: "Film (≤ 2h15)", maxRuntime: "Soirée tranquille" };

  const groupAffinityAverage = useMemo(() => {
    if (!activeGroup || groupMemberIds.length < 2 || !user) return null;
    const otherIds = groupMemberIds.filter((id) => id !== user.id && compatibilityByUser[id]);
    if (otherIds.length === 0) return null;
    const sum = otherIds.reduce((acc, id) => acc + (compatibilityByUser[id]?.score ?? 0), 0);
    return Math.round(sum / otherIds.length);
  }, [activeGroup, groupMemberIds, user, compatibilityByUser]);

  function scrollToMessage(msgId: string) {
    setHighlightedMsgId(msgId);
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    window.setTimeout(() => {
      setHighlightedMsgId((curr) => (curr === msgId ? null : curr));
    }, 1800);
  }

  async function toggleMemberAdminRole(targetUserId: string, makeAdmin: boolean) {
    if (!activeGroup || !canManageRoles || targetUserId === activeGroup.created_by) return;
    const nextRole = makeAdmin ? "admin" : "member";
    setGroupMembersMeta((prev) =>
      prev.map((m) => (m.user_id === targetUserId ? { ...m, role: nextRole } : m)),
    );
    const { error: roleErr } = await supabase
      .from("group_members")
      .update({ role: nextRole })
      .eq("group_id", activeGroup.id)
      .eq("user_id", targetUserId);
    if (roleErr) {
      setNotice(`Rôle mis à jour localement (${personName(targetUserId)}).`);
    } else {
      setNotice(`${personName(targetUserId)} est désormais ${makeAdmin ? "admin" : "membre"}.`);
    }
  }

  async function toggleReaction(
    targetKey: string,
    emoji: string,
    table: "messages" | "direct_messages",
    rowId: string,
    dbReactions?: ReactionsMap,
  ) {
    if (!user) return;
    setReactionPickerFor(null);

    const baseMap: ReactionsMap = { ...(dbReactions ?? localReactions[targetKey] ?? {}) };
    const currentUsers = new Set(baseMap[emoji] ?? []);
    if (currentUsers.has(user.id)) currentUsers.delete(user.id);
    else currentUsers.add(user.id);

    if (currentUsers.size === 0) delete baseMap[emoji];
    else baseMap[emoji] = [...currentUsers];

    setLocalReactions((prev) => {
      const next = { ...prev, [targetKey]: baseMap };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`matchcut_reactions_${user.id}`, JSON.stringify(next));
      }
      return next;
    });

    if (reactionColumnSupportedRef.current === false) return;
    const { error: updateErr } = await supabase.from(table).update({ reactions: baseMap }).eq("id", rowId);
    if (updateErr) {
      reactionColumnSupportedRef.current = false;
    } else {
      reactionColumnSupportedRef.current = true;
      if (activeChat?.kind === "group") void loadGroupFeed(activeChat.id);
      else if (activeChat?.kind === "dm") void loadDmFeed(activeChat.friendId);
    }
  }

  function launchBracketWithPool(pool: DuelCandidate[]) {
    setDuelPool(pool);
    setDuelChampionIdx(0);
    setDuelChallengerIdx(1);
    setDuelWinner(pool.length === 1 ? pool[0] : null);
    setPickingFavorites(false);
  }

  async function prepareDuelSession(mode: DuelMode = duelMode) {
    if (!user || !activeChat) return;
    setDuelMode(mode);
    setDuelOpen(true);
    setDuelLoading(true);
    setDuelWinner(null);
    setPickingFavorites(false);

    try {
      const participantIds =
        activeChat.kind === "group"
          ? [...new Set([user.id, ...groupMemberIds])]
          : [user.id, activeChat.friendId];

      const [{ data: watchRows }, { data: swipeRows }] = await Promise.all([
        supabase
          .from("watch_items")
          .select("user_id, tmdb_id, media_type, title, poster_path, year, status")
          .in("user_id", participantIds)
          .eq("status", "to_watch")
          .limit(100),
        supabase
          .from("swipes")
          .select("user_id, tmdb_id, media_type, title, poster_path, decision")
          .in("user_id", participantIds)
          .eq("decision", "validate")
          .limit(80),
      ]);

      const grouped = new Map<
        string,
        { candidate: DuelCandidate; count: number; pickedByMe: boolean; pickedByOthers: Set<string> }
      >();

      (watchRows ?? []).forEach((row) => {
        const key = `${row.media_type}:${row.tmdb_id}`;
        const uid = row.user_id as string;
        const prev = grouped.get(key);
        const isMe = uid === user.id;
        const others = new Set(prev?.pickedByOthers ?? []);
        if (!isMe) others.add(uid);

        const totalOwners = (isMe ? 1 : 0) + others.size;
        const sourceNote =
          totalOwners > 1
            ? `Envie partagée (${totalOwners} membres)`
            : isMe
            ? "Dans ta liste À voir"
            : `Envie de ${personName(uid)}`;

        grouped.set(key, {
          count: Math.max(prev?.count ?? 0, totalOwners),
          pickedByMe: (prev?.pickedByMe ?? false) || isMe,
          pickedByOthers: others,
          candidate: {
            key,
            tmdbId: row.tmdb_id,
            mediaType: row.media_type,
            title: row.title,
            posterPath: row.poster_path,
            year: row.year ?? "",
            sourceNote,
            isMyPick: (prev?.pickedByMe ?? false) || isMe,
          },
        });
      });

      if (grouped.size < 2) {
        (swipeRows ?? []).forEach((row) => {
          const key = `${row.media_type}:${row.tmdb_id}`;
          if (grouped.has(key)) return;
          const uid = row.user_id as string;
          const isMe = uid === user.id;
          grouped.set(key, {
            count: 1,
            pickedByMe: isMe,
            pickedByOthers: isMe ? new Set() : new Set([uid]),
            candidate: {
              key,
              tmdbId: row.tmdb_id,
              mediaType: row.media_type,
              title: row.title,
              posterPath: row.poster_path,
              year: "",
              sourceNote: isMe ? "Validé par toi" : `Validé par ${personName(uid)}`,
              isMyPick: isMe,
            },
          });
        });
      }

      const candidates = [...grouped.values()]
        .sort((a, b) => b.count - a.count || Math.random() - 0.5)
        .slice(0, 12)
        .map((entry) => entry.candidate);

      setDuelCandidates(candidates);

      if (mode === "favorites") {
        const myFirst = candidates.find((c) => c.isMyPick)?.key;
        const otherFirst = candidates.find((c) => !c.isMyPick && c.key !== myFirst)?.key;
        const initialFavs = [myFirst, otherFirst].filter((k): k is string => Boolean(k));
        setSelectedFavoriteKeys(initialFavs);
        setPickingFavorites(true);
      } else {
        launchBracketWithPool(candidates.slice(0, 8));
      }
    } finally {
      setDuelLoading(false);
    }
  }

  function toggleFavoriteCandidate(key: string) {
    setSelectedFavoriteKeys((prev) => {
      if (prev.includes(key)) return prev.filter((item) => item !== key);
      if (prev.length >= 4) return prev;
      return [...prev, key];
    });
  }

  function startFavoritesBracket() {
    const chosen = duelCandidates.filter((c) => selectedFavoriteKeys.includes(c.key));
    if (chosen.length < 2) return;
    launchBracketWithPool(chosen);
  }

  function pickDuelSide(side: "champion" | "challenger") {
    const winningIdx = side === "champion" ? duelChampionIdx : duelChallengerIdx;
    const nextChallenger = duelChallengerIdx + 1;
    if (nextChallenger >= duelPool.length) {
      setDuelWinner(duelPool[winningIdx]);
    } else {
      setDuelChampionIdx(winningIdx);
      setDuelChallengerIdx(nextChallenger);
    }
  }

  async function shareDuelWinnerInChat(winner: DuelCandidate) {
    if (!user || !activeChat) return;
    const prefix = duelMode === "favorites" ? "❤️ Favori gagnant du duel soirée" : "🏆 Vainqueur du duel soirée";
    const text = `${prefix} : ${winner.title}${winner.year ? ` (${winner.year})` : ""} — On lance ça ?`;
    if (activeChat.kind === "group") {
      await supabase.from("messages").insert({ group_id: activeChat.id, user_id: user.id, body: text });
      if (winner.posterPath) {
        await supabase.from("session_photos").insert({
          group_id: activeChat.id,
          user_id: user.id,
          image_url: `https://image.tmdb.org/t/p/w500${winner.posterPath}`,
          caption: `duel:${winner.title}`,
        });
      }
      void loadGroupFeed(activeChat.id);
    } else {
      await supabase.from("direct_messages").insert({
        sender_id: user.id,
        receiver_id: activeChat.friendId,
        body: text,
        movie_title: winner.title,
        poster_path: winner.posterPath,
        invite_status: "pending",
      });
      void loadDmFeed(activeChat.friendId);
    }
    setDuelOpen(false);
    setNotice(`« ${winner.title} » et son affiche ont été partagés dans la discussion !`);
  }

  async function addFriend(profile: Profile) {
    if (!user || profile.id === user.id || busyFriendAction) return;
    const existing = friendships.find(
      (row) =>
        (row.requester_id === user.id && row.addressee_id === profile.id) ||
        (row.addressee_id === user.id && row.requester_id === profile.id),
    );
    if (existing?.status === "accepted" || existing) return;

    setBusyFriendAction(`add:${profile.id}`);
    setError(null);
    try {
      const { error: writeError } = await supabase.from("friendships").insert({
        requester_id: user.id,
        addressee_id: profile.id,
        status: "pending",
      });
      if (writeError) {
        setError(writeError.message);
        return;
      }
      setNotice(`Demande envoyée à ${profile.username || profile.full_name}.`);
      await loadSocial();
    } finally {
      setBusyFriendAction(null);
    }
  }

  async function respond(id: string, accept: boolean) {
    if (busyFriendAction) return;
    setBusyFriendAction(`resp:${id}`);
    setError(null);
    try {
      const result = accept
        ? await supabase.from("friendships").update({ status: "accepted" }).eq("id", id)
        : await supabase.from("friendships").delete().eq("id", id);
      if (result.error) {
        setError(result.error.message);
        return;
      }
      await loadSocial();
    } finally {
      setBusyFriendAction(null);
    }
  }

  async function createGroup() {
    if (!user || groupName.trim().length < 2 || creatingGroupRef.current) return;
    creatingGroupRef.current = true;
    setCreatingGroup(true);
    setError(null);
    try {
      const { data: group, error: groupError } = await supabase
        .from("groups")
        .insert({ name: groupName.trim(), created_by: user.id })
        .select("*")
        .single();
      if (groupError || !group) {
        setError(groupError?.message || "Le groupe n’a pas pu être créé.");
        return;
      }
      const uniqueMemberIds = [...new Set(memberIds)].filter((id) => id !== user.id);
      const members = [
        { group_id: group.id, user_id: user.id, role: "owner" },
        ...uniqueMemberIds.map((id) => ({ group_id: group.id, user_id: id, role: "member" })),
      ];
      const { error: memberError } = await supabase.from("group_members").insert(members);
      if (memberError) {
        setError(memberError.message);
        return;
      }
      setGroupName("");
      setMemberIds([]);
      setNotice(`Groupe « ${group.name} » créé.`);
      await loadSocial();
      setActiveChat({ kind: "group", id: group.id });
    } finally {
      creatingGroupRef.current = false;
      setCreatingGroup(false);
    }
  }

  async function updateGroupAvatar(file: File | null) {
    if (!user || !activeGroup || !file || uploadingGroupAvatar) return;
    if (!file.type.startsWith("image/") || file.size > 5_000_000) {
      setError("Choisissez une image de moins de 5 Mo.");
      return;
    }
    setUploadingGroupAvatar(true);
    setError(null);
    try {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `groups/${activeGroup.id}/${Date.now()}.${ext}`;
      const uploaded = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: true });
      if (uploaded.error) {
        setError(uploaded.error.message);
        return;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: updateErr } = await supabase
        .from("groups")
        .update({ avatar_url: data.publicUrl })
        .eq("id", activeGroup.id);
      if (updateErr) {
        setError(updateErr.message);
        return;
      }
      setNotice("Photo du groupe mise à jour.");
      await loadSocial();
    } finally {
      setUploadingGroupAvatar(false);
    }
  }

  async function renameActiveGroup() {
    if (!activeGroup || renameDraft.trim().length < 2) return;
    const { error: renErr } = await supabase
      .from("groups")
      .update({ name: renameDraft.trim() })
      .eq("id", activeGroup.id);
    if (renErr) {
      setError(renErr.message);
      return;
    }
    setNotice("Nom du groupe modifié.");
    await loadSocial();
  }

  async function addMemberToActiveGroup() {
    if (!activeGroup || !friendToAddId) return;
    const { error: addErr } = await supabase
      .from("group_members")
      .insert({ group_id: activeGroup.id, user_id: friendToAddId, role: "member" });
    if (addErr) {
      setError(addErr.message);
      return;
    }
    setFriendToAddId("");
    setNotice("Nouveau membre ajouté au groupe.");
    await loadGroupMembers(activeGroup.id);
  }

  async function leaveActiveGroup() {
    if (!user || !activeGroup) return;
    const confirmed = window.confirm(`Quitter définitivement le groupe « ${activeGroup.name} » ?`);
    if (!confirmed) return;

    const { error: leaveErr } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", activeGroup.id)
      .eq("user_id", user.id);
    if (leaveErr) {
      setError(leaveErr.message);
      return;
    }
    const leftName = activeGroup.name;
    setActiveChat(null);
    setNotice(`Vous avez quitté le groupe « ${leftName} ».`);
    await loadSocial();
  }

  async function sendMessage() {
    if (!user || !activeChat || !draft.trim() || sendingMessageRef.current) return;
    const rawText = draft.trim();
    const finalBody = replyDraft ? encodeReplyPrefix(replyDraft, rawText) : rawText;

    sendingMessageRef.current = true;
    setSendingMessage(true);
    setError(null);
    setDraft("");
    setReplyDraft(null);

    try {
      if (activeChat.kind === "group") {
        const { error: writeError } = await supabase
          .from("messages")
          .insert({ group_id: activeChat.id, user_id: user.id, body: finalBody });
        if (writeError) {
          setError(writeError.message);
          setDraft(rawText);
        } else {
          void loadGroupFeed(activeChat.id);
        }
      } else {
        const { error: writeError } = await supabase.from("direct_messages").insert({
          sender_id: user.id,
          receiver_id: activeChat.friendId,
          body: finalBody,
        });
        if (writeError) {
          setError(writeError.message);
          setDraft(rawText);
        } else {
          void loadDmFeed(activeChat.friendId);
        }
      }
    } finally {
      sendingMessageRef.current = false;
      setSendingMessage(false);
    }
  }

  async function respondToInvite(msgId: string, status: "accepted" | "declined") {
    if (activeChat?.kind !== "dm") return;
    await supabase.from("direct_messages").update({ invite_status: status }).eq("id", msgId);
    void loadDmFeed(activeChat.friendId);
  }

  async function sendMediaFile(file: File | null) {
    if (!user || activeChat?.kind !== "group" || !file || uploadingMedia) return;
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      setError("Choisissez une image ou une courte vidéo (MP4, WebM, MOV).");
      return;
    }
    const maxBytes = isVideo ? 25_000_000 : 6_000_000;
    if (file.size > maxBytes) {
      setError(
        isVideo
          ? "La vidéo est trop lourde (25 Mo maximum)."
          : "L'image est trop lourde (6 Mo maximum).",
      );
      return;
    }

    setUploadingMedia(true);
    setError(null);
    try {
      const ext = isVideo
        ? file.type.includes("webm")
          ? "webm"
          : file.type.includes("quicktime")
          ? "mov"
          : "mp4"
        : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
        ? "webp"
        : file.type === "image/gif"
        ? "gif"
        : "jpg";

      const path = `${activeChat.id}/${user.id}/${Date.now()}.${ext}`;
      const uploaded = await supabase.storage.from("session-photos").upload(path, file, { contentType: file.type });
      if (uploaded.error) {
        setError(uploaded.error.message);
        return;
      }
      const { data } = supabase.storage.from("session-photos").getPublicUrl(path);
      const { error: writeError } = await supabase.from("session_photos").insert({
        group_id: activeChat.id,
        user_id: user.id,
        image_url: data.publicUrl,
        caption: isVideo ? "video:clip" : null,
      });
      if (writeError) setError(writeError.message);
      else void loadGroupFeed(activeChat.id);
    } finally {
      setUploadingMedia(false);
    }
  }

  function personName(id: string) {
    const profile = names[id];
    return profile?.username || profile?.full_name || "Membre";
  }

  const invitableFriends = [...friendIds].filter((fid) => !groupMemberIds.includes(fid));
  const unlockedBadgesCount = badges.filter((b) => b.level > 0).length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          kicker="Échanges & soirées"
          title="Amis & groupes"
          text="Discute en direct, réponds à un message, partage photos ou clips et tranche vos séances en duel rapide."
        />
        {badges.length > 0 ? (
          <button
            type="button"
            onClick={() => setBadgesOpen((v) => !v)}
            className="mb-6 inline-flex items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs font-medium text-amber-200 transition hover:border-amber-400/60"
          >
            <Award size={15} className="text-amber-300" />
            <span>
              Mes badges ({unlockedBadgesCount}/{badges.length})
            </span>
          </button>
        ) : null}
      </div>

      {badgesOpen && badges.length > 0 ? (
        <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-xl text-[#f4f1ea]">Badges de régularité</h2>
              <p className="text-xs text-zinc-400">Débloque les paliers Bronze, Argent, Or et Platine sur la durée.</p>
            </div>
            <button type="button" onClick={() => setBadgesOpen(false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5">
              <X size={16} />
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {badges.map((b) => {
              const pct = b.nextTarget ? Math.min(100, Math.round((b.current / b.nextTarget) * 100)) : 100;
              const tierStyle =
                b.level === 4
                  ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-200"
                  : b.level === 3
                  ? "border-amber-400/50 bg-amber-500/10 text-amber-200"
                  : b.level === 2
                  ? "border-zinc-300/40 bg-zinc-400/10 text-zinc-200"
                  : b.level === 1
                  ? "border-orange-400/40 bg-orange-500/10 text-orange-200"
                  : "border-white/10 bg-black/20 text-zinc-500";
              return (
                <div key={b.id} className={`rounded-xl border p-3.5 ${tierStyle}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest">{b.tierLabel}</span>
                    <Trophy size={13} />
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-[#f4f1ea]">{b.title}</p>
                  <p className="mt-1 text-xs opacity-85">{b.description}</p>
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-black/40">
                    <div className="h-full rounded-full bg-amber-300 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="mb-5 space-y-3">
        <ErrorNote message={error} />
        {notice ? <p className="text-sm text-emerald-400">{notice}</p> : null}
      </div>

      <div className="grid gap-8 lg:grid-cols-[350px_minmax(0,1fr)]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <label className="block text-xs font-semibold text-zinc-300">
              Rechercher un pseudo
              <input
                className={`${inputClass} mt-2`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ex. camille_cine"
              />
            </label>
            <div className="mt-3 space-y-2">
              {found.map((profile) => {
                const pending = outgoing.has(profile.id);
                const friend = friendIds.has(profile.id);
                const isBusy = busyFriendAction === `add:${profile.id}`;
                return (
                  <div key={profile.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-2.5">
                    <Link href={`/membre/${profile.id}`} className="flex min-w-0 flex-1 items-center gap-2.5 hover:opacity-85">
                      <Avatar name={profile.username || profile.full_name || "M"} url={profile.avatar_url} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#f4f1ea]">{profile.full_name || profile.username}</p>
                        <p className="truncate text-xs text-zinc-400">{profile.username ? `@${profile.username}` : "Voir le profil"}</p>
                      </div>
                    </Link>
                    <button
                      type="button"
                      className={`${ghostClass} px-2.5 py-1.5 text-xs`}
                      disabled={friend || pending || Boolean(busyFriendAction)}
                      onClick={() => void addFriend(profile)}
                    >
                      {friend ? "Ami" : pending ? "Envoyée" : isBusy ? "..." : "Ajouter"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {incoming.length > 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <h2 className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                Demandes reçues
                <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">{incoming.length}</span>
              </h2>
              <div className="mt-3 space-y-2">
                {incoming.map((row) => {
                  const prof = people[row.requester_id];
                  return (
                    <div key={row.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 p-2.5 text-sm">
                      <Link href={`/membre/${row.requester_id}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
                        <Avatar name={personName(row.requester_id)} url={prof?.avatar_url} size={30} />
                        <span className="truncate font-medium">{personName(row.requester_id)}</span>
                      </Link>
                      <span className="flex shrink-0 gap-2 text-xs">
                        <button
                          type="button"
                          disabled={Boolean(busyFriendAction)}
                          className="rounded-lg bg-emerald-500/15 px-2.5 py-1 font-medium text-emerald-300 hover:bg-emerald-500/25"
                          onClick={() => void respond(row.id, true)}
                        >
                          Accepter
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busyFriendAction)}
                          className="rounded-lg px-2 py-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                          onClick={() => void respond(row.id, false)}
                        >
                          Refuser
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {outgoingRows.length > 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
                <Clock size={13} className="text-amber-400" />
                Demandes envoyées ({outgoingRows.length})
              </h2>
              <div className="mt-3 space-y-2">
                {outgoingRows.map((row) => {
                  const prof = people[row.addressee_id];
                  return (
                    <div key={row.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs">
                      <Link href={`/membre/${row.addressee_id}`} className="flex min-w-0 items-center gap-2 hover:underline">
                        <Avatar name={personName(row.addressee_id)} url={prof?.avatar_url} size={28} />
                        <span className="truncate text-zinc-200">{personName(row.addressee_id)}</span>
                      </Link>
                      <span className="text-amber-300/80">En attente</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {mutualSuggestions.length > 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
                <Sparkles size={13} className="text-amber-400" />
                Suggestions (amis en commun)
              </h2>
              <div className="mt-3 space-y-2">
                {mutualSuggestions.map(({ profile, mutualCount }) => {
                  const isBusy = busyFriendAction === `add:${profile.id}`;
                  return (
                    <div key={profile.id} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/20 p-2.5">
                      <Link href={`/membre/${profile.id}`} className="flex min-w-0 flex-1 items-center gap-2.5 hover:opacity-85">
                        <Avatar name={profile.username || profile.full_name || "M"} url={profile.avatar_url} size={34} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[#f4f1ea]">{profile.full_name || profile.username}</p>
                          <p className="truncate text-xs text-amber-300/85">
                            {mutualCount} ami{mutualCount > 1 ? "s" : ""} en commun
                          </p>
                        </div>
                      </Link>
                      <button
                        type="button"
                        disabled={Boolean(busyFriendAction)}
                        onClick={() => void addFriend(profile)}
                        className={`${ghostClass} px-2.5 py-1.5 text-xs`}
                      >
                        {isBusy ? "..." : "Ajouter"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <h2 className="text-xs font-semibold text-zinc-300">Amis ({accepted.length})</h2>
            <div className="mt-3 space-y-2">
              {accepted.map((row) => {
                const id = row.requester_id === user?.id ? row.addressee_id : row.requester_id;
                const profile = people[id];
                const unread = unreadByFriend[id] ?? 0;
                const isDmActive = activeChat?.kind === "dm" && activeChat.friendId === id;
                const compat = compatibilityByUser[id];

                return (
                  <div
                    key={row.id}
                    className={`flex items-center gap-2 rounded-xl border p-2.5 text-sm transition ${
                      isDmActive ? "border-amber-300/50 bg-white/[0.06]" : "border-white/10 bg-black/20"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="rounded accent-amber-400"
                      title="Sélectionner pour créer un groupe"
                      checked={memberIds.includes(id)}
                      onChange={(event) =>
                        setMemberIds((prev) => (event.target.checked ? [...prev, id] : prev.filter((value) => value !== id)))
                      }
                    />
                    <Link href={`/membre/${id}`} className="flex min-w-0 flex-1 items-center gap-2.5 hover:opacity-85">
                      <Avatar name={personName(id)} url={profile?.avatar_url} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-[#f4f1ea]">{personName(id)}</p>
                        {compat ? (
                          <p className="truncate text-[11px] text-amber-300/85">
                            {compat.score}% affinité · {compat.label}
                          </p>
                        ) : null}
                      </div>
                    </Link>
                    <button
                      type="button"
                      onClick={() => setActiveChat({ kind: "dm", friendId: id })}
                      className="relative inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-200 transition hover:border-white/35"
                      title="Message direct"
                    >
                      <MessageCircle size={13} />
                      <span>Chat</span>
                      {unread > 0 ? (
                        <span className="ml-1 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                          {unread}
                        </span>
                      ) : null}
                    </button>
                  </div>
                );
              })}
              {accepted.length === 0 ? <p className="text-xs text-zinc-500">Aucun ami pour le moment.</p> : null}
            </div>
          </div>

          <form
            className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void createGroup();
            }}
          >
            <h2 className="text-xs font-semibold text-zinc-300">Nouveau groupe</h2>
            <input
              className={inputClass}
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="Nom du groupe"
            />
            <button
              type="submit"
              disabled={creatingGroup || groupName.trim().length < 2}
              className={`w-full ${buttonClass} disabled:opacity-40`}
            >
              {creatingGroup ? "Création..." : "Créer le groupe"}
            </button>
            <p className="text-xs leading-5 text-zinc-400">Coche des amis dans ta liste ci-dessus pour les inclure.</p>
          </form>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <h2 className="text-xs font-semibold text-zinc-300">Groupes ({groups.length})</h2>
            <div className="mt-3 space-y-2">
              {groups.map((group) => {
                const isGroupActive = activeChat?.kind === "group" && activeChat.id === group.id;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setActiveChat({ kind: "group", id: group.id })}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                      isGroupActive
                        ? "border-amber-300/50 bg-white/[0.07] text-[#f4f1ea]"
                        : "border-white/10 bg-black/20 text-zinc-300 hover:border-white/25"
                    }`}
                  >
                    <Avatar name={group.name} url={group.avatar_url} size={34} />
                    <span className="truncate font-medium">{group.name}</span>
                  </button>
                );
              })}
              {groups.length === 0 ? <p className="text-xs text-zinc-500">Aucun groupe.</p> : null}
            </div>
          </div>
        </section>

        <section className={`flex h-[700px] flex-col overflow-hidden rounded-2xl border border-white/10 transition-colors ${currentChatTheme.panelClass}`}>
          {activeGroup ? (
            <>
              <header className="border-b border-white/10 bg-white/[0.02] px-5 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <Avatar name={activeGroup.name} url={activeGroup.avatar_url} size={44} />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-serif text-2xl text-[#f4f1ea]">{activeGroup.name}</h2>
                        {groupAffinityAverage !== null ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-200">
                            <Flame size={11} />
                            {groupAffinityAverage}% affinité
                          </span>
                        ) : null}
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
                          {myRoleInGroup === "owner" ? "Créateur" : myRoleInGroup === "admin" ? "Admin" : "Membre"}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400">
                        {groupMemberIds.length} membre{groupMemberIds.length > 1 ? "s" : ""} ·{" "}
                        {groupMemberIds.map((id) => (id === user?.id ? "Moi" : personName(id))).join(", ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/30 px-2 py-1.5" title="Thème de cette conversation">
                      <Palette size={13} className="mr-0.5 text-zinc-400" />
                      {CHAT_THEMES.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => selectChatTheme(t.id)}
                          title={`Thème ${t.label}`}
                          className={`h-3.5 w-3.5 rounded-full ${t.pillClass} ${
                            currentChatTheme.id === t.id ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-950" : "opacity-55 hover:opacity-100"
                          }`}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void prepareDuelSession(duelMode)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
                    >
                      <Swords size={14} />
                      Duel soirée
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroupSettingsOpen((v) => !v)}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                        groupSettingsOpen
                          ? "border-amber-300/50 bg-white/10 text-white"
                          : "border-white/15 bg-white/[0.02] text-zinc-300 hover:border-white/35"
                      }`}
                    >
                      <Settings size={14} />
                      Gérer
                    </button>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                  <span className="font-medium text-zinc-300">Préférences soirée :</span>
                  <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-amber-200">{activeEveningPrefs.vibe}</span>
                  <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-zinc-300">{activeEveningPrefs.formatPref}</span>
                  <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-zinc-300">{activeEveningPrefs.maxRuntime}</span>
                </div>

                {groupSettingsOpen ? (
                  <div className="mt-4 space-y-4 rounded-xl border border-white/10 bg-black/45 p-4 text-xs">
                    <div className="grid gap-2.5 sm:grid-cols-3">
                      <label className="block text-[11px] text-zinc-400">
                        Ambiance souhaitée
                        <select
                          value={activeEveningPrefs.vibe}
                          onChange={(e) => updateEveningPrefs({ vibe: e.target.value })}
                          className="mt-1 w-full rounded-xl border border-white/15 bg-[#09090b] px-2.5 py-1.5 text-xs text-zinc-200"
                        >
                          <option value="Thriller & suspens">Thriller &amp; suspens</option>
                          <option value="Comédie & détente">Comédie &amp; détente</option>
                          <option value="Animé / Sci-Fi">Animé / Sci-Fi</option>
                          <option value="Drame & émotion">Drame &amp; émotion</option>
                        </select>
                      </label>
                      <label className="block text-[11px] text-zinc-400">
                        Format privilégié
                        <select
                          value={activeEveningPrefs.formatPref}
                          onChange={(e) => updateEveningPrefs({ formatPref: e.target.value })}
                          className="mt-1 w-full rounded-xl border border-white/15 bg-[#09090b] px-2.5 py-1.5 text-xs text-zinc-200"
                        >
                          <option value="Film (≤ 2h15)">Film (≤ 2h15)</option>
                          <option value="2-3 épisodes de série">2-3 épisodes de série</option>
                          <option value="Peu importe">Peu importe</option>
                        </select>
                      </label>
                      <label className="block text-[11px] text-zinc-400">
                        Rythme de soirée
                        <select
                          value={activeEveningPrefs.maxRuntime}
                          onChange={(e) => updateEveningPrefs({ maxRuntime: e.target.value })}
                          className="mt-1 w-full rounded-xl border border-white/15 bg-[#09090b] px-2.5 py-1.5 text-xs text-zinc-200"
                        >
                          <option value="Soirée tranquille">Soirée tranquille</option>
                          <option value="Marathon / tardif">Marathon / tardif</option>
                        </select>
                      </label>
                    </div>

                    <div className="space-y-1.5 border-t border-white/10 pt-3">
                      <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
                        <Shield size={12} className="text-amber-300" />
                        Membres &amp; rôles
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {groupMembersMeta.map((m) => {
                          const isCreator = activeGroup.created_by === m.user_id;
                          const isAdmin = isCreator || m.role === "admin";
                          return (
                            <div
                              key={m.user_id}
                              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1"
                            >
                              <span className="text-zinc-200">
                                {m.user_id === user?.id ? "Moi" : personName(m.user_id)}
                              </span>
                              <span className="text-[10px] text-amber-300/90">
                                {isCreator ? "Créateur" : isAdmin ? "Admin" : "Membre"}
                              </span>
                              {canManageRoles && !isCreator && m.user_id !== user?.id ? (
                                <button
                                  type="button"
                                  onClick={() => void toggleMemberAdminRole(m.user_id, !isAdmin)}
                                  className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:border-amber-300/40"
                                >
                                  {isAdmin ? "Retirer admin" : "Passer admin"}
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/20 bg-white/[0.03] px-3 py-2 text-zinc-200 hover:border-white/40">
                        <Camera size={14} />
                        <span>{uploadingGroupAvatar ? "Envoi..." : "Changer la photo du groupe"}</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={uploadingGroupAvatar}
                          className="sr-only"
                          onChange={(e) => {
                            void updateGroupAvatar(e.target.files?.[0] ?? null);
                            e.target.value = "";
                          }}
                        />
                      </label>

                      <div className="flex flex-1 items-center gap-2">
                        <Pencil size={13} className="shrink-0 text-zinc-500" />
                        <input
                          type="text"
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          placeholder="Nouveau nom du groupe"
                          className={`${inputClass} max-w-xs py-1.5 text-xs`}
                        />
                        <button
                          type="button"
                          onClick={() => void renameActiveGroup()}
                          className="inline-flex items-center gap-1 rounded-xl bg-[#f4f1ea] px-3 py-2 font-semibold text-[#09090b]"
                        >
                          <Check size={13} />
                          Renommer
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {invitableFriends.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <UserPlus size={14} className="text-zinc-400" />
                          <select
                            value={friendToAddId}
                            onChange={(e) => setFriendToAddId(e.target.value)}
                            className="rounded-xl border border-white/15 bg-[#09090b] px-2.5 py-1.5 text-xs"
                          >
                            <option value="">Ajouter un ami au groupe...</option>
                            {invitableFriends.map((fid) => (
                              <option key={fid} value={fid}>
                                {personName(fid)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={!friendToAddId}
                            onClick={() => void addMemberToActiveGroup()}
                            className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 font-medium text-emerald-300 disabled:opacity-40"
                          >
                            Ajouter
                          </button>
                        </div>
                      ) : (
                        <span className="text-zinc-400">Tous vos amis sont déjà dans ce groupe.</span>
                      )}

                      <button
                        type="button"
                        onClick={() => void leaveActiveGroup()}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 px-3 py-1.5 text-rose-300 hover:bg-rose-500/10"
                      >
                        <LogOut size={13} />
                        Quitter le groupe
                      </button>
                    </div>
                  </div>
                ) : null}
              </header>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {feed.map((item, idx) => {
                  const mine = item.user_id === user?.id;
                  const prev = idx > 0 ? feed[idx - 1] : null;
                  const next = idx < feed.length - 1 ? feed[idx + 1] : null;

                  const dayLabel = formatDayLabel(item.created_at);
                  const prevDayLabel = prev ? formatDayLabel(prev.created_at) : null;
                  const showDayDivider = dayLabel !== prevDayLabel;

                  const groupedWithPrev =
                    !showDayDivider && prev ? isSameAuthorCluster(prev.created_at, prev.user_id, item.created_at, item.user_id) : false;
                  const groupedWithNext =
                    next && formatDayLabel(next.created_at) === dayLabel
                      ? isSameAuthorCluster(item.created_at, item.user_id, next.created_at, next.user_id)
                      : false;

                  const targetKey = `group:${item.id}`;
                  const reactions: ReactionsMap =
                    (item.kind === "message" ? item.reactions : undefined) ?? localReactions[targetKey] ?? {};
                  const activeEmojis = Object.entries(reactions).filter(([, users]) => users.length > 0);
                  const prof = people[item.user_id];
                  const isHighlighted = highlightedMsgId === item.id;

                  return (
                    <div
                      key={`${item.kind}-${item.id}`}
                      id={`msg-${item.id}`}
                      className={`rounded-xl transition ${groupedWithPrev ? "mt-1" : "mt-4"} ${
                        isHighlighted ? "bg-amber-300/10 ring-1 ring-amber-300/40" : ""
                      }`}
                    >
                      {showDayDivider ? (
                        <div className="my-4 flex justify-center">
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-0.5 text-[11px] text-zinc-400">
                            {dayLabel}
                          </span>
                        </div>
                      ) : null}

                      <div className={`group flex items-end gap-2.5 ${mine ? "justify-end" : "justify-start"}`}>
                        {!mine ? (
                          <div className="w-8 shrink-0">
                            {!groupedWithNext ? (
                              <Link href={`/membre/${item.user_id}`} className="block hover:opacity-85">
                                <Avatar name={personName(item.user_id)} url={prof?.avatar_url} size={32} />
                              </Link>
                            ) : null}
                          </div>
                        ) : null}

                        <div className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
                          {!mine && !groupedWithPrev ? (
                            <Link
                              href={`/membre/${item.user_id}`}
                              className="mb-1 ml-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:underline"
                            >
                              {personName(item.user_id)}
                            </Link>
                          ) : null}

                          <div className={`relative flex items-center gap-1.5 ${mine ? "flex-row-reverse" : "flex-row"}`}>
                            {item.kind === "message" ? (
                              <div
                                className={`whitespace-pre-wrap break-words px-4 py-2.5 text-sm leading-relaxed border ${
                                  mine
                                    ? `${currentChatTheme.bubbleMineClass} ${
                                        groupedWithPrev ? "rounded-tr-md" : "rounded-tr-2xl"
                                      } ${groupedWithNext ? "rounded-br-md" : "rounded-br-sm"} rounded-l-2xl`
                                    : `bg-zinc-900 text-zinc-100 border-white/10 ${
                                        groupedWithPrev ? "rounded-tl-md" : "rounded-tl-2xl"
                                      } ${groupedWithNext ? "rounded-bl-md" : "rounded-bl-sm"} rounded-r-2xl`
                                }`}
                              >
                                {item.replyTo ? (
                                  <button
                                    type="button"
                                    onClick={() => scrollToMessage(item.replyTo!.id)}
                                    className="mb-2 block w-full rounded-lg border-l-2 border-amber-300 bg-black/35 px-2.5 py-1.5 text-left text-[11px] text-zinc-300 hover:bg-black/50"
                                  >
                                    <span className="font-semibold text-amber-200">{item.replyTo.authorName}</span>
                                    <p className="line-clamp-1 text-zinc-400">{item.replyTo.preview}</p>
                                  </button>
                                ) : null}
                                {item.body}
                              </div>
                            ) : item.mediaKind === "video" ? (
                              <figure className="max-w-xs overflow-hidden rounded-2xl border border-white/15 bg-zinc-900">
                                <video src={item.image_url} controls playsInline className="max-h-72 w-full bg-black" />
                              </figure>
                            ) : (
                              <figure className="max-w-xs overflow-hidden rounded-2xl border border-white/15 bg-zinc-900">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={item.image_url} alt={item.caption || "Photo de séance"} className="max-h-72 w-full object-cover" />
                              </figure>
                            )}

                            {item.kind === "message" ? (
                              <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReplyDraft({
                                      id: item.id,
                                      authorName: mine ? "Moi" : personName(item.user_id),
                                      preview: item.body,
                                    })
                                  }
                                  className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                                  title="Répondre"
                                >
                                  <Reply size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setReactionPickerFor((prevKey) => (prevKey === targetKey ? null : targetKey))}
                                  className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                                  title="Réagir"
                                >
                                  <SmilePlus size={14} />
                                </button>
                              </div>
                            ) : null}
                          </div>

                          {reactionPickerFor === targetKey && item.kind === "message" ? (
                            <div className="mt-1 flex items-center gap-1 rounded-full border border-white/15 bg-zinc-950 px-2 py-1 shadow-lg">
                              {QUICK_REACTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => void toggleReaction(targetKey, emoji, "messages", item.id, item.reactions)}
                                  className="rounded-full px-1.5 py-0.5 text-sm transition hover:scale-125 hover:bg-white/10"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          ) : null}

                          {activeEmojis.length > 0 && item.kind === "message" ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {activeEmojis.map(([emoji, users]) => {
                                const reactedByMe = user ? users.includes(user.id) : false;
                                return (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => void toggleReaction(targetKey, emoji, "messages", item.id, item.reactions)}
                                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition ${
                                      reactedByMe
                                        ? "border-amber-300/50 bg-amber-300/15 text-amber-100"
                                        : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/25"
                                    }`}
                                  >
                                    <span>{emoji}</span>
                                    <span>{users.length}</span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}

                          {!groupedWithNext ? (
                            <span className="mt-1 px-1 text-[10px] text-zinc-500">{formatTime(item.created_at)}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {feed.length === 0 ? (
                  <div className="grid h-full place-items-center text-center text-sm text-zinc-500">
                    La conversation est vide. Lance la discussion ou démarre un duel soirée !
                  </div>
                ) : null}
                <div ref={endRef} />
              </div>

              {replyDraft ? (
                <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-white/[0.04] px-4 py-2 text-xs">
                  <div className="min-w-0 border-l-2 border-amber-300 pl-2.5">
                    <span className="font-semibold text-amber-200">Réponse à {replyDraft.authorName}</span>
                    <p className="truncate text-zinc-400">{replyDraft.preview}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyDraft(null)}
                    className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
                    aria-label="Annuler la réponse"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : null}

              <form
                className="flex items-end gap-2 border-t border-white/10 bg-white/[0.02] p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage();
                }}
              >
                <label
                  className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-white/15 bg-white/[0.03] text-zinc-300 transition hover:border-white/35"
                  aria-label="Partager une photo ou une courte vidéo"
                  title="Photo ou courte vidéo"
                >
                  <ImagePlus size={16} />
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                    disabled={uploadingMedia}
                    className="sr-only"
                    onChange={(event) => {
                      void sendMediaFile(event.target.files?.[0] ?? null);
                      event.target.value = "";
                    }}
                  />
                </label>
                <textarea
                  rows={1}
                  className={`${inputClass} max-h-28 min-h-[44px] resize-none py-2.5`}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder={uploadingMedia ? "Envoi du média..." : "Écrire un message… (Entrée pour envoyer)"}
                  maxLength={2000}
                />
                <button
                  type="submit"
                  disabled={sendingMessage || !draft.trim()}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#f4f1ea] text-[#09090b] transition hover:opacity-90 disabled:opacity-40"
                  aria-label="Envoyer"
                >
                  <Send size={16} />
                </button>
              </form>
            </>
          ) : activeFriend ? (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.02] px-5 py-3.5">
                <Link href={`/membre/${activeFriend.id}`} className="flex items-center gap-3 hover:opacity-85">
                  <Avatar name={personName(activeFriend.id)} url={activeFriend.avatar_url} size={42} />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-serif text-2xl text-[#f4f1ea]">{personName(activeFriend.id)}</h2>
                      {compatibilityByUser[activeFriend.id] ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-200">
                          <Flame size={11} />
                          {compatibilityByUser[activeFriend.id].score}% affinité
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-zinc-400">
                      {compatibilityByUser[activeFriend.id]
                        ? `${compatibilityByUser[activeFriend.id].label} · ${compatibilityByUser[activeFriend.id].commonCount} titre${
                            compatibilityByUser[activeFriend.id].commonCount > 1 ? "s" : ""
                          } en commun`
                        : "Message direct · Voir le profil"}
                    </p>
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/30 px-2 py-1.5" title="Thème de cette conversation">
                    <Palette size={13} className="mr-0.5 text-zinc-400" />
                    {CHAT_THEMES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => selectChatTheme(t.id)}
                        title={`Thème ${t.label}`}
                        className={`h-3.5 w-3.5 rounded-full ${t.pillClass} ${
                          currentChatTheme.id === t.id ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-950" : "opacity-55 hover:opacity-100"
                        }`}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => void prepareDuelSession(duelMode)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
                  >
                    <Swords size={14} />
                    Duel soirée
                  </button>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {dmFeed.map((msg, idx) => {
                  const mine = msg.sender_id === user?.id;
                  const prev = idx > 0 ? dmFeed[idx - 1] : null;
                  const next = idx < dmFeed.length - 1 ? dmFeed[idx + 1] : null;

                  const dayLabel = formatDayLabel(msg.created_at);
                  const prevDayLabel = prev ? formatDayLabel(prev.created_at) : null;
                  const showDayDivider = dayLabel !== prevDayLabel;

                  const groupedWithPrev =
                    !showDayDivider && prev && !msg.movie_title && !prev.movie_title
                      ? isSameAuthorCluster(prev.created_at, prev.sender_id, msg.created_at, msg.sender_id)
                      : false;
                  const groupedWithNext =
                    next && !msg.movie_title && !next.movie_title && formatDayLabel(next.created_at) === dayLabel
                      ? isSameAuthorCluster(msg.created_at, msg.sender_id, next.created_at, next.sender_id)
                      : false;

                  const decoded = decodeReplyBody(msg.body);
                  const targetKey = `dm:${msg.id}`;
                  const reactions: ReactionsMap = msg.reactions ?? localReactions[targetKey] ?? {};
                  const activeEmojis = Object.entries(reactions).filter(([, users]) => users.length > 0);
                  const isHighlighted = highlightedMsgId === msg.id;

                  return (
                    <div
                      key={msg.id}
                      id={`msg-${msg.id}`}
                      className={`rounded-xl transition ${groupedWithPrev ? "mt-1" : "mt-4"} ${
                        isHighlighted ? "bg-amber-300/10 ring-1 ring-amber-300/40" : ""
                      }`}
                    >
                      {showDayDivider ? (
                        <div className="my-4 flex justify-center">
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-0.5 text-[11px] text-zinc-400">
                            {dayLabel}
                          </span>
                        </div>
                      ) : null}

                      <div className={`group flex items-end gap-2.5 ${mine ? "justify-end" : "justify-start"}`}>
                        {!mine ? (
                          <div className="w-8 shrink-0">
                            {!groupedWithNext ? (
                              <Avatar name={personName(msg.sender_id)} url={activeFriend.avatar_url} size={32} />
                            ) : null}
                          </div>
                        ) : null}

                        <div className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
                          {msg.movie_title ? (
                            <div className="flex max-w-md gap-3 rounded-2xl border border-emerald-500/35 bg-emerald-950/25 p-3.5">
                              {msg.poster_path ? (
                                <div className="w-16 shrink-0 overflow-hidden rounded-xl border border-white/10">
                                  <Poster path={msg.poster_path} alt={msg.movie_title} className="aspect-[2/3] w-full" />
                                </div>
                              ) : null}
                              <div className="flex-1 space-y-2">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">Proposition séance</p>
                                <p className="text-sm text-white">{decoded.cleanBody}</p>
                                {msg.invite_status === "pending" && !mine ? (
                                  <div className="flex gap-2 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => void respondToInvite(msg.id, "accepted")}
                                      className="rounded-xl bg-emerald-400 px-3 py-1 text-xs font-semibold text-zinc-950"
                                    >
                                      Chaud !
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void respondToInvite(msg.id, "declined")}
                                      className="rounded-xl border border-white/20 px-3 py-1 text-xs text-zinc-300"
                                    >
                                      Pas ce soir
                                    </button>
                                  </div>
                                ) : msg.invite_status === "accepted" ? (
                                  <p className="text-xs font-semibold text-emerald-400">✓ Séance validée (« Chaud ! »)</p>
                                ) : msg.invite_status === "declined" ? (
                                  <p className="text-xs text-zinc-400">✕ Décliné (« Pas ce soir »)</p>
                                ) : (
                                  <p className="text-xs text-zinc-400">En attente de réponse...</p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className={`relative flex items-center gap-1.5 ${mine ? "flex-row-reverse" : "flex-row"}`}>
                              <div
                                className={`whitespace-pre-wrap break-words px-4 py-2.5 text-sm leading-relaxed border ${
                                  mine
                                    ? `${currentChatTheme.bubbleMineClass} ${
                                        groupedWithPrev ? "rounded-tr-md" : "rounded-tr-2xl"
                                      } ${groupedWithNext ? "rounded-br-md" : "rounded-br-sm"} rounded-l-2xl`
                                    : `bg-zinc-900 text-zinc-100 border-white/10 ${
                                        groupedWithPrev ? "rounded-tl-md" : "rounded-tl-2xl"
                                      } ${groupedWithNext ? "rounded-bl-md" : "rounded-bl-sm"} rounded-r-2xl`
                                }`}
                              >
                                {decoded.replyTo ? (
                                  <button
                                    type="button"
                                    onClick={() => scrollToMessage(decoded.replyTo!.id)}
                                    className="mb-2 block w-full rounded-lg border-l-2 border-amber-300 bg-black/35 px-2.5 py-1.5 text-left text-[11px] text-zinc-300 hover:bg-black/50"
                                  >
                                    <span className="font-semibold text-amber-200">{decoded.replyTo.authorName}</span>
                                    <p className="line-clamp-1 text-zinc-400">{decoded.replyTo.preview}</p>
                                  </button>
                                ) : null}
                                {decoded.cleanBody}
                              </div>
                              <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReplyDraft({
                                      id: msg.id,
                                      authorName: mine ? "Moi" : personName(msg.sender_id),
                                      preview: decoded.cleanBody,
                                    })
                                  }
                                  className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                                  title="Répondre"
                                >
                                  <Reply size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setReactionPickerFor((prevKey) => (prevKey === targetKey ? null : targetKey))}
                                  className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                                  title="Réagir"
                                >
                                  <SmilePlus size={14} />
                                </button>
                              </div>
                            </div>
                          )}

                          {reactionPickerFor === targetKey ? (
                            <div className="mt-1 flex items-center gap-1 rounded-full border border-white/15 bg-zinc-950 px-2 py-1 shadow-lg">
                              {QUICK_REACTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => void toggleReaction(targetKey, emoji, "direct_messages", msg.id, msg.reactions)}
                                  className="rounded-full px-1.5 py-0.5 text-sm transition hover:scale-125 hover:bg-white/10"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          ) : null}

                          {activeEmojis.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {activeEmojis.map(([emoji, users]) => {
                                const reactedByMe = user ? users.includes(user.id) : false;
                                return (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => void toggleReaction(targetKey, emoji, "direct_messages", msg.id, msg.reactions)}
                                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition ${
                                      reactedByMe
                                        ? "border-amber-300/50 bg-amber-300/15 text-amber-100"
                                        : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/25"
                                    }`}
                                  >
                                    <span>{emoji}</span>
                                    <span>{users.length}</span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}

                          {!groupedWithNext ? (
                            <span className="mt-1 px-1 text-[10px] text-zinc-500">{formatTime(msg.created_at)}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {dmFeed.length === 0 ? (
                  <div className="grid h-full place-items-center text-center text-sm text-zinc-500">
                    Démarre ta discussion avec {personName(activeFriend.id)} ou lance un duel soirée !
                  </div>
                ) : null}
                <div ref={endRef} />
              </div>

              {replyDraft ? (
                <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-white/[0.04] px-4 py-2 text-xs">
                  <div className="min-w-0 border-l-2 border-amber-300 pl-2.5">
                    <span className="font-semibold text-amber-200">Réponse à {replyDraft.authorName}</span>
                    <p className="truncate text-zinc-400">{replyDraft.preview}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyDraft(null)}
                    className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
                    aria-label="Annuler la réponse"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : null}

              <form
                className="flex items-end gap-2 border-t border-white/10 bg-white/[0.02] p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage();
                }}
              >
                <textarea
                  rows={1}
                  className={`${inputClass} max-h-28 min-h-[44px] resize-none py-2.5`}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder={`Écrire à ${personName(activeFriend.id)}… (Entrée pour envoyer)`}
                  maxLength={2000}
                />
                <button
                  type="submit"
                  disabled={sendingMessage || !draft.trim()}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#f4f1ea] text-[#09090b] transition hover:opacity-90 disabled:opacity-40"
                  aria-label="Envoyer"
                >
                  <Send size={16} />
                </button>
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center px-8 text-center text-sm leading-6 text-zinc-400">
              Sélectionne un ami ou un groupe à gauche pour ouvrir la discussion ou lancer un duel de soirée.
            </div>
          )}
        </section>
      </div>

      <Modal open={duelOpen} title="Duel de sélection rapide" onClose={() => setDuelOpen(false)}>
        <div className="mb-4 flex gap-2 rounded-xl border border-white/10 bg-black/30 p-1 text-xs">
          <button
            type="button"
            onClick={() => void prepareDuelSession("common")}
            className={`flex-1 rounded-lg px-3 py-1.5 font-medium transition ${
              duelMode === "common" ? "bg-[#f4f1ea] text-[#09090b]" : "text-zinc-300 hover:text-white"
            }`}
          >
            Listes communes
          </button>
          <button
            type="button"
            onClick={() => void prepareDuelSession("favorites")}
            className={`flex-1 rounded-lg px-3 py-1.5 font-medium transition ${
              duelMode === "favorites" ? "bg-amber-300 text-[#09090b]" : "text-zinc-300 hover:text-white"
            }`}
          >
            Chacun son favori
          </button>
        </div>

        {duelLoading ? (
          <p className="py-8 text-center text-sm text-zinc-400">Préparation des affiches en lice…</p>
        ) : duelCandidates.length < 2 ? (
          <div className="space-y-4 py-4 text-center">
            <p className="text-sm text-zinc-300">Il faut au moins 2 titres dans vos listes pour lancer le duel.</p>
            <p className="text-xs text-zinc-400">Ajoutez des titres depuis le Catalogue ou Décider.</p>
            <Link href="/catalogue" onClick={() => setDuelOpen(false)} className={`inline-block ${buttonClass}`}>
              Ouvrir le Catalogue
            </Link>
          </div>
        ) : pickingFavorites ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Choisis 2 à 4 favoris à défendre dans le duel final</span>
              <span className="font-semibold text-amber-300">{selectedFavoriteKeys.length}/4</span>
            </div>
            <div className="grid max-h-80 grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-3">
              {duelCandidates.map((cand) => {
                const picked = selectedFavoriteKeys.includes(cand.key);
                return (
                  <button
                    key={cand.key}
                    type="button"
                    onClick={() => toggleFavoriteCandidate(cand.key)}
                    className={`flex flex-col overflow-hidden rounded-xl border p-2 text-left transition ${
                      picked
                        ? "border-amber-300 bg-amber-300/15"
                        : "border-white/10 bg-black/25 hover:border-white/30"
                    }`}
                  >
                    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg">
                      <Poster path={cand.posterPath} alt={cand.title} className="h-full w-full" />
                      {picked ? (
                        <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-bold text-zinc-950">
                          <Heart size={10} fill="currentColor" />
                          Favori
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 line-clamp-1 font-serif text-sm text-[#f4f1ea]">{cand.title}</p>
                    <p className="truncate text-[10px] text-zinc-400">{cand.sourceNote}</p>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={selectedFavoriteKeys.length < 2}
                onClick={startFavoritesBracket}
                className={`${buttonClass} disabled:opacity-40`}
              >
                Lancer le duel des favoris ({selectedFavoriteKeys.length})
              </button>
            </div>
          </div>
        ) : duelWinner ? (
          <div className="space-y-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">
              {duelMode === "favorites" ? "Favori gagnant de la soirée" : "Vainqueur de la soirée"}
            </p>
            <div className="mx-auto w-40 overflow-hidden rounded-2xl border border-amber-300/40">
              <Poster path={duelWinner.posterPath} alt={duelWinner.title} className="aspect-[2/3] w-full" />
            </div>
            <div>
              <h3 className="font-serif text-2xl text-[#f4f1ea]">{duelWinner.title}</h3>
              <p className="mt-1 text-xs text-zinc-400">
                {duelWinner.year ? `${duelWinner.year} · ` : ""}
                {duelWinner.sourceNote}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <button type="button" onClick={() => void shareDuelWinnerInChat(duelWinner)} className={buttonClass}>
                Proposer dans le chat
              </button>
              <button type="button" onClick={() => void prepareDuelSession(duelMode)} className={ghostClass}>
                Rejouer
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>
                Manche {duelChallengerIdx} / {duelPool.length - 1}
              </span>
              <span>Clique sur celui qui te tente ce soir</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { side: "champion" as const, item: duelPool[duelChampionIdx] },
                { side: "challenger" as const, item: duelPool[duelChallengerIdx] },
              ].map(({ side, item }) =>
                item ? (
                  <button
                    key={`${side}-${item.key}`}
                    type="button"
                    onClick={() => pickDuelSide(side)}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-white/15 bg-black/30 p-2.5 text-left transition hover:border-amber-300/60 hover:bg-white/[0.04]"
                  >
                    <div className="aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/10">
                      <Poster
                        path={item.posterPath}
                        alt={item.title}
                        className="h-full w-full transition duration-300 group-hover:scale-105"
                      />
                    </div>
                    <p className="mt-2.5 line-clamp-2 font-serif text-base leading-snug text-[#f4f1ea]">{item.title}</p>
                    <p className="mt-1 text-[11px] text-amber-300/85">{item.sourceNote}</p>
                  </button>
                ) : null,
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}