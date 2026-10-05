import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreatePageDto } from './dto/create-page.dto';
import { CreatePageRevisionDto } from './dto/create-page-revision.dto';
@Injectable()
export class ContentService {
  constructor(private readonly db: DatabaseService) {}
  async listAdmin() { return (await this.db.query<{id:string;slug:string;title:string;status:string;published_at:string|null;version:string}>(`SELECT p.id,p.slug,p.title,p.status,p.published_at,COALESCE(MAX(r.version),0)::text AS version FROM cms_pages p LEFT JOIN cms_page_revisions r ON r.page_id=p.id GROUP BY p.id ORDER BY p.updated_at DESC`)).rows; }
  async createPage(dto: CreatePageDto, actorId: string) {
    try { const page = await this.db.query<{ id: string }>('INSERT INTO cms_pages (slug,title) VALUES ($1,$2) RETURNING id', [dto.slug, dto.title]); await this.db.query('INSERT INTO cms_page_revisions (page_id,version,content,created_by) VALUES ($1,1,$2,$3)', [page.rows[0].id, JSON.stringify(dto.content), actorId]); return page.rows[0]; }
    catch (error: unknown) { if ((error as { code?: string }).code === '23505') throw new ConflictException('Page slug already exists'); throw error; }
  }
  async createRevision(pageId: string, dto: CreatePageRevisionDto, actorId: string) {
    return this.db.transaction(async (client) => {
      const page = await client.query<{ id: string }>('SELECT id FROM cms_pages WHERE id=$1 FOR UPDATE', [pageId]);
      if (!page.rowCount) throw new NotFoundException('Page not found');
      const revision = await client.query<{ id: string; version: number }>('INSERT INTO cms_page_revisions (page_id,version,content,created_by) SELECT $1,COALESCE(MAX(version),0)+1,$2,$3 FROM cms_page_revisions WHERE page_id=$1 RETURNING id,version', [pageId, JSON.stringify(dto.content), actorId]);
      await client.query('INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id) VALUES ($1,$2,$3,$4)', [actorId, 'cms.revision.created', 'cms_page', pageId]);
      return revision.rows[0];
    });
  }
  async publish(pageId: string) { const page = await this.db.query("UPDATE cms_pages SET status='PUBLISHED',published_at=now(),updated_at=now(),published_revision_id=(SELECT id FROM cms_page_revisions WHERE page_id=cms_pages.id ORDER BY version DESC LIMIT 1) WHERE id=$1 AND status IN ('DRAFT','REVIEW','APPROVED','PUBLISHED') AND EXISTS (SELECT 1 FROM cms_page_revisions WHERE page_id=cms_pages.id) RETURNING id,published_revision_id", [pageId]); if (!page.rowCount) throw new NotFoundException('Publishable page not found'); return page.rows[0]; }
  async getPublic(slug: string) { const page = await this.db.query<{ id: string; title: string; content: Record<string, unknown> }>("SELECT p.id,p.title,r.content FROM cms_pages p JOIN cms_page_revisions r ON r.id=p.published_revision_id WHERE p.slug=$1 AND p.status='PUBLISHED' LIMIT 1", [slug]); if (!page.rows[0]) throw new NotFoundException('Page not found'); return page.rows[0]; }
}
