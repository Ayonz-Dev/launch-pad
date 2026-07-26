import Link from 'next/link';
import type { Scenario } from '../lib/coverage/types';

export interface ScenarioSwitcherProps {
  scenarios: Scenario[];
  /** The active scenario id, or null for live data. */
  active: number | null;
}

/**
 * Live plus one link per scenario. Live data is scenario_id null, so its link
 * carries no query. Server-rendered links keep this free of client JavaScript.
 */
export function ScenarioSwitcher({ scenarios, active }: ScenarioSwitcherProps) {
  return (
    <nav className="scenario-switcher" aria-label="Scenario">
      <Link
        href="/"
        className={active === null ? 'scenario-chip is-active' : 'scenario-chip'}
        aria-current={active === null ? 'page' : undefined}
      >
        Live
      </Link>
      {scenarios.map((scenario) => (
        <Link
          key={scenario.id}
          href={`/?scenario=${scenario.id}`}
          className={active === scenario.id ? 'scenario-chip is-active' : 'scenario-chip'}
          aria-current={active === scenario.id ? 'page' : undefined}
        >
          {scenario.name}
        </Link>
      ))}
    </nav>
  );
}
