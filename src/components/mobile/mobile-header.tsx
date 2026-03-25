'use client';

import { PiggyBank } from 'lucide-react';

export function MobileHeader() {
  return (
    <header className="flex items-center gap-2.5 px-4 py-3 border-b border-card-border/50 md:hidden bg-card/80 backdrop-blur-md sticky top-0 z-30">
      <PiggyBank className="h-6 w-6 text-accent shrink-0" />
      <span className="text-base font-bold text-foreground tracking-tight">Savings</span>
    </header>
  );
}
