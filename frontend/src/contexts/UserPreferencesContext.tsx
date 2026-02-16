"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getMe, type UserProfile } from "@/lib/api";

interface UserPreferences {
  modelMode: "auto" | "manual";
}

interface UserContextValue {
  user: UserProfile | null;
  preferences: UserPreferences;
  refresh: () => Promise<void>;
  initial: string;
  avatarColor: string;
  aiName: string;
  aiInitials: string;
}

const DEFAULT_AVATAR_COLOR = "#6366f1";
const DEFAULT_AI_NAME = "J\u00f8rgen Andr\u00e9";

function getInitials(name: string): string {
  return name.split(" ").map(w => w.charAt(0).toUpperCase()).slice(0, 2).join("");
}

const UserContext = createContext<UserContextValue>({
  user: null,
  preferences: { modelMode: "auto" },
  refresh: async () => {},
  initial: "?",
  avatarColor: DEFAULT_AVATAR_COLOR,
  aiName: DEFAULT_AI_NAME,
  aiInitials: getInitials(DEFAULT_AI_NAME),
});

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences>({ modelMode: "auto" });

  const refresh = useCallback(async () => {
    try {
      const res = await getMe();
      setUser(res.user);
      const prefs = res.user.preferences;
      const mode = prefs.modelMode;
      if (mode === "auto" || mode === "manual") {
        setPreferences({ modelMode: mode as "auto" | "manual" });
      }
    } catch {
      // Silent — keep existing state
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const initial = user?.name
    ? user.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  const avatarColor = (user?.preferences?.avatarColor as string) || DEFAULT_AVATAR_COLOR;
  const aiName = (user?.preferences?.aiName as string) || DEFAULT_AI_NAME;
  const aiInitials = getInitials(aiName);

  return (
    <UserContext.Provider value={{ user, preferences, refresh, initial, avatarColor, aiName, aiInitials }}>
      {children}
    </UserContext.Provider>
  );
}

export const usePreferences = () => {
  const ctx = useContext(UserContext);
  return { preferences: ctx.preferences, refresh: ctx.refresh };
};

export const useUser = () => useContext(UserContext);
