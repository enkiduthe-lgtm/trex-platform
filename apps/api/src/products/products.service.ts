import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RequestUser } from '../auth/auth.types';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProductCostDto } from './dto/create-product-cost.dto';

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
  async listPublic() { return (await this.db.query(`SELECT p.*,price.amount AS sale_price FROM products p LEFT JOIN LATERAL (SELECT amount FROM product_prices WHERE product_id=p.id AND scope='GLOBAL' AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now()) ORDER BY starts_at DESC,created_at DESC LIMIT 1) price ON true WHERE p.status='ACTIVE' ORDER BY p.created_at DESC`)).rows; }
  async getPublic(slug: string) { const product = (await this.db.query(`SELECT p.*,price.amount AS sale_price FROM products p LEFT JOIN LATERAL (SELECT amount FROM product_prices WHERE product_id=p.id AND scope='GLOBAL' AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now()) ORDER BY starts_at DESC,created_at DESC LIMIT 1) price ON true WHERE p.slug=$1 AND p.status='ACTIVE'`, [slug])).rows[0]; if (!product) throw new NotFoundException('Product not found'); return product; }
  async listAdmin() { return (await this.db.query<Product>('SELECT * FROM products ORDER BY created_at DESC')).rows; }
  async listCosts() { return (await this.db.query(`SELECT pc.*, pc.amount AS unit_cost, p.name AS product_name, s.name AS supplier_name FROM product_costs pc JOIN products p ON p.id=pc.product_id LEFT JOIN suppliers s ON s.id=pc.supplier_id ORDER BY p.name, pc.starts_at DESC, pc.created_at DESC`)).rows; }
  async profitability() { return (await this.db.query(`WITH latest_cost AS (SELECT DISTINCT ON (product_id) product_id,amount AS unit_cost FROM product_costs ORDER BY product_id,starts_at DESC,created_at DESC), latest_price AS (SELECT DISTINCT ON (product_id) product_id,amount FROM product_prices WHERE scope='GLOBAL' ORDER BY product_id,starts_at DESC,created_at DESC) SELECT p.id,p.name,lp.amount AS sale_price,lc.unit_cost,CASE WHEN lp.amount IS NOT NULL AND lc.unit_cost IS NOT NULL THEN lp.amount-lc.unit_cost END AS gross_profit,CASE WHEN lp.amount IS NOT NULL AND lp.amount>0 AND lc.unit_cost IS NOT NULL THEN ROUND(((lp.amount-lc.unit_cost)/lp.amount)*100,2) END AS gross_margin_percent FROM products p LEFT JOIN latest_price lp ON lp.product_id=p.id LEFT JOIN latest_cost lc ON lc.product_id=p.id ORDER BY p.name`)).rows; }
  async createCost(dto: CreateProductCostDto, actor: RequestUser) {
    return this.db.transaction(async client => {
      let supplierId = dto.supplierId ?? null;
      if (!supplierId && dto.supplierName?.trim()) { const supplier = await client.query<{ id: string }>('INSERT INTO suppliers(name) VALUES ($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id', [dto.supplierName.trim()]); supplierId = supplier.rows[0].id; }
      const result = await client.query<{ id: string }>('INSERT INTO product_costs(product_id,supplier_id,amount,note,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [dto.productId, supplierId, dto.unitCost, dto.note?.trim() || null, actor.id]);
      await client.query('INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id) VALUES ($1,$2,$3,$4)', [actor.id, 'product.cost.created', 'product_cost', result.rows[0].id]);
      return result.rows[0];
    });
  }
  async importMany(products: CreateProductDto[], actor: RequestUser) {
    try {
      return await this.db.transaction(async (client) => {
        const imported: Product[] = [];
        for (const dto of products) {
          const result = await client.query<Product>('INSERT INTO products (sku, barcode, slug, name, description, status, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [dto.sku.trim(), dto.barcode?.trim() || null, dto.slug, dto.name.trim(), dto.description?.trim() || null, dto.status ?? 'DRAFT', actor.id]);
          const product = result.rows[0];
          await client.query('INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id) VALUES ($1,$2,$3,$4)', [actor.id, 'product.imported', 'product', product.id]);
          imported.push(product);
        }
        return { imported: imported.length, products: imported };
      });
    } catch (error: unknown) { if ((error as { code?: string }).code === '23505') throw new ConflictException('Imported list contains an existing SKU, barcode, or slug'); throw error; }
  }
  async update(id: string, dto: UpdateProductDto, actor: RequestUser) {
    const result = await this.db.query<Product>('UPDATE products SET barcode=CASE WHEN $1::boolean THEN $2 ELSE barcode END, slug=COALESCE($3, slug), name=COALESCE($4, name), description=CASE WHEN $5::boolean THEN $6 ELSE description END, status=COALESCE($7, status), version=version+1, updated_at=now() WHERE id=$8 AND version=$9 RETURNING *', ['barcode' in dto, dto.barcode === null ? null : dto.barcode?.trim(), dto.slug, dto.name?.trim(), 'description' in dto, dto.description === null ? null : dto.description?.trim(), dto.status, id, dto.version]);
    if (!result.rows[0]) { const exists = await this.db.query('SELECT 1 FROM products WHERE id=$1', [id]); if (!exists.rowCount) throw new NotFoundException('Product not found'); throw new ConflictException('Product was modified; reload and try again'); }
    await this.audit(actor, 'product.updated', id); return result.rows[0];
  }
}
