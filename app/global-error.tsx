"use client";

import React from "react";
import Link from "next/link";
import { buttonClasses } from "@/ui/buttonStyles.ts";

interface GlobalErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function GlobalError({ reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 min-h-dvh flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl space-y-6">
          <div className="inline-block px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
            CRITICAL APPLICATION ERROR
          </div>

          <h1 className="text-2xl font-bold tracking-tight">
            System initialization failed
          </h1>

          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            The application encountered a fatal initialization error. Your local data remains safe in your browser storage.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={() => reset()}
              className={buttonClasses("primary", "md")}
            >
              Restart application
            </button>
            <Link href="/" className={buttonClasses("secondary", "md")}>
              Home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
