import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center mb-6">
        <span className="text-white text-2xl font-bold">ح</span>
      </div>
      <h1 className="text-4xl font-extrabold mb-3">حاضر</h1>
      <p className="text-slate-500 mb-8 max-w-md">
        مدیریت هوشمند حضور و غیاب، محاسبه لحظه‌ای درآمد و رسید دیجیتال کارکنان
      </p>
      <div className="flex gap-3">
        <Link
          href="/signup"
          className="px-6 py-3 rounded-xl bg-gradient-to-l from-cyan-600 to-teal-500 text-white font-bold shadow-lg shadow-teal-500/20"
        >
          شروع رایگان
        </Link>
        <Link
          href="/login"
          className="px-6 py-3 rounded-xl border border-slate-200 font-bold bg-white"
        >
          ورود به پنل
        </Link>
      </div>
    </main>
  );
}
