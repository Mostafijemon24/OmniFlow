"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useUi } from "@/components/providers/ui-provider";

export function AuthModal() {
  const { authOpen, authMode, setAuthMode, closeAuth, triggerToast } = useUi();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!authOpen) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (authMode === "register") {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Registration failed.");
          return;
        }
      }

      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password.");
        return;
      }

      closeAuth();
      if (authMode === "register") {
        triggerToast("🎉 Account created successfully! Please complete your survey.");
        router.push("/onboarding");
      } else {
        triggerToast("Welcome back to your OmniFlow Creator Studio!");
        router.push("/dashboard");
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="glass-card relative w-full max-w-md space-y-6 rounded-3xl border border-slate-800 p-6 md:p-8">
        <button
          onClick={closeAuth}
          className="absolute right-5 top-5 text-sm text-slate-400 hover:text-white"
        >
          ✕
        </button>

        <div className="space-y-1 text-center">
          <h3 className="text-xl font-black text-white">
            {authMode === "register" ? "Create Your Creator Account" : "Welcome Back"}
          </h3>
          <p className="text-xs text-slate-400">
            {authMode === "register"
              ? "Start turning comments into passive store revenue."
              : "Enter your credentials to access your dashboard studio."}
          </p>
        </div>

        <div className="flex rounded-xl border border-slate-800 bg-dark-900 p-1">
          <button
            onClick={() => setAuthMode("register")}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
              authMode === "register" ? "bg-brand-600 text-white" : "text-slate-400"
            }`}
          >
            Register
          </button>
          <button
            onClick={() => setAuthMode("login")}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
              authMode === "login" ? "bg-brand-600 text-white" : "text-slate-400"
            }`}
          >
            Sign In
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {authMode === "register" && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">Full Name</label>
              <input
                type="text"
                placeholder="Alex Morgan"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3.5 py-2.5 text-xs text-white focus:border-brand-500 focus:outline-none"
                required
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">Email Address</label>
            <input
              type="email"
              placeholder="you@domain.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3.5 py-2.5 text-xs text-white focus:border-brand-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full rounded-xl border border-slate-800 bg-dark-900 px-3.5 py-2.5 text-xs text-white focus:border-brand-500 focus:outline-none"
              required
            />
          </div>

          {error && <p className="text-xs font-semibold text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-xl bg-brand-600 py-3 text-xs font-bold text-white shadow-lg transition hover:bg-brand-500 disabled:opacity-60"
          >
            {loading
              ? "Please wait..."
              : authMode === "register"
                ? "Register & Continue →"
                : "Sign In To Dashboard"}
          </button>
        </form>
      </div>
    </div>
  );
}
