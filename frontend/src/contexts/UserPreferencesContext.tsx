"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getUserPreferences } from "@/lib/api";

interface UserPreferences {
  modelMode: "auto" | "manual";
}

interface PreferencesContextValue {
  preferences: UserPreferences;
  refresh: () => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextValue>({
  preferences: { modelMode: "auto" },
  refresh: async () => {},
});

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<UserPreferences>({ modelMode: "auto" });

  const refresh = useCallback(async () => {
    try {
      const res = await getUserPreferences();
      const prefs = res.user.preferences;
      const mode = prefs.modelMode;
      if (mode === "auto" || mode === "manual") {
        setPreferences({ modelMode: mode as "auto" | "manual" });
      }
    } catch {
      // Stille feil — behold eksisterende preferanser
    }
  }, []);

  useEffect(() => {
    refresh();
    // TODO: Implementer bedre sync (WebSocket eller event-based)
    // const interval = setInterval(refresh, 3000);
    // return () => clearInterval(interval);
  }, [refresh]);

  return (
    <PreferencesContext.Provider value={{ preferences, refresh }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export const usePreferences = () => useContext(PreferencesContext);
