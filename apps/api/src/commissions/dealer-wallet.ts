import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
export const walletSql = `WITH earned AS (
 SELECT COALESCE(SUM(amount),0) AS total,COALESCE(SUM(amount) FILTER(WHERE COALESCE(available_at,created_at)<date_trunc('month',now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul'),0) AS eligible
 FROM commission_entries WHERE dealer_id=$1 AND currency=$2 AND status IN ('CONFIRMED','AVAILABLE')
), debit AS (
 SELECT COALESCE((SELECT SUM(amount) FROM dealer_prim_requests WHERE dealer_id=$1 AND currency=$2 AND status IN ('REQUESTED','APPROVED','PAID') AND ($3::uuid IS NULL OR id<>$3)),0)
 + COALESCE((SELECT SUM(amount) FROM dealer_prim_deductions WHERE dealer_id=$1 AND currency=$2),0)
 + CASE WHEN $2='TRY' THEN COALESCE((SELECT SUM(amount) FROM dealer_commission_spends WHERE dealer_id=$1),0)-COALESCE((SELECT SUM(amount) FROM dealer_prim_refunds WHERE dealer_id=$1),0) ELSE 0 END AS amount
)
SELECT (earned.total-debit.amount)::text AS available,(earned.eligible-debit.amount)::text AS eligible FROM earned,debit`;
export async function dealerWallet(db: DatabaseService | PoolClient, dealerId: string, currency='TRY', excludeRequest?: string) {
  return (await db.query<{available:string;eligible:string}>(walletSql,[dealerId,currency,excludeRequest??null])).rows[0];
}
export function moneyCents(value:string) {
 if(!/^-?\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Geçersiz Tutar');
 const negative=value.startsWith('-');const [whole,fraction='']=value.replace(/^-/,'').split('.');return (BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')))*(negative?-1n:1n);
}
