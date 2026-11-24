export type Stats = {
  hasProfile: boolean;
  swipes: number;
  ratings: number;
  toWatch: number;
  watched: number;
  friends: number;
  groups: number;
  sent: number;
  matches: number;
};

export type BadgeDef = {
  id: string;
  name: string;
  detail: string;
  goal: number;
  icon: "clapper" | "star" | "bookmark" | "users" | "popcorn" | "heart" | "trophy" | "send" | "film";
  accent: string;
  value: (stats: Stats) => number;
};

export const BADGES: BadgeDef[] = [
  {
    id: "premiere",
    name: "Première coupe",
    detail: "Ouvrir son profil",
    goal: 1,
    icon: "clapper",
    accent: "border-amber-400/50 bg-amber-400/10 text-amber-300",
    value: (stats) => (stats.hasProfile ? 1 : 0),
  },
  {
    id: "critique",
    name: "Critique",
    detail: "Noter un titre",
    goal: 1,
    icon: "star",
    accent: "border-yellow-400/50 bg-yellow-400/10 text-yellow-300",
    value: (stats) => stats.ratings,
  },
  {
    id: "programmation",
    name: "Programmation",
    detail: "Cinq titres à voir",
    goal: 5,
    icon: "bookmark",
    accent: "border-sky-400/50 bg-sky-400/10 text-sky-300",
    value: (stats) => stats.toWatch,
  },
  {
    id: "cercle",
    name: "Cercle",
    detail: "Un ami dans la salle",
    goal: 1,
    icon: "users",
    accent: "border-emerald-400/50 bg-emerald-400/10 text-emerald-300",
    value: (stats) => stats.friends,
  },
  {
    id: "salle",
    name: "Salle",
    detail: "Rejoindre un groupe",
    goal: 1,
    icon: "popcorn",
    accent: "border-orange-400/50 bg-orange-400/10 text-orange-300",
    value: (stats) => stats.groups,
  },
  {
    id: "accord",
    name: "Accord",
    detail: "Un match collectif",
    goal: 1,
    icon: "heart",
    accent: "border-rose-400/50 bg-rose-400/10 text-rose-300",
    value: (stats) => stats.matches,
  },
  {
    id: "archiviste",
    name: "Archiviste",
    detail: "Dix titres vus",
    goal: 10,
    icon: "trophy",
    accent: "border-amber-300/60 bg-amber-300/15 text-amber-200",
    value: (stats) => stats.watched,
  },
  {
    id: "passeur",
    name: "Passeur",
    detail: "Cinq recommandations",
    goal: 5,
    icon: "send",
    accent: "border-violet-400/50 bg-violet-400/10 text-violet-300",
    value: (stats) => stats.sent,
  },
  {
    id: "montage",
    name: "Montage",
    detail: "Vingt-cinq décisions",
    goal: 25,
    icon: "film",
    accent: "border-teal-400/50 bg-teal-400/10 text-teal-300",
    value: (stats) => stats.swipes,
  },
];