"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (e: any) {
      setError(e.message || "Google OAuth not configured — see docs/AUTH_SETUP.md");
      setLoading(false);
    }
  };

  const handleEmail = async (signup: boolean) => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      if (signup) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Check your email for confirmation (if email confirmation is enabled).");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = "/dashboard";
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F7] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-[420px] p-8">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-[#FFF1EB] flex items-center justify-center text-[#FF6B2C] mx-auto">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1z" /></svg>
          </div>
          <h1 className="text-xl font-semibold mt-3">Welcome to VedaAI</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to save and manage your assessments</p>
        </div>

        <div className="mt-6 space-y-3">
          <Button onClick={handleGoogle} disabled={loading} className="w-full" variant="secondary">
            Continue with Google
          </Button>
          <div className="flex items-center gap-3 text-xs text-gray-400"><div className="h-px flex-1 bg-gray-200" /> or <div className="h-px flex-1 bg-gray-200" /></div>
          <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FF6B2C] text-sm" />
          <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FF6B2C] text-sm" />
          {error && <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
          {message && <p className="text-xs text-emerald-700 bg-emerald-50 p-2 rounded-lg">{message}</p>}
          <div className="flex gap-2">
            <Button onClick={()=>handleEmail(false)} disabled={loading} className="flex-1">Sign in</Button>
            <Button onClick={()=>handleEmail(true)} disabled={loading} variant="secondary" className="flex-1">Sign up</Button>
          </div>
          <p className="text-xs text-gray-400 text-center mt-4">
            Guest assessments are temporary — sign in within 90 seconds to keep them.
          </p>
        </div>
      </div>
    </div>
  );
}
