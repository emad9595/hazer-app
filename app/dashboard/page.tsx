"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatShamsiDate } from "@/lib/shamsi";

type Employee = {
  id: string;
  full_name: string | null;
  phone: string | null;
  hourly_wage: number | null;
  is_active: boolean;
};

type LeaveRequest = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  leave_type: "full_day" | "hourly";
  hours: number | null;
};

type Organization = {
  id: string;
  name: string;
  phone: string | null;
  work_lat: number | null;
  work_lng: number | null;
  work_radius_meters: number | null;
  leave_auto_approve: boolean;
};

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [org, setOrg] = useState<Organization | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [workingNow, setWorkingNow] = useState<Set<string>>(new Set());
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hourlyWage, setHourlyWage] = useState("");
  const [showExtraFields, setShowExtraFields] = useState(false);
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  const [nationalCode, setNationalCode] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [startDate, setStartDate] = useState("");
  const [salaryType, setSalaryType] = useState<"hourly" | "monthly">("hourly");
  const [monthlySalary, setMonthlySalary] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWage, setEditWage] = useState("");

  const [orgNameDraft, setOrgNameDraft] = useState("");
  const [orgPhoneDraft, setOrgPhoneDraft] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);
  const [radiusDraft, setRadiusDraft] = useState("150");
  const [capturingLocation, setCapturingLocation] = useState(false);
  const [locationMsg, setLocationMsg] = useState<string | null>(null);

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
      .select("id, name, phone, work_lat, work_lng, work_radius_meters, leave_auto_approve")
      .eq("id", profile.organization_id)
      .single();
    setOrg(orgData);
    setOrgNameDraft(orgData?.name ?? "");
    setOrgPhoneDraft(orgData?.phone ?? "");
    setRadiusDraft(String(orgData?.work_radius_meters ?? 150));

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

    const { data: leaves } = await supabase
      .from("leave_requests")
      .select("id, employee_id, start_date, end_date, reason, status, leave_type, hours")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false });
    setLeaveRequests(leaves ?? []);

    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: whenever an attendance record changes (check-in or
  // check-out), reflect it immediately without requiring a page refresh.
  useEffect(() => {
    const channel = supabase
      .channel("attendance-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_records" },
        (payload) => {
          const row = (payload.new ?? payload.old) as {
            employee_id: string;
            status: string;
          };
          if (!row?.employee_id) return;

          setWorkingNow((prev) => {
            const next = new Set(prev);
            if (payload.eventType !== "DELETE" && row.status === "open") {
              next.add(row.employee_id);
            } else {
              next.delete(row.employee_id);
            }
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Live updates for leave requests too, so a new request from an
  // employee shows up instantly without a manual refresh.
  useEffect(() => {
    const channel = supabase
      .channel("leave-requests-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leave_requests" },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

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
        position: position || null,
        department: department || null,
        nationalCode: nationalCode || null,
        employeeCode: employeeCode || null,
        startDate: startDate || null,
        salaryType,
        monthlySalary: monthlySalary ? Number(monthlySalary) : null,
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
    setPosition("");
    setDepartment("");
    setNationalCode("");
    setEmployeeCode("");
    setStartDate("");
    setSalaryType("hourly");
    setMonthlySalary("");
    setShowExtraFields(false);
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

  async function toggleAutoApprove() {
    if (!org) return;
    await supabase
      .from("organizations")
      .update({ leave_auto_approve: !org.leave_auto_approve })
      .eq("id", org.id);
    load();
  }

  async function reviewLeave(id: string, status: "approved" | "rejected") {
    await supabase
      .from("leave_requests")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id);
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

  function captureWorkLocation() {
    if (!org || !navigator.geolocation) return;
    setCapturingLocation(true);
    setLocationMsg(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await supabase
          .from("organizations")
          .update({
            work_lat: position.coords.latitude,
            work_lng: position.coords.longitude,
            work_radius_meters: Number(radiusDraft) || 150,
          })
          .eq("id", org.id);
        setCapturingLocation(false);
        setLocationMsg("موقعیت محل کار با موفقیت ثبت شد.");
        load();
      },
      () => {
        setCapturingLocation(false);
        setLocationMsg("دریافت موقعیت مکانی ممکن نشد. لطفاً دسترسی GPS را بررسی کنید.");
      },
      { timeout: 8000 }
    );
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
              type="button"
              onClick={() => setShowExtraFields((v) => !v)}
              className="text-xs text-teal-700 underline"
            >
              {showExtraFields ? "پنهان کردن اطلاعات تکمیلی" : "+ افزودن اطلاعات تکمیلی (سمت، دپارتمان و ...)"}
            </button>

            {showExtraFields && (
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-sm font-medium">سمت شغلی</label>
                    <input
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">دپارتمان</label>
                    <input
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-sm font-medium">کد ملی</label>
                    <input
                      value={nationalCode}
                      onChange={(e) => setNationalCode(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">کد پرسنلی</label>
                    <input
                      value={employeeCode}
                      onChange={(e) => setEmployeeCode(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
                      dir="ltr"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">تاریخ شروع به کار</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">نوع حقوق</label>
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setSalaryType("hourly")}
                      className={`flex-1 py-2 rounded-lg text-sm border ${
                        salaryType === "hourly"
                          ? "bg-teal-600 text-white border-teal-600"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      ساعتی
                    </button>
                    <button
                      type="button"
                      onClick={() => setSalaryType("monthly")}
                      className={`flex-1 py-2 rounded-lg text-sm border ${
                        salaryType === "monthly"
                          ? "bg-teal-600 text-white border-teal-600"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      حقوق ثابت ماهانه
                    </button>
                  </div>
                </div>
                {salaryType === "monthly" && (
                  <div>
                    <label className="text-sm font-medium">حقوق ثابت ماهانه (تومان)</label>
                    <input
                      type="number"
                      value={monthlySalary}
                      onChange={(e) => setMonthlySalary(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
                      dir="ltr"
                    />
                  </div>
                )}
              </div>
            )}

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

      {/* Leave requests */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold">
            درخواست‌های مرخصی{" "}
            <span className="text-slate-400 font-normal text-sm">
              ({leaveRequests.filter((l) => l.status === "pending").length} در انتظار)
            </span>
          </h2>
        </div>
        <button
          onClick={toggleAutoApprove}
          className="flex items-center gap-2 mb-4 text-xs text-slate-500"
        >
          <span
            className={`w-8 h-4 rounded-full relative transition-colors ${
              org?.leave_auto_approve ? "bg-teal-600" : "bg-slate-200"
            }`}
          >
            <span
              className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${
                org?.leave_auto_approve ? "right-0.5" : "right-4"
              }`}
            />
          </span>
          تایید خودکار مرخصی‌ها (بدون نیاز به بررسی دستی)
        </button>
        {leaveRequests.length === 0 ? (
          <p className="text-slate-400 text-sm">درخواستی ثبت نشده است.</p>
        ) : (
          <ul className="space-y-2">
            {leaveRequests.map((r) => {
              const emp = employees.find((e) => e.id === r.employee_id);
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2"
                >
                  <div>
                    <p className="font-medium">{emp?.full_name ?? "کارمند"}</p>
                    <p className="text-xs text-slate-400">
                      {formatShamsiDate(new Date(r.start_date))}
                      {r.leave_type === "hourly"
                        ? ` — ${r.hours} ساعت`
                        : r.end_date !== r.start_date
                        ? ` تا ${formatShamsiDate(new Date(r.end_date))}`
                        : ""}
                      {r.reason ? ` — ${r.reason}` : ""}
                    </p>
                  </div>
                  {r.status === "pending" ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => reviewLeave(r.id, "approved")}
                        className="text-xs px-2 py-1 rounded bg-green-600 text-white"
                      >
                        تایید
                      </button>
                      <button
                        onClick={() => reviewLeave(r.id, "rejected")}
                        className="text-xs px-2 py-1 rounded bg-red-500 text-white"
                      >
                        رد
                      </button>
                    </div>
                  ) : (
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        r.status === "approved"
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {r.status === "approved" ? "تایید شده" : "رد شده"}
                    </span>
                  )}
                </li>
              );
            })}
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

        <div className="mt-6 pt-6 border-t border-slate-100">
          <h3 className="font-bold text-sm mb-1">موقعیت محل کار</h3>
          <p className="text-xs text-slate-400 mb-3">
            ثبت تردد کارکنان با این موقعیت مقایسه می‌شود تا مشخص شود در محل کار
            بوده‌اند یا خیر.
          </p>

          {org?.work_lat ? (
            <p className="text-xs text-teal-700 bg-teal-50 rounded-lg px-3 py-2 mb-3">
              موقعیت ثبت شده — شعاع مجاز: {org.work_radius_meters} متر
            </p>
          ) : (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3">
              هنوز موقعیتی ثبت نشده — ثبت تردد بدون بررسی محدوده انجام می‌شود.
            </p>
          )}

          <div className="flex items-center gap-2 mb-3">
            <label className="text-sm text-slate-500 whitespace-nowrap">
              شعاع مجاز (متر)
            </label>
            <input
              type="number"
              value={radiusDraft}
              onChange={(e) => setRadiusDraft(e.target.value)}
              className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              dir="ltr"
            />
          </div>

          <button
            onClick={captureWorkLocation}
            disabled={capturingLocation}
            className="w-full py-2.5 rounded-lg border border-teal-600 text-teal-700 text-sm font-bold disabled:opacity-60"
          >
            {capturingLocation
              ? "در حال دریافت موقعیت..."
              : "📍 موقعیت فعلی من را به‌عنوان محل کار ثبت کن"}
          </button>
          {locationMsg && (
            <p className="text-xs text-slate-500 mt-2">{locationMsg}</p>
          )}
        </div>
      </div>
    </main>
  );
}
