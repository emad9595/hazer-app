"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Org = {
  id: string;
  name: string;
  status: string;
  created_at: string;
};

export default function AdminPage() {
  const router = useRouter();
  const supabase = createClient();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.push("/login");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (!profile || profile.role !== "super_admin") {
      router.push("/login");
      return;
    }

    const { data } = await supabase
      .from("organizations")
      .select("id, name, status, created_at")
      .order("created_at", { ascending: false });

    setOrgs(data ?? []);
    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <main className="p-6 text-center text-slate-500">در حال بارگذاری...</main>;
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold mb-6">پنل مدیریت پلتفرم حاضر</h1>

      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <h2 className="font-bold mb-4">سازمان‌های ثبت‌شده ({orgs.length})</h2>
        <ul className="divide-y divide-slate-100">
          {orgs.map((org) => (
            <li key={org.id} className="py-3 flex justify-between items-center">
              <span>{org.name}</span>
              <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                {org.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
