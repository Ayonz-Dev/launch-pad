"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ACCESS_PERSONA_OPTIONS,
  ACCESS_PERSONA_STORAGE_KEY,
  ACCESS_TEAM_STORAGE_KEY,
  DEFAULT_ACCESS_PERSONA,
  isTeamScopedPersona,
  personaCan,
  type AccessPersona,
  type PersonaCapability,
} from "@/lib/accessPersona";
import { listTeams, type TeamRecord } from "@/features/teams/repository";
import { useSession } from "./SessionProvider";

type AccessPersonaContextValue = {
  persona: AccessPersona;
  setPersona: (persona: AccessPersona) => void;
  teamId: string | null;
  setTeamId: (teamId: string | null) => void;
  teams: TeamRecord[];
  refreshTeams: () => Promise<void>;
  can: (capability: PersonaCapability) => boolean;
  isTeamScoped: boolean;
  personaLabel: string;
};

const AccessPersonaContext = createContext<AccessPersonaContextValue | null>(null);

export function AccessPersonaProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const [persona, setPersonaState] = useState<AccessPersona>(DEFAULT_ACCESS_PERSONA);
  const [teamId, setTeamIdState] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamRecord[]>([]);

  const refreshTeams = useCallback(async () => {
    if (session.status !== "authenticated") {
      setTeams([]);
      return;
    }
    try {
      setTeams(await listTeams());
    } catch {
      setTeams([]);
    }
  }, [session.status]);

  useEffect(() => {
    void refreshTeams();
  }, [refreshTeams, session.organizationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedPersona = window.localStorage.getItem(ACCESS_PERSONA_STORAGE_KEY);
        if (savedPersona && ACCESS_PERSONA_OPTIONS.some((option) => option.value === savedPersona)) {
          setPersonaState(savedPersona as AccessPersona);
        }
        const savedTeam = window.localStorage.getItem(ACCESS_TEAM_STORAGE_KEY);
        if (savedTeam) setTeamIdState(savedTeam);
      } catch {
        // ignore
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (teamId && teams.length > 0 && !teams.some((team) => team.id === teamId)) {
        setTeamIdState(teams[0]?.id ?? null);
        return;
      }
      if (isTeamScopedPersona(persona) && !teamId && teams[0]) {
        setTeamIdState(teams[0].id);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [persona, teamId, teams]);

  const setPersona = (next: AccessPersona) => {
    setPersonaState(next);
    try {
      window.localStorage.setItem(ACCESS_PERSONA_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  const setTeamId = (next: string | null) => {
    setTeamIdState(next);
    try {
      if (next) window.localStorage.setItem(ACCESS_TEAM_STORAGE_KEY, next);
      else window.localStorage.removeItem(ACCESS_TEAM_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const value = useMemo<AccessPersonaContextValue>(
    () => ({
      persona,
      setPersona,
      teamId,
      setTeamId,
      teams,
      refreshTeams,
      can: (capability) => personaCan(persona, capability),
      isTeamScoped: isTeamScopedPersona(persona),
      personaLabel:
        ACCESS_PERSONA_OPTIONS.find((option) => option.value === persona)?.label ?? persona,
    }),
    [persona, teamId, teams, refreshTeams],
  );

  return <AccessPersonaContext.Provider value={value}>{children}</AccessPersonaContext.Provider>;
}

export function useAccessPersona(): AccessPersonaContextValue {
  const ctx = useContext(AccessPersonaContext);
  if (!ctx) throw new Error("useAccessPersona must be used within AccessPersonaProvider");
  return ctx;
}
