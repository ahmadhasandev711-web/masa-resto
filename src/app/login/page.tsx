import Link from 'next/link';
import { Store, ArrowRight } from 'lucide-react';
import { LoginForm } from './login-form';
import { DEMO_ACCOUNTS, DEMO_BANNER_TEXT, isDemoMode } from '../../infrastructure/demo/demo-policy';

export default function LoginPage() {
  const demoAccounts = isDemoMode()
    ? DEMO_ACCOUNTS.map((account) => ({
        label: account.labelAr,
        username: account.username,
        password: account.password,
      }))
    : null;
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-4" dir="rtl">
      <section className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-9 space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-900 transition"
          >
            <ArrowRight size={15} />
            <span>العودة للموقع الرئيسي</span>
          </Link>
          <span className="text-3xs font-mono text-zinc-400">MASA Platform</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-zinc-900 text-white shadow-2xs">
            <Store size={22} />
          </span>
          <div>
            <p className="text-xs text-zinc-500">لوحة التحكم المركزية</p>
            <h1 className="text-xl font-bold text-zinc-950">دخول لوحة الإدارة</h1>
          </div>
        </div>


        <LoginForm />

        {demoAccounts && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-bold">{DEMO_BANNER_TEXT}</p>
            <p className="mt-1 text-xs">كلمة المرور هي نفس اسم المستخدم.</p>
            <ul className="mt-3 space-y-1.5 text-xs">
              {demoAccounts.map((account) => (
                <li key={account.username} className="flex items-center justify-between gap-3">
                  <span className="font-bold">{account.label}</span>
                  <span dir="ltr" className="font-mono">{account.username}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
