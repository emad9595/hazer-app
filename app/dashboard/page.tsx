"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Employee = {
  id: string;
  full_name: string | null;
  phone: string | null;
  hourly_wage: number | null;
  is_active: boolean;
};

type Organization = {
  id: string;
  name: string;
  phone: string | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [org, setOrg] = useState<Organization | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [workingNow, setWorkingNow] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hourlyWage, setHourlyWage] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWage, setEditWage] = useState("");

  const [orgNameDraft, setOrgNameDraft] = useState("");
  const [orgPhoneDraft, setOrgPhoneDraft] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);

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

    if (!profile || profile.role !== "employer" || !profile.organization_id) {
      router.push("/login");
      return;
    }

    const { data: orgData } = await supabase
      .from("organizations")
      .select("id, name, phone")
      .eq("id", profile.organization_id)
      .single();
    setOrg(orgData);
    setOrgNameDraft(orgData?.name ?? "");
    setOrgPhoneDraft(orgData?.phone ?? "");

    const { data: emps } = await supabase
      .from("profiles")
      .select("id, full_name, phone, hourly_wage, is_active")
      .eq("organization_id", profile.organization_id)
      .eq("role", "employee");
    setEmployees(emps ?? []);

    if (emps && emps.length > 0) {
      const { data: openShifts } = await supabase
        .from("attendance_records")
        .select("employee_id")
        .in("employee_id", emps.map((e) => e.id))
        .eq("status", "open");
      setWorkingNow(new Set((openShifts ?? []).map((s) => s.employee_id)));
    }

    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName,
        email,
        password,
        hourlyWage: hourlyWage ? Number(hourlyWage) : null,
      }),
    });
    const result = await res.json();

    if (!res.ok) {
      setError(result.error ?? "خطا در افزودن کارمند");
      setSubmitting(false);
      return;
    }

    setFullName("");
    setEmail("");
    setPassword("");
    setHourlyWage("");
    setShowAddForm(false);
    setSubmitting(false);
    load();
  }

  async function saveWage(employeeId: string) {
    await fetch("/api/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        hourlyWage: editWage ? Number(editWage) : null,
      }),
    });
    setEditingId(null);
    load();
  }

  async function toggleActive(employeeId: string, current: boolean) {
    await fetch("/api/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, isActive: !current }),
    });
    load();
  }

  async function saveOrgSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!org) return;
    setSavingOrg(true);
    await supabase
      .from("organizations")
      .update({ name: orgNameDraft, phone: orgPhoneDraft })
      .eq("id", org.id);
    setSavingOrg(false);
    load();
  }

  if (loading) {
    return <main className="p-6 text-center text-slate-500">در حال بارگذاری...</main>;
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-4">
      <h1 className="text-xl font-bold">داشبورد کارفرما</h1>

      {/* Employees */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">
            کارکنان سازمان{" "}
            <span className="text-slate-400 font-normal text-sm">
              ({employees.length})
            </span>
          </h2>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="text-sm px-4 py-2 rounded-lg bg-gradient-to-l from-cyan-600 to-teal-500 text-white font-bold"
          >
            {showAddForm ? "انصراف" : "+ افزودن کارمند"}
          </button>
        </div>

        {showAddForm && (
          <form
            onSubmit={handleAddEmployee}
            className="space-y-3 mb-5 p-4 rounded-xl bg-slate-50 border border-slate-100"
          >
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
                {error}
              </div>
            )}
            <div>
              <label className="text-sm font-medium">نام کامل کارمند</label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
              />
            </div>
            <div>
              <label className="text-sm font-medium">ایمیل ورود کارمند</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                رمز عبور موقت (به کارمند بدهید)
              </label>
              <input
                required
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                حقوق ساعتی (تومان) — اختیاری
              </label>
              <input
                type="number"
                value={hourlyWage}
                onChange={(e) => setHourlyWage(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
                dir="ltr"
              />
            </div>
            <button
              disabled={submitting}
              className="w-full py-2.5 rounded-lg bg-teal-600 text-white font-bold disabled:opacity-60"
            >
              {submitting ? "در حال افزودن..." : "افزودن کارمند"}
            </button>
          </form>
        )}

        {employees.length === 0 ? (
          <p className="text-slate-400 text-sm">
            هنوز کارمندی اضافه نشده است.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {employees.map((emp) => (
              <li key={emp.id} className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        workingNow.has(emp.id) ? "bg-green-500" : "bg-slate-300"
                      }`}
                      title={workingNow.has(emp.id) ? "الان سرکار است" : "غیرفعال"}
                    />
                    <span className={!emp.is_active ? "text-slate-400 line-through" : ""}>
                      {emp.full_name}
                    </span>
                  </div>

                  {editingId === emp.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        type="number"
                        value={editWage}
                        onChange={(e) => setEditWage(e.target.value)}
                        className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                        dir="ltr"
                      />
                      <button
                        onClick={() => saveWage(emp.id)}
                        className="text-xs px-2 py-1 rounded bg-teal-600 text-white"
                      >
                        ذخیره
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setEditingId(emp.id);
                          setEditWage(String(emp.hourly_wage ?? ""));
                        }}
                        className="text-slate-500 text-sm"
                      >
                        {emp.hourly_wage
                          ? `${emp.hourly_wage.toLocaleString("fa-IR")} تومان/ساعت`
                          : "تعیین حقوق"}
                      </button>
                      <button
                        onClick={() => toggleActive(emp.id, emp.is_active)}
                        className="text-xs text-slate-400 underline"
                      >
                        {emp.is_active ? "غیرفعال کردن" : "فعال کردن"}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Organization settings */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <h2 className="font-bold mb-4">تنظیمات سازمان</h2>
        <form onSubmit={saveOrgSettings} className="space-y-3">
          <div>
            <label className="text-sm font-medium">نام سازمان</label>
            <input
              value={orgNameDraft}
              onChange={(e) => setOrgNameDraft(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">شماره تماس</label>
            <input
              value={orgPhoneDraft}
              onChange={(e) => setOrgPhoneDraft(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              dir="ltr"
            />
          </div>
          <button
            disabled={savingOrg}
            className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-bold disabled:opacity-60"
          >
            {savingOrg ? "در حال ذخیره..." : "ذخیره تنظیمات"}
          </button>
        </form>
      </div>
    </main>
  );
}
