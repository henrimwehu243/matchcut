"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Clapperboard,
  Film,
  Layers,
  Loader2,
  Plus,
  SkipForward,
  Sparkles,
  Users,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Avatar, ErrorNote, buttonClass, ghostClass, inputClass } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import type { Group, Profile } from "@/lib/types";

type Step = "intro" | "tastes" | "summary";

const GENRE_THEMES = [
  "Drame",
  "Sci-Fi",
  "Thriller",
  "Comédie",
  "Animation / Anime",
  "Action",
  "Horreur",
  "Aventure",
  "Mystère",
  "Romance",
];

const CURATED_PICKS = [
  { id: "inception", label: "Inception (Film)", kind: "Film" },
  { id: "dune-2", label: "Dune: Deuxième Partie (Film)", kind: "Film" },
  { id: "parasite", label: "Parasite (Film)", kind: "Film" },
  { id: "spirited-away", label: "Le Voyage de Chihiro (Anime)", kind: "Anime" },
  { id: "dark", label: "Dark (Série)", kind: "Série" },
  { id: "severence", label: "Severance (Série)", kind: "Série" },
  { id: "interstellar", label: "Interstellar (Film)", kind: "Film" },
  { id: "the-bear", label: "The Bear (Série)", kind: "Série" },
  { id: "spider-verse", label: "Spider-Man: Across the Spider-Verse (Anime)", kind: "Anime" },
  { id: "whiplash", label: "Whiplash (Film)", kind: "Film" },
];

