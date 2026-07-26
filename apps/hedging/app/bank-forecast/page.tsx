import Link from 'next/link';
import { BankForecastForm } from '../../components/BankForecastForm';
import { isSupabaseConfigured } from '../../lib/supabase/server';

// Bank forecast intake. Paste the macro commentary, parse the horizon ranges,
// review, and save. The parsed band then plots on the predictions and forwards
// chart as a distinct "Bank forecast (range)" band.

export const dynamic = 'force-dynamic';

export default function BankForecastPage() {
  const today = new Date().toISOString().slice(0, 10);
  const canSave = isSupabaseConfigured();

  return (
    <main className="page">
      <header className="page-head">
        <h1>Bank forecast intake</h1>
        <span className="anchor">Paste, parse, plot</span>
      </header>

      <nav className="scenario-switcher" aria-label="Sections">
        <Link href="/" className="scenario-chip">
          Coverage dashboard
        </Link>
        <Link href="/forex" className="scenario-chip">
          Forex position
        </Link>
        <Link href="/bank-forecast" className="scenario-chip is-active" aria-current="page">
          Bank forecast
        </Link>
      </nav>

      <p className="notice">
        Banks quote a <strong>range over a horizon</strong>, not a single number. Paste the FX
        macro comment from the email and the parser reads each horizon (for example{' '}
        <code>1-3wks: 0.6865-0.7100</code>) into a dated low/high band with a midline. Review the
        rows, correct anything the parser misread, then save. The band appears on the predictions
        and forwards chart, clearly separated from the model forecast and the arbitrage-free IRP
        line.
      </p>

      <BankForecastForm defaultAsOf={today} canSave={canSave} />
    </main>
  );
}
