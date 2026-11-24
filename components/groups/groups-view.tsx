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
import { Avatar, ErrorNote, Modal, Poster, buttonClass, ghostClass, inputClass } from "@/components/ui";
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

const AMBER_PANEL_CLASS = "bg-[#14110d]";
const AMBER_BUBBLE_MINE_CLASS = "bg-[#C49A58]/25 text-[#EAE6DE] border-[#C49A58]/60";

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

  const accepted = useMemo(
    () => friendships.filter((row) => row.status === "accepted"),
    [friendships],
  );

  const friendIds = useMemo(
    () => new Set(accepted.map((row) => (row.requester_id === user?.id ? row.addressee_id : row.requester_id))),
    [accepted, user?.id],
  );

  const canSeeRealName = useCallback(
    (targetUserId?: string | null) => {
      if (!targetUserId || !user) return false;
      if (targetUserId === user.id) return true;
      return friendIds.has(targetUserId);
    },
    [user, friendIds],
  );

  const formatPublicIdentity = useCallback(
    (profile?: Profile | null, targetUserId?: string | null) => {
      const uid = targetUserId ?? profile?.id ?? null;
      const handle = profile?.username ? `@${profile.username}` : null;
      if (canSeeRealName(uid) && profile?.full_name) {
        return {
          primary: profile.full_name,
          secondary: handle,
          avatarName: profile.full_name,
        };
      }
      return {
        primary: handle || "Membre",
        secondary: null,
        avatarName: profile?.username || "Membre",
      };
    },
    [canSeeRealName],
  );

  const personName = useCallback(
    (id: string) => {
      const profile = people[id];
      if (!profile) return "Membre";
      if (canSeeRealName(id) && profile.full_name) {
        return profile.full_name;
      }
      return profile.username ? `@${profile.username}` : "Membre";
    },
    [people, canSeeRealName],
  );

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
      const savedPrefs = window.localStorage.getItem(`matchcut_evening_prefs_${user.id}`);
      if (savedPrefs) setEveningPrefsByGroup(JSON.parse(savedPrefs) as Record<string, EveningPrefs>);
    } catch {
      // ignore
    }
  }, [user]);

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

  const incoming = friendships.filter((row) => row.status === "pending" && row.addressee_id === user?.id);
  const outgoingRows = friendships.filter((row) => row.status === "pending" && row.requester_id === user?.id);
  const outgoing = new Set(outgoingRows.map((row) => row.addressee_id));
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
            ? "Dans votre liste À voir"
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
              sourceNote: isMe ? "Validé par vous" : `Validé par ${personName(uid)}`,
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
    const prefix = duelMode === "favorites" ? "Favori retenu du duel" : "Choix retenu du duel";
    const text = `${prefix} : ${winner.title}${winner.year ? ` (${winner.year})` : ""} — On lance cette séance ?`;
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
    setNotice(`« ${winner.title} » partagé dans la discussion.`);
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
      setNotice(`Invitation envoyée à ${profile.username ? `@${profile.username}` : "ce membre"}.`);
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
        setError(groupError?.message || "Le cercle n’a pas pu être créé.");
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
      setNotice(`Cercle « ${group.name} » créé.`);
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
      setNotice("Visuel du cercle mis à jour.");
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
    setNotice("Nom du cercle modifié.");
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
    setNotice("Membre ajouté au cercle.");
    await loadGroupMembers(activeGroup.id);
  }

  async function leaveActiveGroup() {
    if (!user || !activeGroup) return;
    const confirmed = window.confirm(`Quitter le cercle « ${activeGroup.name} » ?`);
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
    setNotice(`Vous avez quitté « ${leftName} ».`);
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

  const invitableFriends = [...friendIds].filter((fid) => !groupMemberIds.includes(fid));
  const unlockedBadgesCount = badges.filter((b) => b.level > 0).length;

  return (
    <div className="min-w-0 space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-[#EAE6DE]/12 pb-10">
        <div className="min-w-0">
          <p className="mc-kicker">IV — Correspondances &amp; Cercles</p>
          <h1 className="mt-3 font-serif text-4xl leading-[0.98] tracking-tight text-[#EAE6DE] sm:text-6xl">
            Proches &amp; <span className="italic text-[#C49A58]">cercles</span>
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-[#EAE6DE]/65">
            {accepted.length} ami{accepted.length > 1 ? "s" : ""} · {groups.length} cercle{groups.length > 1 ? "s" : ""}. Nom et prénom visibles entre amis ; pseudo seul pour les autres.
          </p>
        </div>

        {badges.length > 0 ? (
          <button
            type="button"
            onClick={() => setBadgesOpen((v) => !v)}
            className="mc-kicker inline-flex items-center gap-2 border-b border-[#C49A58]/60 pb-1 text-[#EAE6DE] transition hover:border-[#C49A58] hover:text-[#C49A58]"
          >
            <Award size={14} className="text-[#C49A58]" />
            <span>
              Distinctions ({unlockedBadgesCount}/{badges.length})
            </span>
          </button>
        ) : null}
      </div>

      {badgesOpen && badges.length > 0 ? (
        <section className="editorial-enter border-b border-[#EAE6DE]/12 pb-10">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="mc-kicker text-[#C49A58]">Repères</p>
              <h2 className="mt-1 font-serif text-3xl text-[#EAE6DE]">Paliers de régularité</h2>
            </div>
            <button type="button" onClick={() => setBadgesOpen(false)} className="mc-kicker text-[#EAE6DE]/50 hover:text-[#EAE6DE]">
              <X size={16} />
            </button>
          </div>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {badges.map((b) => {
              const pct = b.nextTarget ? Math.min(100, Math.round((b.current / b.nextTarget) * 100)) : 100;
              return (
                <div key={b.id} className="border-t border-[#EAE6DE]/15 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="mc-kicker text-[10px] text-[#C49A58]">{b.tierLabel}</span>
                    <Trophy size={13} className="text-[#A3B99B]" />
                  </div>
                  <p className="mt-2 font-serif text-xl text-[#EAE6DE]">{b.title}</p>
                  <p className="mt-1 text-xs text-[#EAE6DE]/60">{b.description}</p>
                  <div className="mt-3 h-px w-full bg-[#EAE6DE]/12">
                    <div className="h-full bg-[#C49A58] transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="space-y-1">
        <ErrorNote message={error} />
        {notice ? <p className="text-xs text-[#A3B99B]">{notice}</p> : null}
      </div>

      <div className="grid gap-10 lg:grid-cols-[350px_minmax(0,1fr)]">
        <section className="min-w-0 space-y-9 border-r-0 lg:border-r lg:border-[#EAE6DE]/12 lg:pr-8">
          <div>
            <label className="mc-kicker block text-[10px]">Rechercher un membre par pseudo</label>
            <input
              className={`${inputClass} mt-2 rounded-none border-x-0 border-t-0 border-b border-[#EAE6DE]/20 bg-transparent px-0 py-2 text-base text-[#EAE6DE] placeholder:text-[#EAE6DE]/35 focus:border-[#C49A58] focus:outline-none sm:text-sm`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ex. camille_cine"
            />
            <div className="mt-3 divide-y divide-[#EAE6DE]/10">
              {found.map((profile) => {
                const pending = outgoing.has(profile.id);
                const friend = friendIds.has(profile.id);
                const isBusy = busyFriendAction === `add:${profile.id}`;
                const identity = formatPublicIdentity(profile, profile.id);
                return (
                  <div key={profile.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link href={`/membre/${profile.id}`} className="flex min-w-0 flex-1 items-center gap-2.5 hover:opacity-85">
                      <Avatar name={identity.avatarName} url={profile.avatar_url} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#EAE6DE]">{identity.primary}</p>
                        {identity.secondary ? (
                          <p className="truncate text-xs text-[#EAE6DE]/50">{identity.secondary}</p>
                        ) : null}
                      </div>
                    </Link>
                    <button
                      type="button"
                      className="mc-kicker shrink-0 text-[10px] text-[#C49A58] hover:underline disabled:opacity-40"
                      disabled={friend || pending || Boolean(busyFriendAction)}
                      onClick={() => void addFriend(profile)}
                    >
                      {friend ? "Ami" : pending ? "Envoyée" : isBusy ? "..." : "Inviter"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {incoming.length > 0 ? (
            <div className="border-t border-[#EAE6DE]/12 pt-6">
              <p className="mc-kicker text-[10px] text-[#C49A58]">Invitations ({incoming.length})</p>
              <div className="mt-3 divide-y divide-[#EAE6DE]/10">
                {incoming.map((row) => {
                  const prof = people[row.requester_id];
                  const identity = formatPublicIdentity(prof, row.requester_id);
                  return (
                    <div key={row.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                      <Link href={`/membre/${row.requester_id}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
                        <Avatar name={identity.avatarName} url={prof?.avatar_url} size={28} />
                        <span className="truncate font-serif text-base text-[#EAE6DE]">{identity.primary}</span>
                      </Link>
                      <span className="flex shrink-0 gap-3 text-xs">
                        <button
                          type="button"
                          disabled={Boolean(busyFriendAction)}
                          className="mc-kicker text-[10px] text-[#A3B99B] hover:underline"
                          onClick={() => void respond(row.id, true)}
                        >
                          Accepter
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busyFriendAction)}
                          className="mc-kicker text-[10px] text-[#EAE6DE]/45 hover:text-[#EAE6DE]"
                          onClick={() => void respond(row.id, false)}
                        >
                          Décliner
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {outgoingRows.length > 0 ? (
            <div className="border-t border-[#EAE6DE]/12 pt-6">
              <p className="mc-kicker inline-flex items-center gap-1.5 text-[10px]">
                <Clock size={12} className="text-[#C49A58]" />
                <span>En attente ({outgoingRows.length})</span>
              </p>
              <div className="mt-3 divide-y divide-[#EAE6DE]/10">
                {outgoingRows.map((row) => {
                  const prof = people[row.addressee_id];
                  const identity = formatPublicIdentity(prof, row.addressee_id);
                  return (
                    <div key={row.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                      <Link href={`/membre/${row.addressee_id}`} className="flex min-w-0 items-center gap-2 hover:underline">
                        <Avatar name={identity.avatarName} url={prof?.avatar_url} size={26} />
                        <span className="truncate text-[#EAE6DE]/80">{identity.primary}</span>
                      </Link>
                      <span className="mc-kicker shrink-0 text-[10px] text-[#C49A58]/80">Envoyée</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {mutualSuggestions.length > 0 ? (
            <div className="border-t border-[#EAE6DE]/12 pt-6">
              <p className="mc-kicker inline-flex items-center gap-1.5 text-[10px]">
                <Sparkles size={12} className="text-[#A3B99B]" />
                <span>Suggestions · Affinités communes</span>
              </p>
              <div className="mt-3 divide-y divide-[#EAE6DE]/10">
                {mutualSuggestions.map(({ profile, mutualCount }) => {
                  const isBusy = busyFriendAction === `add:${profile.id}`;
                  const identity = formatPublicIdentity(profile, profile.id);
                  return (
                    <div key={profile.id} className="flex items-center justify-between gap-2.5 py-2.5">
                      <Link href={`/membre/${profile.id}`} className="flex min-w-0 flex-1 items-center gap-2.5 hover:opacity-85">
                        <Avatar name={identity.avatarName} url={profile.avatar_url} size={30} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[#EAE6DE]">{identity.primary}</p>
                          <p className="mc-kicker truncate text-[10px] text-[#A3B99B]">
                            {mutualCount} ami{mutualCount > 1 ? "s" : ""} en commun
                          </p>
                        </div>
                      </Link>
                      <button
                        type="button"
                        disabled={Boolean(busyFriendAction)}
                        onClick={() => void addFriend(profile)}
                        className="mc-kicker shrink-0 text-[10px] text-[#C49A58] hover:underline"
                      >
                        {isBusy ? "..." : "Inviter"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="border-t border-[#EAE6DE]/12 pt-6">
            <p className="mc-kicker text-[10px] text-[#C49A58]">Cercles ({groups.length})</p>
            <div className="mt-3 divide-y divide-[#EAE6DE]/10">
              {groups.map((group) => {
                const isGroupActive = activeChat?.kind === "group" && activeChat.id === group.id;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setActiveChat({ kind: "group", id: group.id })}
                    className={`flex w-full items-center justify-between gap-3 py-2.5 text-left transition ${
                      isGroupActive ? "text-[#C49A58]" : "text-[#EAE6DE]/80 hover:text-[#EAE6DE]"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar name={group.name} url={group.avatar_url} size={30} />
                      <span className="truncate font-serif text-xl">{group.name}</span>
                    </span>
                    <span className="mc-kicker shrink-0 text-[9px] text-[#EAE6DE]/45">Cercle</span>
                  </button>
                );
              })}
              {groups.length === 0 ? <p className="py-2 text-xs text-[#EAE6DE]/45">Aucun cercle formé.</p> : null}
            </div>

            <form
              className="mt-4 space-y-3 border-t border-[#EAE6DE]/10 pt-4"
              onSubmit={(event) => {
                event.preventDefault();
                void createGroup();
              }}
            >
              <input
                className={`${inputClass} rounded-none border-x-0 border-t-0 border-b border-[#EAE6DE]/20 bg-transparent px-0 py-1.5 text-base text-[#EAE6DE] placeholder:text-[#EAE6DE]/35 focus:border-[#C49A58] focus:outline-none sm:text-xs`}
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Nouveau cercle (cochez des amis ci-dessous)…"
              />
              <button
                type="submit"
                disabled={creatingGroup || groupName.trim().length < 2}
                className="mc-kicker inline-flex w-full items-center justify-center border border-[#EAE6DE]/25 py-2 text-[10px] text-[#EAE6DE] transition hover:border-[#C49A58] hover:text-[#C49A58] disabled:opacity-35"
              >
                <span>{creatingGroup ? "Création…" : "Créer un cercle"}</span>
              </button>
            </form>
          </div>

          <div className="border-t border-[#EAE6DE]/12 pt-6">
            <p className="mc-kicker text-[10px] text-[#A3B99B]">
              Amis ({accepted.length})
            </p>
            <div className="mt-3 divide-y divide-[#EAE6DE]/10">
              {accepted.map((row) => {
                const id = row.requester_id === user?.id ? row.addressee_id : row.requester_id;
                const profile = people[id];
                const unread = unreadByFriend[id] ?? 0;
                const isDmActive = activeChat?.kind === "dm" && activeChat.friendId === id;
                const compat = compatibilityByUser[id];
                const identity = formatPublicIdentity(profile, id);

                return (
                  <div key={row.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <input
                        type="checkbox"
                        className="accent-[#C49A58]"
                        title="Inclure dans un nouveau cercle"
                        checked={memberIds.includes(id)}
                        onChange={(event) =>
                          setMemberIds((prev) => (event.target.checked ? [...prev, id] : prev.filter((value) => value !== id)))
                        }
                      />
                      <Link href={`/membre/${id}`} className="flex min-w-0 flex-1 items-center gap-2.5 hover:opacity-85">
                        <Avatar name={identity.avatarName} url={profile?.avatar_url} size={30} />
                        <div className="min-w-0 flex-1">
                          <p className={`truncate font-serif text-lg ${isDmActive ? "text-[#C49A58]" : "text-[#EAE6DE]"}`}>
                            {identity.primary}
                          </p>
                          {compat ? (
                            <p className="mc-kicker truncate text-[9px] text-[#EAE6DE]/50">
                              {compat.score}% · {compat.label}
                            </p>
                          ) : null}
                        </div>
                      </Link>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveChat({ kind: "dm", friendId: id })}
                      className="mc-kicker inline-flex shrink-0 items-center gap-1.5 text-[10px] text-[#EAE6DE]/70 transition hover:text-[#C49A58]"
                      title="Ouvrir la discussion privée"
                    >
                      <MessageCircle size={12} />
                      <span>Privé</span>
                      {unread > 0 ? (
                        <span className="rounded-full bg-[#C49A58] px-1.5 py-0.5 text-[9px] font-bold leading-none text-[#101112]">
                          {unread}
                        </span>
                      ) : null}
                    </button>
                  </div>
                );
              })}
              {accepted.length === 0 ? <p className="py-2 text-xs text-[#EAE6DE]/45">Aucun ami pour le moment.</p> : null}
            </div>
          </div>
        </section>

        <section
          className={`flex h-[560px] min-w-0 flex-col overflow-hidden border border-[#EAE6DE]/12 transition-colors sm:h-[700px] ${AMBER_PANEL_CLASS}`}
        >
          {activeGroup ? (
            <>
              <header className="border-b border-[#EAE6DE]/12 bg-[#202224]/60 px-4 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3.5">
                    <Avatar name={activeGroup.name} url={activeGroup.avatar_url} size={42} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="mc-kicker text-[9px] text-[#C49A58]">Cercle</span>
                        <h2 className="truncate font-serif text-2xl text-[#EAE6DE] sm:text-3xl">{activeGroup.name}</h2>
                        {groupAffinityAverage !== null ? (
                          <span className="mc-kicker inline-flex items-center gap-1 text-[10px] text-[#C49A58]">
                            <Flame size={11} />
                            {groupAffinityAverage}%
                          </span>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-[#EAE6DE]/55">
                        {groupMemberIds.length} membre{groupMemberIds.length > 1 ? "s" : ""} ·{" "}
                        {groupMemberIds.map((id) => (id === user?.id ? "Vous" : personName(id))).join(", ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void prepareDuelSession(duelMode)}
                      className="mc-kicker inline-flex items-center gap-1.5 border border-[#A3B99B]/50 px-3 py-1.5 text-[10px] text-[#A3B99B] transition hover:bg-[#A3B99B] hover:text-[#101112]"
                    >
                      <Swords size={12} />
                      <span>Duel</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroupSettingsOpen((v) => !v)}
                      className="mc-kicker inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-[#EAE6DE]/75 transition hover:text-[#C49A58]"
                    >
                      <Settings size={13} />
                      <span>Réglages</span>
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[#EAE6DE]/55">
                  <span className="mc-kicker text-[10px]">Soirée :</span>
                  <span className="text-[#C49A58]">{activeEveningPrefs.vibe}</span>
                  <span>·</span>
                  <span>{activeEveningPrefs.formatPref}</span>
                  <span>·</span>
                  <span>{activeEveningPrefs.maxRuntime}</span>
                </div>

                {groupSettingsOpen ? (
                  <div className="mt-4 space-y-4 border-t border-[#EAE6DE]/12 bg-[#101112]/80 p-4 text-xs">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="block text-xs text-[#EAE6DE]/60">
                        <span className="mc-kicker text-[10px]">Ambiance</span>
                        <select
                          value={activeEveningPrefs.vibe}
                          onChange={(e) => updateEveningPrefs({ vibe: e.target.value })}
                          className="mt-1.5 w-full"
                        >
                          <option value="Thriller & suspens">Thriller &amp; suspens</option>
                          <option value="Comédie & détente">Comédie &amp; détente</option>
                          <option value="Animé / Sci-Fi">Animé / Sci-Fi</option>
                          <option value="Drame & émotion">Drame &amp; émotion</option>
                        </select>
                      </label>
                      <label className="block text-xs text-[#EAE6DE]/60">
                        <span className="mc-kicker text-[10px]">Format</span>
                        <select
                          value={activeEveningPrefs.formatPref}
                          onChange={(e) => updateEveningPrefs({ formatPref: e.target.value })}
                          className="mt-1.5 w-full"
                        >
                          <option value="Film (≤ 2h15)">Film (≤ 2h15)</option>
                          <option value="2-3 épisodes de série">2-3 épisodes de série</option>
                          <option value="Peu importe">Peu importe</option>
                        </select>
                      </label>
                      <label className="block text-xs text-[#EAE6DE]/60">
                        <span className="mc-kicker text-[10px]">Rythme</span>
                        <select
                          value={activeEveningPrefs.maxRuntime}
                          onChange={(e) => updateEveningPrefs({ maxRuntime: e.target.value })}
                          className="mt-1.5 w-full"
                        >
                          <option value="Soirée tranquille">Soirée tranquille</option>
                          <option value="Marathon / tardif">Marathon / tardif</option>
                        </select>
                      </label>
                    </div>

                    <div className="space-y-2 border-t border-[#EAE6DE]/10 pt-3">
                      <p className="mc-kicker inline-flex items-center gap-1.5 text-[10px] text-[#EAE6DE]/75">
                        <Shield size={12} className="text-[#C49A58]" />
                        <span>Membres &amp; rôles</span>
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {groupMembersMeta.map((m) => {
                          const isCreator = activeGroup.created_by === m.user_id;
                          const isAdmin = isCreator || m.role === "admin";
                          return (
                            <div key={m.user_id} className="flex items-center gap-2 text-xs">
                              <span className="text-[#EAE6DE]">
                                {m.user_id === user?.id ? "Vous" : personName(m.user_id)}
                              </span>
                              <span className="mc-kicker text-[9px] text-[#C49A58]">
                                {isCreator ? "Créateur" : isAdmin ? "Admin" : "Membre"}
                              </span>
                              {canManageRoles && !isCreator && m.user_id !== user?.id ? (
                                <button
                                  type="button"
                                  onClick={() => void toggleMemberAdminRole(m.user_id, !isAdmin)}
                                  className="mc-kicker text-[9px] text-[#EAE6DE]/60 underline hover:text-[#EAE6DE]"
                                >
                                  {isAdmin ? "Retirer admin" : "Passer admin"}
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 border-t border-[#EAE6DE]/10 pt-3">
                      <label className="mc-kicker inline-flex cursor-pointer items-center gap-2 text-[10px] text-[#EAE6DE]/80 hover:text-[#C49A58]">
                        <Camera size={13} />
                        <span>{uploadingGroupAvatar ? "Envoi…" : "Visuel du cercle"}</span>
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
                        <Pencil size={12} className="shrink-0 text-[#EAE6DE]/45" />
                        <input
                          type="text"
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          placeholder="Nouveau nom du cercle"
                          className={`${inputClass} max-w-xs py-1 text-base sm:text-xs`}
                        />
                        <button
                          type="button"
                          onClick={() => void renameActiveGroup()}
                          className="mc-kicker inline-flex items-center gap-1 bg-[#C49A58] px-3 py-1.5 text-[10px] font-semibold text-[#101112]"
                        >
                          <Check size={12} />
                          <span>Renommer</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {invitableFriends.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <UserPlus size={13} className="text-[#EAE6DE]/50" />
                          <select
                            value={friendToAddId}
                            onChange={(e) => setFriendToAddId(e.target.value)}
                            className="py-1 text-xs"
                          >
                            <option value="">Ajouter un proche au cercle…</option>
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
                            className="mc-kicker border border-[#A3B99B] px-3 py-1.5 text-[10px] text-[#A3B99B] disabled:opacity-40"
                          >
                            Ajouter
                          </button>
                        </div>
                      ) : (
                        <span className="text-[#EAE6DE]/50">Tous vos proches sont déjà dans ce cercle.</span>
                      )}

                      <button
                        type="button"
                        onClick={() => void leaveActiveGroup()}
                        className="mc-kicker inline-flex items-center gap-1.5 text-[10px] text-[#EAE6DE]/55 hover:text-[#EAE6DE]"
                      >
                        <LogOut size={12} />
                        <span>Quitter</span>
                      </button>
                    </div>
                  </div>
                ) : null}
              </header>

              <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
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
                  const identity = formatPublicIdentity(prof, item.user_id);
                  const isHighlighted = highlightedMsgId === item.id;

                  return (
                    <div
                      key={`${item.kind}-${item.id}`}
                      id={`msg-${item.id}`}
                      className={`transition ${groupedWithPrev ? "mt-1" : "mt-5"} ${
                        isHighlighted ? "bg-[#C49A58]/10" : ""
                      }`}
                    >
                      {showDayDivider ? (
                        <div className="my-5 flex justify-center">
                          <span className="mc-kicker border-b border-[#EAE6DE]/15 pb-1 text-[10px] text-[#EAE6DE]/45">
                            {dayLabel}
                          </span>
                        </div>
                      ) : null}

                      <div className={`group flex items-end gap-2.5 ${mine ? "justify-end" : "justify-start"}`}>
                        {!mine ? (
                          <div className="w-8 shrink-0">
                            {!groupedWithNext ? (
                              <Link href={`/membre/${item.user_id}`} className="block hover:opacity-85">
                                <Avatar name={identity.avatarName} url={prof?.avatar_url} size={30} />
                              </Link>
                            ) : null}
                          </div>
                        ) : null}

                        <div className={`flex max-w-[82%] flex-col sm:max-w-[78%] ${mine ? "items-end" : "items-start"}`}>
                          {!mine && !groupedWithPrev ? (
                            <Link
                              href={`/membre/${item.user_id}`}
                              className="mc-kicker mb-1 text-[10px] text-[#EAE6DE]/50 hover:text-[#C49A58]"
                            >
                              {personName(item.user_id)}
                            </Link>
                          ) : null}

                          <div className={`relative flex items-center gap-1.5 ${mine ? "flex-row-reverse" : "flex-row"}`}>
                            {item.kind === "message" ? (
                              <div
                                className={`whitespace-pre-wrap break-words rounded-sm border px-3.5 py-2.5 text-sm leading-relaxed sm:px-4 ${
                                  mine
                                    ? AMBER_BUBBLE_MINE_CLASS
                                    : "border-[#EAE6DE]/12 bg-[#202224] text-[#EAE6DE]"
                                }`}
                              >
                                {item.replyTo ? (
                                  <button
                                    type="button"
                                    onClick={() => scrollToMessage(item.replyTo!.id)}
                                    className="mb-2 block w-full border-l border-[#C49A58] bg-[#101112]/60 px-2.5 py-1 text-left text-[11px] text-[#EAE6DE]/75 hover:bg-[#101112]"
                                  >
                                    <span className="font-semibold text-[#C49A58]">{item.replyTo.authorName}</span>
                                    <p className="line-clamp-1 text-[#EAE6DE]/55">{item.replyTo.preview}</p>
                                  </button>
                                ) : null}
                                {item.body}
                              </div>
                            ) : item.mediaKind === "video" ? (
                              <figure className="max-w-xs overflow-hidden rounded-sm border border-[#EAE6DE]/15 bg-[#202224]">
                                <video src={item.image_url} controls playsInline className="max-h-72 w-full bg-[#101112]" />
                              </figure>
                            ) : (
                              <figure className="max-w-xs overflow-hidden rounded-sm border border-[#EAE6DE]/15 bg-[#202224]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={item.image_url} alt={item.caption || "Visuel de séance"} className="max-h-72 w-full object-cover" />
                              </figure>
                            )}

                            {item.kind === "message" ? (
                              <div className="flex items-center gap-0.5 opacity-75 transition group-hover:opacity-100 focus-within:opacity-100 sm:opacity-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReplyDraft({
                                      id: item.id,
                                      authorName: mine ? "Vous" : personName(item.user_id),
                                      preview: item.body,
                                    })
                                  }
                                  className="p-1 text-[#EAE6DE]/45 hover:text-[#EAE6DE]"
                                  title="Répondre"
                                >
                                  <Reply size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setReactionPickerFor((prevKey) => (prevKey === targetKey ? null : targetKey))}
                                  className="p-1 text-[#EAE6DE]/45 hover:text-[#EAE6DE]"
                                  title="Réagir"
                                >
                                  <SmilePlus size={14} />
                                </button>
                              </div>
                            ) : null}
                          </div>

                          {reactionPickerFor === targetKey && item.kind === "message" ? (
                            <div className="mt-1 flex items-center gap-1 border border-[#EAE6DE]/15 bg-[#202224] px-2 py-1">
                              {QUICK_REACTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => void toggleReaction(targetKey, emoji, "messages", item.id, item.reactions)}
                                  className="px-1.5 py-0.5 text-sm transition hover:scale-125"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          ) : null}

                          {activeEmojis.length > 0 && item.kind === "message" ? (
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {activeEmojis.map(([emoji, users]) => {
                                const reactedByMe = user ? users.includes(user.id) : false;
                                return (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => void toggleReaction(targetKey, emoji, "messages", item.id, item.reactions)}
                                    className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[11px] transition ${
                                      reactedByMe
                                        ? "border-[#C49A58] bg-[#C49A58]/15 text-[#EAE6DE]"
                                        : "border-[#EAE6DE]/12 bg-[#202224]/70 text-[#EAE6DE]/75 hover:border-[#EAE6DE]/30"
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
                            <span className="mc-kicker mt-1 text-[9px] text-[#EAE6DE]/40">{formatTime(item.created_at)}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {feed.length === 0 ? (
                  <div className="grid h-full place-items-center text-center font-serif text-xl italic text-[#EAE6DE]/50">
                    La conversation est ouverte. Lancez la discussion ou un duel de soirée.
                  </div>
                ) : null}
                <div ref={endRef} />
              </div>

              {replyDraft ? (
                <div className="flex items-center justify-between gap-2 border-t border-[#EAE6DE]/12 bg-[#202224]/70 px-4 py-2 text-xs sm:px-5">
                  <div className="min-w-0 border-l border-[#C49A58] pl-2.5">
                    <span className="mc-kicker text-[10px] text-[#C49A58]">Réponse à {replyDraft.authorName}</span>
                    <p className="truncate text-[#EAE6DE]/65">{replyDraft.preview}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyDraft(null)}
                    className="p-1 text-[#EAE6DE]/50 hover:text-[#EAE6DE]"
                    aria-label="Annuler la réponse"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : null}

              <form
                className="flex items-end gap-3 border-t border-[#EAE6DE]/12 bg-[#202224]/40 px-4 py-3.5 sm:px-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage();
                }}
              >
                <label
                  className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center border border-[#EAE6DE]/15 text-[#EAE6DE]/75 transition hover:border-[#C49A58] hover:text-[#C49A58]"
                  aria-label="Partager une image ou une courte vidéo"
                  title="Image ou courte vidéo"
                >
                  <ImagePlus size={15} />
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
                  className={`${inputClass} max-h-28 min-h-[40px] resize-none rounded-none border-x-0 border-t-0 border-b border-[#EAE6DE]/20 bg-transparent px-0 py-2 text-base text-[#EAE6DE] placeholder:text-[#EAE6DE]/35 focus:border-[#C49A58] focus:outline-none sm:text-sm`}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder={uploadingMedia ? "Envoi du visuel…" : "Écrire un message…"}
                  maxLength={2000}
                />
                <button
                  type="submit"
                  disabled={sendingMessage || !draft.trim()}
                  className="grid h-10 w-10 shrink-0 place-items-center bg-[#C49A58] text-[#101112] transition hover:bg-[#d2aa6a] disabled:opacity-35"
                  aria-label="Envoyer"
                >
                  <Send size={15} />
                </button>
              </form>
            </>
          ) : activeFriend ? (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EAE6DE]/12 bg-[#202224]/60 px-4 py-4 sm:px-6">
                <Link href={`/membre/${activeFriend.id}`} className="flex min-w-0 items-center gap-3 hover:opacity-85">
                  <Avatar
                    name={formatPublicIdentity(activeFriend, activeFriend.id).avatarName}
                    url={activeFriend.avatar_url}
                    size={40}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className="mc-kicker text-[9px] text-[#A3B99B]">Privé</span>
                      <h2 className="truncate font-serif text-2xl text-[#EAE6DE] sm:text-3xl">
                        {personName(activeFriend.id)}
                      </h2>
                      {compatibilityByUser[activeFriend.id] ? (
                        <span className="mc-kicker inline-flex items-center gap-1 text-[10px] text-[#C49A58]">
                          <Flame size={11} />
                          {compatibilityByUser[activeFriend.id].score}%
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-[#EAE6DE]/55">
                      {compatibilityByUser[activeFriend.id]
                        ? `${compatibilityByUser[activeFriend.id].label} · ${compatibilityByUser[activeFriend.id].commonCount} titre${
                            compatibilityByUser[activeFriend.id].commonCount > 1 ? "s" : ""
                          } en commun`
                        : "Correspondance directe"}
                    </p>
                  </div>
                </Link>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void prepareDuelSession(duelMode)}
                    className="mc-kicker inline-flex items-center gap-1.5 border border-[#A3B99B]/50 px-3 py-1.5 text-[10px] text-[#A3B99B] transition hover:bg-[#A3B99B] hover:text-[#101112]"
                  >
                    <Swords size={12} />
                    <span>Duel</span>
                  </button>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
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
                      className={`transition ${groupedWithPrev ? "mt-1" : "mt-5"} ${
                        isHighlighted ? "bg-[#C49A58]/10" : ""
                      }`}
                    >
                      {showDayDivider ? (
                        <div className="my-5 flex justify-center">
                          <span className="mc-kicker border-b border-[#EAE6DE]/15 pb-1 text-[10px] text-[#EAE6DE]/45">
                            {dayLabel}
                          </span>
                        </div>
                      ) : null}

                      <div className={`group flex items-end gap-2.5 ${mine ? "justify-end" : "justify-start"}`}>
                        {!mine ? (
                          <div className="w-8 shrink-0">
                            {!groupedWithNext ? (
                              <Avatar
                                name={formatPublicIdentity(activeFriend, msg.sender_id).avatarName}
                                url={activeFriend.avatar_url}
                                size={30}
                              />
                            ) : null}
                          </div>
                        ) : null}

                        <div className={`flex max-w-[82%] flex-col sm:max-w-[78%] ${mine ? "items-end" : "items-start"}`}>
                          {msg.movie_title ? (
                            <div className="flex max-w-md gap-4 rounded-sm border border-[#A3B99B]/45 bg-[#202224] p-4">
                              {msg.poster_path ? (
                                <div className="w-16 shrink-0 overflow-hidden bg-[#101112]">
                                  <Poster path={msg.poster_path} alt={msg.movie_title} className="aspect-[2/3] w-full" />
                                </div>
                              ) : null}
                              <div className="flex-1 space-y-2">
                                <p className="mc-kicker text-[10px] text-[#A3B99B]">Proposition de séance</p>
                                <p className="font-serif text-xl text-[#EAE6DE]">{decoded.cleanBody}</p>
                                {msg.invite_status === "pending" && !mine ? (
                                  <div className="flex gap-3 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => void respondToInvite(msg.id, "accepted")}
                                      className="mc-kicker bg-[#A3B99B] px-3 py-1 text-[10px] font-semibold text-[#101112]"
                                    >
                                      Partant
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void respondToInvite(msg.id, "declined")}
                                      className="mc-kicker border border-[#EAE6DE]/25 px-3 py-1 text-[10px] text-[#EAE6DE]/75"
                                    >
                                      Pas ce soir
                                    </button>
                                  </div>
                                ) : msg.invite_status === "accepted" ? (
                                  <p className="mc-kicker text-[10px] text-[#A3B99B]">Séance acceptée</p>
                                ) : msg.invite_status === "declined" ? (
                                  <p className="mc-kicker text-[10px] text-[#EAE6DE]/45">Déclinée</p>
                                ) : (
                                  <p className="mc-kicker text-[10px] text-[#EAE6DE]/45">En attente</p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className={`relative flex items-center gap-1.5 ${mine ? "flex-row-reverse" : "flex-row"}`}>
                              <div
                                className={`whitespace-pre-wrap break-words rounded-sm border px-3.5 py-2.5 text-sm leading-relaxed sm:px-4 ${
                                  mine
                                    ? AMBER_BUBBLE_MINE_CLASS
                                    : "border-[#EAE6DE]/12 bg-[#202224] text-[#EAE6DE]"
                                }`}
                              >
                                {decoded.replyTo ? (
                                  <button
                                    type="button"
                                    onClick={() => scrollToMessage(decoded.replyTo!.id)}
                                    className="mb-2 block w-full border-l border-[#C49A58] bg-[#101112]/60 px-2.5 py-1 text-left text-[11px] text-[#EAE6DE]/75 hover:bg-[#101112]"
                                  >
                                    <span className="font-semibold text-[#C49A58]">{decoded.replyTo.authorName}</span>
                                    <p className="line-clamp-1 text-[#EAE6DE]/55">{decoded.replyTo.preview}</p>
                                  </button>
                                ) : null}
                                {decoded.cleanBody}
                              </div>
                              <div className="flex items-center gap-0.5 opacity-75 transition group-hover:opacity-100 focus-within:opacity-100 sm:opacity-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReplyDraft({
                                      id: msg.id,
                                      authorName: mine ? "Vous" : personName(msg.sender_id),
                                      preview: decoded.cleanBody,
                                    })
                                  }
                                  className="p-1 text-[#EAE6DE]/45 hover:text-[#EAE6DE]"
                                  title="Répondre"
                                >
                                  <Reply size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setReactionPickerFor((prevKey) => (prevKey === targetKey ? null : targetKey))}
                                  className="p-1 text-[#EAE6DE]/45 hover:text-[#EAE6DE]"
                                  title="Réagir"
                                >
                                  <SmilePlus size={14} />
                                </button>
                              </div>
                            </div>
                          )}

                          {reactionPickerFor === targetKey ? (
                            <div className="mt-1 flex items-center gap-1 border border-[#EAE6DE]/15 bg-[#202224] px-2 py-1">
                              {QUICK_REACTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => void toggleReaction(targetKey, emoji, "direct_messages", msg.id, msg.reactions)}
                                  className="px-1.5 py-0.5 text-sm transition hover:scale-125"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          ) : null}

                          {activeEmojis.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {activeEmojis.map(([emoji, users]) => {
                                const reactedByMe = user ? users.includes(user.id) : false;
                                return (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => void toggleReaction(targetKey, emoji, "direct_messages", msg.id, msg.reactions)}
                                    className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[11px] transition ${
                                      reactedByMe
                                        ? "border-[#C49A58] bg-[#C49A58]/15 text-[#EAE6DE]"
                                        : "border-[#EAE6DE]/12 bg-[#202224]/70 text-[#EAE6DE]/75 hover:border-[#EAE6DE]/30"
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
                            <span className="mc-kicker mt-1 text-[9px] text-[#EAE6DE]/40">{formatTime(msg.created_at)}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {dmFeed.length === 0 ? (
                  <div className="grid h-full place-items-center text-center font-serif text-xl italic text-[#EAE6DE]/50">
                    Ouvrez la discussion avec {personName(activeFriend.id)} ou lancez un duel de soirée.
                  </div>
                ) : null}
                <div ref={endRef} />
              </div>

              {replyDraft ? (
                <div className="flex items-center justify-between gap-2 border-t border-[#EAE6DE]/12 bg-[#202224]/70 px-4 py-2 text-xs sm:px-5">
                  <div className="min-w-0 border-l border-[#C49A58] pl-2.5">
                    <span className="mc-kicker text-[10px] text-[#C49A58]">Réponse à {replyDraft.authorName}</span>
                    <p className="truncate text-[#EAE6DE]/65">{replyDraft.preview}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyDraft(null)}
                    className="p-1 text-[#EAE6DE]/50 hover:text-[#EAE6DE]"
                    aria-label="Annuler la réponse"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : null}

              <form
                className="flex items-end gap-3 border-t border-[#EAE6DE]/12 bg-[#202224]/40 px-4 py-3.5 sm:px-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage();
                }}
              >
                <textarea
                  rows={1}
                  className={`${inputClass} max-h-28 min-h-[40px] resize-none rounded-none border-x-0 border-t-0 border-b border-[#EAE6DE]/20 bg-transparent px-0 py-2 text-base text-[#EAE6DE] placeholder:text-[#EAE6DE]/35 focus:border-[#C49A58] focus:outline-none sm:text-sm`}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder={`Écrire à ${personName(activeFriend.id)}…`}
                  maxLength={2000}
                />
                <button
                  type="submit"
                  disabled={sendingMessage || !draft.trim()}
                  className="grid h-10 w-10 shrink-0 place-items-center bg-[#C49A58] text-[#101112] transition hover:bg-[#d2aa6a] disabled:opacity-35"
                  aria-label="Envoyer"
                >
                  <Send size={15} />
                </button>
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center px-8 text-center">
              <div className="space-y-2">
                <p className="mc-kicker text-[#C49A58]">Salon de correspondance</p>
                <p className="font-serif text-2xl italic text-[#EAE6DE]/75 sm:text-3xl">
                  Choisissez un cercle ou un ami dans la colonne de gauche.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      <Modal open={duelOpen} title="Duel de soirée" onClose={() => setDuelOpen(false)}>
        <div className="mb-5 flex gap-4 border-b border-[#EAE6DE]/12 pb-3 text-xs">
          <button
            type="button"
            onClick={() => void prepareDuelSession("common")}
            className={`mc-kicker pb-1 transition ${
              duelMode === "common" ? "border-b border-[#C49A58] text-[#EAE6DE]" : "text-[#EAE6DE]/45 hover:text-[#EAE6DE]"
            }`}
          >
            Collections communes
          </button>
          <button
            type="button"
            onClick={() => void prepareDuelSession("favorites")}
            className={`mc-kicker pb-1 transition ${
              duelMode === "favorites" ? "border-b border-[#C49A58] text-[#C49A58]" : "text-[#EAE6DE]/45 hover:text-[#EAE6DE]"
            }`}
          >
            Favoris en lice
          </button>
        </div>

        {duelLoading ? (
          <p className="mc-kicker py-8 text-center">Préparation des affiches…</p>
        ) : duelCandidates.length < 2 ? (
          <div className="space-y-4 py-4 text-center">
            <p className="font-serif text-2xl italic text-[#EAE6DE]/80">
              Il faut au moins deux titres dans vos collections pour lancer un duel.
            </p>
            <Link href="/catalogue" onClick={() => setDuelOpen(false)} className={`inline-block ${buttonClass}`}>
              Ouvrir la Cinémathèque
            </Link>
          </div>
        ) : pickingFavorites ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="mc-kicker text-[10px]">Sélectionnez 2 à 4 favoris</span>
              <span className="mc-kicker text-[10px] text-[#C49A58]">{selectedFavoriteKeys.length}/4</span>
            </div>
            <div className="grid max-h-80 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
              {duelCandidates.map((cand) => {
                const picked = selectedFavoriteKeys.includes(cand.key);
                return (
                  <button
                    key={cand.key}
                    type="button"
                    onClick={() => toggleFavoriteCandidate(cand.key)}
                    className={`flex flex-col overflow-hidden border p-2 text-left transition ${
                      picked
                        ? "border-[#C49A58] bg-[#C49A58]/15"
                        : "border-[#EAE6DE]/12 bg-[#101112]/60 hover:border-[#EAE6DE]/30"
                    }`}
                  >
                    <div className="relative aspect-[2/3] w-full overflow-hidden">
                      <Poster path={cand.posterPath} alt={cand.title} className="h-full w-full" />
                      {picked ? (
                        <span className="mc-kicker absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 bg-[#C49A58] px-2 py-0.5 text-[9px] font-bold text-[#101112]">
                          <Heart size={9} fill="currentColor" />
                          <span>Choix</span>
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 line-clamp-1 font-serif text-base text-[#EAE6DE]">{cand.title}</p>
                    <p className="mc-kicker truncate text-[9px] text-[#EAE6DE]/50">{cand.sourceNote}</p>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={selectedFavoriteKeys.length < 2}
                onClick={startFavoritesBracket}
                className={`${buttonClass} disabled:opacity-35`}
              >
                Lancer le duel ({selectedFavoriteKeys.length})
              </button>
            </div>
          </div>
        ) : duelWinner ? (
          <div className="space-y-5 text-center">
            <p className="mc-kicker text-[#C49A58]">
              {duelMode === "favorites" ? "Favori retenu" : "Titre retenu pour la séance"}
            </p>
            <div className="mx-auto aspect-[2/3] w-40 overflow-hidden bg-[#101112]">
              <Poster path={duelWinner.posterPath} alt={duelWinner.title} className="h-full w-full" />
            </div>
            <div>
              <h3 className="font-serif text-3xl text-[#EAE6DE]">{duelWinner.title}</h3>
              <p className="mc-kicker mt-1 text-[10px] text-[#EAE6DE]/50">
                {duelWinner.year ? `${duelWinner.year} · ` : ""}
                {duelWinner.sourceNote}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <button type="button" onClick={() => void shareDuelWinnerInChat(duelWinner)} className={buttonClass}>
                Partager dans la discussion
              </button>
              <button type="button" onClick={() => void prepareDuelSession(duelMode)} className={ghostClass}>
                Rejouer
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="mc-kicker text-[10px] text-[#C49A58]">
                Manche {duelChallengerIdx} / {duelPool.length - 1}
              </span>
              <span className="mc-kicker text-[10px] text-[#EAE6DE]/50">Sélectionnez une affiche</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { side: "champion" as const, item: duelPool[duelChampionIdx] },
                { side: "challenger" as const, item: duelPool[duelChallengerIdx] },
              ].map(({ side, item }) =>
                item ? (
                  <button
                    key={`${side}-${item.key}`}
                    type="button"
                    onClick={() => pickDuelSide(side)}
                    className="group flex flex-col overflow-hidden border border-[#EAE6DE]/12 bg-[#101112]/60 p-2.5 text-left transition hover:border-[#C49A58]"
                  >
                    <div className="aspect-[2/3] w-full overflow-hidden bg-[#202224]">
                      <Poster
                        path={item.posterPath}
                        alt={item.title}
                        className="h-full w-full transition duration-500 group-hover:scale-105"
                      />
                    </div>
                    <p className="mt-3 line-clamp-2 font-serif text-lg leading-snug text-[#EAE6DE] group-hover:text-[#C49A58]">
                      {item.title}
                    </p>
                    <p className="mc-kicker mt-1 text-[10px] text-[#EAE6DE]/50">{item.sourceNote}</p>
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