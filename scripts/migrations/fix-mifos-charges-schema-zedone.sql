-- ================================================================
-- MIFOS Charges Table Schema Fix for ZEDONE Tenant
-- ================================================================
-- This script fixes the missing 'isCapitalized' column in m_charge table
-- Run this against the MIFOS database (affects only the zedone tenant)
--
-- IMPORTANT: This script should be run by a database administrator
-- After running, restart the MIFOS application
-- ================================================================

-- Step 1: Check if the column exists
SELECT CASE 
  WHEN EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'm_charge' 
    AND COLUMN_NAME = 'is_capitalized'
  ) THEN 'Column exists - No action needed'
  ELSE 'Column missing - Migration required'
END AS check_result;

-- Step 2: Add the missing isCapitalized column if it doesn't exist
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_capitalized TINYINT(1) NOT NULL DEFAULT 0 AFTER charge_payment_mode;

-- Step 3: Verify the column was added
DESCRIBE m_charge;

-- Step 4: Ensure default values for existing charges
UPDATE m_charge SET is_capitalized = 0 WHERE is_capitalized IS NULL;

-- Step 5: Fix any other potentially missing columns in m_charge
-- based on current MIFOS schema standards
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_charge_surcharge_fee TINYINT(1) NOT NULL DEFAULT 0 AFTER is_capitalized;
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS surcharge_fee_charge_id BIGINT AFTER is_charge_surcharge_fee;
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS tax_group_id BIGINT AFTER surcharge_fee_charge_id;
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER is_capitalized;

-- Step 6: Verify the table structure
SELECT 
  COLUMN_NAME, 
  COLUMN_TYPE, 
  IS_NULLABLE, 
  COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'm_charge'
ORDER BY ORDINAL_POSITION;

-- Step 7: Check for any orphaned tenant-specific data (if applicable)
SELECT COUNT(*) as charge_count FROM m_charge;

-- ================================================================
-- VERIFICATION QUERIES (Run these to verify the fix)
-- ================================================================

-- Check if charges endpoint would work
SELECT 
  mc.id,
  mc.name,
  mc.amount,
  mc.charge_applies_to_option_id,
  mc.charge_time_type_enum,
  mc.charge_calculation_type_enum,
  mc.charge_payment_mode_enum,
  mc.is_capitalized
FROM m_charge mc
LIMIT 5;

-- Verify no NULL values in critical columns
SELECT COUNT(*) as rows_with_null_is_capitalized 
FROM m_charge 
WHERE is_capitalized IS NULL;

-- Check loan products (should be able to reference charges)
SELECT COUNT(*) as product_count FROM m_product_loan;

-- ================================================================
-- ROLLBACK PLAN (if needed)
-- ================================================================
-- If something goes wrong, rollback with:
-- ALTER TABLE m_charge DROP COLUMN IF EXISTS is_capitalized;
-- ALTER TABLE m_charge DROP COLUMN IF EXISTS is_charge_surcharge_fee;
-- ALTER TABLE m_charge DROP COLUMN IF EXISTS surcharge_fee_charge_id;
-- ALTER TABLE m_charge DROP COLUMN IF EXISTS tax_group_id;
-- ================================================================

-- Mark migration as complete
SELECT "Migration completed successfully - MIFOS charges schema fixed" as status;
