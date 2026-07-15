"use client";

import DatePicker, { DateObject } from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";

function toISODate(date: DateObject) {
  const d = date.toDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function JalaliDatePicker({
  value,
  onChange,
  disablePast = true,
  placeholder,
}: {
  value: string; // ISO date string, e.g. "2026-07-16"
  onChange: (isoDate: string) => void;
  disablePast?: boolean;
  placeholder?: string;
}) {
  return (
    <DatePicker
      calendar={persian}
      locale={persian_fa}
      value={value || undefined}
      onChange={(date) => {
        if (date && !Array.isArray(date)) onChange(toISODate(date));
      }}
      minDate={disablePast ? new Date() : undefined}
      placeholder={placeholder}
      inputClass="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white text-sm"
      containerClassName="w-full"
      calendarPosition="bottom-right"
    />
  );
}
