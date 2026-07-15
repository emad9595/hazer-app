"use client";

import DatePicker, { DateObject } from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import gregorian from "react-date-object/calendars/gregorian";
import gregorian_en from "react-date-object/locales/gregorian_en";

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
  value: string; // ISO date string (Gregorian), e.g. "2026-07-16"
  onChange: (isoDate: string) => void;
  disablePast?: boolean;
  placeholder?: string;
}) {
  // The stored value is always a plain Gregorian ISO date. It must be
  // parsed with the Gregorian calendar explicitly before being handed
  // to a Persian-calendar picker, otherwise the library misreads the
  // year/month as if it were already Persian.
  const dateObjectValue = value
    ? new DateObject({ date: value, format: "YYYY-MM-DD", calendar: gregorian, locale: gregorian_en })
    : undefined;

  return (
    <DatePicker
      calendar={persian}
      locale={persian_fa}
      value={dateObjectValue}
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
