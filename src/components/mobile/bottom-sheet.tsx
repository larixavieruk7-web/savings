'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Upload,
  Wallet,
  Tags,
  BookOpen,
  MessageCircle,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserProfile } from '@/components/dashboard/user-profile';

const MORE_ITEMS = [
  { href: '/upload', label: 'Upload CSV', icon: Upload },
  { href: '/accounts', label: 'Accounts', icon: Wallet },
  { href: '/categories', label: 'Categories', icon: Tags },
  { href: '/knowledge', label: 'Knowledge', icon: BookOpen },
  { href: '/ask', label: 'Ask AI', icon: MessageCircle },
];

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
}

export function BottomSheet({ open, onClose }: BottomSheetProps) {
  const pathname = usePathname();
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close on route change
  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-card-border overflow-hidden animate-slide-up"
        style={{
          background: 'rgba(17, 17, 24, 0.95)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Handle + close */}
        <div className="flex items-center justify-between px-5 pt-3 pb-1">
          <div className="w-10 h-1 bg-muted/30 rounded-full mx-auto" />
          <button
            onClick={onClose}
            className="absolute right-4 top-3 p-1.5 rounded-full text-muted hover:text-foreground hover:bg-card-border/50 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="px-3 py-2 space-y-0.5">
          {MORE_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-4 px-4 py-3.5 rounded-xl text-[15px] font-medium transition-colors',
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-foreground active:bg-card-border/50'
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User profile */}
        <div className="px-5 py-4 mt-1 border-t border-card-border/50">
          <UserProfile />
        </div>
      </div>
    </div>
  );
}
