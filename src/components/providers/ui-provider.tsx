"use client";

import { createContext, useCallback, useContext, useState } from "react";

type AuthMode = "register" | "login";

type UiContextValue = {
  authOpen: boolean;
  authMode: AuthMode;
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
  setAuthMode: (mode: AuthMode) => void;
  toast: string | null;
  triggerToast: (msg: string) => void;
};

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [toast, setToast] = useState<string | null>(null);

  const triggerToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const openAuth = useCallback((mode: AuthMode = "register") => {
    setAuthMode(mode);
    setAuthOpen(true);
  }, []);

  return (
    <UiContext.Provider
      value={{
        authOpen,
        authMode,
        openAuth,
        closeAuth: () => setAuthOpen(false),
        setAuthMode,
        toast,
        triggerToast,
      }}
    >
      {children}
    </UiContext.Provider>
  );
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi must be used within UiProvider");
  return ctx;
}
