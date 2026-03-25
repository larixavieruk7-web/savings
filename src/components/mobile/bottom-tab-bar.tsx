'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Receipt,
  TrendingUp,
  Brain,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BottomSheet } from './bottom-sheet';

const TABS = [
  { href: '/', label: 'Home', icon: LayoutDashboard },
  { href: '/transactions', label: 'Txns', icon: Receipt },
  { href: '/trends', label: 'Trends', icon: TrendingUp },
  { href: '/ask', label: 'Advisor', icon: Brain },
] as const;

export function BottomTabBar() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  // "More" pages — highlight More tab when on these routes
  const moreRoutes = ['/upload', '/accounts', '/categories', '/knowledge', '/insights'];
  const isMoreActive = moreRoutes.some((r) => pathname.startsWith(r));

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden">
        {/* Glass bar */}
        <div
          className="flex items-stretch border-t border-card-border/60"
          style={{
            background: 'rgba(17, 17, 24, 0.82)',
            backdropFilter: 'blur(20px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          {TABS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors',
                  isActive
                    ? 'text-accent'
                    : 'text-muted active:text-foreground'
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.2 : 1.8} />
                <span className="text-[10px] font-medium leading-none">{label}</span>
                {isActive && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-accent rounded-full" />
                )}
              </Link>
            );
          })}

          {/* More tab — opens sheet instead of navigating */}
          <button
            data-testid="more-tab"
            onClick={() => setSheetOpen(true)}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors',
              isMoreActive || sheetOpen
                ? 'text-accent'
                : 'text-muted active:text-foreground'
            )}
          >
            <MoreHorizontal className="h-5 w-5" strokeWidth={isMoreActive ? 2.2 : 1.8} />
            <span className="text-[10px] font-medium leading-none">More</span>
          </button>
        </div>
      </nav>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
