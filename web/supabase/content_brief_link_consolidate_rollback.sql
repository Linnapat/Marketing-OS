-- Undo content_brief_link_consolidate.sql — as far as it can be undone.
--
-- READ THIS BEFORE RUNNING. The forward migration merged four link fields into
-- one. Which box a URL originally sat in is not recorded anywhere, so that split
-- CANNOT be reconstructed: this restores the three keys as empty strings, it
-- does not put the old values back.
--
-- That is enough to undo the SCHEMA change (a build that still renders four
-- inputs will find its fields and work), and no link is lost either way —
-- every URL is in referenceBriefLink, which every version reads.
--
-- If you need the true prior state, restore from a Supabase backup taken before
-- 2026-08-13 instead.

begin;

update campaigns c
set data = jsonb_set(
  c.data,
  '{content}',
  (
    select jsonb_agg(
      ci || jsonb_build_object(
        'referenceImageLink', coalesce(ci->>'referenceImageLink', ''),
        'driveLink',          coalesce(ci->>'driveLink', ''),
        'competitorLink',     coalesce(ci->>'competitorLink', '')
      )
      order by idx
    )
    from jsonb_array_elements(c.data->'content') with ordinality as t(ci, idx)
  )
)
where jsonb_typeof(c.data->'content') = 'array'
  and jsonb_array_length(c.data->'content') > 0;

delete from schema_migrations where filename = 'content_brief_link_consolidate.sql';

commit;
