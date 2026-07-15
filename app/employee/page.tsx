"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatShamsiDate, formatPersianTime } from "@/lib/shamsi";

type Profile = {
  id: string;
  full_name: string | null;
  hourly_wage: number | null;
  organization_id: string | null;
  position: string | null;
  department: string | null;
  employee_code: string | null;
};

type OpenShift = {
  id: string;
  check_in_at: string;
};

type Coords = { lat: number; lng: number } | null;

const HOLD_DURATION_MS = 1100;
const MAPIR_API_KEY = process.env.NEXT_PUBLIC_MAPIR_API_KEY;

function getLocation(): Promise<Coords> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (value: Coords) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    // Backup timer: some browser/OS combinations ignore the geolocation
    // API's own timeout option, so we enforce our own hard cutoff too.
    const backupTimer = setTimeout(() => finish(null), 3000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(backupTimer);
        finish({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        clearTimeout(backupTimer);
        finish(null);
      },
      { timeout: 3000, maximumAge: 30000 }
    );
  });
}

function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Map.ir's Static Map API requires the API key to be sent as an
 * "x-api-key" HTTP header (not a URL query parameter), so a plain
 * <img src="..."> can't authenticate on its own. We fetch the image
 * ourselves with the correct header and turn the result into a
 * temporary blob URL that <img> can display normally.
 */
async function fetchStaticMapBlobUrl(coords: Coords): Promise<string | null> {
  if (!coords || !MAPIR_API_KEY) return null;
  const { lat, lng } = coords;

  const params = new URLSearchParams({
    width: "500",
    height: "220",
    zoom_level: "16",
    markers: `color:origin|label:حاضر|${lng},${lat}`,
    center: `${lat},${lng}`,
  });

  try {
    const res = await fetch(`https://map.ir/static?${params.toString()}`, {
      headers: { "x-api-key": MAPIR_API_KEY },
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/**
 * Press-and-hold button used for check-in / check-out.
 * Filling ring gives a visual, self-explanatory cue without any text
 * instructions — inspired by the "hold to accept" pattern in ride-hailing apps.
 */
function HoldButton({
  label,
  busyLabel,
  busy,
  onConfirm,
  variant = "primary",
}: {
  label: string;
  busyLabel: string;
  busy: boolean;
  onConfirm: () => void;
  variant?: "primary" | "light";
}) {
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    startRef.current = null;
    setProgress(0);
  }, []);

  const tick = useCallback(() => {
    if (startRef.current === null) return;
    const elapsed = Date.now() - startRef.current;
    const pct = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
    setProgress(pct);
    if (pct >= 100) {
      stop();
      onConfirm();
      return;
    }
    frameRef.current = requestAnimationFrame(tick);
  }, [onConfirm, stop]);

  const start = useCallback(() => {
    if (busy) return;
    startRef.current = Date.now();
    frameRef.current = requestAnimationFrame(tick);
  }, [busy, tick]);

  useEffect(() => stop, [stop]);

  const isPrimary = variant === "primary";
  const ringColor = isPrimary ? "#ffffff" : "#0d9488";

  return (
    <button
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      disabled={busy}
      style={{
        backgroundImage: `conic-gradient(${ringColor} ${progress}%, transparent ${progress}%)`,
      }}
      className={`relative w-full py-5 rounded-2xl text-lg font-bold select-none touch-none transition-transform active:scale-[0.98] disabled:opacity-60 ${
        isPrimary
          ? "bg-gradient-to-br from-cyan-600 to-teal-500 text-white shadow-lg shadow-teal-500/20"
          : "bg-white text-teal-700"
      }`}
    >
      <span
        className={`absolute inset-[3px] rounded-2xl flex items-center justify-center ${
          isPrimary ? "bg-gradient-to-br from-cyan-600 to-teal-500" : "bg-white"
        }`}
      >
        {busy ? busyLabel : progress > 0 ? "نگه دارید..." : label}
      </span>
    </button>
  );
}

export default function EmployeePage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [openShift, setOpenShift] = useState<OpenShift | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastCoords, setLastCoords] = useState<Coords>(null);
  const [locationVerified, setLocationVerified] = useState<boolean | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(interval);
  }, []);
  const [mapImageUrl, setMapImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      const url = await fetchStaticMapBlobUrl(lastCoords);
      if (!cancelled) {
        objectUrl = url;
        setMapImageUrl(url);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [lastCoords]);

  const loadData = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.push("/login");
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, full_name, hourly_wage, organization_id, position, department, employee_code")
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
    if (!userData.user) {
      setBusy(false);
      return;
    }

    const coords = await getLocation();
    setLastCoords(coords);

    let locationVerified: boolean | null = null;
    if (coords && profile?.organization_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("work_lat, work_lng, work_radius_meters")
        .eq("id", profile.organization_id)
        .single();

      if (org?.work_lat && org?.work_lng) {
        const distance = distanceMeters(
          coords.lat,
          coords.lng,
          org.work_lat,
          org.work_lng
        );
        locationVerified = distance <= (org.work_radius_meters ?? 150);
      }
    }
    setLocationVerified(locationVerified);

    await supabase.from("attendance_records").insert({
      employee_id: userData.user.id,
      organization_id: profile?.organization_id ?? null,
      status: "open",
      check_in_lat: coords?.lat ?? null,
      check_in_lng: coords?.lng ?? null,
      location_verified: locationVerified,
    });

    setBusy(false);
    loadData();
  }

  async function handleCheckOut() {
    if (!openShift) return;
    setBusy(true);

    const coords = await getLocation();
    setLastCoords(coords);

    await supabase
      .from("attendance_records")
      .update({
        check_out_at: new Date().toISOString(),
        check_out_lat: coords?.lat ?? null,
        check_out_lng: coords?.lng ?? null,
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
      <div className="flex items-center justify-between text-slate-500 text-sm mb-1">
        <span>{formatShamsiDate(now)}</span>
        <span className="font-mono">{formatPersianTime(now)}</span>
      </div>
      {(profile?.position || profile?.department) && (
        <p className="text-xs text-slate-400 mb-4">
          {[profile.position, profile.department].filter(Boolean).join(" · ")}
          {profile.employee_code ? ` · کد پرسنلی: ${profile.employee_code}` : ""}
        </p>
      )}

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
          {mapImageUrl && (
            <img
              src={mapImageUrl}
              alt="موقعیت ثبت ورود"
              className="w-full rounded-xl mb-4 border border-white/20"
            />
          )}
          {locationVerified !== null && (
            <p
              className={`text-xs mb-4 rounded-lg py-2 px-3 ${
                locationVerified ? "bg-white/15" : "bg-amber-400/30"
              }`}
            >
              {locationVerified
                ? "✓ موقعیت شما در محدوده محل کار تایید شد"
                : "⚠ موقعیت شما خارج از محدوده محل کار ثبت شد"}
            </p>
          )}
          <HoldButton
            label="نگه دارید برای ثبت خروج"
            busyLabel="..."
            busy={busy}
            onConfirm={handleCheckOut}
            variant="light"
          />
        </div>
      ) : (
        <>
          {mapImageUrl && (
            <img
              src={mapImageUrl}
              alt="موقعیت ثبت خروج قبلی"
              className="w-full rounded-xl mb-4 border border-slate-100"
            />
          )}
          <HoldButton
            label="نگه دارید برای ثبت ورود"
            busyLabel="..."
            busy={busy}
            onConfirm={handleCheckIn}
            variant="primary"
          />
        </>
      )}

      <LeaveSection profile={profile} supabase={supabase} />
    </main>
  );
}

