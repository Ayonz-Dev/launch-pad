"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_DESTINATION,
  DESTINATION_COUNTRIES,
  DESTINATION_STORAGE_KEY,
} from "@/lib/destinations";

type DestinationContextValue = {
  destination: string;
  setDestination: (code: string) => void;
};

const DestinationContext = createContext<DestinationContextValue | null>(null);

export function DestinationProvider({ children }: { children: ReactNode }) {
  const [destination, setDestinationState] = useState(DEFAULT_DESTINATION);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DESTINATION_STORAGE_KEY);
      if (
        saved &&
        DESTINATION_COUNTRIES.some((c) => c.code === saved && c.enabled)
      ) {
        setDestinationState(saved);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  function setDestination(code: string) {
    const allowed = DESTINATION_COUNTRIES.find((c) => c.code === code && c.enabled);
    if (!allowed) return;
    setDestinationState(code);
    try {
      window.localStorage.setItem(DESTINATION_STORAGE_KEY, code);
    } catch {
      // ignore storage errors
    }
  }

  return (
    <DestinationContext.Provider value={{ destination, setDestination }}>
      {children}
    </DestinationContext.Provider>
  );
}

export function useDestination(): DestinationContextValue {
  const ctx = useContext(DestinationContext);
  if (!ctx) {
    throw new Error("useDestination must be used within DestinationProvider");
  }
  return ctx;
}
