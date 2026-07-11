"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !data.user) {
      setError("ایمیل یا رمز عبور اشتباه است");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    setLoading(false);

    if (profile?.role === "super_admin") router.push("/admin");
    else if (profile?.role === "employer") router.push("/dashboard");
    else router.push("/employee");
  }

  return (
    <main className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
        <h1 className="text-2xl font-bold mb-1">ورود به حاضر</h1>
        <p className="text-slate-500 text-sm mb-6">
          با ایمیل و رمز عبور خود وارد شوید
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-sm font-medium">ایمیل</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              dir="ltr"
            />
          </div>
          <div>
            <label className="text-sm font-medium">رمز عبور</label>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </div>
          <button
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-l from-cyan-600 to-teal-500 text-white font-bold disabled:opacity-60"
          >
            {loading ? "در حال ورود..." : "ورود"}
          </button>
        </form>

        <p className="text-sm text-slate-500 mt-6 text-center">
          حساب ندارید؟{" "}
          <Link href="/signup" className="text-teal-600 font-bold">
            ثبت‌نام کنید
          </Link>
        </p>
      </div>
    </main>
  );
}
