// Placeholder positions page. Present so the shared nav has a second live
// route and active-link highlighting is visibly working.
//
// Australian English. No em dashes.

export const dynamic = 'force-dynamic';

export default function PositionsPage() {
  return (
    <div className="page">
      <span className="eyebrow">Ayonz · Hedging</span>
      <h1>
        Positions <span className="placeholder-band">Placeholder</span>
      </h1>
      <p className="sub">
        Open forward contracts and coverage will render here once the engine is
        wired in.
      </p>
      <div className="card">
        <p className="note">No positions to show yet.</p>
      </div>
    </div>
  );
}
