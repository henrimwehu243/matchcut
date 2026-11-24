"use client";

import Link from "next/link";

const READY_GAMES = [
  {
    href: "/jeu/imposter",
    tag: "3 à 10 joueurs · Sur place ou En ligne",
    title: "L'Imposteur",
    desc: "Un ou plusieurs imposteurs bluffent sur une œuvre du catalogue ou un mot concret. Indices, débat, vote et salon.",
    badge: "Disponible",
  },
];

const UPCOMING_GAMES = [
  {
    href: "/jeu/optimal",
    tag: "Stratégie & Estimation · Solo ou Multi",
    title: "Optimal",
    desc: "Trouve l'équilibre ou la réponse la plus proche de l'optimum sans te faire piéger. Précision, risque et sang-froid.",
    badge: "Bientôt",
  },
  {
    href: "/jeu/wordle",
    tag: "Quotidien · Films, Séries & Animés",
    title: "Ciné / Série / Animé Wordle",
    desc: "Devine l'œuvre mystère grâce aux indices progressifs et aux essais successifs.",
    badge: "Bientôt",
  },
  {
    href: "/jeu/clash",
    tag: "Débat & Classement · Entre amis",
    title: "Tier List Clash & Débat",
    desc: "Classe tes œuvres, défends tes choix et compare tes classements avec le groupe.",
    badge: "Bientôt",
  },
  {
    href: "/jeu/mot-interdit",
    tag: "Rapidité · Équipes",
    title: "Mot Interdit",
    desc: "Fais deviner un titre ou un mot sans jamais prononcer les mots clés interdits.",
    badge: "Bientôt",
  },
];

export default function JeuPage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-3.5 py-6 text-[#EAE6DE] sm:space-y-12 sm:px-6 sm:py-10">
      <header className="mx-auto max-w-2xl space-y-3 border-b border-[#EAE6DE]/12 pb-6 text-center sm:pb-8">
        <p className="mc-kicker text-[11px] text-[#C49A58] sm:text-xs">Salle de jeux · MatchCut</p>
        <h1 className="font-serif text-3xl tracking-tight sm:text-5xl">
          Jeu
        </h1>
        <p className="text-sm leading-relaxed text-[#EAE6DE]/65">
          Des formats courts et nerveux pour jouer entre amis ou en solo autour du catalogue et des mots.
        </p>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center justify-center border border-[#EAE6DE]/20 px-4 py-2 text-xs uppercase tracking-widest text-[#EAE6DE]/80 transition hover:border-[#C49A58] hover:text-[#C49A58]"
          >
            ← Retour à l&apos;accueil
          </Link>
        </div>
      </header>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="mc-kicker text-[11px] text-[#C49A58] sm:text-xs">À lancer maintenant</p>
          <span className="text-xs text-[#EAE6DE]/45">{READY_GAMES.length} jeu prêt</span>
        </div>

        <div className="grid gap-4 sm:gap-6">
          {READY_GAMES.map((game) => (
            <article
              key={game.href}
              className="flex flex-col justify-between gap-5 border border-[#C49A58]/35 bg-[#151719] p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-8"
            >
              <div className="max-w-2xl space-y-2">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className="mc-kicker text-[11px] text-[#C49A58] sm:text-xs">{game.tag}</span>
                  <span className="border border-[#C49A58]/40 bg-[#C49A58]/10 px-2.5 py-0.5 text-[10px] uppercase tracking-widest text-[#C49A58]">
                    {game.badge}
                  </span>
                </div>
                <h2 className="font-serif text-2xl text-[#EAE6DE] sm:text-3xl">{game.title}</h2>
                <p className="text-sm leading-relaxed text-[#EAE6DE]/70">{game.desc}</p>
              </div>

              <div className="w-full sm:w-auto sm:shrink-0">
                <Link
                  href={game.href}
                  className="flex min-h-[44px] w-full items-center justify-center bg-[#C49A58] px-6 py-3 text-xs font-semibold uppercase tracking-widest text-[#101112] transition hover:bg-[#d4ab68] sm:inline-flex sm:w-auto"
                >
                  Jouer
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2 border-t border-[#EAE6DE]/12 pt-6 sm:pt-8">
          <p className="mc-kicker text-[11px] text-[#EAE6DE]/60 sm:text-xs">À venir dans la salle</p>
          <span className="text-xs text-[#EAE6DE]/45">{UPCOMING_GAMES.length} formats prévus</span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
          {UPCOMING_GAMES.map((game) => (
            <article
              key={game.href}
              className="flex flex-col justify-between border border-[#EAE6DE]/12 bg-[#151719]/80 p-5 sm:p-6"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="mc-kicker text-[11px] text-[#C49A58]/80 sm:text-xs">{game.tag}</span>
                  <span className="border border-[#EAE6DE]/15 px-2.5 py-0.5 text-[10px] uppercase tracking-widest text-[#EAE6DE]/45">
                    {game.badge}
                  </span>
                </div>
                <h3 className="font-serif text-xl text-[#EAE6DE] sm:text-2xl">{game.title}</h3>
                <p className="text-sm leading-relaxed text-[#EAE6DE]/60">{game.desc}</p>
              </div>

              <div className="mt-5">
                <span className="inline-flex min-h-[36px] items-center border border-[#EAE6DE]/15 px-3.5 py-1.5 text-[11px] uppercase tracking-widest text-[#EAE6DE]/40">
                  En préparation
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}