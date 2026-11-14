import {BadRequestException} from '@nestjs/common';
import {OrdersService} from './orders.service';

describe('Central order history',()=>{
  const cursor='7045b6f1-3181-49ce-a919-15ae126507d0';
  it('keeps the array contract and includes dealer orders without an implicit channel filter',async()=>{
    const rows=[{id:cursor,sales_channel:'DEALER_PORTAL',admin_note:'Önce Telefon Edin'}];
    const db={query:jest.fn().mockResolvedValue({rows})};
    expect(await new OrdersService(db as never).list()).toEqual(rows);
    expect(db.query.mock.calls[0][1]).toEqual([null,null,null,null,null,null]);
    expect(db.query.mock.calls[0][0]).toContain("o.admin_note");
    expect(db.query.mock.calls[0][0]).toContain("o.customer_id");
  });
  it('uses a stable date and id cursor so new orders do not shift older pages',async()=>{
    const db={query:jest.fn().mockResolvedValue({rows:[]})};
    await new OrdersService(db as never).list('dealer_portal',cursor);
    const [sql,args]=db.query.mock.calls[0];
    expect(args).toEqual(['DEALER_PORTAL',cursor,null,null,null,null]);
    expect(sql).toContain('(o.created_at,o.id)<(SELECT created_at,id FROM orders WHERE id=$2::uuid)');
    expect(sql).toContain('ORDER BY o.created_at DESC,o.id DESC LIMIT 100');
  });
  it('rejects malformed cursors before querying',async()=>{
    const db={query:jest.fn()};
    await expect(new OrdersService(db as never).list(undefined,'invalid')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });
  it('filters the complete history by stage before limiting the page', async () => {
    const query=jest.fn().mockResolvedValue({rows:[]});
    await new OrdersService({query} as never).list(undefined,cursor,'CARRIER_RETURN');
    const [sql,params]=query.mock.calls[0];
    expect(params).toEqual([null,cursor,'CARRIER_RETURN',null,null,null]);
    expect(sql).toMatch(/tracking_direction_code='3' THEN 'CARRIER_RETURN'[\s\S]+END\)=\$3[\s\S]+LIMIT 100/);
  });
  it('binds Turkish search and Istanbul dates independently of the cursor', async () => {
    const query=jest.fn().mockResolvedValue({rows:[]});
    await new OrdersService({query} as never).list(undefined,cursor,'PAID',{query:' İSMAİL% ',from:'2026-11-01',to:'2026-11-02'});
    expect(query.mock.calls[0][1]).toEqual([null,cursor,'PAID','2026-11-01','2026-11-02','ismail%']);
    expect(query.mock.calls[0][0]).toContain("AT TIME ZONE 'Europe/Istanbul'");
  });
  it('rejects an invalid stage before querying', async () => {
    const query=jest.fn();
    await expect(new OrdersService({query} as never).list(undefined,undefined,'invalid')).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });
  it('returns saved product names and combines quantity across price-split lines', async () => {
    const products = [{product_name:'Trex Tea',sku:'TEA',quantity:5}];
    const db = {query:jest.fn().mockResolvedValue({rows:[{id:cursor,item_count:'5',products}]})};
    expect((await new OrdersService(db as never).list())[0].products).toEqual(products);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('SUM(quantity)::int AS quantity');
    expect(sql).toContain('GROUP BY product_id,product_name,sku');
    expect(sql).toContain("'product_name',lines.product_name");
    expect(sql).toContain("'[]'::jsonb) AS products");
  });
});
