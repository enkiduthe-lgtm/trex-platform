import { ConflictException } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';

describe('WarehouseService', () => {
  it('creates pick items from a paid order', async () => {
    const db={query:jest.fn().mockResolvedValueOnce({rowCount:1}).mockResolvedValueOnce({rows:[{id:'pick'}]}).mockResolvedValueOnce({rows:[{id:'item',quantity:2}]}).mockResolvedValueOnce({rows:[]})};
    const result=await new WarehouseService(db as never).createPick('order','warehouse','user');
    expect(result).toEqual({id:'pick'});
    expect(db.query).toHaveBeenCalledTimes(4);
  });

  it('does not allow a picker to exceed the ordered quantity', async () => {
    const client={query:jest.fn().mockResolvedValueOnce({rows:[{id:'item',expected_quantity:2,status:'IN_PROGRESS'}]})};
    const db={transaction:jest.fn((work) => work(client))};
    const service=new WarehouseService(db as never);
    await expect(service.updatePickedQuantity('pick','item',3,'user')).rejects.toBeInstanceOf(ConflictException);
  });

  it('records the scanned quantity and an audit trail', async () => {
    const client={query:jest.fn().mockResolvedValueOnce({rows:[{id:'item',expected_quantity:2,status:'IN_PROGRESS'}]}).mockResolvedValue({rows:[]})};
    const db={transaction:jest.fn((work) => work(client))};
    const result=await new WarehouseService(db as never).updatePickedQuantity('pick','item',2,'user');
    expect(result).toEqual({id:'item',pickId:'pick',pickedQuantity:2,expectedQuantity:2});
    expect(client.query).toHaveBeenCalledWith('UPDATE picking_items SET picked_quantity=$1 WHERE id=$2',[2,'item']);
  });

  it('accepts a barcode only when it belongs to the active pick list', async () => {
    const client={query:jest.fn()
      .mockResolvedValueOnce({rows:[{id:'item',expected_quantity:2,picked_quantity:0,status:'IN_PROGRESS',product_name:'TrexTea'}]})
      .mockResolvedValue({rows:[]})};
    const db={transaction:jest.fn((work) => work(client))};
    const result=await new WarehouseService(db as never).scanPickBarcode('pick','869000000001','user');
    expect(result).toEqual({id:'item',pickId:'pick',productName:'TrexTea',pickedQuantity:1,expectedQuantity:2});
    expect(client.query).toHaveBeenCalledWith('UPDATE picking_items SET picked_quantity=$1 WHERE id=$2',[1,'item']);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO picking_scans'),['pick','item','869000000001','user']);
  });

  it('consumes the stock reservation once a package is completed', async () => {
    const client={query:jest.fn()
      .mockResolvedValueOnce({rowCount:1,rows:[{id:'packing',order_id:'order',checkout_id:'checkout'}]})
      .mockResolvedValueOnce({rows:[{id:'reservation',product_id:'product',warehouse_id:'warehouse',quantity:2}]})
      .mockResolvedValueOnce({rowCount:1,rows:[{physical_quantity:8}]})
      .mockResolvedValue({rows:[]})};
    const db={transaction:jest.fn((work) => work(client))};
    await expect(new WarehouseService(db as never).completePacking('pick','user')).resolves.toEqual({pickId:'pick',status:'READY_FOR_SHIPMENT'});
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE stock_reservations SET status='CONSUMED'"),['reservation']);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("'FULFILLMENT'"),['product','warehouse',-2,'order','user']);
  });

  it('receives stock by creating inventory, a lot, movement and audit entry', async () => {
    const client={query:jest.fn()
      .mockResolvedValueOnce({rowCount:1})
      .mockResolvedValueOnce({rowCount:1})
      .mockResolvedValueOnce({rows:[{physical_quantity:12}]})
      .mockResolvedValue({rows:[]})};
    const db={transaction:jest.fn((work) => work(client))};
    const result=await new WarehouseService(db as never).receiveStock({productId:'product',warehouseId:'warehouse',quantity:12,lotCode:'LOT-1'},'user');
    expect(result).toEqual({physical_quantity:12});
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO inventory_lots'),['product','warehouse','LOT-1',null,12,null]);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("'RECEIPT'"),['product','warehouse',12,'stock_receipt','user']);
  });
});
