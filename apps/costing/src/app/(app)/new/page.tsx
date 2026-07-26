import { Suspense } from "react";
import { CostingWorkspace } from "@/features/quotes/CostingWorkspace";

export default function NewCostingPage() {
  return (
    <Suspense>
      <CostingWorkspace />
    </Suspense>
  );
}
