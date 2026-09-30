import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
@Injectable()
export class CustomersService { constructor(private readonly db:DatabaseService){} async addNote(customerId:string,body:string,userId:string){const customer=await this.db.query('SELECT 1 FROM customers WHERE id=$1',[customerId]);if(!customer.rowCount)throw new NotFoundException('Customer not found');return(await this.db.query<{id:string}>('INSERT INTO customer_notes (customer_id,body,created_by) VALUES ($1,$2,$3) RETURNING id',[customerId,body,userId])).rows[0]} async notes(customerId:string){return(await this.db.query('SELECT id,body,created_at FROM customer_notes WHERE customer_id=$1 ORDER BY created_at DESC',[customerId])).rows}}
