import { ConflictException, NotFoundException } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import { WarehouseController } from './warehouse.controller';
import { REQUIRED_ROLES } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';

function service(query:jest.Mock) {
  return new WarehouseService({transaction:(work:(client:unknown)=>unknown)=>work({query})} as never);
}
describe('Warehouse deletion',()=>{
  it('restricts delete routes to administrators',()=>{
    for(const method of ['deleteStock','deleteLocation'] as const)
      expect(Reflect.getMetadata(REQUIRED_ROLES,WarehouseController.prototype[method])).toEqual([Roles.SUPER_ADMIN,Roles.ADMIN]);
  });
  it('rejects missing stock',async()=>{
    const query=jest.fn().mockResolvedValue({rows:[],rowCount:0});
    await expect(service(query).deleteStock('warehouse','product','user')).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('rejects reserved stock without deleting anything',async()=>{
    const query=jest.fn().mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{physical_quantity:5,reserved_quantity:1}]}).mockResolvedValueOnce({rowCount:0});
    await expect(service(query).deleteStock('warehouse','product','user')).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(3);
  });
  it('removes stock and records an adjustment and audit',async()=>{
    const query=jest.fn().mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{physical_quantity:5,reserved_quantity:0}]}).mockResolvedValueOnce({rowCount:0}).mockResolvedValue({rows:[]});
    await expect(service(query).deleteStock('warehouse','product','user')).resolves.toEqual({deleted:true});
    expect(query).toHaveBeenCalledWith(expect.stringContaining("'ADJUSTMENT'"),['product','warehouse',-5,'user']);
    expect(query).toHaveBeenCalledWith('DELETE FROM inventory WHERE warehouse_id=$1 AND product_id=$2',['warehouse','product']);
  });
  it('does not delete a warehouse with operational dependencies',async()=>{
    const query=jest.fn().mockResolvedValueOnce({rows:[{id:'warehouse'}]}).mockResolvedValueOnce({rowCount:1});
    await expect(service(query).deleteLocation('warehouse','user')).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('backs up warehouse history in audit before deleting',async()=>{
    const query=jest.fn().mockResolvedValueOnce({rows:[{id:'warehouse'}]}).mockResolvedValue({rows:[],rowCount:0});
    await expect(service(query).deleteLocation('warehouse','user')).resolves.toEqual({deleted:true});
    const calls=query.mock.calls.map(call=>call[0] as string);
    expect(calls.findIndex(sql=>sql.includes('INSERT INTO audit_logs'))).toBeLessThan(calls.findIndex(sql=>sql.includes('DELETE FROM warehouses')));
  });
});
