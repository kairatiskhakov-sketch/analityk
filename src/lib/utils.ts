import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, compact = false): string {
  return (
    new Intl.NumberFormat("ru-KZ", {
      notation: compact ? "compact" : "standard",
    }).format(value) + " ₸"
  );
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-KZ").format(value);
}
