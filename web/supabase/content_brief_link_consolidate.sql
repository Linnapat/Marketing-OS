-- One link box on a content item — 2026-08-13
--
-- The content-item form asked for four links: Reference Brief Link, Reference
-- Image Link, Google Drive Link and Competitor / Inspiration Link. All four fed
-- the SAME single link on the Graphic Request, Drive first — so the labels were
-- a promise the system did not keep, and a competitor link typed on a campaign
-- was handed to the designer as the brief. 15 items had the same URL typed into
-- two boxes; 27 had Drive filled, 42 the brief box.
--
-- The form now offers Reference Brief Link only. This moves the links that live
-- in the retired boxes into it, so they are visible and editable rather than
-- sitting in a field with no input any more — the same "data is there, nobody
-- can see it" shape as the campaigns that went missing this morning.
--
-- Order matches contentBriefLink(): an existing referenceBriefLink always wins;
-- only an EMPTY one is filled, and from Drive → image → competitor. Nothing is
-- overwritten, so a re-run changes nothing.
--
-- The retired keys are then dropped from the blob. They are not read anywhere
-- once they are empty, and leaving them behind invites someone to wire an input
-- back up to one.
--
-- Undo: content_brief_link_consolidate_rollback.sql (see the note there — the
-- split cannot be reconstructed, so the rollback only restores empty keys).
-- Re-runnable: filling is guarded on the target being empty.

begin;

update campaigns c
set data = jsonb_set(
  c.data,
  '{content}',
  (
    select jsonb_agg(
      (ci - 'referenceImageLink' - 'driveLink' - 'competitorLink')
      || jsonb_build_object('referenceBriefLink', coalesce(
           nullif(btrim(coalesce(ci->>'referenceBriefLink', '')), ''),
           nullif(btrim(coalesce(ci->>'driveLink', '')), ''),
           nullif(btrim(coalesce(ci->>'referenceImageLink', '')), ''),
           nullif(btrim(coalesce(ci->>'competitorLink', '')), ''),
           ''
         ))
      order by idx
    )
    from jsonb_array_elements(c.data->'content') with ordinality as t(ci, idx)
  )
)
where jsonb_typeof(c.data->'content') = 'array'
  and jsonb_array_length(c.data->'content') > 0
  -- Only campaigns that still carry a retired key, so untouched rows keep their
  -- updated_at and nobody's open brief goes stale for nothing (see
  -- adoptBriefVersion / StaleBriefError).
  and exists (
    select 1 from jsonb_array_elements(c.data->'content') ci
    where ci ? 'referenceImageLink' or ci ? 'driveLink' or ci ? 'competitorLink'
  );

select record_migration(
  'content_brief_link_consolidate.sql',
  'ยุบลิงก์ 4 ช่องในคอนเทนต์เหลือ Reference Brief Link ช่องเดียว'
);

commit;
