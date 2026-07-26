import { Suspense } from "react";
import { CostingWorkspace } from "@/features/quotes/CostingWorkspace";

export default function Home() {
  return (
    <Suspense>
      <CostingWorkspace />
    </Suspense>
  );
}