type LeaveRequest = {
  id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
};

function LeaveSection({
  profile,
  supabase,
}: {
  profile: Profile | null;
  supabase: ReturnType<typeof createClient>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadRequests = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("leave_requests")
      .select("id, start_date, end_date, reason, status")
      .eq("employee_id", profile.id)
      .order("created_at", { ascending: false });
    setRequests(data ?? []);
  }, [profile, supabase]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSubmitting(true);
    await supabase.from("leave_requests").insert({
      employee_id: profile.id,
      organization_id: profile.organization_id,
      start_date: startDate,
      end_date: endDate,
      reason: reason || null,
    });
    setStartDate("");
    setEndDate("");
    setReason("");
    setShowForm(false);
    setSubmitting(false);
    loadRequests();
  }

  const statusLabel: Record<LeaveRequest["status"], string> = {
    pending: "در انتظار بررسی",
    approved: "تایید شده",
    rejected: "رد شده",
  };
  const statusColor: Record<LeaveRequest["status"], string> = {
    pending: "bg-amber-50 text-amber-700",
    approved: "bg-green-50 text-green-700",
    rejected: "bg-red-50 text-red-700",
  };

  return (
    <div className="mt-6 bg-white rounded-2xl border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-sm">درخواست مرخصی</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-white font-bold"
        >
          {showForm ? "انصراف" : "+ درخواست جدید"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 mb-4 p-3 rounded-xl bg-slate-50">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium">از تاریخ</label>
              <input
                required
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-xs font-medium">تا تاریخ</label>
              <input
                required
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white"
                dir="ltr"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium">دلیل (اختیاری)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white"
            />
          </div>
          <button
            disabled={submitting}
            className="w-full py-2 rounded-lg bg-teal-600 text-white text-sm font-bold disabled:opacity-60"
          >
            {submitting ? "در حال ارسال..." : "ارسال درخواست"}
          </button>
        </form>
      )}

      {requests.length === 0 ? (
        <p className="text-slate-400 text-xs">هنوز درخواستی ثبت نکرده‌اید.</p>
      ) : (
        <ul className="space-y-2">
          {requests.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-2"
            >
              <span>
                {r.start_date} تا {r.end_date}
              </span>
              <span className={`px-2 py-0.5 rounded-full ${statusColor[r.status]}`}>
                {statusLabel[r.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
