-- Undo teppen_items_in_omd_plan_1910.sql

begin;

update graphic_requests set deleted_at = null, deleted_by = null
 where deleted_by = 'ล้างงาน TEPPEN ที่หลุดเข้าแผน OMD';
update content_posts set deleted_at = null, deleted_by = null
 where deleted_by = 'ล้างงาน TEPPEN ที่หลุดเข้าแผน OMD';
update tasks set deleted_at = null, deleted_by = null
 where deleted_by = 'ล้างงาน TEPPEN ที่หลุดเข้าแผน OMD';

update campaigns c
   set data = jsonb_set(c.data, '{content}', b.content)
  from campaigns_content_backup_omd_1910 b
 where c.id = b.id;

commit;
