"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const FALLBACK_CATALOG = [
  {
    id: 27205,
    title: "Inception",
    type: "Film",
    year: "2010",
    clue: "Un voleur s'infiltre dans les rêves pour implanter une idée.",
    poster: "https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg",
  },
  {
    id: 155,
    title: "The Dark Knight",
    type: "Film",
    year: "2008",
    clue: "Gotham face au chaos d'un criminel anarchiste au sourire marqué.",
    poster: "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
  },
  {
    id: 680,
    title: "Pulp Fiction",
    type: "Film",
    year: "1994",
    clue: "Des destins croisés dans le milieu criminel de Los Angeles, hors chronologie.",
    poster: "https://image.tmdb.org/t/p/w500/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg",
  },
  {
    id: 496243,
    title: "Parasite",
    type: "Film",
    year: "2019",
    clue: "Deux familles que tout oppose se retrouvent liées sous un même toit.",
    poster: "https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg",
  },
  {
    id: 372058,
    title: "Your Name",
    type: "Animé",
    year: "2016",
    clue: "Deux adolescents échangent leur corps à distance sans jamais s'être rencontrés.",
    poster: "https://image.tmdb.org/t/p/w500/q719jXXEzOoYaps6babgKQSORX8.jpg",
  },
  {
    id: 1396,
    title: "Breaking Bad",
    type: "Série",
    year: "2008",
    clue: "Un professeur de chimie bascule dans la fabrication de méthamphétamine.",
    poster: "https://image.tmdb.org/t/p/w500/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg",
  },
  {
    id: 66732,
    title: "Stranger Things",
    type: "Série",
    year: "2016",
    clue: "La disparition d'un garçon révèle une dimension parallèle inquiétante.",
    poster: "https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg",
  },
  {
    id: 31472,
    title: "Monster",
    type: "Animé",
    year: "2004",
    clue: "Un neurochirurgien traque un ancien patient devenu un tueur insaisissable.",
    poster: "https://image.tmdb.org/t/p/w500/2j8p93S7S5e2uB8B9nW1h1qG8X.jpg",
  },
  {
    id: 37854,
    title: "One Piece",
    type: "Animé",
    year: "1999",
    clue: "Un équipage de pirates navigue sur Grand Line à la recherche d'un trésor légendaire.",
    poster: "https://image.tmdb.org/t/p/w500/cMD9Ygz11zjJzAovURpO75Qg7rT.jpg",
  },
  {
    id: 94605,
    title: "Arcane",
    type: "Animé",
    year: "2021",
    clue: "Deux sœurs se retrouvent de part et d'autre d'une fracture entre deux cités.",
    poster: "https://image.tmdb.org/t/p/w500/fqldf2t8ztc9aiwn3k6mlX3tvRT.jpg",
  },
];

