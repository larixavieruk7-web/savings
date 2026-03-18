'use client';

import { createContext, useContext } from 'react';
import { useTransactions } from '@/hooks/useTransactions';

type TransactionContextType = ReturnType<typeof useTransactions>;

const TransactionContext = createContext<TransactionContextType | null>(null);

export function TransactionProvider({ children }: { children: React.ReactNode }) {
  const value = useTransactions();
  return (
    <TransactionContext.Provider value={value}>
      {children}
    </TransactionContext.Provider>
  );
}

export function useTransactionContext() {
  const ctx = useContext(TransactionContext);
  if (!ctx) throw new Error('useTransactionContext must be inside TransactionProvider');
  return ctx;
}
