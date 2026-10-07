import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
@Injectable()
export class CustomersService {
  constructor(private readonly db:DatabaseService){}
  async list(){return(await this.db.query(`
    WITH currency_totals AS (
      SELECT customer_id,currency,COUNT(*)::int AS order_count,SUM(total_amount) AS amount
      FROM orders WHERE status <> 'CANCELLED' GROUP BY customer_id,currency
    ), order_totals AS (
      SELECT customer_id,SUM(order_count)::int AS order_count,
        COALESCE(SUM(amount) FILTER (WHERE currency='TRY'),0)::text AS total_spend,
        jsonb_agg(jsonb_build_object('currency',currency,'amount',amount::text,'order_count',order_count) ORDER BY currency) AS totals_by_currency
      FROM currency_totals GROUP BY customer_id
    )
    SELECT c.id,c.email,c.first_name,c.last_name,c.phone,c.is_active,c.created_at,
      COALESCE(o.order_count,0)::int AS order_count,COALESCE(o.total_spend,'0') AS total_spend,
      COALESCE(o.totals_by_currency,'[]'::jsonb) AS totals_by_currency,COALESCE(n.note_count,0)::int AS note_count
    FROM customers c LEFT JOIN order_totals o ON o.customer_id=c.id
    LEFT JOIN (SELECT customer_id,COUNT(*) AS note_count FROM customer_notes GROUP BY customer_id) n ON n.customer_id=c.id
    ORDER BY c.created_at DESC`)).rows}
  async addNote(customerId:string,body:string,userId:string){
    const note = body.trim();
    if (!note) throw new BadRequestException('Müşteri notu boş olamaz');
    return this.db.transaction(async client => {
      const customer=await client.query('SELECT 1 FROM customers WHERE id=$1 FOR KEY SHARE',[customerId]);
      if(!customer.rowCount)throw new NotFoundException('Customer not found');
      const result = await client.query<{id:string}>('INSERT INTO customer_notes (customer_id,body,created_by) VALUES ($1,$2,$3) RETURNING id',[customerId,note,userId]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,$3,$4)', [userId,'customer.note.created','customer',customerId]);
      return result.rows[0];
    });
  }
  async notes(customerId:string){return(await this.db.query('SELECT id,body,created_at FROM customer_notes WHERE customer_id=$1 ORDER BY created_at DESC',[customerId])).rows}
}
