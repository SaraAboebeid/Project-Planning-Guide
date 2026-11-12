/* Who is signed in. The session itself is an HttpOnly cookie the page cannot
   read, so this only mirrors /api/auth/me — refreshed on load and after sign-in. */

import { create } from "zustand";
import { accounts } from "../api/accounts";

interface AuthState {
  email: string | null;
  loaded: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>()((set) => ({
  email: null,
  loaded: false,
  refresh: async () => {
    try {
      const { email } = await accounts.me();
      set({ email, loaded: true });
    } catch {
      // Backend down: behave as signed out rather than blocking the tool.
      set({ email: null, loaded: true });
    }
  },
  signOut: async () => {
    try { await accounts.logout(); } finally { set({ email: null }); }
  },
}));

/** Two letters for the avatar: "sara.abouebeid@…" → "SA", "saraabo@…" → "SA". */
export function initialsOf(email: string | null): string {
  if (!email) return "";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const s = parts.length >= 2 ? `${parts[0]![0]}${parts[1]![0]}` : local.slice(0, 2);
  return s.toUpperCase();
}
