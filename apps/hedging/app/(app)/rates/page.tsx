// Placeholder rates page. Second stub route to demonstrate the shared shell nav.
//
// Australian English. No em dashes.

export const dynamic = 'force-dynamic';

export default function RatesPage() {
  return (
    <div className="page">
      <span className="eyebrow">Ayonz · Hedging</span>
      <h1>
        Rates <span className="placeholder-band">Placeholder</span>
      </h1>
      <p className="sub">
        Live and forward AUD/USD rates will render here. The costing app already
        reads a working rate from settings; this is where that feed will be
        managed.
      </p>
      <div className="card">
        <p className="note">No rate feed connected yet.</p>
      </div>
    </div>
  );
}
