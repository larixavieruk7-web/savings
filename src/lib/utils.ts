import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Convert pence to pounds */
export function penceToPounds(pence: number): number {
  return pence / 100;
}

/** Format pence as GBP string */
export function formatGBP(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(pence / 100);
}

/** Format pence as GBP without symbol */
export function formatAmount(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(pence / 100);
}

/** Recharts tooltip formatter for GBP values */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const gbpTooltipFormatter = (value: any) => [
  `£${Number(value).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`,
];

/** Format a percentage change */
export function formatChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? '+∞%' : '0%';
  const change = ((current - previous) / Math.abs(previous)) * 100;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
}