export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const { user, profile } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>("intro");
  const [selectedTastes, setSelectedTastes] = useState<string[]>([]);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSocialOverview = useCallback(async () => {
    if (!user) return;
    setError(null);

    const { data: links } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id, status")
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    const friendIds = [
      ...new Set(
        (links ?? []).map((row) =>
          row.requester_id === user.id ? (row.addressee_id as string) : (row.requester_id as string),
        ),
      ),
    ];

    if (friendIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, bio, updated_at, created_at")
        .in("id", friendIds);
      setFriends((profs as Profile[]) ?? []);
    } else {
      setFriends([]);
    }

    const { data: groupRows } = await supabase
      .from("groups")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(12);
    setGroups((groupRows as Group[]) ?? []);
  }, [user]);

  useEffect(() => {
    if (step === "summary") {
      void loadSocialOverview();
    }
  }, [step, loadSocialOverview]);

  function toggleTaste(label: string) {
    setError(null);
    setSelectedTastes((prev) => {
      if (prev.includes(label)) {
        return prev.filter((item) => item !== label);
      }
      if (prev.length >= 10) {
        setError("Vous pouvez sélectionner jusqu'à 10 préférences maximum.");
        return prev;
      }
      return [...prev, label];
    });
  }

  function savePreferencesAndContinue(skipped: boolean) {
    if (!user) return;
    const finalPrefs = skipped ? [] : selectedTastes.slice(0, 10);
    window.localStorage.setItem(`matchcut_taste_prefs_${user.id}`, JSON.stringify(finalPrefs));
    setStep("summary");
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!user || newGroupName.trim().length < 2 || creatingGroup) return;
    setCreatingGroup(true);
    setError(null);
    setNotice(null);

    try {
      const { data: created, error: groupErr } = await supabase
        .from("groups")
        .insert({ name: newGroupName.trim(), created_by: user.id })
        .select("*")
        .single();

      if (groupErr || !created) {
        setError(groupErr?.message || "Impossible de créer le groupe.");
        return;
      }

      const { error: memErr } = await supabase
        .from("group_members")
        .insert({ group_id: created.id, user_id: user.id, role: "owner" });

      if (memErr) {
        setError(memErr.message);
        return;
      }

      setNewGroupName("");
      setNotice(`Groupe « ${created.name} » créé.`);
      await loadSocialOverview();
    } finally {
      setCreatingGroup(false);
    }
  }

  async function handleJoinGroup(group: Group) {
    if (!user || joiningGroupId) return;
    setJoiningGroupId(group.id);
    setError(null);
    setNotice(null);

    try {
      const { error: joinErr } = await supabase
        .from("group_members")
        .upsert(
          { group_id: group.id, user_id: user.id, role: "member" },
          { onConflict: "group_id,user_id", ignoreDuplicates: true },
        );

      if (joinErr) {
        setError(joinErr.message);
        return;
      }

      setNotice(`Vous avez rejoint le groupe « ${group.name} ».`);
      await loadSocialOverview();
    } finally {
      setJoiningGroupId(null);
    }
  }

  function finishTo(targetPath: "/catalogue" | "/decider") {
    if (user) {
      window.localStorage.setItem(`matchcut_onboarding_done_${user.id}`, "1");
    }
    onComplete();
    router.push(targetPath);
  }

  const displayName = profile?.full_name || profile?.username || "Cinéphile";
  const handleText = profile?.username ? `@${profile.username}` : "Pseudo à compléter";

  return (
    <div className="mx-auto max-w-3xl py-4 sm:py-8">
      <div className="mb-6 flex items-center justify-between text-xs text-zinc-400">
        <span className="inline-flex items-center gap-1.5 font-medium text-amber-300">
          <Sparkles size={14} />
          Bienvenue sur MatchCut
        </span>
        <span>
          Étape {step === "intro" ? "1 / 3" : step === "tastes" ? "2 / 3" : "3 / 3"}
        </span>
      </div>

      <div className="space-y-3">
        <ErrorNote message={error} />
        {notice ? <p className="text-sm text-emerald-400">{notice}</p> : null}
      </div>

      {step === "intro" ? (
        <div className="mt-4 rounded-2xl border border-white/12 bg-white/[0.025] p-6 sm:p-8">
          <h1 className="font-serif text-4xl tracking-tight text-[#f4f1ea] sm:text-5xl">
            Fini les soirées à hésiter pendant une heure.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-zinc-300 sm:text-base">
            MatchCut réunit vos envies de films, séries et animés avec celles de vos amis. Swipez chacun de votre côté,
            repérez vos matchs, partagez vos listes et lancez vos séances ensemble.
          </p>

          <div className="mt-6 grid gap-3.5 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/25 p-4">
              <Clapperboard size={18} className="text-amber-400" />
              <h2 className="mt-2.5 text-sm font-semibold text-[#f4f1ea]">Swipe &amp; match</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-400">
                Choisissez ensemble ce qui vous tente vraiment pour ce soir.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 p-4">
              <Layers size={18} className="text-amber-400" />
              <h2 className="mt-2.5 text-sm font-semibold text-[#f4f1ea]">Listes &amp; avis</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-400">
                Gardez vos idées « À voir », notez ce que vous avez vu et échangez des conseils.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 p-4">
              <Users size={18} className="text-amber-400" />
              <h2 className="mt-2.5 text-sm font-semibold text-[#f4f1ea]">Amis &amp; groupes</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-400">
                Discutez en groupe ou en message privé et organisez vos séances.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => savePreferencesAndContinue(true)}
              className={ghostClass}
            >
              <SkipForward size={15} />
              Passer l&apos;étape des goûts
            </button>
            <button type="button" onClick={() => setStep("tastes")} className={buttonClass}>
              Choisir mes préférences
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {step === "tastes" ? (
        <div className="mt-4 rounded-2xl border border-white/12 bg-white/[0.025] p-6 sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="font-serif text-3xl tracking-tight text-[#f4f1ea] sm:text-4xl">
              Tes envies du moment (5 à 10 choix)
            </h1>
            <span className="text-xs font-medium text-amber-300">
              {selectedTastes.length} sélectionné{selectedTastes.length > 1 ? "s" : ""} (max 10)
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Sélectionne entre 5 et 10 thèmes, genres ou titres pour affiner tes premières recommandations. Ces choix ne
            sont pas ajoutés automatiquement à tes listes « À voir » ou « Vus ».
          </p>

          <div className="mt-6">
            <h2 className="text-xs font-semibold text-zinc-300">Genres &amp; thèmes</h2>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {GENRE_THEMES.map((genre) => {
                const picked = selectedTastes.includes(genre);
                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => toggleTaste(genre)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-medium transition ${
                      picked
                        ? "border-amber-300 bg-amber-400/15 text-amber-200"
                        : "border-white/12 bg-black/25 text-zinc-300 hover:border-white/30"
                    }`}
                  >
                    {picked ? <Check size={13} /> : <Plus size={13} />}
                    {genre}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
              <Film size={13} className="text-amber-400" />
              Quelques repères (films, séries, animés)
            </h2>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {CURATED_PICKS.map((item) => {
                const picked = selectedTastes.includes(item.label);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleTaste(item.label)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition ${
                      picked
                        ? "border-amber-300 bg-amber-400/15 text-amber-200"
                        : "border-white/12 bg-black/25 text-zinc-300 hover:border-white/30"
                    }`}
                  >
                    {picked ? <Check size={13} /> : <Plus size={13} />}
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => savePreferencesAndContinue(true)}
              className={ghostClass}
            >
              <SkipForward size={15} />
              Passer
            </button>
            <button
              type="button"
              onClick={() => savePreferencesAndContinue(false)}
              className={buttonClass}
            >
              {selectedTastes.length < 5
                ? `Continuer (${selectedTastes.length}/5 conseillés)`
                : "Enregistrer mes préférences"}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {step === "summary" ? (
        <div className="mt-4 space-y-6 rounded-2xl border border-white/12 bg-white/[0.025] p-6 sm:p-8">
          <div>
            <h1 className="font-serif text-3xl tracking-tight text-[#f4f1ea] sm:text-4xl">
              Tout est prêt, {displayName}
            </h1>
            <p className="mt-1.5 text-sm text-zinc-400">
              Voici le résumé de ton espace avant de te lancer.
            </p>
          </div>

          {/* Profil créé */}
          <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/25 p-4">
            <Avatar name={displayName} url={profile?.avatar_url} size={56} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-serif text-2xl text-[#f4f1ea]">{displayName}</p>
              <p className="text-xs text-amber-300/90">{handleText}</p>
              {profile?.bio ? <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{profile.bio}</p> : null}
            </div>
          </div>

          {/* Amis ajoutés */}
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <h2 className="text-xs font-semibold text-zinc-300">Amis ajoutés ({friends.length})</h2>
            {friends.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2.5">
                {friends.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-200"
                  >
                    <Avatar name={f.full_name || f.username || "A"} url={f.avatar_url} size={24} />
                    <span>{f.full_name || f.username}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-zinc-400">
                Aucun ami ajouté pour l&apos;instant — tu pourras en inviter ou en rechercher dans l&apos;onglet Groupes.
              </p>
            )}
          </div>

          {/* Créer ou rejoindre un groupe */}
          <div className="space-y-4 rounded-2xl border border-white/10 bg-black/25 p-4">
            <h2 className="text-xs font-semibold text-zinc-300">Créer ou rejoindre un groupe</h2>
            <form onSubmit={(e) => void handleCreateGroup(e)} className="flex flex-wrap gap-2">
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Nom d'un nouveau groupe (ex. Ciné du vendredi)"
                className={`${inputClass} flex-1`}
              />
              <button
                type="submit"
                disabled={creatingGroup || newGroupName.trim().length < 2}
                className={buttonClass}
              >
                {creatingGroup ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                Créer
              </button>
            </form>

            {groups.length > 0 ? (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-zinc-400">Groupes disponibles :</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {groups.slice(0, 6).map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs"
                    >
                      <span className="truncate font-medium text-zinc-200">{g.name}</span>
                      <button
                        type="button"
                        disabled={joiningGroupId === g.id}
                        onClick={() => void handleJoinGroup(g)}
                        className={`${ghostClass} px-2.5 py-1 text-xs`}
                      >
                        {joiningGroupId === g.id ? "..." : "Rejoindre"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Accès direct Catalogue & Swipe Deck */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <button type="button" onClick={() => finishTo("/catalogue")} className={ghostClass}>
              Explorer le Catalogue
            </button>
            <button type="button" onClick={() => finishTo("/decider")} className={buttonClass}>
              Ouvrir le Swipe Deck
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}