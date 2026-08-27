/**
 * Class-name join. Deliberately three lines rather than a dependency.
 *
 * `clsx` and `tailwind-merge` are the reflexive choices here, but the brief asks for no unnecessary
 * dependencies and nothing in this codebase needs conflict resolution between Tailwind utilities —
 * variants are composed from disjoint sets, not overridden.
 */

export type ClassValue = string | false | null | undefined;

export const cx = (...values: ClassValue[]): string => values.filter(Boolean).join(" ");
