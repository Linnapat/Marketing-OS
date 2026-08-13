-- Repair campaigns whose row columns and brief blob disagree.
--
-- Status and total budget are stored twice: as columns on the campaigns row
-- (what the list, Finance and the dashboards read) and inside data (what the
-- Campaign Builder loads and rewrites whole on Save). Writers that moved only
-- the column left the two apart; the code fix stops new drift, this repairs the
-- rows that already have it.
--
-- Every campaign below was checked one by one — which side is true is a
-- judgement about what actually happened, not something to automate. Read the
-- note above each statement before running it. Safe to re-run: each statement
-- only touches the row it names, and only while it still shows the drift.
--
-- Check first / verify after:
--   select id, name, status, data->>'status' as brief_status,
--          budget, data->'budget'->>'total' as brief_budget
--   from campaigns
--   where deleted_at is null and data is not null
--     and (coalesce(status,'') is distinct from coalesce(data->>'status','')
--         or (data->'budget'->>'total')::numeric is distinct from budget::numeric);

-- 1) MS_Delivery — the row is a ghost of a save that failed.
-- Pupay edited it on 4 ส.ค., before the stale-version fix: the row took the new
-- status ("Waiting for Approval") and the plan write was refused, so the edit
-- itself was never stored. The plan says In Progress, its work exists (3 posts,
-- 2 graphic requests), and its approval log records Approved → In Progress by
-- Gik. Nothing asked the CMO to re-approve anything, so the row goes back to
-- what the plan says. Pupay's 4 ส.ค. edit has to be made again.
update campaigns
set status = 'In Progress', next_approval = 'None'
where id = 'CAM-2026-7516' and status = 'Waiting for Approval' and data->>'status' = 'In Progress';

-- 2) Mother's Day — the approval was real, the brief never heard about it.
-- Approved on the row on 17 ก.ค. (audit_log: "เปลี่ยนสถานะแคมเปญ CAM-2026-5818"
-- → Approved) by the old dropdown that wrote the column alone. Its work was
-- created (3 posts, 3 graphic requests), so the approval is not in doubt — the
-- brief is simply missing it, approval log included.
update campaigns
set data = jsonb_set(
      jsonb_set(data, '{status}', '"Approved"'),
      '{approvalLog}',
      coalesce(data->'approvalLog', '[]'::jsonb) || jsonb_build_object(
        'action', 'Approved',
        'by', 'Gik',
        'at', '2026-07-17T03:36:39.486Z',
        'from', data->>'status',
        'to', 'Approved',
        'comment', 'บันทึกย้อนหลัง: อนุมัติจริงเมื่อ 17 ก.ค. 69 (audit log) แต่ตอนนั้นระบบเขียนสถานะลงแถวสรุปอย่างเดียว ไม่ได้ลงในบรีฟ'
      ))
where id = 'CAM-2026-5818' and status = 'Approved' and data->>'status' = 'Waiting for Approval';

-- 3) Unlimited Side Dish — parked on a status the app does not know.
-- "Active" came from the pre-17 ก.ค. detail page, which wrote it straight onto
-- the row. It is not a brief status, so the campaign counted as neither
-- approved (its 3 planned items never became work — 0 posts) nor waiting (no
-- approval queue could see it). The brief still says Waiting for Approval and
-- its log has no approval, so that is where it goes: back in front of the CMO.
update campaigns
set status = 'Waiting for Approval',
    next_approval = coalesce(nullif(data->>'approver', ''), 'Gik')
where id = 'CAM-2026-4064' and status = 'Active' and data->>'status' = 'Waiting for Approval';

-- 4) Seasonal menu — the row's cap is the newer decision, the plan kept the old.
-- Row ฿6,000 vs plan ฿12,000. Two things produce this shape — an approved
-- budget revision that only wrote the column, or a Builder save whose plan write
-- was refused — and both leave the NEWER number on the row: the revision's, or
-- the one the planner had just typed. ฿6,000 is the later decision either way,
-- and it is what Finance and the list have been showing all along.
-- The per-bucket allocation is left alone deliberately: it now adds up to
-- more than the cap, which is a real thing for the planner to re-allocate, and
-- the Builder already warns about it.
update campaigns
set data = jsonb_set(
      jsonb_set(data, '{budget,total}', '6000'),
      '{approvalLog}',
      coalesce(data->'approvalLog', '[]'::jsonb) || jsonb_build_object(
        'action', 'Budget revised',
        'by', 'ระบบ (แก้ข้อมูลที่ไม่ตรงกัน)',
        'at', '2026-08-07T00:00:00.000Z',
        'comment', 'บันทึกย้อนหลัง: งบในแถวสรุปถูกปรับเป็น 6,000 บาท แต่ในแผนยังเป็น 12,000 — ปรับแผนให้ตรงกับงบที่อนุมัติ · การจัดสรรรายก้อนยังเป็นของเดิม ต้องเกลี่ยใหม่ให้รวมไม่เกิน 6,000'
      ))
where id = 'CAM-2026-4770' and budget = 6000 and (data->'budget'->>'total')::numeric = 12000;
