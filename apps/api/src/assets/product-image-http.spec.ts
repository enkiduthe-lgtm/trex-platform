import express = require('express');
import helmet from 'helmet';
import request = require('supertest');
import { PublicAssetsController } from './assets.controller';

describe('Public product image HTTP response', () => {
  it('allows the admin on a separate origin to embed the stored image while retaining other security headers', async () => {
    const image = Buffer.from('stored-product-image');
    const controller = new PublicAssetsController({ productImage: jest.fn().mockResolvedValue({ buffer: image, mimeType: 'image/png' }) } as never);
    const app = express();
    app.use(helmet());
    app.get('/image', (_req, res, next) => { void controller.productImage('product', res).catch(next); });
    const response = await request(app).get('/image').set('Origin', 'https://trex-admin.onrender.com').expect(200);
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(response.headers['content-type']).toContain('image/png');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toContain('must-revalidate');
    expect(response.body).toEqual(image);
  });
});
