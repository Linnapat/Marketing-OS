-- Promotion Summary Print — clear saved manual/synced rows.
-- Run in Supabase SQL Editor when switching the module to Campaign-only sync.

truncate table promotion_summary_items;
