'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Search,
  Calendar,
  Tag,
  Filter,
  Hash,
} from 'lucide-react';
import {
  getKnowledgeEntries,
  addKnowledgeEntry,
  deleteKnowledgeEntry,
  saveKnowledgeEntries,
} from '@/lib/storage';
import type { KnowledgeEntry } from '@/types';

const TYPE_COLORS: Record<KnowledgeEntry['type'], string> = {
  event: '#3b82f6',
  context: '#8b5cf6',
  goal: '#22c55e',
  note: '#6b7280',
};

const TYPE_LABELS: Record<KnowledgeEntry['type'], string> = {
  event: 'Event',
  context: 'Context',
  goal: 'Goal',
  note: 'Note',
};

const ENTRY_TYPES: KnowledgeEntry['type'][] = ['event', 'context', 'goal', 'note'];

function toLocalDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function KnowledgePage() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Form state
  const [formDate, setFormDate] = useState(todayISO());
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formType, setFormType] = useState<KnowledgeEntry['type']>('event');
  const [formTags, setFormTags] = useState('');

  // Filter state
  const [filterType, setFilterType] = useState<KnowledgeEntry['type'] | 'all'>('all');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterTag, setFilterTag] = useState('');

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editType, setEditType] = useState<KnowledgeEntry['type']>('event');
  const [editTags, setEditTags] = useState('');
  const [editDate, setEditDate] = useState('');

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    getKnowledgeEntries().then((entries) => {
      setEntries(entries);
      setLoaded(true);
    });
  }, []);

  // All unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    entries.forEach((e) => e.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [entries]);

  // Filtered entries
  const filtered = useMemo(() => {
    let list = entries;
    if (filterType !== 'all') {
      list = list.filter((e) => e.type === filterType);
    }
    if (filterSearch.trim()) {
      const q = filterSearch.toLowerCase();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q)
      );
    }
    if (filterTag) {
      list = list.filter((e) => e.tags?.includes(filterTag));
    }
    return list.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [entries, filterType, filterSearch, filterTag]);

  // Stats
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonthCount = entries.filter((e) => e.date.startsWith(thisMonth)).length;

    const tagCounts: Record<string, number> = {};
    entries.forEach((e) => e.tags?.forEach((t) => {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    }));
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return { total: entries.length, thisMonth: thisMonthCount, topTags };
  }, [entries]);

  const handleAdd = async () => {
    if (!formTitle.trim()) return;
    const tags = formTags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const entry = await addKnowledgeEntry({
      date: formDate,
      title: formTitle.trim(),
      description: formDesc.trim(),
      type: formType,
      tags: tags.length > 0 ? tags : undefined,
    });
    setEntries((prev) => [entry, ...prev]);
    setFormTitle('');
    setFormDesc('');
    setFormTags('');
    setFormType('event');
    setFormDate(todayISO());
  };

  const handleDelete = async (id: string) => {
    await deleteKnowledgeEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setDeleteConfirm(null);
  };

  const startEdit = (entry: KnowledgeEntry) => {
    setEditId(entry.id);
    setEditTitle(entry.title);
    setEditDesc(entry.description);
    setEditType(entry.type);
    setEditTags(entry.tags?.join(', ') || '');
    setEditDate(entry.date.slice(0, 10));
  };

  const saveEdit = async () => {
    if (!editId || !editTitle.trim()) return;
    const tags = editTags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const updated = entries.map((e) =>
      e.id === editId
        ? {
            ...e,
            title: editTitle.trim(),
            description: editDesc.trim(),
            type: editType,
            tags: tags.length > 0 ? tags : undefined,
            date: editDate || e.date,
          }
        : e
    );
    setEntries(updated);
    await saveKnowledgeEntries(updated);
    setEditId(null);
  };

  const cancelEdit = () => setEditId(null);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Knowledge Bank</h1>
        <p className="text-muted mt-1">
          Journal life events and context that explain your spending patterns
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-4">
          <p className="text-xs text-muted">Total Entries</p>
          <p className="text-xl font-bold text-foreground">{stats.total}</p>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <p className="text-xs text-muted">This Month</p>
          <p className="text-xl font-bold text-foreground">{stats.thisMonth}</p>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <p className="text-xs text-muted">Top Tags</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {stats.topTags.length > 0 ? (
              stats.topTags.map(([tag, count]) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent"
                >
                  {tag} ({count})
                </span>
              ))
            ) : (
              <span className="text-sm text-muted">--</span>
            )}
          </div>
        </div>
      </div>

      {/* Add Entry Form */}
      <div className="bg-card border border-card-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Plus className="h-5 w-5 text-accent" />
          <h3 className="text-base font-semibold text-foreground">
            Add Entry
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted block mb-1">Date</label>
            <input
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm text-foreground"
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Type</label>
            <select
              value={formType}
              onChange={(e) =>
                setFormType(e.target.value as KnowledgeEntry['type'])
              }
              className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm text-foreground"
            >
              {ENTRY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-muted block mb-1">
              Title <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="e.g. Larissa went to Barcelona"
              className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm text-foreground placeholder:text-muted"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-muted block mb-1">
              Description (optional)
            </label>
            <textarea
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="Additional context or details..."
              rows={2}
              className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm text-foreground placeholder:text-muted resize-none"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-muted block mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={formTags}
              onChange={(e) => setFormTags(e.target.value)}
              placeholder="e.g. larissa, travel, barcelona"
              className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm text-foreground placeholder:text-muted"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleAdd}
            disabled={!formTitle.trim()}
            className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Entry
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted" />
          <span className="text-sm font-medium text-foreground">Filters</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              type="text"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              placeholder="Search entries..."
              className="w-full pl-9 pr-3 py-2 bg-background border border-card-border rounded-lg text-sm text-foreground placeholder:text-muted"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) =>
              setFilterType(e.target.value as KnowledgeEntry['type'] | 'all')
            }
            className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm text-foreground"
          >
            <option value="all">All Types</option>
            {ENTRY_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm text-foreground"
          >
            <option value="">All Tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="border border-dashed border-card-border rounded-xl p-12 text-center">
            <BookOpen className="h-12 w-12 text-muted mx-auto mb-3" />
            <p className="text-muted">
              {entries.length === 0
                ? 'No entries yet. Add your first life event or note above.'
                : 'No entries match your filters.'}
            </p>
          </div>
        )}

        {filtered.map((entry) => {
          const color = TYPE_COLORS[entry.type];
          const isEditing = editId === entry.id;
          const isDeleting = deleteConfirm === entry.id;

          return (
            <div
              key={entry.id}
              className="bg-card border border-card-border rounded-xl p-4 hover:border-accent/20 transition-colors"
              style={{ borderLeftWidth: '3px', borderLeftColor: color }}
            >
              {isEditing ? (
                /* Inline Edit Form */
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="px-3 py-2 bg-background border border-card-border rounded-lg text-sm text-foreground"
                    />
                    <select
                      value={editType}
                      onChange={(e) =>
                        setEditType(
                          e.target.value as KnowledgeEntry['type']
                        )
                      }
                      className="px-3 py-2 bg-background border border-card-border rounded-lg text-sm text-foreground"
                    >
                      {ENTRY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm text-foreground"
                  />
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm text-foreground resize-none"
                  />
                  <input
                    type="text"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    placeholder="Tags (comma-separated)"
                    className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-sm text-foreground placeholder:text-muted"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={cancelEdit}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-muted hover:text-foreground transition-colors"
                    >
                      <X className="h-3.5 w-3.5" /> Cancel
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={!editTitle.trim()}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <Check className="h-3.5 w-3.5" /> Save
                    </button>
                  </div>
                </div>
              ) : (
                /* Display Mode */
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="flex items-center gap-1 text-xs text-muted">
                          <Calendar className="h-3 w-3" />
                          {toLocalDate(entry.date)}
                        </span>
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: `${color}20`,
                            color,
                          }}
                        >
                          {TYPE_LABELS[entry.type]}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-foreground">
                        {entry.title}
                      </h4>
                      {entry.description && (
                        <p className="text-sm text-muted mt-1">
                          {entry.description}
                        </p>
                      )}
                      {entry.tags && entry.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {entry.tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-card-border/50 text-muted"
                            >
                              <Hash className="h-2.5 w-2.5" />
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(entry)}
                        className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card-border/50 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {isDeleting ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(entry.id)}
                            className="p-1.5 rounded-lg text-danger hover:bg-danger/10 transition-colors"
                            title="Confirm delete"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="p-1.5 rounded-lg text-muted hover:text-foreground transition-colors"
                            title="Cancel"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(entry.id)}
                          className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
