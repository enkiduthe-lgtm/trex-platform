import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
const actor={id:'user'} as never;
function service(query:jest.Mock){return new ProductsService({transaction:(work:(client:unknown)=>unknown)=>work({query})} as never);}
describe('Product deletion',()=>{
  it('rejects missing products',async()=>{
    await expect(service(jest.fn().mockResolvedValue({rows:[]})).delete('product',actor)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('protects order and stock history',async()=>{
    const query=jest.fn().mockResolvedValueOnce({rows:[{id:'product'}]}).mockResolvedValueOnce({rowCount:1});
    await expect(service(query).delete('product',actor)).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('backs up prices and costs before deleting an unused product',async()=>{
    const query=jest.fn().mockResolvedValueOnce({rows:[{id:'product'}]}).mockResolvedValue({rows:[],rowCount:0});
    await expect(service(query).delete('product',actor)).resolves.toEqual({deleted:true});
    expect(query).toHaveBeenCalledWith('DELETE FROM products WHERE id=$1',['product']);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_logs'),expect.arrayContaining(['product.deleted']));
  });
  it('translates unknown foreign key dependencies to a safe conflict',async()=>{
    const query=jest.fn().mockRejectedValue({code:'23503'});
    await expect(service(query).delete('product',actor)).rejects.toBeInstanceOf(ConflictException);
  });
});
