// Placeholder hedging dashboard. It exists to prove the shared shell seam end
// to end: this page only renders because the shell's session guard let a
// signed-in user through and framed it with the shared chrome. The figures are
// intentionally blank until the real Hedging-Tool logic is ported in.
//
// Australian English. No em dashes.

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  return (
    <div className="page">
      <span className="eyebrow">Ayonz · Hedging</span>
      <h1>
        Dashboard <span className="placeholder-band">Placeholder</span>
      </h1>
      <p className="sub">
        A thin app on the shared platform shell. Signed in through the same
        identity as costing, framed by the same chrome.
      </p>

      <div className="stat-row">
        <div className="stat">
          <div className="label">Open positions</div>
          <div className="value">--</div>
        </div>
        <div className="stat">
          <div className="label">Hedged notional (USD)</div>
          <div className="value">--</div>
        </div>
        <div className="stat">
          <div className="label">Working AUD/USD</div>
          <div className="value">--</div>
        </div>
        <div className="stat">
          <div className="label">Unrealised P&amp;L (AUD)</div>
          <div className="value">--</div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>
          What lands here when Hedging-Tool is ported
        </h2>
        <div className="note">
          <ul>
            <li>Live and forward AUD/USD rates from the hedging engine.</li>
            <li>Open forward contracts and their coverage against exposure.</li>
            <li>
              The working-rate feed that the costing app already consumes, so
              both apps price from one source.
            </li>
            <li>
              Role-derived nav and permissions, reusing @launchpad/auth rather
              than a parallel model.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
