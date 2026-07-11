"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("رمز عبور و تکرار آن یکسان نیستند");
      return;
    }

    setLoading(true);

    // Step 1: create the auth user
    const { data: signUpData, error: signUpError } =
      await supabase.auth.signUp({ email, password });

    if (signUpError || !signUpData.user) {
      setError(signUpError?.message ?? "خطا در ایجاد حساب کاربری");
      setLoading(false);
      return;
    }

    const userId = signUpData.user.id;

    // Step 2: create the organization (runs client-side, so auth.uid()
    // is correctly available to the RLS policy)
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({ name: orgName, phone, status: "trial" })
      .select()
      .single();

    if (orgError || !org) {
      setError("خطا در ایجاد سازمان: " + (orgError?.message ?? ""));
      setLoading(false);
      return;
    }

    // Step 3: create the profile, linking user -> organization as employer
    const { error: profileError } = await supabase.from("profiles").insert({
      id: userId,
      organization_id: org.id,
      role: "employer",
      full_name: `${firstName} ${lastName}`,
      phone,
    });

    if (profileError) {
      setError("خطا در ایجاد پروفایل: " + profileError.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push("/dashboard");
  }

  return (
    <main className="flex items-center justify-center min-h-screen px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
        <h1 className="text-2xl font-bold mb-1">ایجاد حساب کاربری</h1>
        <p className="text-slate-500 text-sm mb-6">
          سازمان و حساب کاربری خود را ایجاد کنید
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">نام</label>
              <input
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium">نام خانوادگی</label>
              <input
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">نام سازمان/شرکت</label>
            <input
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </div>

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
            <label className="text-sm font-medium">شماره موبایل</label>
            <input
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              dir="ltr"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <label className="text-sm font-medium">تکرار رمز</label>
              <input
                required
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
          </div>

          <button
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-l from-cyan-600 to-teal-500 text-white font-bold disabled:opacity-60"
          >
            {loading ? "در حال ایجاد..." : "ایجاد حساب"}
          </button>
        </form>
      </div>
    </main>
  );
}
