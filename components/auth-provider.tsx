"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

type AuthValue = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

async function ensureProfile(user: User) {
  const { data, error } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (error || data) return;
  const meta = user.user_metadata ?? {};
  const raw = String(meta.username || user.email?.split("@")[0] || "membre")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
  const username = raw.length >= 3 ? raw : `membre_${user.id.replace(/-/g, "").slice(0, 6)}`;
  await supabase.from("profiles").insert({
    id: user.id,
    username,
    full_name: String(meta.full_name || ""),
    bio: "",
    avatar_url: null,
  });
}

async function loadProfile(userId: string) {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function boot() {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
        url.searchParams.delete("code");
        const next = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState({}, "", next);
      }
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) {
        await ensureProfile(data.session.user);
        const row = await loadProfile(data.session.user.id);
        if (active) setProfile(row);
      }
      if (active) setLoading(false);
    }

    void boot();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next?.user) {
        setProfile(null);
        setLoading(false);
        return;
      }
      void (async () => {
        await ensureProfile(next.user);
        const row = await loadProfile(next.user.id);
        if (active) setProfile(row);
        if (active) setLoading(false);
      })();
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user: session?.user ?? null,
      profile,
      loading,
      refreshProfile: async () => {
        if (!session?.user) return;
        setProfile(await loadProfile(session.user.id));
      },
      signOut: async () => {
        await supabase.auth.signOut();
        setProfile(null);
      },
    }),
    [session, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  const [fallbackUser, setFallbackUser] = useState<User | null>(null);
  const [fallbackProfile, setFallbackProfile] = useState<Profile | null>(null);
  const [fallbackLoading, setFallbackLoading] = useState(true);

  useEffect(() => {
    if (value) return;
    let active = true;

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      const u = data.session?.user ?? null;
      setFallbackUser(u);
      if (u) {
        setFallbackProfile(await loadProfile(u.id));
      }
      if (active) setFallbackLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      const u = next?.user ?? null;
      setFallbackUser(u);
      if (!u) {
        setFallbackProfile(null);
        setFallbackLoading(false);
        return;
      }
      void loadProfile(u.id).then((p) => {
        if (active) {
          setFallbackProfile(p);
          setFallbackLoading(false);
        }
      });
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [value]);

  const refreshFallback = useCallback(async () => {
    if (!fallbackUser) return;
    setFallbackProfile(await loadProfile(fallbackUser.id));
  }, [fallbackUser]);

  const signOutFallback = useCallback(async () => {
    await supabase.auth.signOut();
    setFallbackUser(null);
    setFallbackProfile(null);
  }, []);

  if (value) return value;

  return {
    user: fallbackUser,
    profile: fallbackProfile,
    loading: fallbackLoading,
    refreshProfile: refreshFallback,
    signOut: signOutFallback,
  };
}