"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { buttonClasses } from "@/ui/buttonStyles.ts";
import { StatusPill } from "@/ui/StatusPill.tsx";

interface ErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Sanitized operational logging (no sensitive key or state data)
    console.error("[Application Error]", error.name, error.message);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-start px-5 py-24 sm:px-8 sm:py-32">
      <StatusPill tone="fault" srPrefix="Status:">
        500 · runtime error
      </StatusPill>

      <h1 className="display text-ink mt-6 text-[2rem] sm:text-[2.5rem]">
        An unexpected error occurred.
      </h1>

      <p className="text-muted mt-5 max-w-[52ch] text-sm leading-relaxed">
        Your cryptographic identity and keypair remain securely held in your browser memory and have
        not been compromised. No unencrypted private key material was transmitted.
      </p>

      {error.digest && (
        <div className="mt-4 rounded bg-panel border border-hairline px-3 py-2 text-xs mono text-muted">
          Error Reference ID: <span className="text-ink">{error.digest}</span>
        </div>
      )}

      <div className="mt-9 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => reset()}
          className={buttonClasses("primary", "md")}
        >
          Try again
        </button>
        <Link href="/" className={buttonClasses("secondary", "md")}>
          Return to home
        </Link>
      </div>
    </div>
  );
}