const LOGICAL_WORDS = [
  { id: "w-1", title: "Aéroport", type: "Hors catalogue", year: "Lieu", clue: "Avion, bagages, décollage." },
  { id: "w-2", title: "Boulangerie", type: "Hors catalogue", year: "Lieu", clue: "Pain, croissants, matin." },
  { id: "w-3", title: "Supermarché", type: "Hors catalogue", year: "Lieu", clue: "Rayons, caddie, caisse." },
  { id: "w-4", title: "Hôpital", type: "Hors catalogue", year: "Lieu", clue: "Médecins, soins, urgences." },
  { id: "w-5", title: "Cinéma", type: "Hors catalogue", year: "Lieu", clue: "Écran noir, pop-corn, séance." },
  { id: "w-6", title: "Bibliothèque", type: "Hors catalogue", year: "Lieu", clue: "Livres, silence, lecture." },
  { id: "w-7", title: "Stade", type: "Hors catalogue", year: "Lieu", clue: "Tribunes, match, supporters." },
  { id: "w-8", title: "Gare", type: "Hors catalogue", year: "Lieu", clue: "Quai, train, horaires." },
  { id: "w-9", title: "Restaurant", type: "Hors catalogue", year: "Lieu", clue: "Carte, serveur, assiette." },
  { id: "w-10", title: "Plage", type: "Hors catalogue", year: "Lieu", clue: "Sable, vagues, soleil." },
  { id: "w-11", title: "Parapluie", type: "Hors catalogue", year: "Objet", clue: "Pluie, toile, poignée." },
  { id: "w-12", title: "Valise", type: "Hors catalogue", year: "Objet", clue: "Voyage, roulettes, vêtements." },
  { id: "w-13", title: "Réveil", type: "Hors catalogue", year: "Objet", clue: "Heure, sonnerie, matin." },
  { id: "w-14", title: "Clé", type: "Hors catalogue", year: "Objet", clue: "Porte, serrure, trousseau." },
  { id: "w-15", title: "Lunettes", type: "Hors catalogue", year: "Objet", clue: "Verres, monture, vue." },
  { id: "w-16", title: "Boussole", type: "Hors catalogue", year: "Objet", clue: "Nord, aiguille, orientation." },
  { id: "w-17", title: "Casque audio", type: "Hors catalogue", year: "Objet", clue: "Musique, oreilles, son." },
  { id: "w-18", title: "Passeport", type: "Hors catalogue", year: "Objet", clue: "Frontière, photo, voyage." },
  { id: "w-19", title: "Pompier", type: "Hors catalogue", year: "Métier", clue: "Incendie, secours, caserne." },
  { id: "w-20", title: "Cuisinier", type: "Hors catalogue", year: "Métier", clue: "Recettes, fourneau, plats." },
  { id: "w-21", title: "Pilote", type: "Hors catalogue", year: "Métier", clue: "Cockpit, vol, commandes." },
  { id: "w-22", title: "Architecte", type: "Hors catalogue", year: "Métier", clue: "Plans, bâtiment, structure." },
  { id: "w-23", title: "Photographe", type: "Hors catalogue", year: "Métier", clue: "Objectif, lumière, cadre." },
  { id: "w-24", title: "Professeur", type: "Hors catalogue", year: "Métier", clue: "Cours, élèves, explication." },
  { id: "w-25", title: "Pizza", type: "Hors catalogue", year: "Nourriture", clue: "Pâte, fromage, parts." },
  { id: "w-26", title: "Café", type: "Hors catalogue", year: "Boisson", clue: "Tasse, chaud, réveil." },
  { id: "w-27", title: "Glace", type: "Hors catalogue", year: "Nourriture", clue: "Froid, cornet, été." },
  { id: "w-28", title: "Train", type: "Hors catalogue", year: "Transport", clue: "Rails, wagons, trajet." },
  { id: "w-29", title: "Vélo", type: "Hors catalogue", year: "Transport", clue: "Pédales, guidon, roues." },
  { id: "w-30", title: "Ascenseur", type: "Hors catalogue", year: "Quotidien", clue: "Étages, boutons, cabine." },
];

const DEFAULT_PLAYERS = ["Joueur 1", "Joueur 2", "Joueur 3", "Joueur 4"];

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function encodeRoomState(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeRoomState(token) {
  if (!token) return null;
  const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json);
}

