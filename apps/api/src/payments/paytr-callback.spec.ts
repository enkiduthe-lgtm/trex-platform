import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

describe('PayTR callback HTTP contract',()=>{
  it('accepts the form payload and returns only OK with HTTP 200',async()=>{
    const payments={receivePaytrCallback:jest.fn().mockResolvedValue({response:'OK',matched:true})};
    const module=await Test.createTestingModule({controllers:[PaymentsController],providers:[{provide:PaymentsService,useValue:payments}]}).compile();
    const app=module.createNestApplication();app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidNonWhitelisted:true}));
    await app.init();
    try{
      const payload={merchant_oid:'order1',status:'success',total_amount:'75999',hash:'signed',payment_amount:'75999',payment_type:'card',currency:'TL',test_mode:'1',installment_count:'0',merchant_id:'123456'};
      const response=await request(app.getHttpServer()).post('/v1/payments/paytr/callback').type('form').send(payload);
      expect(response.status).toBe(200);expect(response.text).toBe('OK');expect(response.headers['content-type']).toContain('text/plain');
      expect(payments.receivePaytrCallback).toHaveBeenCalledWith(expect.objectContaining(payload));
    }finally{await app.close();}
  });
  it('does not acknowledge a rejected signature',async()=>{
    const controller=new PaymentsController({receivePaytrCallback:jest.fn().mockRejectedValue(new Error('invalid signature'))} as never);
    await expect(controller.paytrCallback({merchant_oid:'order1',status:'success',total_amount:'1',hash:'invalid'})).rejects.toThrow('invalid signature');
  });
});
