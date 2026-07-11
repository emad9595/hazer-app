import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "حاضر | مدیریت حضور و غیاب",
  description: "سامانه مدیریت حضور و غیاب و محاسبه درآمد ساعتی کارکنان",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fa" dir="rtl">
      <body className="bg-slate-50 text-slate-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}
