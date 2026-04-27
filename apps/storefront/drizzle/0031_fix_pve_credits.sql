-- Correct first_clear_credit for PVE levels to pound values.
-- Background: 0030_pve_seed.sql initially stored pence values (100 = "£1") to
-- match a /100 divide in the UI, but the API passes first_clear_credit directly
-- into addCredit() which expects pounds. Production was always stored correctly
-- in pounds; the UI was off-by-100 on display. This patch normalises any DB
-- that was seeded with the incorrect unit — idempotent since it assigns
-- absolute values.

UPDATE pve_levels SET first_clear_credit = 0.00  WHERE level_number = 1;
UPDATE pve_levels SET first_clear_credit = 0.00  WHERE level_number = 2;
UPDATE pve_levels SET first_clear_credit = 1.00  WHERE level_number = 3;
UPDATE pve_levels SET first_clear_credit = 1.00  WHERE level_number = 4;
UPDATE pve_levels SET first_clear_credit = 2.00  WHERE level_number = 5;
UPDATE pve_levels SET first_clear_credit = 2.00  WHERE level_number = 6;
UPDATE pve_levels SET first_clear_credit = 3.00  WHERE level_number = 7;
UPDATE pve_levels SET first_clear_credit = 3.00  WHERE level_number = 8;
UPDATE pve_levels SET first_clear_credit = 5.00  WHERE level_number = 9;
UPDATE pve_levels SET first_clear_credit = 10.00 WHERE level_number = 10;
