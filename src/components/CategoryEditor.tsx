'use client';

import { useState, useRef, useEffect } from 'react';
import { Pencil, Check, X, ChevronDown, MessageSquare } from 'lucide-react';
import { CATEGORY_COLORS } from '@/lib/categories';
import { addCustomRule } from '@/lib/storage';
import type { CategoryName, Transaction } from '@/types';

const CATEGORY_GROUPS: Record<string, string[]> = {
  Essential: [
    'Rent / Mortgage',
    'Utilities',
    'Groceries',
    'Insurance',
    'Transport',
    'Phone & Internet',
    'Childcare & Education',
    'Healthcare',
    'Debt Repayments',
  ],
  Discretionary: [
    'Dining Out',
    'Entertainment',
    'Shopping',
    'Subscriptions',
    'Personal Care',
    'Holidays & Travel',
    'Drinks & Nights Out',
  ],
  Financial: [
    'Savings & Investments',
    'Transfers',
    'Cash Withdrawals',
    'Bank Charges',
    'Charity',
  ],
  Income: ['Salary', 'Benefits', 'Refunds', 'Other Income'],
};

// Determine default "essential" value based on category group
function isEssentialDefault(category: string): boolean {
  return CATEGORY_GROUPS.Essential.includes(category);
}

interface CategoryEditorProps {
  transaction: Transaction;
  onSaved: () => void;
}

export function CategoryEditor({ transaction, onSaved }: CategoryEditorProps) {
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [essential, setEssential] = useState(false);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleOpen = () => {
    setSelectedCategory('');
    setEssential(transaction.isEssential ?? false);
    setNote(transaction.userNote ?? '');
    setShowNote(!!transaction.userNote);
    setOpen(true);
  };

  const handleSelectCategory = (cat: string) => {
    setSelectedCategory(cat);
    setEssential(isEssentialDefault(cat));
  };

  const handleSave = () => {
    if (!selectedCategory) return;

    // Derive pattern from merchantName or description
    const pattern =
      transaction.merchantName ||
      transaction.description.replace(/\d{2}\/\d{2}\/\d{4}.*/, '').trim() ||
      transaction.description;

    addCustomRule({
      pattern,
      category: selectedCategory,
      isEssential: essential,
      source: 'manual',
      note: note.trim() || undefined,
    });

    setOpen(false);
    onSaved();
  };

  const isManual = transaction.categorySource === 'manual';
  const color =
    CATEGORY_COLORS[transaction.category as CategoryName] || '#a1a1aa';

  return (
    <div className="relative" ref={ref}>
      {/* Clickable badge */}
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:ring-2 hover:ring-accent/50 transition-all"
        style={{
          backgroundColor: `${color}20`,
          color: color,
        }}
        title="Click to change category"
      >
        {isManual && <Pencil className="h-3 w-3 shrink-0" />}
        {transaction.category}
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-card border border-card-border rounded-xl shadow-2xl overflow-hidden">
          {/* Category list */}
          <div className="max-h-64 overflow-y-auto p-2">
            {Object.entries(CATEGORY_GROUPS).map(([group, cats]) => (
              <div key={group}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted px-2 pt-2 pb-1">
                  {group}
                </p>
                {cats.map((cat) => {
                  const catColor =
                    CATEGORY_COLORS[cat as CategoryName] || '#a1a1aa';
                  const isSelected = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => handleSelectCategory(cat)}
                      className={`w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center gap-2 transition-colors ${
                        isSelected
                          ? 'bg-accent/20 text-foreground'
                          : 'text-foreground/80 hover:bg-card-border/40'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: catColor }}
                      />
                      {cat}
                      {isSelected && (
                        <Check className="h-3 w-3 ml-auto text-accent" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Options area - shown when a category is selected */}
          {selectedCategory && (
            <div className="border-t border-card-border p-3 space-y-3">
              {/* Essential toggle */}
              <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={essential}
                  onChange={(e) => setEssential(e.target.checked)}
                  className="rounded border-card-border bg-card accent-accent h-3.5 w-3.5"
                />
                Essential (need vs want)
              </label>

              {/* Note toggle + field */}
              {!showNote ? (
                <button
                  onClick={() => setShowNote(true)}
                  className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
                >
                  <MessageSquare className="h-3 w-3" />
                  Add a note
                </button>
              ) : (
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g., Health Express = Mounjaro medication for Larissa"
                  className="w-full text-xs bg-background border border-card-border rounded-md px-2 py-1.5 text-foreground placeholder:text-muted/60 focus:outline-none focus:border-accent"
                  autoFocus
                />
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                >
                  <Check className="h-3 w-3" />
                  Save
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-1 text-xs text-muted hover:text-foreground px-3 py-1.5 rounded-md border border-card-border hover:bg-card-border/40 transition-colors"
                >
                  <X className="h-3 w-3" />
                  Cancel
                </button>
              </div>

              <p className="text-[10px] text-muted/70">
                This will re-categorize all matching transactions.
              </p>
            </div>
          )}
        </div>
      )}

      {/* User note tooltip indicator */}
      {transaction.userNote && !open && (
        <span className="ml-1 text-muted" title={transaction.userNote}>
          <MessageSquare className="inline h-3 w-3" />
        </span>
      )}
    </div>
  );
}
