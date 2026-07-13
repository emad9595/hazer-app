"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  id: string;
  full_name: string | null;
  hourly_wage: number | null;
  organization_id: string | null;
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
      .select("id, full_name, hourly_wage, organization_id")
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

    await supabase.from("attendance_records").insert({
      employee_id: userData.user.id,
      organization_id: profile?.organization_id ?? null,
      status: "open",
      check_in_lat: coords?.lat ?? null,
      check_in_lng: coords?.lng ?? null,
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
          {mapImageUrl && (
            <img
              src={mapImageUrl}
              alt="موقعیت ثبت ورود"
              className="w-full rounded-xl mb-4 border border-white/20"
            />
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
    </main>
  );
}
