-- Restore paid and removed columns dropped when 0002_entry_uniqueness recreated the table
ALTER TABLE entries ADD COLUMN paid INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entries ADD COLUMN removed INTEGER NOT NULL DEFAULT 0;
