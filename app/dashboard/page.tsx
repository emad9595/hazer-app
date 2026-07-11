"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Employee = {
  id: string;
  full_name: string | null;
  phone: string | null;
  hourly_wage: number | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.push("/login");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, role")
      .eq("id", userData.user.id)
      .single();

    if (!profile || profile.role !== "employer") {
      router.push("/login");
      return;
    }

    setOrgId(profile.organization_id);

    const { data: emps } = await supabase
      .from("profiles")
      .select("id, full_name, phone, hourly_wage")
      .eq("organization_id", profile.organization_id)
      .eq("role", "employee");

    setEmployees(emps ?? []);
    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <main className="p-6 text-center text-slate-500">در حال بارگذاری...</main>;
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold mb-6">داشبورد کارفرما</h1>

      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <h2 className="font-bold mb-4">کارکنان سازمان</h2>
        {employees.length === 0 ? (
          <p className="text-slate-400 text-sm">
            هنوز کارمندی اضافه نشده است.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {employees.map((emp) => (
              <li key={emp.id} className="py-3 flex justify-between">
                <span>{emp.full_name}</span>
                <span className="text-slate-400 text-sm">{emp.phone}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
