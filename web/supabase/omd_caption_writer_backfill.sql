-- OMD captions are written by OMD's own Marketing Executive (narawich), not
-- Creative (CMO, 2026-10-19). New posts get this from pickCaptionWriter; this
-- moves the OMD posts whose caption nobody has started yet. Posts already
-- Ready/Approved keep their writer — someone wrote those words.
-- Rollback: rows carry data->>'ownerBackfilledFrom' with the previous name.

-- 1) Dry run — expect 66 rows (19 Oct 2026)
select id, campaign, title, owner, data->>'captionStatus' as caption_status
from content_posts
where brand = 'omakase' and deleted_at is null
  and owner in ('Ninew', 'Pichayaporn')
  and coalesce(data->>'captionStatus', 'Missing') in ('Missing', 'Draft')
order by campaign, id;

-- 2) Apply
update content_posts
set owner = 'narawich',
    data = data || jsonb_build_object(
      'owner', 'narawich',
      'ownerBackfilledFrom', owner,
      'ownerBackfilledAt', now()::text)
where brand = 'omakase' and deleted_at is null
  and owner in ('Ninew', 'Pichayaporn')
  and coalesce(data->>'captionStatus', 'Missing') in ('Missing', 'Draft');
