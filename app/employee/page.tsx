"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  id: string;
  full_name: string | null;
  hourly_wage: number | null;
};

type OpenShift = {
  id: string;
  check_in_at: string;
};

export default function EmployeePage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [openShift, setOpenShift] = useState<OpenShift | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.push("/login");
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, full_name, hourly_wage")
      .eq("id", userData.user.id)
      .single();
    setProfile(profileData);

    const { data: shift } = await supabase
      .from("attendance_records")
      .select("id, check_in_at")
      .eq("employee_id", userData.user.id)
      .eq("status", "open")
      .maybeSingle();
    setOpenShift(shift);
    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!openShift) return;
    const tick = () => {
      const start = new Date(openShift.check_in_at).getTime();
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [openShift]);

  async function handleCheckIn() {
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    let coords: { lat: number | null; lng: number | null } = {
      lat: null,
      lng: null,
    };
    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject)
      );
      coords = { lat: position.coords.latitude, lng: position.coords.longitude };
    } catch {
      // location optional; continue without it
    }

    await supabase.from("attendance_records").insert({
      employee_id: userData.user.id,
      status: "open",
      check_in_lat: coords.lat,
      check_in_lng: coords.lng,
    });

    setBusy(false);
    loadData();
  }

  async function handleCheckOut() {
    if (!openShift) return;
    setBusy(true);

    let coords: { lat: number | null; lng: number | null } = {
      lat: null,
      lng: null,
    };
    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject)
      );
      coords = { lat: position.coords.latitude, lng: position.coords.longitude };
    } catch {
      // ignore
    }

    await supabase
      .from("attendance_records")
      .update({
        check_out_at: new Date().toISOString(),
        check_out_lat: coords.lat,
        check_out_lng: coords.lng,
        status: "closed",
      })
      .eq("id", openShift.id);

    setBusy(false);
    setOpenShift(null);
    loadData();
  }

  if (loading) {
    return <main className="p-6 text-center text-slate-500">در حال بارگذاری...</main>;
  }

  const hourlyWage = profile?.hourly_wage ?? 0;
  const earnings = (elapsedSeconds / 3600) * hourlyWage;
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  return (
    <main className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-xl font-bold mb-1">
        سلام {profile?.full_name ?? ""} 👋
      </h1>
      <p className="text-slate-500 text-sm mb-6">امروز آماده کاری؟</p>

      {openShift ? (
        <div className="rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white p-6 mb-4 text-center">
          <p className="text-sm opacity-80 mb-1">در حال کار از ساعت</p>
          <p className="text-3xl font-black tracking-wider mb-4">
            {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:
            {String(seconds).padStart(2, "0")}
          </p>
          {hourlyWage > 0 && (
            <div className="bg-white/15 rounded-xl py-3 mb-4">
              <p className="text-xs opacity-80">درآمد این شیفت (تخمینی)</p>
              <p className="text-2xl font-black">
                {earnings.toLocaleString("fa-IR", { maximumFractionDigits: 0 })}{" "}
                تومان
              </p>
            </div>
          )}
          <button
            onClick={handleCheckOut}
            disabled={busy}
            className="w-full py-3 rounded-xl bg-white text-teal-700 font-bold disabled:opacity-60"
          >
            {busy ? "..." : "ثبت خروج"}
          </button>
        </div>
      ) : (
        <button
          onClick={handleCheckIn}
          disabled={busy}
          className="w-full py-5 rounded-2xl bg-gradient-to-br from-cyan-600 to-teal-500 text-white text-lg font-bold shadow-lg shadow-teal-500/20 disabled:opacity-60"
        >
          {busy ? "..." : "ثبت ورود"}
        </button>
      )}
    </main>
  );
}
