"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { buttonClass, inputClass } from "@/components/ui";
import { supabase } from "@/lib/supabase";

function translate(message: string) {
  if (/invalid login credentials/i.test(message)) return "Email ou mot de passe incorrect.";
  if (/email not confirmed/i.test(message)) return "Confirmez votre email avant de vous connecter.";
  return message;
}

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/decider");
  }, [loading, user, router]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (signError) {
      setError(translate(signError.message));
      return;
    }
    router.replace("/decider");
  }

  return (
    <main className="grid min-h-screen place-items-center px-5 py-16">
      <div className="w-full max-w-md">
        <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">MatchCut</p>
        <h1 className="mt-3 font-serif text-5xl tracking-tight text-[#f4f1ea]">Connexion</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">Reprendre la séance. Les décisions du groupe vous attendent.</p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block text-sm text-zinc-300">
            Email
            <input className={`${inputClass} mt-2`} type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="block text-sm text-zinc-300">
            Mot de passe
            <input className={`${inputClass} mt-2`} type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <button className={`${buttonClass} w-full`} type="submit" disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            Entrer
          </button>
        </form>
        <p className="mt-6 text-sm text-zinc-400">
          Pas encore de siège ?{" "}
          <Link href="/signup" className="text-[#f4f1ea] underline decoration-white/30 underline-offset-4">
            Créer un profil
          </Link>
        </p>
      </div>
    </main>
  );
}
