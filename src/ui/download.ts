/**
 * Saving a file from the browser.
 *
 * A `Blob` and an object URL rather than a `data:` URL: object URLs are same-origin, are revoked
 * immediately after the click, and never put the file's contents into a string that could end up in a
 * history entry, a referrer, or a screenshot of the address bar. For a file that contains an encrypted
 * private key, that distinction is worth the extra four lines.
 *
 * The anchor is created, clicked and discarded without ever entering the React tree — a download is an
 * imperative act, not a piece of state, and rendering a hidden `<a>` per download would leave DOM around
 * for the lifetime of the page.
 *
 * No client directive here, because these are plain functions rather than components. They touch
 * `document`, so they must only ever be called from an event handler; each one checks and returns
 * `false` instead of throwing if it finds itself on the server.
 */

/** Filenames are generated in this codebase, never taken from remote input. Belt and braces anyway. */
function safeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[.-]+/, "");
  return cleaned.length === 0 ? "download.txt" : cleaned.slice(0, 128);
}

export function downloadText(fileName: string, text: string, mimeType = "application/json"): boolean {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return false;

  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeFileName(fileName);
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Revoked on the next task rather than synchronously: some browsers have not yet started reading the
  // blob when `click()` returns, and revoking too early produces an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

/**
 * Read a user-selected file as text.
 *
 * Capped, because the only files this app accepts are a backup envelope and a proof document, both of
 * which are a few hundred bytes. Reading an arbitrarily large file into a string to then fail parsing it
 * is a denial of service against the user's own tab.
 */
export const MAX_UPLOAD_BYTES = 64 * 1024;

export class UploadTooLargeError extends Error {
  override readonly name = "UploadTooLargeError";
  constructor(size: number) {
    super(
      `That file is ${size} bytes. Backup and proof files produced by this app are well under ` +
        `${MAX_UPLOAD_BYTES} bytes, so this is not one of them.`,
    );
  }
}

export async function readFileText(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadTooLargeError(file.size);
  return file.text();
}
