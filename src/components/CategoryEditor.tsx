'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Pencil, Check, X, ChevronDown, MessageSquare, Plus, Search } from 'lucide-react';
import { CATEGORY_COLORS } from '@/lib/categories';
import { addCustomRule, getCustomCategories, addCustomCategory } from '@/lib/storage';
import type { CategoryName, Transaction } from '@/types';

/** Palette of colors to pick from for new custom categories */
const CUSTOM_COLOR_PALETTE = [
  '#e11d48', '#db2777', '#c026d3', '#9333ea', '#7c3aed',
  '#4f46e5', '#2563eb', '#0284c7', '#0891b2', '#0d9488',
  '#059669', '#65a30d', '#ca8a04', '#d97706', '#ea580c',
  '#dc2626', '#e879f9', '#818cf8', '#38bdf8', '#2dd4bf',
  '#4ade80', '#a3e635', '#facc15', '#fb923c', '#f87171',
];

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

/** Pick a color that doesn't clash with existing ones */
function pickNewColor(existingColors: Set<string>): string {
  for (const c of CUSTOM_COLOR_PALETTE) {
    if (!existingColors.has(c)) return c;
  }
  // Fallback: random hex
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
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
  const [searchQuery, setSearchQuery] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [customCategories, setCustomCategories] = useState<Record<string, string>>({});
  const ref = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const newCategoryInputRef = useRef<HTMLInputElement>(null);

  // Load custom categories when dropdown opens
  useEffect(() => {
    if (open) {
      setCustomCategories(getCustomCategories());
    }
  }, [open]);

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

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [open]);

  // Focus new category input when creating
  useEffect(() => {
    if (creatingNew && newCategoryInputRef.current) {
      newCategoryInputRef.current.focus();
    }
  }, [creatingNew]);

  // Merge all colors: built-in + custom
  const allColors = useMemo(() => {
    return { ...CATEGORY_COLORS, ...customCategories };
  }, [customCategories]);

  // Build filtered category groups + custom group
  const filteredGroups = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const result: Record<string, string[]> = {};

    for (const [group, cats] of Object.entries(CATEGORY_GROUPS)) {
      const filtered = query
        ? cats.filter((c) => c.toLowerCase().includes(query))
        : cats;
      if (filtered.length > 0) {
        result[group] = filtered;
      }
    }

    // Add custom categories as their own group
    const customNames = Object.keys(customCategories);
    if (customNames.length > 0) {
      const filtered = query
        ? customNames.filter((c) => c.toLowerCase().includes(query))
        : customNames;
      if (filtered.length > 0) {
        result['Custom'] = filtered;
      }
    }

    return result;
  }, [searchQuery, customCategories]);

  const handleOpen = () => {
    setSelectedCategory('');
    setEssential(transaction.isEssential ?? false);
    setNote(transaction.userNote ?? '');
    setShowNote(!!transaction.userNote);
    setSearchQuery('');
    setCreatingNew(false);
    setNewCategoryName('');
    setOpen(true);
  };

  const handleSelectCategory = (cat: string) => {
    setSelectedCategory(cat);
    setEssential(isEssentialDefault(cat));
    setCreatingNew(false);
  };

  const handleCreateCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;

    // Check if it already exists
    if (allColors[name]) {
      // Just select the existing one
      handleSelectCategory(name);
      setCreatingNew(false);
      setNewCategoryName('');
      return;
    }

    // Pick a new color
    const usedColors = new Set(Object.values(allColors));
    const color = pickNewColor(usedColors);

    // Save to localStorage
    addCustomCategory(name, color);

    // Update local state
    setCustomCategories((prev) => ({ ...prev, [name]: color }));
    setCreatingNew(false);
    setNewCategoryName('');
    handleSelectCategory(name);
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
  const color = allColors[transaction.category] || '#a1a1aa';

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
          {/* Search input */}
          <div className="p-2 border-b border-card-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search categories..."
                className="w-full text-xs bg-background border border-card-border rounded-md pl-7 pr-2 py-1.5 text-foreground placeholder:text-muted/60 focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* Category list */}
          <div className="max-h-64 overflow-y-auto p-2">
            {Object.entries(filteredGroups).map(([group, cats]) => (
              <div key={group}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted px-2 pt-2 pb-1">
                  {group}
                </p>
                {cats.map((cat) => {
                  const catColor = allColors[cat] || '#a1a1aa';
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

            {/* No results message */}
            {Object.keys(filteredGroups).length === 0 && searchQuery && (
              <p className="text-xs text-muted px-2 py-3 text-center">
                No categories match &ldquo;{searchQuery}&rdquo;
              </p>
            )}

            {/* Create New Category option */}
            <div className="mt-2 pt-2 border-t border-card-border/50">
              {!creatingNew ? (
                <button
                  onClick={() => {
                    setCreatingNew(true);
                    setNewCategoryName(searchQuery);
                  }}
                  className="w-full text-left px-2 py-2 rounded-md text-xs flex items-center gap-2 text-accent hover:bg-accent/10 transition-colors border border-dashed border-accent/40"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  Create New Category
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    ref={newCategoryInputRef}
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateCategory();
                      if (e.key === 'Escape') {
                        setCreatingNew(false);
                        setNewCategoryName('');
                      }
                    }}
                    placeholder="Category name..."
                    className="flex-1 text-xs bg-background border border-accent/40 rounded-md px-2 py-1.5 text-foreground placeholder:text-muted/60 focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={handleCreateCategory}
                    disabled={!newCategoryName.trim()}
                    className="p-1.5 rounded-md bg-accent hover:bg-accent-hover text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Create category"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setCreatingNew(false);
                      setNewCategoryName('');
                    }}
                    className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-card-border/40 transition-colors"
                    title="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
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
