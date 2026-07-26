"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function SetupPage() {
  const [name, setName] = useState("Ayonz");
  const [slug, setSlug] = useState("ayonz");
  const [message, setMessage] = useState("");

  async function createWorkspace(event: FormEvent) {
    event.preventDefault();
    if (!isSupabaseConfigured()) return setMessage("Supabase is not configured.");
    setMessage("Creating workspace…");
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return setMessage("Sign in before creating a workspace.");
    const { error } = await supabase.rpc("bootstrap_costing_organization", {
      organization_name: name,
      organization_slug: slug,
    });
    if (error) return setMessage(error.message);
    setMessage("Workspace created. Redirecting…");
    window.setTimeout(() => window.location.assign("/"), 700);
  }

  return (
    <main className="auth-page"><section className="auth-card">
      <Link href="/" className="back-link">← Back to costing</Link>
      <span className="eyebrow">ONE-TIME SETUP</span><h1>Create the first workspace</h1>
      <p>This grants the signed-in user the Costing Administrator role. It can only be used when that user has no organisation membership.</p>
      <form onSubmit={createWorkspace}>
        <label className="field"><span>Organisation name</span><span className="control"><input required value={name} onChange={(event) => setName(event.target.value)} /></span></label>
        <label className="field"><span>Workspace slug</span><span className="control"><input required pattern="[a-z0-9][a-z0-9-]{1,62}" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} /></span></label>
        <button type="submit">Create workspace</button>
      </form>
      {message && <p className="auth-message">{message}</p>}
    </section></main>
  );
}
