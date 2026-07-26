import type { ReactNode } from "react";
import { SessionProvider } from "@/components/SessionProvider";
import { AccessPersonaProvider } from "@/components/AccessPersonaProvider";
import { AppSidebar } from "@/components/AppSidebar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AccessPersonaProvider>
        <div className="app-shell">
          <AppSidebar />
          {children}
        </div>
      </AccessPersonaProvider>
    </SessionProvider>
  );
}