export default function ImposterGamePage() {
  const [mode, setMode] = useState("local");
  const [phase, setPhase] = useState("setup");
  const [playerCount, setPlayerCount] = useState(4);
  const [players, setPlayers] = useState(DEFAULT_PLAYERS);
  const [imposterCount, setImposterCount] = useState(1);
  const [showClueToImposter, setShowClueToImposter] = useState(true);
  const [showPosters, setShowPosters] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("Hors catalogue");

  const [catalog, setCatalog] = useState([...FALLBACK_CATALOG, ...LOGICAL_WORDS]);
  const [targetTitle, setTargetTitle] = useState(null);
  const [imposterIndices, setImposterIndices] = useState([]);
  const [revealIndex, setRevealIndex] = useState(0);
  const [cardVisible, setCardVisible] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  const [votes, setVotes] = useState({});
  const [voterIndex, setVoterIndex] = useState(0);
  const [caughtImposter, setCaughtImposter] = useState(false);

  const [roomCode, setRoomCode] = useState("MC-7K4P");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [onlineRoleIndex, setOnlineRoleIndex] = useState(0);
  const [sharePayloadString, setSharePayloadString] = useState("");
  const [importPayloadInput, setImportPayloadInput] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const [chatMessages, setChatMessages] = useState([
    {
      id: "welcome",
      author: "Système",
      text: "Salon ouvert. Partage le code de partie aux autres joueurs puis discutez ici avant le vote.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");

  useEffect(() => {
    let active = true;
    async function loadTmdbTitles() {
      try {
        const res = await fetch("/api/tmdb?path=movie/popular&page=1");
        if (!res.ok) return;
        const data = await res.json();
        const results = Array.isArray(data?.results) ? data.results : [];
        if (!active || results.length === 0) return;

        const mapped = results
          .filter((item) => item?.title)
          .slice(0, 18)
          .map((item) => ({
            id: item.id,
            title: item.title,
            type: "Film",
            year: item.release_date ? item.release_date.slice(0, 4) : "",
            clue: item.overview
              ? `${item.overview.slice(0, 110).trim()}${item.overview.length > 110 ? "..." : ""}`
              : "Titre issu du catalogue cinéma MatchCut.",
            poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
          }));

        if (mapped.length >= 6) {
          setCatalog([
            ...mapped,
            ...FALLBACK_CATALOG.filter((f) => f.type !== "Film"),
            ...LOGICAL_WORDS,
          ]);
        }
      } catch {
        // Garde le catalogue local et les mots logiques hors catalogue
      }
    }
    loadTmdbTitles();
    return () => {
      active = false;
    };
  }, []);

  const filteredCatalog = useMemo(() => {
    if (categoryFilter === "Tous") return catalog;
    const matches = catalog.filter((item) => item.type === categoryFilter);
    return matches.length > 0 ? matches : catalog;
  }, [catalog, categoryFilter]);

  const activePlayers = useMemo(() => {
    return players.slice(0, playerCount).map((name, idx) => {
      const cleaned = (name || "").trim();
      return cleaned || `Joueur ${idx + 1}`;
    });
  }, [players, playerCount]);

  function handlePlayerCountChange(nextCount) {
    const clamped = Math.max(3, Math.min(10, nextCount));
    setPlayerCount(clamped);
    setPlayers((prev) => {
      const copy = [...prev];
      while (copy.length < clamped) {
        copy.push(`Joueur ${copy.length + 1}`);
      }
      return copy;
    });
    if (imposterCount >= clamped) {
      setImposterCount(Math.max(1, clamped - 1));
    }
    if (onlineRoleIndex >= clamped) {
      setOnlineRoleIndex(0);
    }
  }

  function handlePlayerNameChange(index, value) {
    setPlayers((prev) => {
      const copy = [...prev];
      copy[index] = value;
      return copy;
    });
  }

  function startNewRound() {
    const pool = filteredCatalog;
    const chosen = pool[Math.floor(Math.random() * pool.length)] || LOGICAL_WORDS[0];

    const indices = Array.from({ length: activePlayers.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const maxImposters = Math.max(1, Math.min(imposterCount, activePlayers.length - 1));
    const selectedImposters = indices.slice(0, maxImposters);

    const newCode = `${generateRoomCode().slice(0, 2)}-${generateRoomCode().slice(0, 4)}`;
    setRoomCode(newCode);
    setTargetTitle(chosen);
    setImposterIndices(selectedImposters);
    setRevealIndex(0);
    setCardVisible(false);
    setPosterFailed(false);
    setVotes({});
    setVoterIndex(0);
    setCaughtImposter(false);
    setStatusMessage("");

    const encoded = encodeRoomState({
      roomCode: newCode,
      players: activePlayers,
      targetTitle: chosen,
      imposterIndices: selectedImposters,
      showClueToImposter,
    });
    setSharePayloadString(`${newCode}#${encoded}`);
    setPhase("reveal");
  }

  function handleRevealNext() {
    if (!cardVisible) {
      setCardVisible(true);
      return;
    }
    setCardVisible(false);
    if (revealIndex + 1 < activePlayers.length) {
      setRevealIndex((prev) => prev + 1);
    } else {
      setPhase("discussion");
    }
  }

  function handleCastVote(suspectIndex) {
    const nextVotes = {
      ...votes,
      [voterIndex]: suspectIndex,
    };
    setVotes(nextVotes);

    if (voterIndex + 1 < activePlayers.length) {
      setVoterIndex((prev) => prev + 1);
      return;
    }

    const tally = {};
    Object.values(nextVotes).forEach((targetIdx) => {
      tally[targetIdx] = (tally[targetIdx] || 0) + 1;
    });

    let topSuspect = null;
    let maxVotes = -1;
    Object.entries(tally).forEach(([idxStr, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        topSuspect = Number(idxStr);
      }
    });

    setCaughtImposter(topSuspect !== null && imposterIndices.includes(topSuspect));
    setPhase("result");
  }

  function handleApplyRoomCode() {
    const raw = joinCodeInput.trim();
    if (!raw) return;

    const hashIndex = raw.indexOf("#");
    if (hashIndex !== -1) {
      const codePart = raw.slice(0, hashIndex).trim().toUpperCase();
      const tokenPart = raw.slice(hashIndex + 1).trim();
      try {
        const parsed = decodeRoomState(tokenPart);
        if (parsed && Array.isArray(parsed.players) && parsed.targetTitle) {
          setRoomCode(codePart || parsed.roomCode || "SALON");
          setPlayerCount(parsed.players.length);
          setPlayers(parsed.players);
          setTargetTitle(parsed.targetTitle);
          setImposterIndices(Array.isArray(parsed.imposterIndices) ? parsed.imposterIndices : [0]);
          setShowClueToImposter(Boolean(parsed.showClueToImposter));
          setPosterFailed(false);
          setOnlineRoleIndex(0);
          setPhase("reveal");
          setStatusMessage("Salon synchronisé à partir du code partagé.");
          return;
        }
      } catch {
        setStatusMessage("Code de salon incomplet : vérifie le collage complet.");
        return;
      }
    }

    setRoomCode(raw.toUpperCase());
    setStatusMessage(`Salon ${raw.toUpperCase()} prêt. Colle un code de partie pour synchroniser les rôles.`);
  }

  function handleImportState() {
    const raw = importPayloadInput.trim();
    if (!raw) return;
    const tokenPart = raw.includes("#") ? raw.split("#")[1] : raw;
    try {
      const parsed = decodeRoomState(tokenPart.trim());
      if (!parsed || !Array.isArray(parsed.players) || !parsed.targetTitle) {
        setStatusMessage("Code de synchronisation invalide.");
        return;
      }
      setRoomCode(parsed.roomCode || roomCode);
      setPlayerCount(parsed.players.length);
      setPlayers(parsed.players);
      setTargetTitle(parsed.targetTitle);
      setImposterIndices(Array.isArray(parsed.imposterIndices) ? parsed.imposterIndices : [0]);
      setShowClueToImposter(Boolean(parsed.showClueToImposter));
      setPosterFailed(false);
      setOnlineRoleIndex(0);
      setPhase("reveal");
      setStatusMessage("Partie chargée avec succès.");
    } catch {
      setStatusMessage("Impossible de lire ce code de partie.");
    }
  }

  function handleSendChat(e) {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    const sender = activePlayers[onlineRoleIndex] || activePlayers[0] || "Joueur";
    setChatMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        author: sender,
        text: trimmed,
      },
    ]);
    setChatInput("");
  }

  function handleCopyCode(textToCopy) {
    if (!textToCopy || typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(textToCopy).then(
      () => setStatusMessage("Code copié dans le presse-papiers."),
      () => setStatusMessage("Sélectionne et copie le code manuellement.")
    );
  }

  function handleQuitToHub() {
    setPhase("setup");
    setCardVisible(false);
    setStatusMessage("");
  }

  const currentRevealPlayer = activePlayers[revealIndex] || "Joueur 1";
  const currentRevealIsImposter = imposterIndices.includes(revealIndex);
  const currentOnlinePlayer = activePlayers[onlineRoleIndex] || activePlayers[0];
  const currentOnlineIsImposter = imposterIndices.includes(onlineRoleIndex);

  const isMediaItem =
    targetTitle && ["Film", "Série", "Animé"].includes(targetTitle.type);
  const activePosterUrl =
    showPosters && !posterFailed && isMediaItem && targetTitle?.poster ? targetTitle.poster : "";

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-3.5 py-6 text-[#EAE6DE] sm:space-y-8 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EAE6DE]/12 pb-4 sm:pb-5">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Link
            href="/jeu"
            className="inline-flex min-h-[40px] items-center border border-[#EAE6DE]/20 px-3.5 py-2 text-[11px] uppercase tracking-widest text-[#EAE6DE]/80 transition hover:border-[#C49A58] hover:text-[#C49A58] sm:px-4 sm:text-xs"
          >
            ← Salle de jeux
          </Link>
          {phase !== "setup" && (
            <button
              type="button"
              onClick={handleQuitToHub}
              className="inline-flex min-h-[40px] items-center border border-[#EAE6DE]/15 bg-[#151719] px-3.5 py-2 text-[11px] uppercase tracking-widest text-[#EAE6DE]/70 transition hover:border-[#C49A58] hover:text-[#EAE6DE] sm:px-4 sm:text-xs"
            >
              Quitter la manche
            </button>
          )}
        </div>

        <span className="mc-kicker border border-[#C49A58]/40 px-2.5 py-1 text-[10px] text-[#C49A58] sm:px-3 sm:text-xs">
          Mini-jeu · MatchCut
        </span>
      </div>

      <header className="mx-auto max-w-2xl space-y-2 text-center">
        <p className="mc-kicker text-[11px] text-[#C49A58] sm:text-xs">Bluff, indices &amp; vote collectif</p>
        <h1 className="font-serif text-3xl tracking-tight text-[#EAE6DE] sm:text-5xl">
          L&apos;Imposteur
        </h1>
        <p className="text-sm leading-relaxed text-[#EAE6DE]/65">
          Joue avec les films, séries et animés ou choisis{" "}
          <span className="text-[#C49A58]">Hors catalogue</span> pour des mots concrets du quotidien.
        </p>
      </header>

      <section className="mx-auto grid max-w-xl grid-cols-1 gap-2 border border-[#EAE6DE]/12 bg-[#151719] p-1.5 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("local")}
          className={`min-h-[44px] px-4 py-2.5 text-xs font-semibold uppercase tracking-widest transition ${
            mode === "local"
              ? "bg-[#C49A58] text-[#101112]"
              : "text-[#EAE6DE]/65 hover:text-[#EAE6DE]"
          }`}
        >
          Sur place (même écran)
        </button>
        <button
          type="button"
          onClick={() => setMode("online")}
          className={`min-h-[44px] px-4 py-2.5 text-xs font-semibold uppercase tracking-widest transition ${
            mode === "online"
              ? "bg-[#C49A58] text-[#101112]"
              : "text-[#EAE6DE]/65 hover:text-[#EAE6DE]"
          }`}
        >
          En ligne &amp; Salon
        </button>
      </section>

      {mode === "online" && (
        <section className="mx-auto max-w-3xl space-y-5 border border-[#EAE6DE]/12 bg-[#151719] p-4 sm:p-6">
          <div className="flex flex-col justify-between gap-3 border-b border-[#EAE6DE]/10 pb-4 sm:flex-row sm:items-center">
            <div>
              <p className="mc-kicker text-[11px] text-[#C49A58] sm:text-xs">Salon en ligne</p>
              <h2 className="mt-1 font-serif text-xl text-[#EAE6DE] sm:text-2xl">
                Code : <span className="font-mono text-[#C49A58]">{roomCode}</span>
              </h2>
            </div>
            <button
              type="button"
              onClick={() => handleCopyCode(sharePayloadString || roomCode)}
              className="min-h-[42px] border border-[#EAE6DE]/20 px-4 py-2 text-xs uppercase tracking-widest text-[#EAE6DE]/85 transition hover:border-[#C49A58] hover:text-[#C49A58]"
            >
              Copier le code
            </button>
          </div>

          <p className="border border-[#EAE6DE]/10 bg-[#101112]/80 px-3.5 py-2.5 text-xs leading-relaxed text-[#EAE6DE]/60">
            Astuce multi-écrans : lance une manche pour générer le code complet, puis colle-le sur l&apos;autre appareil pour voir son rôle. Le fil ci-dessous permet d&apos;écrire ses indices et remarques sur l&apos;appareil actif.
          </p>

          {sharePayloadString && (
            <div className="border border-[#EAE6DE]/12 bg-[#101112] p-3">
              <p className="mc-kicker mb-1 text-[10px] text-[#EAE6DE]/50">Code complet à partager</p>
              <p className="break-all font-mono text-xs text-[#EAE6DE]/80">{sharePayloadString}</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <input
              type="text"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              placeholder="Colle un code de salon (ex: MC-7K4P ou code complet)"
              className="min-h-[44px] border border-[#EAE6DE]/15 bg-[#101112] px-3.5 py-2.5 text-sm text-[#EAE6DE] placeholder-[#EAE6DE]/35 focus:border-[#C49A58] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleApplyRoomCode}
              className="min-h-[44px] bg-[#C49A58] px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-[#101112] transition hover:bg-[#d4ab68]"
            >
              Rejoindre
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <input
              type="text"
              value={importPayloadInput}
              onChange={(e) => setImportPayloadInput(e.target.value)}
              placeholder="Coller un code de partie reçu pour synchroniser une manche"
              className="min-h-[44px] border border-[#EAE6DE]/15 bg-[#101112] px-3.5 py-2.5 text-sm text-[#EAE6DE] placeholder-[#EAE6DE]/35 focus:border-[#C49A58] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleImportState}
              className="min-h-[44px] border border-[#EAE6DE]/20 px-5 py-2.5 text-xs uppercase tracking-widest text-[#EAE6DE]/85 transition hover:border-[#C49A58] hover:text-[#C49A58]"
            >
              Charger la partie
            </button>
          </div>

          {targetTitle && (
            <div className="space-y-3 border-t border-[#EAE6DE]/12 pt-4">
              <p className="text-xs uppercase tracking-widest text-[#EAE6DE]/65">
                Ton pseudo dans le salon :
              </p>
              <div className="flex flex-wrap gap-2">
                {activePlayers.map((name, idx) => (
                  <button
                    key={`${name}-${idx}`}
                    type="button"
                    onClick={() => setOnlineRoleIndex(idx)}
                    className={`min-h-[38px] px-3.5 py-1.5 text-xs uppercase tracking-widest transition ${
                      onlineRoleIndex === idx
                        ? "bg-[#C49A58] font-semibold text-[#101112]"
                        : "border border-[#EAE6DE]/15 bg-[#101112] text-[#EAE6DE]/75 hover:border-[#C49A58]"
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="border border-[#EAE6DE]/12 bg-[#101112] p-4">
                <p className="text-xs text-[#EAE6DE]/60">Rôle de {currentOnlinePlayer} :</p>
                {currentOnlineIsImposter ? (
                  <div className="mt-1 space-y-1">
                    <p className="font-serif text-xl text-[#C49A58]">Tu es l&apos;Imposteur</p>
                    <p className="text-xs text-[#EAE6DE]/75">
                      {showClueToImposter
                        ? `Indice : ${targetTitle.clue}`
                        : "Aucun indice donné : improvise à partir des réponses des autres."}
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                    {activePosterUrl && (
                      <img
                        src={activePosterUrl}
                        alt={targetTitle.title}
                        onError={() => setPosterFailed(true)}
                        className="h-40 w-28 shrink-0 border border-[#EAE6DE]/12 object-cover"
                      />
                    )}
                    <div className="space-y-1 text-center sm:text-left">
                      <p className="font-serif text-2xl text-[#EAE6DE]">
                        {targetTitle.title}{" "}
                        <span className="text-sm font-sans text-[#C49A58]">({targetTitle.type})</span>
                      </p>
                      <p className="text-xs text-[#EAE6DE]/65">
                        Donne un indice subtil sans dire le mot ou le titre exact.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3 border-t border-[#EAE6DE]/12 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="mc-kicker text-[11px] text-[#C49A58] sm:text-xs">Fil de discussion du salon</p>
              <span className="text-[11px] text-[#EAE6DE]/45">
                En tant que {currentOnlinePlayer}
              </span>
            </div>

            <div className="max-h-48 space-y-2 overflow-y-auto border border-[#EAE6DE]/12 bg-[#101112] p-3">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="border-b border-[#EAE6DE]/8 pb-2 text-sm last:border-b-0 last:pb-0"
                >
                  <span className="text-xs font-semibold text-[#C49A58]">{msg.author} : </span>
                  <span className="text-[#EAE6DE]/85">{msg.text}</span>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendChat} className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_auto]">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Écris un indice ou accuse un suspect..."
                className="min-h-[44px] border border-[#EAE6DE]/15 bg-[#101112] px-3.5 py-2.5 text-sm text-[#EAE6DE] placeholder-[#EAE6DE]/35 focus:border-[#C49A58] focus:outline-none"
              />
              <button
                type="submit"
                className="min-h-[44px] bg-[#C49A58] px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-[#101112] transition hover:bg-[#d4ab68]"
              >
                Envoyer
              </button>
            </form>
          </div>

          {statusMessage && <p className="text-xs text-[#C49A58]">{statusMessage}</p>}
        </section>
      )}

      {phase === "setup" && (
        <section className="mx-auto max-w-3xl space-y-6 border border-[#EAE6DE]/12 bg-[#151719] p-4 sm:p-8">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div>
              <label className="mc-kicker block text-[11px] text-[#EAE6DE]/60">Joueurs</label>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePlayerCountChange(playerCount - 1)}
                  className="h-11 w-11 border border-[#EAE6DE]/20 bg-[#101112] text-base text-[#EAE6DE] transition hover:border-[#C49A58]"
                >
                  −
                </button>
                <span className="min-w-[2.5rem] text-center font-serif text-xl text-[#EAE6DE]">
                  {playerCount}
                </span>
                <button
                  type="button"
                  onClick={() => handlePlayerCountChange(playerCount + 1)}
                  className="h-11 w-11 border border-[#EAE6DE]/20 bg-[#101112] text-base text-[#EAE6DE] transition hover:border-[#C49A58]"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <label className="mc-kicker block text-[11px] text-[#EAE6DE]/60">Imposteurs</label>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setImposterCount((prev) => Math.max(1, prev - 1))}
                  className="h-11 w-11 border border-[#EAE6DE]/20 bg-[#101112] text-base text-[#EAE6DE] transition hover:border-[#C49A58]"
                >
                  −
                </button>
                <span className="min-w-[2.5rem] text-center font-serif text-xl text-[#EAE6DE]">
                  {Math.min(imposterCount, Math.max(1, playerCount - 1))}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setImposterCount((prev) => Math.min(Math.max(1, playerCount - 1), prev + 1))
                  }
                  className="h-11 w-11 border border-[#EAE6DE]/20 bg-[#101112] text-base text-[#EAE6DE] transition hover:border-[#C49A58]"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <label className="mc-kicker block text-[11px] text-[#EAE6DE]/60">Catégorie</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="mt-2 min-h-[44px] w-full border border-[#EAE6DE]/15 bg-[#101112] px-3 py-2.5 text-sm text-[#EAE6DE] focus:border-[#C49A58] focus:outline-none"
              >
                <option value="Hors catalogue">Hors catalogue (Mots concrets)</option>
                <option value="Tous">Tout mélanger (Catalogue + Mots)</option>
                <option value="Film">Films</option>
                <option value="Série">Séries</option>
                <option value="Animé">Animés</option>
              </select>
            </div>
          </div>

          <div className="space-y-2.5">
            <label className="mc-kicker block text-[11px] text-[#EAE6DE]/60">Noms des joueurs</label>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {Array.from({ length: playerCount }).map((_, idx) => (
                <input
                  key={idx}
                  type="text"
                  value={players[idx] ?? ""}
                  onChange={(e) => handlePlayerNameChange(idx, e.target.value)}
                  placeholder={`Joueur ${idx + 1}`}
                  className="min-h-[44px] border border-[#EAE6DE]/15 bg-[#101112] px-3.5 py-2 text-sm text-[#EAE6DE] placeholder-[#EAE6DE]/35 focus:border-[#C49A58] focus:outline-none"
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex min-h-[48px] cursor-pointer items-center justify-between gap-3 border border-[#EAE6DE]/12 bg-[#101112] px-4 py-3">
              <span className="text-sm text-[#EAE6DE]/85">Indice vague pour l&apos;imposteur</span>
              <input
                type="checkbox"
                checked={showClueToImposter}
                onChange={(e) => setShowClueToImposter(e.target.checked)}
                className="h-4 w-4 shrink-0 accent-[#C49A58]"
              />
            </label>

            <label className="flex min-h-[48px] cursor-pointer items-center justify-between gap-3 border border-[#EAE6DE]/12 bg-[#101112] px-4 py-3">
              <span className="text-sm text-[#EAE6DE]/85">Afficher l&apos;affiche (films, séries, animés)</span>
              <input
                type="checkbox"
                checked={showPosters}
                onChange={(e) => setShowPosters(e.target.checked)}
                className="h-4 w-4 shrink-0 accent-[#C49A58]"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={startNewRound}
            className="min-h-[48px] w-full bg-[#C49A58] px-5 py-3.5 text-xs font-semibold uppercase tracking-widest text-[#101112] transition hover:bg-[#d4ab68]"
          >
            Lancer la manche
          </button>
        </section>
      )}

      {phase === "reveal" && targetTitle && (
        <section className="mx-auto max-w-2xl space-y-6 border border-[#EAE6DE]/12 bg-[#151719] p-4 text-center sm:p-8">
          <p className="mc-kicker text-[11px] text-[#C49A58] sm:text-xs">
            Joueur {revealIndex + 1} sur {activePlayers.length}
          </p>
          <h2 className="font-serif text-2xl text-[#EAE6DE] sm:text-3xl">
            Passe l&apos;écran à {currentRevealPlayer}
          </h2>

          <div className="mx-auto max-w-md border border-[#EAE6DE]/15 bg-[#101112] p-5 sm:p-6">
            {!cardVisible ? (
              <p className="text-sm leading-relaxed text-[#EAE6DE]/65">
                Assure-toi que personne d&apos;autre ne regarde l&apos;écran, puis affiche ton rôle.
              </p>
            ) : currentRevealIsImposter ? (
              <div className="space-y-2">
                <p className="font-serif text-2xl text-[#C49A58]">Tu es l&apos;Imposteur</p>
                <p className="text-xs text-[#EAE6DE]/65">Fais croire que tu connais le mot ou le titre.</p>
                {showClueToImposter && (
                  <p className="mt-3 border border-[#C49A58]/30 bg-[#151719] p-3 text-xs text-[#EAE6DE]/85">
                    Indice : {targetTitle.clue}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="mc-kicker text-[11px] text-[#C49A58]">Mot / Titre secret</p>
                {activePosterUrl && (
                  <img
                    src={activePosterUrl}
                    alt={targetTitle.title}
                    onError={() => setPosterFailed(true)}
                    className="mx-auto h-52 w-36 border border-[#EAE6DE]/12 object-cover sm:h-56 sm:w-40"
                  />
                )}
                <p className="font-serif text-2xl text-[#EAE6DE] sm:text-3xl">{targetTitle.title}</p>
                <p className="text-xs text-[#EAE6DE]/60">
                  {targetTitle.type} {targetTitle.year ? `· ${targetTitle.year}` : ""}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleRevealNext}
              className="min-h-[46px] bg-[#C49A58] px-6 py-3 text-xs font-semibold uppercase tracking-widest text-[#101112] transition hover:bg-[#d4ab68]"
            >
              {!cardVisible
                ? "Afficher mon rôle"
                : revealIndex + 1 < activePlayers.length
                  ? "Masquer et passer au suivant"
                  : "Passer au débat"}
            </button>
            <button
              type="button"
              onClick={() => setPhase("setup")}
              className="min-h-[46px] border border-[#EAE6DE]/20 px-4 py-3 text-xs uppercase tracking-widest text-[#EAE6DE]/80 transition hover:border-[#C49A58]"
            >
              Modifier les joueurs
            </button>
          </div>
        </section>
      )}

      {phase === "discussion" && targetTitle && (
        <section className="mx-auto max-w-2xl space-y-6 border border-[#EAE6DE]/12 bg-[#151719] p-4 text-center sm:p-8">
          <div className="space-y-1">
            <p className="mc-kicker text-[11px] text-[#C49A58] sm:text-xs">Étape 3 · Indices</p>
            <h2 className="font-serif text-2xl text-[#EAE6DE] sm:text-3xl">Tour d&apos;indices et débat</h2>
            <p className="text-sm text-[#EAE6DE]/65">
              Chacun donne un mot ou une courte phrase liée au sujet sans le dire directement.
            </p>
          </div>

          <div className="border border-[#EAE6DE]/12 bg-[#101112] p-4 text-sm text-[#EAE6DE]/80">
            Catégorie : <span className="text-[#C49A58]">{categoryFilter}</span> ·{" "}
            <span>{activePlayers.length}</span> joueurs en lice.
          </div>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setVoterIndex(0);
                setVotes({});
                setPhase("vote");
              }}
              className="min-h-[46px] bg-[#C49A58] px-5 py-3 text-xs font-semibold uppercase tracking-widest text-[#101112] transition hover:bg-[#d4ab68]"
            >
              Passer au vote
            </button>
            <button
              type="button"
              onClick={() => {
                setRevealIndex(0);
                setCardVisible(false);
                setPhase("reveal");
              }}
              className="min-h-[46px] border border-[#EAE6DE]/20 px-4 py-3 text-xs uppercase tracking-widest text-[#EAE6DE]/80 transition hover:border-[#C49A58]"
            >
              Revoir les rôles
            </button>
          </div>
        </section>
      )}

      {phase === "vote" && (
        <section className="mx-auto max-w-2xl space-y-6 border border-[#EAE6DE]/12 bg-[#151719] p-4 text-center sm:p-8">
          <div className="space-y-1">
            <p className="mc-kicker text-[11px] text-[#C49A58] sm:text-xs">
              Vote {voterIndex + 1} sur {activePlayers.length}
            </p>
            <h2 className="font-serif text-2xl text-[#EAE6DE] sm:text-3xl">
              {activePlayers[voterIndex]}, qui est l&apos;imposteur ?
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {activePlayers.map((candidate, idx) => (
              <button
                key={`${candidate}-${idx}`}
                type="button"
                onClick={() => handleCastVote(idx)}
                disabled={idx === voterIndex}
                className={`min-h-[46px] border px-4 py-3 text-left text-sm transition ${
                  idx === voterIndex
                    ? "cursor-not-allowed border-[#EAE6DE]/8 bg-[#101112]/40 text-[#EAE6DE]/30"
                    : "border-[#EAE6DE]/15 bg-[#101112] text-[#EAE6DE] hover:border-[#C49A58]"
                }`}
              >
                {candidate} {idx === voterIndex ? "(toi)" : ""}
              </button>
            ))}
          </div>
        </section>
      )}

      {phase === "result" && targetTitle && (
        <section className="mx-auto max-w-2xl space-y-6 border border-[#EAE6DE]/12 bg-[#151719] p-4 text-center sm:p-8">
          <div className="space-y-2">
            <p className="mc-kicker text-[11px] text-[#C49A58] sm:text-xs">Verdict</p>
            <h2 className="font-serif text-2xl text-[#EAE6DE] sm:text-3xl">
              {caughtImposter ? "L'imposteur est démasqué" : "L'imposteur a échappé au groupe"}
            </h2>
            <p className="text-sm text-[#EAE6DE]/70">
              Le mot / titre secret était{" "}
              <span className="font-semibold text-[#C49A58]">{targetTitle.title}</span> ({targetTitle.type}).
            </p>
            {activePosterUrl && (
              <img
                src={activePosterUrl}
                alt={targetTitle.title}
                onError={() => setPosterFailed(true)}
                className="mx-auto mt-2 h-48 w-36 border border-[#EAE6DE]/12 object-cover sm:h-52"
              />
            )}
          </div>

          <div className="border border-[#EAE6DE]/12 bg-[#101112] p-4">
            <p className="mc-kicker text-[10px] text-[#EAE6DE]/50">
              {imposterIndices.length > 1 ? "Les imposteurs étaient" : "L'imposteur était"}
            </p>
            <p className="mt-1 font-serif text-xl text-[#C49A58]">
              {imposterIndices.map((idx) => activePlayers[idx]).join(", ")}
            </p>
          </div>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={startNewRound}
              className="min-h-[46px] bg-[#C49A58] px-5 py-3 text-xs font-semibold uppercase tracking-widest text-[#101112] transition hover:bg-[#d4ab68]"
            >
              Nouvelle manche
            </button>
            <button
              type="button"
              onClick={() => setPhase("setup")}
              className="min-h-[46px] border border-[#EAE6DE]/20 px-4 py-3 text-xs uppercase tracking-widest text-[#EAE6DE]/80 transition hover:border-[#C49A58]"
            >
              Changer les paramètres
            </button>
          </div>
        </section>
      )}
    </main>
  );
}