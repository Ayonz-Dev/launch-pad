"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!isSupabaseConfigured()) {
      setMessage("Add the Supabase URL and publishable key to .env.local first.");
      return;
    }
    setMessage("Signing in…");
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      return;
    }
    window.location.assign("/");
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/" className="back-link">← Back to costing</Link>
        <div className="brand-mark auth-brand"><span>A</span><div><b>AYONZ</b><small>Costing platform</small></div></div>
        <span className="eyebrow">SECURE ACCESS</span>
        <h1>Sign in to your workspace</h1>
        <p>Use the account issued by your platform administrator.</p>
        <form onSubmit={signIn}>
          <label className="field"><span>Work email</span><span className="control"><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></span></label>
          <label className="field"><span>Password</span><span className="control"><input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></span></label>
          <button type="submit">Sign in</button>
        </form>
        {message && <p className="auth-message">{message}</p>}
        <small>First administrator? Sign in, then <Link href="/setup">create the organisation workspace</Link>.</small>
      </section>
    </main>
  );
}
