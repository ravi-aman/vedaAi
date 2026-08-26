"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/Button";

export function AuthGate({ onClose, jobId }: { onClose?: () => void; jobId: string }) {
  const [mode, setMode] = useState<"choose" | "email">("choose");
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
      const origin = window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${origin}/auth/callback?next=/results/${jobId}` },
      });
      if (error) throw error;
    } catch (e: any) {
      setError(e.message || "Google sign-in failed. Check Supabase Google OAuth config.");
      setLoading(false);
    }
  };

  const handleEmail = async (isSignup: boolean) => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      if (isSignup) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Check your email for confirmation.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // claim guest result
        await fetch(`/api/assessments/${jobId}/claim`, { method: "POST" });
        window.location.reload();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-[420px] p-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-[#FFF1EB] flex items-center justify-center text-[#FF6B2C] mx-auto">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1z" /></svg>
          </div>
          <h2 className="text-lg font-semibold mt-3">Save your assessment</h2>
          <p className="text-sm text-gray-500 mt-1">Your assessment is ready. Sign in or create your account to keep access to this result.</p>
        </div>

        {mode === "choose" ? (
          <div className="mt-6 space-y-3">
            <Button onClick={handleGoogle} disabled={loading} className="w-full" variant="secondary">
              <svg width="18" height="18" viewBox="0 0 24 24" className="mr-2"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </Button>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <div className="h-px flex-1 bg-gray-200" /> or <div className="h-px flex-1 bg-gray-200" />
            </div>
            <Button onClick={() => setMode("email")} className="w-full">Continue with Email</Button>
            {onClose && (
              <button onClick={onClose} className="w-full text-sm text-gray-500 hover:text-gray-700 mt-2">
                Continue as guest (temporary)
              </button>
            )}
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FF6B2C] text-sm"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FF6B2C] text-sm"
            />
            {error && <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
            {message && <p className="text-xs text-emerald-700 bg-emerald-50 p-2 rounded-lg">{message}</p>}
            <div className="flex gap-2">
              <Button onClick={() => handleEmail(false)} disabled={loading} className="flex-1">
                {loading ? "..." : "Sign in"}
              </Button>
              <Button onClick={() => handleEmail(true)} disabled={loading} variant="secondary" className="flex-1">
                Sign up
              </Button>
            </div>
            <button onClick={() => setMode("choose")} className="w-full text-xs text-gray-500 hover:text-gray-700">
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
