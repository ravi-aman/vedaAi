export default function AuthCodeError() {
  return (
    <div className="min-h-screen bg-[#F7F7F7] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border p-8 max-w-md text-center">
        <h1 className="font-semibold">Authentication error</h1>
        <p className="text-sm text-gray-500 mt-2">Could not exchange code for session. Check Supabase URL, Google OAuth callback, and that NEXT_PUBLIC_SUPABASE_URL is set.</p>
        <a href="/auth/login" className="inline-block mt-4 text-sm px-4 py-2 rounded-full bg-[#FF6B2C] text-white">Back to login</a>
      </div>
    </div>
  );
}
