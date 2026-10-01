ALTER TABLE cms_pages ADD COLUMN published_revision_id uuid REFERENCES cms_page_revisions(id);

UPDATE cms_pages page
SET published_revision_id = revision.id
FROM (
  SELECT DISTINCT ON (page_id) id, page_id
  FROM cms_page_revisions
  ORDER BY page_id, version DESC
) revision
WHERE page.id = revision.page_id
  AND page.status = 'PUBLISHED';

CREATE INDEX cms_pages_published_revision_idx ON cms_pages(published_revision_id) WHERE status = 'PUBLISHED';
