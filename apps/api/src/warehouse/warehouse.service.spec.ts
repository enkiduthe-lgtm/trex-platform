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

  it('saves a reorder level when target is not lower than minimum', async () => {
    const client={query:jest.fn()
      .mockResolvedValueOnce({rowCount:1})
      .mockResolvedValueOnce({rows:[{product_id:'product',warehouse_id:'warehouse',minimum_quantity:4,target_quantity:24}]})
      .mockResolvedValueOnce({rows:[]})};
    const db={transaction:jest.fn((work) => work(client))};
    const result=await new WarehouseService(db as never).updateReorderLevel('warehouse','product',{minimumQuantity:4,targetQuantity:24},'user');
    expect(result).toEqual({product_id:'product',warehouse_id:'warehouse',minimum_quantity:4,target_quantity:24});
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO inventory_reorder_levels'),['product','warehouse',4,24,'user']);
  });

  it('does not allow a reorder target below its minimum', async () => {
    const service=new WarehouseService({} as never);
    await expect(service.updateReorderLevel('warehouse','product',{minimumQuantity:24,targetQuantity:4},'user')).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not let a count lower physical stock below active reservations', async () => {
    const client={query:jest.fn().mockResolvedValueOnce({rows:[{physical_quantity:12,reserved_quantity:4}]})};
    const db={transaction:jest.fn((work) => work(client))};
    await expect(new WarehouseService(db as never).createInventoryCount({productId:'product',warehouseId:'warehouse',actualQuantity:3,reason:'Sayım farkı'},'user')).rejects.toBeInstanceOf(ConflictException);
  });
  it('does not complete packing when lot records cannot cover the reservation', async () => {
    const query=jest.fn()
      .mockResolvedValueOnce({rowCount:1,rows:[{id:'packing',order_id:'order',checkout_id:'checkout'}]})
      .mockResolvedValueOnce({rows:[{id:'reservation',product_id:'product',warehouse_id:'warehouse',quantity:2}]})
      .mockResolvedValueOnce({rowCount:1,rows:[{physical_quantity:8}]})
      .mockResolvedValueOnce({rows:[{id:'lot',available_quantity:1}]})
      .mockResolvedValueOnce({rows:[]});
    const db={transaction:async(work:(client:unknown)=>unknown)=>work({query})};
    await expect(new WarehouseService(db as never).completePacking('pick','user')).rejects.toBeInstanceOf(ConflictException);
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining("status='CONSUMED'"),expect.anything());
  });

  it('lists recent inventory movements newest first', async () => {
    const db={query:jest.fn().mockResolvedValue({rows:[{id:'movement',movement_type:'RECEIPT'}]})};
    await expect(new WarehouseService(db as never).listInventoryMovements()).resolves.toEqual([{id:'movement',movement_type:'RECEIPT'}]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY m.created_at DESC LIMIT 100'));
  });

  it('lists lots expiring within the next sixty days', async () => {
    const db={query:jest.fn().mockResolvedValue({rows:[{lot_code:'LOT-1',days_remaining:12}]})};
    await expect(new WarehouseService(db as never).expiryAlerts()).resolves.toEqual([{lot_code:'LOT-1',days_remaining:12}]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("interval '60 days'"));
  });

  it('rejects a warehouse transfer that exceeds available stock', async () => {
    const client={query:jest.fn()
      .mockResolvedValueOnce({rowCount:2,rows:[{id:'source'},{id:'destination'}]})
      .mockResolvedValueOnce({rows:[{physical_quantity:10,reserved_quantity:4}]})};
    const db={transaction:jest.fn((work) => work(client))};
    await expect(new WarehouseService(db as never).createInventoryTransfer({productId:'product',sourceWarehouseId:'source',destinationWarehouseId:'destination',quantity:7},'user')).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates paired transfer movements for a valid warehouse transfer', async () => {
    const client={query:jest.fn()
      .mockResolvedValueOnce({rowCount:2,rows:[{id:'source'},{id:'destination'}]})
      .mockResolvedValueOnce({rows:[{physical_quantity:10,reserved_quantity:0}]})
      .mockResolvedValueOnce({rows:[{id:'lot',lot_code:'LOT-1',expiry_date:null,location_code:'A-1',available_quantity:10}]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[{id:'transfer'}]})
      .mockResolvedValue({rows:[]})};
    const db={transaction:jest.fn((work) => work(client))};
    const result=await new WarehouseService(db as never).createInventoryTransfer({productId:'product',sourceWarehouseId:'source',destinationWarehouseId:'destination',quantity:3,note:'Şube sevki'},'user');
    expect(result).toEqual({id:'transfer',quantity:3,allocations:[{lotCode:'LOT-1',expiryDate:null,locationCode:'A-1',quantity:3}]});
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("'TRANSFER_OUT'"),['product','source',-3,'transfer','user','destination',3]);
  });
});
