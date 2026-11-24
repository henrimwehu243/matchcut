"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { WatchSessionsPanel } from "@/components/sessions/watch-sessions-panel";
import { PageHeader } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import type { Group, Profile } from "@/lib/types";

export default function SessionsPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("solo");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: memberships } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id);
      const gIds = (memberships ?? []).map((m) => m.group_id as string);
      if (gIds.length > 0) {
        const { data: gRows } = await supabase.from("groups").select("*").in("id", gIds);
        const list = (gRows as Group[]) ?? [];
        setGroups(list);
        if (list.length > 0) {
          setSelectedGroupId(list[0].id);
        }
      }

      const { data: links } = await supabase
        .from("friendships")
        .select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      const friendIds = (links ?? []).map((row) =>
        row.requester_id === user.id ? (row.addressee_id as string) : (row.requester_id as string),
      );
      const allIds = [...new Set([user.id, ...friendIds])];
      if (allIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url, bio, updated_at, created_at")
          .in("id", allIds);
        const map: Record<string, Profile> = {};
        ((profs as Profile[]) ?? []).forEach((p) => {
          map[p.id] = p;
        });
        setPeople(map);
        setMemberIds(allIds);
      }
    })();
  }, [user]);

  const activeGroup = groups.find((g) => g.id === selectedGroupId) ?? null;
  const effectiveGroupId = activeGroup ? activeGroup.id : `personal_${user?.id ?? "default"}`;
  const effectiveGroupName = activeGroup ? activeGroup.name : "Ma soirée";

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Séances collectives"
        title="Sessions"
        text="Crée une session, fixe une date et une deadline, vote pour le film, lance le compte à rebours et archive la séance."
      />

      {notice ? <p className="text-sm text-emerald-400">{notice}</p> : null}

      {groups.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-zinc-400">Espace :</span>
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setSelectedGroupId(g.id)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                selectedGroupId === g.id
                  ? "bg-[#f4f1ea] text-[#09090b]"
                  : "border border-white/15 bg-white/[0.02] text-zinc-300 hover:border-white/35"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      ) : null}

      {user ? (
        <WatchSessionsPanel
          groupId={effectiveGroupId}
          groupName={effectiveGroupName}
          memberIds={memberIds}
          people={people}
          onNotice={(msg) => setNotice(msg)}
        />
      ) : null}
    </div>
  );
}