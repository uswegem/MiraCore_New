-- ================================================================
-- MIFOS m_charge Table - All Missing Columns
-- Copy and paste this directly into your MySQL client
-- ================================================================

-- CRITICAL: Add is_capitalized column (THIS FIXES THE IMMEDIATE ERROR)
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_capitalized TINYINT(1) NOT NULL DEFAULT 0;

-- Add other flag columns
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS active TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_charge_surcharge_fee TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_penalty TINYINT(1) NOT NULL DEFAULT 0;

-- Add surcharge/fee reference columns
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS surcharge_charge_id BIGINT(20);
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS surcharge_fee_charge_id BIGINT(20);

-- Add tax group reference
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS tax_group_id BIGINT(20);

-- Add accounting GL account references (if missing)
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS liabilityaccount_id BIGINT(20);
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS receivable_account_id BIGINT(20);
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS expense_account_id BIGINT(20);

-- ================================================================
-- VERIFY: Run these after adding columns
-- ================================================================

-- Check all columns were added
DESCRIBE m_charge;

-- Show just the new columns
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT 
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'm_charge'
AND COLUMN_NAME IN (
  'is_capitalized',
  'active',
  'is_charge_surcharge_fee',
  'is_penalty',
  'surcharge_charge_id',
  'surcharge_fee_charge_id',
  'tax_group_id'
);

-- Verify data integrity
SELECT COUNT(*) as charge_count FROM m_charge;

-- ================================================================
-- NEXT: Restart MIFOS application
-- ================================================================
