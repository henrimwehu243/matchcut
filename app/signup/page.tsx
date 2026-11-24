"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { buttonClass, inputClass } from "@/components/ui";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/decider");
  }, [loading, user, router]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const handle = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
      setError("Le pseudo doit contenir 3 à 20 lettres minuscules, chiffres ou tirets bas.");
      return;
    }
    if (fullName.trim().length < 2) {
      setError("Indiquez votre nom.");
      return;
    }
    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setBusy(true);
    const availability = await supabase.rpc("username_available", { name: handle });
    if (!availability.error && availability.data === false) {
      setBusy(false);
      setError("Ce pseudo est déjà pris.");
      return;
    }

    const { data, error: signError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/decider`,
        data: { username: handle, full_name: fullName.trim() },
      },
    });
    setBusy(false);
    if (signError) {
      setError(/already registered/i.test(signError.message) ? "Un compte existe déjà avec cet email." : signError.message);
      return;
    }
    if (data.session) {
      router.replace("/decider");
      return;
    }
    setNotice("Compte créé. Confirmez l’email reçu, puis connectez-vous. Votre profil est créé automatiquement.");
  }

  return (
    <main className="grid min-h-screen place-items-center px-5 py-16">
      <div className="w-full max-w-md">
        <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">MatchCut</p>
        <h1 className="mt-3 font-serif text-5xl tracking-tight text-[#f4f1ea]">Inscription</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">Un profil, un pseudo, puis la salle. Rien de plus.</p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block text-sm text-zinc-300">
            Nom
            <input className={`${inputClass} mt-2`} required value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </label>
          <label className="block text-sm text-zinc-300">
            Pseudo
            <input className={`${inputClass} mt-2`} required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="lena_monte" />
          </label>
          <label className="block text-sm text-zinc-300">
            Email
            <input className={`${inputClass} mt-2`} type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="block text-sm text-zinc-300">
            Mot de passe
            <input className={`${inputClass} mt-2`} type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <label className="block text-sm text-zinc-300">
            Confirmation
            <input className={`${inputClass} mt-2`} type="password" autoComplete="new-password" required value={confirm} onChange={(event) => setConfirm(event.target.value)} />
          </label>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          {notice ? <p className="border border-white/15 px-3 py-2 text-sm leading-6 text-zinc-300">{notice}</p> : null}
          <button className={`${buttonClass} w-full`} type="submit" disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            Créer le profil
          </button>
        </form>
        <p className="mt-6 text-sm text-zinc-400">
          Déjà inscrit ?{" "}
          <Link href="/login" className="text-[#f4f1ea] underline decoration-white/30 underline-offset-4">
            Se connecter
          </Link>
        </p>
      </div>
    </main>
  );
}
