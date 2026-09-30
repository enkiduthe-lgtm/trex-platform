import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreatePageDto } from './dto/create-page.dto';
@Injectable()
export class ContentService {
  constructor(private readonly db: DatabaseService) {}
  async createPage(dto: CreatePageDto, actorId: string) {
    try { const page = await this.db.query<{ id: string }>('INSERT INTO cms_pages (slug,title) VALUES ($1,$2) RETURNING id', [dto.slug, dto.title]); await this.db.query('INSERT INTO cms_page_revisions (page_id,version,content,created_by) VALUES ($1,1,$2,$3)', [page.rows[0].id, JSON.stringify(dto.content), actorId]); return page.rows[0]; }
    catch (error: unknown) { if ((error as { code?: string }).code === '23505') throw new ConflictException('Page slug already exists'); throw error; }
  }
  async publish(pageId: string) { const page = await this.db.query("UPDATE cms_pages SET status='PUBLISHED',published_at=now(),updated_at=now() WHERE id=$1 AND status IN ('DRAFT','REVIEW','APPROVED') RETURNING id", [pageId]); if (!page.rowCount) throw new NotFoundException('Publishable page not found'); return page.rows[0]; }
  async getPublic(slug: string) { const page = await this.db.query<{ id: string; title: string; content: Record<string, unknown> }>("SELECT p.id,p.title,r.content FROM cms_pages p JOIN cms_page_revisions r ON r.page_id=p.id WHERE p.slug=$1 AND p.status='PUBLISHED' ORDER BY r.version DESC LIMIT 1", [slug]); if (!page.rows[0]) throw new NotFoundException('Page not found'); return page.rows[0]; }
}
