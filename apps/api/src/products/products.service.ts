import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RequestUser } from '../auth/auth.types';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export interface Product { id: string; sku: string; barcode: string | null; slug: string; name: string; description: string | null; status: ProductStatus; version: number; created_at: Date; updated_at: Date; }

@Injectable()
export class ProductsService {
  constructor(private readonly db: DatabaseService) {}
  private async audit(actor: RequestUser, action: string, productId: string) { await this.db.query('INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id) VALUES ($1,$2,$3,$4)', [actor.id, action, 'product', productId]); }
  async create(dto: CreateProductDto, actor: RequestUser) {
    try {
      const result = await this.db.query<Product>('INSERT INTO products (sku, barcode, slug, name, description, status, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [dto.sku.trim(), dto.barcode?.trim() || null, dto.slug, dto.name.trim(), dto.description?.trim() || null, dto.status ?? 'DRAFT', actor.id]);
      await this.audit(actor, 'product.created', result.rows[0].id); return result.rows[0];
    } catch (error: unknown) { if ((error as { code?: string }).code === '23505') throw new ConflictException('SKU, barcode, or slug already exists'); throw error; }
  }
  async listPublic() { return (await this.db.query<Product>("SELECT * FROM products WHERE status='ACTIVE' ORDER BY created_at DESC")).rows; }
  async getPublic(slug: string) { const product = (await this.db.query<Product>("SELECT * FROM products WHERE slug=$1 AND status='ACTIVE'", [slug])).rows[0]; if (!product) throw new NotFoundException('Product not found'); return product; }
  async listAdmin() { return (await this.db.query<Product>('SELECT * FROM products ORDER BY created_at DESC')).rows; }
  async update(id: string, dto: UpdateProductDto, actor: RequestUser) {
    const result = await this.db.query<Product>('UPDATE products SET barcode=CASE WHEN $1::boolean THEN $2 ELSE barcode END, slug=COALESCE($3, slug), name=COALESCE($4, name), description=CASE WHEN $5::boolean THEN $6 ELSE description END, status=COALESCE($7, status), version=version+1, updated_at=now() WHERE id=$8 AND version=$9 RETURNING *', ['barcode' in dto, dto.barcode === null ? null : dto.barcode?.trim(), dto.slug, dto.name?.trim(), 'description' in dto, dto.description === null ? null : dto.description?.trim(), dto.status, id, dto.version]);
    if (!result.rows[0]) { const exists = await this.db.query('SELECT 1 FROM products WHERE id=$1', [id]); if (!exists.rowCount) throw new NotFoundException('Product not found'); throw new ConflictException('Product was modified; reload and try again'); }
    await this.audit(actor, 'product.updated', id); return result.rows[0];
  }
}
