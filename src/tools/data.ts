// Fake data for the fictional wallet. Read-only: tools never change these objects.
import paymentsFile from '../../data/payments.json';
import feesFile from '../../data/fees.json';
import usersFile from '../../data/users.json';
import type { Currency } from './money.ts';

export type MethodId = 'wallet_balance' | 'debit_card' | 'credit_card' | 'bank_transfer';
export type Status = 'completed' | 'pending' | 'failed' | 'refunded' | 'disputed';

export interface Payment {
  id: string;
  date: string; // YYYY-MM-DD
  merchant: string;
  category: 'purchase' | 'bill' | 'subscription' | 'transfer';
  amount_cents: number;
  currency: Currency;
  method: MethodId;
  fee_cents: number;
  status: Status;
  failure_reason?: string;
  refunded_on?: string;
}

export interface FeeRule {
  label: string;
  percent_bps: number;
  fixed_cents: number;
  min_cents: number;
}

export const DEMO_TODAY: string = paymentsFile.demo_today;
export const PAYMENTS: readonly Payment[] = Object.freeze(paymentsFile.payments.map((p) => Object.freeze({ ...p }) as Payment));
export const FEES: Readonly<Record<MethodId, FeeRule>> = feesFile.methods;
export const MAX_AMOUNT_CENTS: number = feesFile.max_amount_cents;
export const USER = usersFile.user;
export const METHOD_IDS = Object.keys(FEES) as MethodId[];

export function findPayment(id: string): Payment | undefined {
  const key = id.trim().toUpperCase();
  return PAYMENTS.find((p) => p.id === key);
}
