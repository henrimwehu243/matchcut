"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Camera, Check, ImagePlus, LogOut, MessageCircle, Pencil, Send, Settings, UserPlus } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Avatar, ErrorNote, PageHeader, Poster, buttonClass, ghostClass, inputClass } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import type { ChatMessage, DirectMessage, Friendship, Group, Profile, SessionPhoto } from "@/lib/types";

type FeedItem =
  | { kind: "message"; id: string; created_at: string; user_id: string; body: string }
  | { kind: "photo"; id: string; created_at: string; user_id: string; image_url: string; caption: string | null };

type ActiveChat = { kind: "group"; id: string } | { kind: "dm"; friendId: string };

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

export function GroupsView() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const initialDm = searchParams?.get("dm");

  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Profile[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);

  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [dmFeed, setDmFeed] = useState<DirectMessage[]>([]);
  const [unreadByFriend, setUnreadByFriend] = useState<Record<string, number>>({});

  // Gestion avancée du groupe actif
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [renameDraft, setRenameDraft] = useState("");
  const [friendToAddId, setFriendToAddId] = useState("");
  const [uploadingGroupAvatar, setUploadingGroupAvatar] = useState(false);

  const [draft, setDraft] = useState("");
  const [groupName, setGroupName] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialDm) {
      setActiveChat({ kind: "dm", friendId: initialDm });
    }
  }, [initialDm]);

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
    const ids = [...new Set(rows.flatMap((row) => [row.requester_id, row.addressee_id]).filter((id) => id !== user.id))];
    if (ids.length) {
      const { data } = await supabase.from("profiles").select("*").in("id", ids);
      const map: Record<string, Profile> = {};
      ((data as Profile[]) ?? []).forEach((profile) => {
        map[profile.id] = profile;
      });
      setPeople((prev) => ({ ...prev, ...map }));
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

    await loadUnreadDms();
  }, [user, loadUnreadDms]);

  const loadGroupMembers = useCallback(async (gId: string) => {
    const { data } = await supabase.from("group_members").select("user_id").eq("group_id", gId);
    const mIds = (data ?? []).map((r) => r.user_id as string);
    setGroupMemberIds(mIds);
    if (mIds.length) {
      const { data: profs } = await supabase.from("profiles").select("*").in("id", mIds);
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
      ...((messages.data as ChatMessage[]) ?? []).map((row) => ({
        kind: "message" as const,
        id: row.id,
        created_at: row.created_at,
        user_id: row.user_id,
        body: row.body,
      })),
      ...((photos.data as SessionPhoto[]) ?? []).map((row) => ({
        kind: "photo" as const,
        id: row.id,
        created_at: row.created_at,
        user_id: row.user_id,
        image_url: row.image_url,
        caption: row.caption,
      })),
    ].sort((a, b) => a.created_at.localeCompare(b.created_at));
    setFeed(items);
    const authorIds = [...new Set(items.map((item) => item.user_id))];
    if (authorIds.length) {
      const { data } = await supabase.from("profiles").select("*").in("id", authorIds);
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
      const list = (data as DirectMessage[]) ?? [];
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
    if (!activeChat) return;
    if (activeChat.kind === "group") {
      const currentG = groups.find((g) => g.id === activeChat.id);
      setRenameDraft(currentG?.name ?? "");
      setFriendToAddId("");
      void loadGroupFeed(activeChat.id);
      void loadGroupMembers(activeChat.id);
      const timer = window.setInterval(() => void loadGroupFeed(activeChat.id), 4000);
      return () => window.clearInterval(timer);
    } else {
      void loadDmFeed(activeChat.friendId);
      const timer = window.setInterval(() => void loadDmFeed(activeChat.friendId), 3500);
      return () => window.clearInterval(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat, loadGroupFeed, loadGroupMembers, loadDmFeed]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
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
        .select("*")
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
  const outgoing = new Set(friendships.filter((row) => row.status === "pending" && row.requester_id === user?.id).map((row) => row.addressee_id));
  const friendIds = new Set(accepted.map((row) => (row.requester_id === user?.id ? row.addressee_id : row.requester_id)));
  const activeGroup = activeChat?.kind === "group" ? groups.find((group) => group.id === activeChat.id) ?? null : null;
  const activeFriend = activeChat?.kind === "dm" ? people[activeChat.friendId] ?? null : null;
  const names = useMemo(() => people, [people]);

  async function addFriend(profile: Profile) {
    if (!user) return;
    const existing = friendships.find(
      (row) =>
        (row.requester_id === user.id && row.addressee_id === profile.id) ||
        (row.addressee_id === user.id && row.requester_id === profile.id),
    );
    if (existing?.status === "accepted") return;
    if (existing?.status === "pending" && existing.addressee_id === user.id) {
      await respond(existing.id, true);
      return;
    }
    if (existing) return;
    const { error: writeError } = await supabase.from("friendships").insert({
      requester_id: user.id,
      addressee_id: profile.id,
      status: "pending",
    });
    if (writeError) setError(writeError.message);
    else {
      setNotice(`Demande envoyée à ${profile.username || profile.full_name}.`);
      void loadSocial();
    }
  }

  async function respond(id: string, accept: boolean) {
    const result = accept
      ? await supabase.from("friendships").update({ status: "accepted" }).eq("id", id)
      : await supabase.from("friendships").delete().eq("id", id);
    if (result.error) setError(result.error.message);
    else void loadSocial();
  }

  async function createGroup() {
    if (!user || groupName.trim().length < 2) return;
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .insert({ name: groupName.trim(), created_by: user.id })
      .select("*")
      .single();
    if (groupError || !group) {
      setError(groupError?.message || "Le groupe n’a pas pu être créé.");
      return;
    }
    const members = [
      { group_id: group.id, user_id: user.id, role: "owner" },
      ...memberIds.map((id) => ({ group_id: group.id, user_id: id, role: "member" })),
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
  }

  async function updateGroupAvatar(file: File | null) {
    if (!user || !activeGroup || !file) return;
    if (!file.type.startsWith("image/") || file.size > 5_000_000) {
      setError("Choisissez une image de moins de 5 Mo.");
      return;
    }
    setUploadingGroupAvatar(true);
    setError(null);
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `groups/${activeGroup.id}/${Date.now()}.${ext}`;
    const uploaded = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: true });
    if (uploaded.error) {
      setUploadingGroupAvatar(false);
      setError(uploaded.error.message);
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const { error: updateErr } = await supabase
      .from("groups")
      .update({ avatar_url: data.publicUrl })
      .eq("id", activeGroup.id);
    setUploadingGroupAvatar(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    setNotice("Photo du groupe mise à jour.");
    await loadSocial();
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
    if (!user || !activeChat || !draft.trim()) return;
    const body = draft.trim();
    setDraft("");
    if (activeChat.kind === "group") {
      const { error: writeError } = await supabase.from("messages").insert({ group_id: activeChat.id, user_id: user.id, body });
      if (writeError) setError(writeError.message);
      else void loadGroupFeed(activeChat.id);
    } else {
      const { error: writeError } = await supabase.from("direct_messages").insert({
        sender_id: user.id,
        receiver_id: activeChat.friendId,
        body,
      });
      if (writeError) setError(writeError.message);
      else void loadDmFeed(activeChat.friendId);
    }
  }

  async function respondToInvite(msgId: string, status: "accepted" | "declined") {
    if (activeChat?.kind !== "dm") return;
    await supabase.from("direct_messages").update({ invite_status: status }).eq("id", msgId);
    void loadDmFeed(activeChat.friendId);
  }

  async function sendPhoto(file: File | null) {
    if (!user || activeChat?.kind !== "group" || !file) return;
    if (!file.type.startsWith("image/") || file.size > 5_000_000) {
      setError("Choisissez une image de moins de 5 Mo.");
      return;
    }
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "jpg";
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
      caption: null,
    });
    if (writeError) setError(writeError.message);
    else void loadGroupFeed(activeChat.id);
  }

  function personName(id: string) {
    const profile = names[id];
    return profile?.username || profile?.full_name || "Membre";
  }

  const invitableFriends = [...friendIds].filter((fid) => !groupMemberIds.includes(fid));

  return (
    <div>
      <PageHeader
        kicker="Salle & messages"
        title="Amis & groupes"
        text="Cliquez sur un ami pour ouvrir sa page profil complète, ou lancez une discussion directe ou de groupe."
      />
      <div className="mb-4 space-y-3">
        <ErrorNote message={error} />
        {notice ? <p className="text-sm text-emerald-400">{notice}</p> : null}
      </div>
      <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <section className="space-y-8">
          <div>
            <label className="text-sm text-zinc-300">
              Rechercher un pseudo
              <input className={`${inputClass} mt-2`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="pseudo" />
            </label>
            <div className="mt-3 space-y-2">
              {found.map((profile) => {
                const pending = outgoing.has(profile.id);
                const friend = friendIds.has(profile.id);
                return (
                  <div key={profile.id} className="flex items-center gap-3 border border-white/10 p-3">
                    <Link href={`/membre/${profile.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80">
                      <Avatar name={profile.username || profile.full_name || "M"} url={profile.avatar_url} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-[#f4f1ea] hover:underline">
                          {profile.username || profile.full_name}
                        </p>
                        <p className="truncate text-xs text-zinc-500">{profile.bio || "Voir le profil"}</p>
                      </div>
                    </Link>
                    <button
                      type="button"
                      className={`${ghostClass} px-2 py-1.5 text-xs`}
                      disabled={friend || pending}
                      onClick={() => addFriend(profile)}
                    >
                      {friend ? "Ami" : pending ? "Envoyée" : "Ajouter"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {incoming.length > 0 ? (
            <div>
              <h2 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                Demandes
                <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{incoming.length}</span>
              </h2>
              <div className="mt-3 space-y-2">
                {incoming.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 border border-white/10 p-3 text-sm">
                    <Link href={`/membre/${row.requester_id}`} className="hover:underline">
                      {personName(row.requester_id)}
                    </Link>
                    <span className="flex gap-2">
                      <button type="button" className="text-emerald-400" onClick={() => respond(row.id, true)}>
                        Accepter
                      </button>
                      <button type="button" className="text-zinc-500" onClick={() => respond(row.id, false)}>
                        Refuser
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Amis</h2>
            <div className="mt-3 space-y-2">
              {accepted.map((row) => {
                const id = row.requester_id === user?.id ? row.addressee_id : row.requester_id;
                const profile = people[id];
                const unread = unreadByFriend[id] ?? 0;
                const isDmActive = activeChat?.kind === "dm" && activeChat.friendId === id;

                return (
                  <div
                    key={row.id}
                    className={`flex items-center gap-2 border p-2.5 text-sm ${
                      isDmActive ? "border-white/40 bg-white/[0.04]" : "border-white/10"
                    }`}
                  >
                    <input
                      type="checkbox"
                      title="Sélectionner pour créer un groupe"
                      checked={memberIds.includes(id)}
                      onChange={(event) =>
                        setMemberIds((prev) => (event.target.checked ? [...prev, id] : prev.filter((value) => value !== id)))
                      }
                    />
                    <Link href={`/membre/${id}`} className="flex min-w-0 flex-1 items-center gap-2.5 hover:opacity-80">
                      <Avatar name={personName(id)} url={profile?.avatar_url} size={32} />
                      <span className="truncate font-medium text-[#f4f1ea] hover:underline">{personName(id)}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => setActiveChat({ kind: "dm", friendId: id })}
                      className="relative inline-flex items-center gap-1 border border-white/15 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-white/40"
                      title="Message direct"
                    >
                      <MessageCircle size={13} />
                      <span>Chat</span>
                      {unread > 0 ? (
                        <span className="ml-1 rounded-full bg-red-600 px-1.5 py-0.2 text-[10px] font-bold text-white">
                          {unread}
                        </span>
                      ) : null}
                    </button>
                  </div>
                );
              })}
              {accepted.length === 0 ? <p className="text-sm text-zinc-500">Aucun ami pour le moment.</p> : null}
            </div>
          </div>

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void createGroup();
            }}
          >
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Nouveau groupe</h2>
            <input className={inputClass} value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Nom du groupe" />
            <button type="submit" className={buttonClass}>
              Créer
            </button>
            <p className="text-xs leading-5 text-zinc-500">Cochez les amis ci-dessus pour les ajouter au groupe.</p>
          </form>

          <div>
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Groupes</h2>
            <div className="mt-3 space-y-2">
              {groups.map((group) => {
                const isGroupActive = activeChat?.kind === "group" && activeChat.id === group.id;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setActiveChat({ kind: "group", id: group.id })}
                    className={`flex w-full items-center gap-3 border px-3 py-2.5 text-left text-sm ${
                      isGroupActive ? "border-white/40 bg-white/[0.04] text-[#f4f1ea]" : "border-white/10 text-zinc-300"
                    }`}
                  >
                    <Avatar name={group.name} url={group.avatar_url} size={32} />
                    <span className="truncate font-medium">{group.name}</span>
                  </button>
                );
              })}
              {groups.length === 0 ? <p className="text-sm text-zinc-500">Aucun groupe.</p> : null}
            </div>
          </div>
        </section>

        {/* Zone de conversation droite (Groupe OU Message Direct 1-à-1) */}
        <section className="flex min-h-[560px] flex-col border border-white/10">
          {activeGroup ? (
            <>
              <header className="border-b border-white/10 px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <Avatar name={activeGroup.name} url={activeGroup.avatar_url} size={46} />
                    <div>
                      <h2 className="font-serif text-2xl text-[#f4f1ea] sm:text-3xl">{activeGroup.name}</h2>
                      <p className="text-xs text-zinc-400">
                        {groupMemberIds.length} membre{groupMemberIds.length > 1 ? "s" : ""} ·{" "}
                        {groupMemberIds.map((id) => (id === user?.id ? "Moi" : personName(id))).join(", ")}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGroupSettingsOpen((v) => !v)}
                    className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs transition ${
                      groupSettingsOpen
                        ? "border-white/40 bg-white/10 text-white"
                        : "border-white/15 text-zinc-300 hover:border-white/40"
                    }`}
                  >
                    <Settings size={14} />
                    Gérer
                  </button>
                </div>

                {/* Panneau de gestion du groupe (Photo, Nom, Ajouter membre, Quitter) */}
                {groupSettingsOpen ? (
                  <div className="mt-4 space-y-4 border-t border-white/10 pt-4 text-xs">
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="inline-flex cursor-pointer items-center gap-2 border border-white/20 px-3 py-2 text-zinc-200 hover:border-white/40">
                        <Camera size={14} />
                        <span>{uploadingGroupAvatar ? "Envoi..." : "Changer la photo du groupe"}</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
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
                          className="w-full max-w-xs border border-white/15 bg-zinc-950 px-2.5 py-1.5 text-xs text-white"
                        />
                        <button
                          type="button"
                          onClick={renameActiveGroup}
                          className="inline-flex items-center gap-1 bg-[#f4f1ea] px-3 py-1.5 font-semibold text-[#09090b]"
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
                            className="border border-white/15 bg-zinc-950 px-2.5 py-1.5 text-xs text-white"
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
                            onClick={addMemberToActiveGroup}
                            className="border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 font-medium text-emerald-300 disabled:opacity-40"
                          >
                            Ajouter
                          </button>
                        </div>
                      ) : (
                        <span className="text-zinc-500">Tous vos amis sont déjà dans ce groupe.</span>
                      )}

                      <button
                        type="button"
                        onClick={leaveActiveGroup}
                        className="inline-flex items-center gap-1.5 border border-red-500/40 px-3 py-1.5 text-red-400 hover:bg-red-500/10"
                      >
                        <LogOut size={13} />
                        Quitter le groupe
                      </button>
                    </div>
                  </div>
                ) : null}
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {feed.map((item, idx) => {
                  const mine = item.user_id === user?.id;
                  const dayLabel = formatDayLabel(item.created_at);
                  const prevDayLabel = idx > 0 ? formatDayLabel(feed[idx - 1].created_at) : null;
                  const showDayDivider = dayLabel !== prevDayLabel;

                  return (
                    <div key={`${item.kind}-${item.id}`} className="space-y-3">
                      {showDayDivider ? (
                        <div className="my-2 flex justify-center">
                          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
                            {dayLabel}
                          </span>
                        </div>
                      ) : null}

                      <article className={`flex flex-col ${mine ? "ml-10 items-end" : "mr-10 items-start"}`}>
                        <div className="mb-1 flex items-center gap-2 text-[11px] text-zinc-500">
                          {mine ? (
                            <span>Moi</span>
                          ) : (
                            <Link href={`/membre/${item.user_id}`} className="font-medium text-zinc-300 hover:underline">
                              {personName(item.user_id)}
                            </Link>
                          )}
                          <span>· {formatTime(item.created_at)}</span>
                        </div>

                        {item.kind === "message" ? (
                          <div
                            className={`max-w-md border px-3.5 py-2 text-sm leading-6 ${
                              mine
                                ? "border-white/25 bg-white/[0.06] text-[#f4f1ea]"
                                : "border-white/10 bg-zinc-950 text-zinc-200"
                            }`}
                          >
                            {item.body}
                          </div>
                        ) : (
                          <figure className="max-w-sm overflow-hidden border border-white/15">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item.image_url} alt={item.caption || "Photo de séance"} className="max-h-72 w-full object-cover" />
                          </figure>
                        )}
                      </article>
                    </div>
                  );
                })}
                {feed.length === 0 ? <p className="text-sm text-zinc-500">La conversation est vide.</p> : null}
                <div ref={endRef} />
              </div>

              <form
                className="flex gap-2 border-t border-white/10 p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage();
                }}
              >
                <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center border border-white/15 text-zinc-300" aria-label="Partager une photo">
                  <ImagePlus size={16} />
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    onChange={(event) => {
                      void sendPhoto(event.target.files?.[0] ?? null);
                      event.target.value = "";
                    }}
                  />
                </label>
                <input
                  className={inputClass}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Écrire au groupe"
                  maxLength={2000}
                />
                <button type="submit" className={buttonClass} aria-label="Envoyer">
                  <Send size={16} />
                </button>
              </form>
            </>
          ) : activeFriend ? (
            <>
              <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <Link href={`/membre/${activeFriend.id}`} className="flex items-center gap-3 hover:opacity-80">
                  <Avatar name={personName(activeFriend.id)} url={activeFriend.avatar_url} size={42} />
                  <div>
                    <h2 className="font-serif text-2xl text-[#f4f1ea] hover:underline">{personName(activeFriend.id)}</h2>
                    <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Message direct · Voir son profil complet</p>
                  </div>
                </Link>
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {dmFeed.map((msg, idx) => {
                  const mine = msg.sender_id === user?.id;
                  const dayLabel = formatDayLabel(msg.created_at);
                  const prevDayLabel = idx > 0 ? formatDayLabel(dmFeed[idx - 1].created_at) : null;
                  const showDayDivider = dayLabel !== prevDayLabel;

                  return (
                    <div key={msg.id} className="space-y-3">
                      {showDayDivider ? (
                        <div className="my-2 flex justify-center">
                          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
                            {dayLabel}
                          </span>
                        </div>
                      ) : null}

                      <article className={`flex flex-col ${mine ? "ml-10 items-end" : "mr-10 items-start"}`}>
                        <p className="mb-1 text-[11px] text-zinc-500">
                          {mine ? "Moi" : personName(msg.sender_id)} · {formatTime(msg.created_at)}
                        </p>

                        {msg.movie_title ? (
                          <div className="flex max-w-md gap-3 border border-emerald-500/30 bg-emerald-950/15 p-3">
                            {msg.poster_path ? (
                              <div className="w-14 shrink-0 overflow-hidden border border-white/10">
                                <Poster path={msg.poster_path} alt={msg.movie_title} className="aspect-[2/3] w-full" />
                              </div>
                            ) : null}
                            <div className="flex-1 space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Invitation séance</p>
                              <p className="text-sm text-white">{msg.body}</p>
                              {msg.invite_status === "pending" && !mine ? (
                                <div className="flex gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => respondToInvite(msg.id, "accepted")}
                                    className="bg-emerald-400 px-3 py-1 text-xs font-semibold text-zinc-950"
                                  >
                                    Chaud !
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => respondToInvite(msg.id, "declined")}
                                    className="border border-white/20 px-3 py-1 text-xs text-zinc-300"
                                  >
                                    Pas ce soir
                                  </button>
                                </div>
                              ) : msg.invite_status === "accepted" ? (
                                <p className="text-xs font-semibold text-emerald-400">✓ Séance validée (« Chaud ! »)</p>
                              ) : msg.invite_status === "declined" ? (
                                <p className="text-xs text-zinc-500">✕ Décliné (« Pas ce soir »)</p>
                              ) : (
                                <p className="text-xs text-zinc-400">En attente de réponse...</p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`max-w-md border px-3.5 py-2 text-sm leading-6 ${
                              mine
                                ? "border-white/25 bg-white/[0.06] text-[#f4f1ea]"
                                : "border-white/10 bg-zinc-950 text-zinc-200"
                            }`}
                          >
                            {msg.body}
                          </div>
                        )}
                      </article>
                    </div>
                  );
                })}
                {dmFeed.length === 0 ? (
                  <p className="text-sm text-zinc-500">Démarrez votre discussion privée avec {personName(activeFriend.id)}.</p>
                ) : null}
                <div ref={endRef} />
              </div>

              <form
                className="flex gap-2 border-t border-white/10 p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage();
                }}
              >
                <input
                  className={inputClass}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={`Écrire un message à ${personName(activeFriend.id)}...`}
                  maxLength={2000}
                />
                <button type="submit" className={buttonClass} aria-label="Envoyer">
                  <Send size={16} />
                </button>
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center px-8 text-center text-sm leading-6 text-zinc-500">
              Cliquez sur « Chat » à côté d&apos;un ami pour lui envoyer un message direct, ou sélectionnez un groupe.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}