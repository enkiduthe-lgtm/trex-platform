import test from 'node:test';
import assert from 'node:assert/strict';
import {orderQueueStatus,nextPreparationAction} from './order-queue';

test('registration is separate from dispatch and real tracking',()=>{
  assert.equal(orderQueueStatus({status:'PROCESSING',shipment_status:'CREATED'}),'REGISTERED');
  assert.equal(orderQueueStatus({status:'PROCESSING',shipment_status:'IN_TRANSIT'}),'SHIPPED');
  assert.equal(orderQueueStatus({status:'PROCESSING',shipment_status:'DELIVERED'}),'DELIVERED');
  assert.equal(orderQueueStatus({status:'PROCESSING',shipment_status:null}),'PROCESSING');
});
test('shipment history never reopens cancelled or refunded orders',()=>{
  for(const status of ['CANCELLED','REFUNDED']) {
    for(const shipment_status of ['CREATED','IN_TRANSIT','DELIVERED']) {
      assert.equal(orderQueueStatus({status,shipment_status}),status);
    }
  }
});

test('preparation proceeds in sequence and never restarts a registered or terminal shipment',()=>{
  assert.equal(nextPreparationAction({status:'PAID'}),'prepare');
  assert.equal(nextPreparationAction({status:'PROCESSING',preparation_status:'COMPLETED'}),'pack');
  assert.equal(nextPreparationAction({status:'PROCESSING',packed_at:'2026-11-06'}),'ship');
  assert.equal(nextPreparationAction({status:'PROCESSING',packed_at:'2026-11-06',shipment_status:'FAILED'}),'ship');
  for(const status of ['PENDING_PAYMENT','SHIPPED','DELIVERED','CANCELLED','REFUNDED'])assert.equal(nextPreparationAction({status}),null);
  for(const shipment_status of ['CREATED','IN_TRANSIT','DELIVERED','RETURNED'])assert.equal(nextPreparationAction({status:'PROCESSING',shipment_status}),null);
});
