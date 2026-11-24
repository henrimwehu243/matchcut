"use client";

import { useEffect, useState } from "react";
import { Award, Bookmark, Check, Clapperboard, Copy, Film, Heart, Loader2, Popcorn, Send, Star, Trophy, Users } from "lucide-react";
import { BADGES, type BadgeDef, type Stats } from "@/lib/badges";
import { useAuth } from "@/components/auth-provider";
import { Avatar, ErrorNote, PageHeader, buttonClass, inputClass } from "@/components/ui";
import { supabase } from "@/lib/supabase";

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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name || "");
    setUsername(profile?.username || "");
    setBio(profile?.bio || "");
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const [swipes, ratings, toWatch, watched, friends, groups, sent, memberships] = await Promise.all([
        supabase.from("swipes").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("watch_items").select("id", { count: "exact", head: true }).eq("user_id", user.id).not("rating", "is", null),
        supabase.from("watch_items").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "to_watch"),
        supabase.from("watch_items").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "watched"),
        supabase.from("friendships").select("id", { count: "exact", head: true }).eq("status", "accepted").or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
        supabase.from("group_members").select("group_id").eq("user_id", user.id),
        supabase.from("recommendations").select("id", { count: "exact", head: true }).eq("from_user_id", user.id),
        supabase.from("group_members").select("group_id").eq("user_id", user.id),
      ]);
      const firstError = [swipes.error, ratings.error, toWatch.error, watched.error, friends.error, groups.error, sent.error, memberships.error].find(Boolean);
      if (firstError) setError(firstError.message);
      const groupIds = (memberships.data ?? []).map((row) => row.group_id as string);
      let matches = 0;
      if (groupIds.length) {
        const matchResult = await supabase.from("matches").select("id", { count: "exact", head: true }).in("group_id", groupIds);
        if (matchResult.error) setError(matchResult.error.message);
        matches = matchResult.count ?? 0;
      }
      setStats({
        hasProfile: Boolean(profile),
        swipes: swipes.count ?? 0,
        ratings: ratings.count ?? 0,
        toWatch: toWatch.count ?? 0,
        watched: watched.count ?? 0,
        friends: friends.count ?? 0,
        groups: groups.data?.length ?? 0,
        sent: sent.count ?? 0,
        matches,
      });
    })();
  }, [profile, user]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
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
    setBusy(false);
    if (writeError) {
      setError(writeError.message);
      return;
    }
    await refreshProfile();
    setNotice("Profil mis à jour.");
  }

  async function uploadAvatar(file: File | null) {
    if (!user || !file) return;
    if (!file.type.startsWith("image/") || file.size > 5_000_000) {
      setError("Choisissez une image de moins de 5 Mo.");
      return;
    }
    setBusy(true);
    setError(null);
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const uploaded = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: true });
    if (uploaded.error) {
      setBusy(false);
      setError(uploaded.error.message);
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const { error: writeError } = await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
    setBusy(false);
    if (writeError) {
      setError(writeError.message);
      return;
    }
    await refreshProfile();
    setNotice("Photo mise à jour.");
  }

  function copyInviteLink() {
    const handle = (profile?.username || username || "").trim().toLowerCase();
    if (!handle || typeof window === "undefined") return;
    const link = `${window.location.origin}/invite/${encodeURIComponent(handle)}`;
    void navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
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

  return (
    <div className="max-w-4xl">
      <PageHeader kicker="Fiche" title="Profil" text="Nom, pseudo, bio, photo. Les trophées s’illuminent au fil de vos séances." />
      <div className="mb-6 space-y-3">
        <ErrorNote message={error} />
        {notice ? <p className="text-sm text-zinc-400">{notice}</p> : null}
      </div>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
        <form onSubmit={save} className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar name={fullName || username || "M"} url={profile?.avatar_url} size={84} />
            <label className="cursor-pointer text-sm text-zinc-300 underline decoration-white/20 underline-offset-4">
              Changer la photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  void uploadAvatar(event.target.files?.[0] ?? null);
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
            Bio
            <textarea className={`${inputClass} mt-2 min-h-28`} value={bio} maxLength={280} onChange={(event) => setBio(event.target.value)} />
          </label>
          {since ? <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Membre depuis {since}</p> : null}
          <button type="submit" className={buttonClass} disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            Enregistrer
          </button>
        </form>

        <aside className="space-y-8">
          {inviteHandle ? (
            <div className="border border-emerald-500/30 bg-emerald-500/[0.04] p-4">
              <h2 className="text-[11px] uppercase tracking-[0.22em] text-emerald-400">Inviter un ami</h2>
              <p className="mt-2 text-xs leading-5 text-zinc-300">
                Partage ce lien : dès que ton pote crée son compte, vous êtes automatiquement ajoutés en amis.
              </p>
              <button
                type="button"
                onClick={copyInviteLink}
                className="mt-3 flex w-full items-center justify-center gap-2 bg-[#f4f1ea] px-3 py-2.5 text-xs font-semibold text-[#09090b] transition hover:opacity-90"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Lien copié !" : "Copier mon lien d’invitation"}
              </button>
            </div>
          ) : null}

          <div>
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Statistiques</h2>
            <dl className="mt-4 grid grid-cols-2 gap-px bg-white/10">
              {figures.map(([label, value]) => (
                <div key={label} className="bg-[#09090b] px-3 py-3">
                  <dt className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">{label}</dt>
                  <dd className="mt-1 font-serif text-3xl text-[#f4f1ea]">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>
      </div>

      <section className="mt-12">
        <h2 className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Trophées &amp; badges</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BADGES.map((badge) => {
            const value = badge.value(stats);
            const unlocked = value >= badge.goal;
            return (
              <article
                key={badge.id}
                className={`border px-4 py-4 transition ${
                  unlocked ? badge.accent : "border-white/10 opacity-55"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className={unlocked ? "" : "text-zinc-500"}>
                      <BadgeIcon icon={badge.icon} />
                    </span>
                    <h3 className="font-serif text-2xl text-[#f4f1ea]">{badge.name}</h3>
                  </div>
                  <span className="text-xs font-medium opacity-80">
                    {Math.min(value, badge.goal)}/{badge.goal}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-300">{badge.detail}</p>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em]">
                  {unlocked ? "✦ Débloqué" : "En cours"}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}