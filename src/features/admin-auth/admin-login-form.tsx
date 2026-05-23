"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useAdminAuth } from "./admin-auth-provider";

const loginSchema = z.object({
  email: z.email("メールアドレスを入力してください。"),
  password: z.string().min(1, "パスワードを入力してください。"),
});

type LoginInput = z.infer<typeof loginSchema>;

export function AdminLoginForm() {
  const router = useRouter();
  const { login, status, error } = useAdminAuth();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/admin");
    }
  }, [router, status]);

  const onSubmit = handleSubmit(async (values) => {
    await login(values.email, values.password);
    router.replace("/admin");
  });

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 text-zinc-100">
      <section className="w-full max-w-sm rounded-lg border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/40">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-alma-gold">
          ALMA COPA
        </p>
        <h1 className="mt-3 text-2xl font-bold text-white">管理者ログイン</h1>
        <p className="mt-2 text-sm text-zinc-400">
          管理者アカウントでログインしてください。
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label htmlFor="email" className="text-sm font-medium text-zinc-200">
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="mt-2 min-h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white outline-none transition placeholder:text-zinc-600 focus:border-alma-gold"
              placeholder="admin@example.com"
              {...register("email")}
            />
            {errors.email ? (
              <p className="mt-2 text-sm text-red-300">{errors.email.message}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="password" className="text-sm font-medium text-zinc-200">
              パスワード
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="mt-2 min-h-11 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white outline-none transition placeholder:text-zinc-600 focus:border-alma-gold"
              placeholder="password"
              {...register("password")}
            />
            {errors.password ? (
              <p className="mt-2 text-sm text-red-300">{errors.password.message}</p>
            ) : null}
          </div>

          {error ? (
            <div className="whitespace-pre-wrap break-words rounded-md border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting || status === "loading"}
            className="min-h-11 w-full rounded-md bg-alma-gold px-4 py-2 text-sm font-bold text-black transition hover:bg-[#d7b760] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting || status === "loading" ? "確認中..." : "ログイン"}
          </button>
        </form>
      </section>
    </main>
  );
}
