"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";

export default function Dashboard() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/jobs").then(r=>r.json()).then(d=>setJobs(d.jobs || [])).catch(()=>{});
    (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        setUser(data.user);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, []);

  const handleSignOut = async () => {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.href = "/";
    } catch {}
  };

  return (
    <div className="min-h-screen bg-[#F7F7F7]">
      <header className="h-[56px] bg-white border-b flex items-center px-6 justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#FF6B2C] flex items-center justify-center text-white font-bold text-xs">V</div>
          <span className="font-semibold">VedaAI</span>
          <span className="text-gray-300 mx-2">/</span>
          <span className="text-sm text-gray-600">My Assessments</span>
        </Link>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-gray-600">{user.email}</span>
              <button onClick={handleSignOut} className="text-sm px-4 py-2 rounded-full border hover:bg-gray-50">Sign out</button>
            </>
          ) : (
            <Link href="/auth/login" className="text-sm px-4 py-2 rounded-full bg-[#FF6B2C] text-white">Sign in</Link>
          )}
        </div>
      </header>
      <main className="max-w-[960px] mx-auto p-6">
        {error && <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-sm text-amber-800 mb-4">{error} — Supabase not configured? See docs/AUTH_SETUP.md</div>}
        <h1 className="text-xl font-semibold">My Assessments</h1>
        <p className="text-sm text-gray-500 mt-1">{jobs.length} assessments • {user ? "authenticated" : "guest (local tmp, not persisted)"}</p>
        <div className="grid gap-3 mt-6">
          {jobs.length === 0 ? (
            <div className="bg-white rounded-2xl border p-8 text-center text-sm text-gray-500">
              No assessments yet. <Link href="/" className="text-[#FF6B2C] hover:underline">Create one</Link>
            </div>
          ) : (
            jobs.map((j: any) => (
              <Link key={j.id} href={`/results/${j.id}`} className="bg-white rounded-2xl border p-4 flex items-center justify-between hover:shadow-sm transition">
                <div>
                  <p className="text-sm font-medium">{j.id.slice(0, 8)} • {j.status}</p>
                  <p className="text-xs text-gray-500">{new Date(j.createdAt).toLocaleString()} • {j.currentStage}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${j.status==="COMPLETED"?"bg-emerald-50 text-emerald-700": j.status==="FAILED"?"bg-red-50 text-red-700":"bg-gray-100"}`}>{j.status}</span>
              </Link>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
