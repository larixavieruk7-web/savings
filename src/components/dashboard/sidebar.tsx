'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Upload,
  Wallet,
  Receipt,
  Tags,
  TrendingUp,
  Brain,
  BookOpen,
  PiggyBank,
  MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserProfile } from './user-profile';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/upload', label: 'Upload CSV', icon: Upload },
  { href: '/accounts', label: 'Accounts', icon: Wallet },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/categories', label: 'Categories', icon: Tags },
  { href: '/trends', label: 'Trends', icon: TrendingUp },
  { href: '/insights', label: 'AI Insights', icon: Brain },
  { href: '/knowledge', label: 'Knowledge', icon: BookOpen },
  { href: '/ask', label: 'Ask AI', icon: MessageCircle },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-card-border bg-card flex flex-col">
      <div className="p-6 border-b border-card-border">
        <div className="flex items-center gap-3">
          <PiggyBank className="h-8 w-8 text-accent" />
          <div>
            <h1 className="text-lg font-bold text-foreground">Savings</h1>
            <p className="text-xs text-muted">Household Dashboard</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-muted hover:text-foreground hover:bg-card-border/50'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-card-border">
        <UserProfile />
      </div>
    </aside>
  );
}
