'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, MessageCircle, Sparkles, Bot, User } from 'lucide-react';
import { useTransactionContext } from '@/context/transactions';
import { getKnowledgeEntries, getAccountNicknames } from '@/lib/storage';
import { computeSubscriptionData } from '@/lib/subscriptions';
import { formatGBP } from '@/lib/utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const SUGGESTED_QUESTIONS = [
  'Where is most of our money going?',
  'What subscriptions are we paying for?',
  'How can we save \u00a3300 this month?',
  "What's changed in our spending recently?",
  'Are there any unusual charges?',
  'Compare our essential vs discretionary spending',
];

function renderMarkdown(text: string) {
  // Split into lines and process
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listKey = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${listKey++}`} className="list-disc list-inside space-y-1 my-2">
          {listItems.map((item, i) => (
            <li key={i}>{processInline(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  const processInline = (line: string): React.ReactNode => {
    // Process bold, currency amounts
    const parts: React.ReactNode[] = [];
    // Match **bold**, £amounts
    const regex = /(\*\*(.+?)\*\*)|(£[\d,]+\.?\d*)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }
      if (match[1]) {
        // Bold text
        parts.push(
          <strong key={match.index} className="font-semibold text-foreground">
            {match[2]}
          </strong>
        );
      } else if (match[3]) {
        // Currency amount
        parts.push(
          <span key={match.index} className="font-semibold text-accent">
            {match[3]}
          </span>
        );
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }
    return parts.length > 0 ? parts : line;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('- ') || line.startsWith('* ')) {
      listItems.push(line.slice(2));
      continue;
    }

    flushList();

    if (line.startsWith('### ')) {
      elements.push(
        <h4 key={i} className="font-semibold text-foreground mt-3 mb-1 text-sm">
          {processInline(line.slice(4))}
        </h4>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h3 key={i} className="font-semibold text-foreground mt-3 mb-1">
          {processInline(line.slice(3))}
        </h3>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="leading-relaxed">
          {processInline(line)}
        </p>
      );
    }
  }

  flushList();

  return elements;
}

export default function AskPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    categoryBreakdown,
    merchantBreakdown,
    monthlyBreakdowns,
    totalIncome,
    totalSpending,
    essentialSpending,
    discretionarySpending,
    loaded,
    transactions,
    healthScorecard,
    categoryCreep,
    recommendations,
    salaryFlow,
  } = useTransactionContext();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const buildRecurringByAccount = useCallback(() => {
    const { potentialDuplicates, recurringMerchants } = computeSubscriptionData(transactions);
    return {
      potentialDuplicateSubscriptions: potentialDuplicates.map((d) => ({
        merchant: d.merchant,
        accounts: d.accounts,
      })),
      recurringMerchants,
    };
  }, [transactions]);

  const buildContext = useCallback(async () => {
    const knowledgeEntries = (await getKnowledgeEntries()).map((e) => ({
      date: e.date,
      title: e.title,
      description: e.description,
      type: e.type,
      tags: e.tags,
    }));

    const accountNicknames = await getAccountNicknames();

    // Top 15 categories
    const categories = categoryBreakdown.slice(0, 15).map((c) => ({
      category: c.category,
      total: c.amount,
    }));

    // Top 20 merchants
    const merchants = merchantBreakdown.slice(0, 20).map((m) => ({
      merchant: m.merchant,
      total: m.total,
      count: m.count,
    }));

    // Last 12 months
    const monthlyTotals = monthlyBreakdowns.slice(-12).map((m) => ({
      month: m.month,
      income: m.income,
      spending: m.spending,
      net: m.net,
    }));

    const { potentialDuplicateSubscriptions, recurringMerchants } = buildRecurringByAccount();

    return {
      totalIncome,
      totalSpending,
      essentialSpending,
      discretionarySpending,
      categories,
      merchants,
      monthlyTotals,
      knowledgeEntries,
      accountNicknames,
      potentialDuplicateSubscriptions,
      recurringMerchants,
      // Intelligence layer
      healthScorecard: healthScorecard ? {
        overallScore: healthScorecard.overallScore,
        verdict: healthScorecard.verdict,
        highlights: healthScorecard.highlights,
        warnings: healthScorecard.warnings,
        metrics: {
          savingsRate: healthScorecard.metrics.savingsRate,
          essentialRatio: healthScorecard.metrics.essentialRatio,
          creepCount: healthScorecard.metrics.creepCount,
          unaccountedPct: healthScorecard.metrics.unaccountedPct,
        },
      } : undefined,
      categoryCreep: categoryCreep.length > 0 ? categoryCreep : undefined,
      recommendations: recommendations.length > 0 ? recommendations.map((r) => ({
        severity: r.severity,
        title: r.title,
        detail: r.detail,
        potentialSaving: r.potentialSaving,
        actionType: r.actionType,
      })) : undefined,
      salaryFlow: salaryFlow ? {
        totalSalary: salaryFlow.totalSalary,
        creditCardPayments: salaryFlow.creditCardPayments,
        savingsContributions: salaryFlow.savingsContributions,
        directDebits: salaryFlow.directDebits,
        directSpending: salaryFlow.directSpending,
        creditCardSpending: salaryFlow.creditCardSpending,
        unaccounted: salaryFlow.unaccounted,
      } : undefined,
    };
  }, [
    categoryBreakdown,
    merchantBreakdown,
    monthlyBreakdowns,
    totalIncome,
    totalSpending,
    essentialSpending,
    discretionarySpending,
    buildRecurringByAccount,
    healthScorecard,
    categoryCreep,
    recommendations,
    salaryFlow,
  ]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}-user`,
        role: 'user',
        content: text.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setIsLoading(true);

      try {
        const context = await buildContext();
        const history = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text.trim(),
            context,
            history,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to get response');
        }

        const assistantMessage: ChatMessage = {
          id: `msg-${Date.now()}-assistant`,
          role: 'assistant',
          content: data.reply,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error) {
        const errorMessage: ChatMessage = {
          id: `msg-${Date.now()}-error`,
          role: 'assistant',
          content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, buildContext, messages]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const hasData = loaded && transactions.length > 0;

  return (
    <div className="flex flex-col -m-6 h-[calc(100vh)] overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b border-card-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent/10">
            <MessageCircle className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Ask About Your Finances
            </h2>
            <p className="text-sm text-muted">
              {!loaded
                ? 'Loading...'
                : hasData
                ? `Powered by AI with ${transactions.length} transactions loaded`
                : 'Upload bank statements first to get personalized insights'}
            </p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full space-y-8">
            {/* Welcome */}
            <div className="text-center space-y-3">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-accent" />
              </div>
              <h3 className="text-xl font-semibold text-foreground">
                Your personal finance assistant
              </h3>
              <p className="text-muted max-w-md">
                Ask me anything about your spending, savings, subscriptions, or
                financial goals. I have access to all your transaction data.
              </p>
              {!hasData && (
                <p className="text-sm text-amber-400 bg-amber-400/10 px-4 py-2 rounded-lg inline-block">
                  No transaction data loaded yet. Upload your bank statements to
                  get started.
                </p>
              )}
            </div>

            {/* Suggested Questions */}
            {hasData && (
              <div className="w-full max-w-2xl space-y-3">
                <p className="text-sm text-muted text-center">
                  Try asking:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="text-left px-4 py-3 rounded-xl border border-card-border bg-card hover:bg-card-border/50 hover:border-accent/30 transition-all text-sm text-foreground group"
                    >
                      <span className="text-accent mr-2 opacity-60 group-hover:opacity-100 transition-opacity">
                        &rarr;
                      </span>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Data summary */}
            {hasData && (
              <div className="flex gap-6 text-sm text-muted">
                <span>
                  Income:{' '}
                  <span className="text-green-400 font-medium">
                    {formatGBP(totalIncome)}
                  </span>
                </span>
                <span>
                  Spending:{' '}
                  <span className="text-red-400 font-medium">
                    {formatGBP(totalSpending)}
                  </span>
                </span>
                <span>
                  Categories:{' '}
                  <span className="text-foreground font-medium">
                    {categoryBreakdown.length}
                  </span>
                </span>
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center mt-1">
                    <Bot className="h-4 w-4 text-accent" />
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-accent text-white rounded-br-md'
                      : 'bg-card border border-card-border text-foreground rounded-bl-md shadow-sm'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="text-sm space-y-1">
                      {renderMarkdown(msg.content)}
                    </div>
                  ) : (
                    <p className="text-sm">{msg.content}</p>
                  )}
                  <p
                    className={`text-[10px] mt-2 ${
                      msg.role === 'user'
                        ? 'text-white/60'
                        : 'text-muted'
                    }`}
                  >
                    {msg.timestamp.toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                {msg.role === 'user' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center mt-1">
                    <User className="h-4 w-4 text-accent" />
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center mt-1">
                  <Bot className="h-4 w-4 text-accent" />
                </div>
                <div className="bg-card border border-card-border rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                  <div className="flex gap-1.5 items-center h-5">
                    <div className="w-2 h-2 rounded-full bg-muted animate-bounce [animation-delay:0ms]" />
                    <div className="w-2 h-2 rounded-full bg-muted animate-bounce [animation-delay:150ms]" />
                    <div className="w-2 h-2 rounded-full bg-muted animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Bar */}
      <div className="flex-shrink-0 p-4 border-t border-card-border bg-card/50 backdrop-blur-sm">
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-3 max-w-3xl mx-auto"
        >
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                hasData
                  ? 'Ask about your finances...'
                  : 'Upload bank statements first...'
              }
              disabled={!hasData || isLoading}
              rows={1}
              className="w-full resize-none rounded-xl border border-card-border bg-background px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ maxHeight: '120px' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || isLoading || !hasData}
            className="flex-shrink-0 p-3 rounded-xl bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
