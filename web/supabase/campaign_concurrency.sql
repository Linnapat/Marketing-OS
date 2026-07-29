-- ── Stop two editors silently overwriting each other ─────────────────────
--
-- A campaign brief is saved as one whole blob (`update campaigns set data = …`),
-- so two people with the campaign open both write their entire copy and the
-- later save wins — the earlier one's edits vanish with no error and no trace.
-- Nobody finds out until someone notices their work is gone.
--
-- The new "Creative accepts / Marketing edits" flow puts more hands on the same
-- records, so this gets likelier, not rarer.
--
-- `updated_at` is maintained by a trigger rather than by the client: a client
-- that forgets to set it would look permanently up to date, which is worse than
-- having no check at all.
--
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
-- rollback: campaign_concurrency_rollback.sql

alter table campaigns add column if not exists updated_at timestamptz not null default now();

create or replace function touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists campaigns_touch_updated_at on campaigns;
create trigger campaigns_touch_updated_at
  before update on campaigns
  for each row execute function touch_updated_at();

select record_migration('campaign_concurrency.sql', 'campaigns.updated_at + touch trigger');
