"use client";

import { Star, X } from "lucide-react";
import { posterUrl } from "@/lib/tmdb";

export const inputClass =
  "w-full rounded-xl border border-white/15 bg-zinc-900/80 px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-amber-300/60 focus:bg-zinc-900";

export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-[#f4f1ea] px-4 py-2.5 text-sm font-semibold text-[#09090b] transition hover:bg-white active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50";

export const ghostClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.02] px-4 py-2.5 text-sm text-zinc-100 transition hover:border-white/35 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50";

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  const needsSchema = /schema cache|does not exist|column |relation |permission denied|42P01|PGRST/i.test(message);
  return (
    <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm leading-6 text-red-100">
      {message}
      {needsSchema ? " Vérifiez que le script SQL est bien exécuté dans Supabase, puis rechargez la page." : ""}
    </p>
  );
}

export function PageHeader({ kicker, title, text }: { kicker: string; title: string; text?: string }) {
  return (
    <header className="mb-8">
      <p className="text-xs font-medium tracking-wide text-amber-300/80">{kicker}</p>
      <h1 className="mt-1.5 font-serif text-4xl tracking-tight text-[#f4f1ea] sm:text-5xl">{title}</h1>
      {text ? <p className="mt-2.5 max-w-2xl text-sm leading-6 text-zinc-400">{text}</p> : null}
    </header>
  );
}

export function Poster({
  path,
  alt,
  className = "",
}: {
  path: string | null;
  alt: string;
  className?: string;
}) {
  const src = posterUrl(path);
  if (!src) {
    return <div className={`rounded-xl bg-zinc-900 ${className}`} aria-hidden />;
  }
  return (
    // Affiches TMDB servies directement, sans optimisation d'image.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={`rounded-xl object-cover ${className}`} />
  );
}

export function Avatar({
  name,
  url,
  size = 40,
}: {
  name: string;
  url?: string | null;
  size?: number;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "M";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover ring-1 ring-white/15"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-zinc-800 font-serif text-[#f4f1ea] ring-1 ring-white/15"
      style={{ width: size, height: size }}
    >
      {initial}
    </span>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 backdrop-blur-xs sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/12 bg-zinc-950 p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="font-serif text-3xl tracking-tight text-[#f4f1ea]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stars({ value, onChange }: { value: number; onChange?: (value: number) => void }) {
  return (
    <div className="flex gap-1" role="group" aria-label="Note sur 5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(star)}
          aria-label={`${star} sur 5`}
          className={onChange ? "transition hover:scale-110" : ""}
        >
          <Star
            size={16}
            className={star <= value ? "fill-amber-400 text-amber-400" : "text-zinc-700"}
          />
        </button>
      ))}
    </div>
  );
}