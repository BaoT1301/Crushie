import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// @ts-expect-error: owned by ngard
import { isEqual } from "@ngard/tiny-isequal";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isDeepEqual(a: unknown, b: unknown): boolean {
  return isEqual(a, b);
}

export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
