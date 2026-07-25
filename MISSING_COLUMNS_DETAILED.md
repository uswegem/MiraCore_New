# MIFOS m_charge Table - Missing Columns Analysis

## Current Error
```
Database Error: Unknown column 'isCapitalized' in 'INSERT INTO'
```

This indicates the m_charge table is missing the `is_capitalized` column and likely other modern MIFOS columns.

## Missing Columns for m_charge Table

Based on the error trace and standard MIFOS schema (v1.28+), here are ALL columns that should exist:

### COMPLETE m_charge TABLE SCHEMA
```sql
-- Core Identification
id                              BIGINT(20)         PRIMARY KEY AUTO_INCREMENT
name                            VARCHAR(100)       NOT NULL
charge_code                     VARCHAR(100)       UNIQUE

-- Applicability
charge_applies_to_option_id     INT(11)            NOT NULL  -- 1=Loan, 2=Savings, etc.
charge_time_type_enum           INT(11)            NOT NULL  -- 1=Disbursement, 2=Monthly, etc.
charge_calculation_type_enum    INT(11)            NOT NULL  -- 1=Fixed, 2=Percentage, etc.
charge_payment_mode_enum        INT(11)            NOT NULL  -- 0=Portfolio, 1=Beneficiary

-- Amount/Rate
amount                          DECIMAL(19,6)      NOT NULL
currency_code                   VARCHAR(3)         NOT NULL
percentage_or_amount            VARCHAR(20)

-- Accounting
account_id                      BIGINT(20)         FOREIGN KEY
liabilityaccount_id             BIGINT(20)         FOREIGN KEY  
receivable_account_id           BIGINT(20)         FOREIGN KEY
expense_account_id              BIGINT(20)         FOREIGN KEY

-- Status & Flags
active                          TINYINT(1)         NOT NULL DEFAULT 1  [PROBABLY MISSING]
is_capitalized                  TINYINT(1)         NOT NULL DEFAULT 0  [CONFIRMED MISSING]
is_charge_surcharge_fee         TINYINT(1)         NOT NULL DEFAULT 0  [PROBABLY MISSING]
is_penalty                      TINYINT(1)         NOT NULL DEFAULT 0  [PROBABLY MISSING]

-- Surcharge/Tax References
surcharge_charge_id             BIGINT(20)         FOREIGN KEY         [PROBABLY MISSING]
surcharge_fee_charge_id         BIGINT(20)         FOREIGN KEY         [PROBABLY MISSING]
tax_group_id                    BIGINT(20)         FOREIGN KEY         [PROBABLY MISSING]

-- Audit Fields
created_date                    DATETIME
created_by_id                   BIGINT(20)         FOREIGN KEY
updated_date                    DATETIME
updated_by_id                   BIGINT(20)         FOREIGN KEY
version                         BIGINT(20)

-- Indexes (for performance)
KEY idx_charge_applies_to       (charge_applies_to_option_id)
KEY idx_charge_time_type        (charge_time_type_enum)
KEY idx_active                  (active)
```

---

## Step-by-Step Column Addition

Here are ALL the columns you need to add, one by one or in groups:

### STEP 1: Add PRIMARY Flags (Do First - This fixes the immediate error)
```sql
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_capitalized TINYINT(1) NOT NULL DEFAULT 0 AFTER charge_payment_mode_enum;
```

### STEP 2: Add Related Flag Columns
```sql
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS active TINYINT(1) NOT NULL DEFAULT 1 AFTER is_capitalized;
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_charge_surcharge_fee TINYINT(1) NOT NULL DEFAULT 0 AFTER active;
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_penalty TINYINT(1) NOT NULL DEFAULT 0 AFTER is_charge_surcharge_fee;
```

### STEP 3: Add Surcharge Fee Reference Columns
```sql
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS surcharge_charge_id BIGINT(20) AFTER is_penalty;
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS surcharge_fee_charge_id BIGINT(20) AFTER surcharge_charge_id;
```

### STEP 4: Add Tax Group Reference
```sql
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS tax_group_id BIGINT(20) AFTER surcharge_fee_charge_id;
```

### STEP 5: Add Accounting Account References (if missing)
```sql
-- Only add these if they don't already exist
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS liabilityaccount_id BIGINT(20) AFTER account_id;
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS receivable_account_id BIGINT(20) AFTER liabilityaccount_id;
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS expense_account_id BIGINT(20) AFTER receivable_account_id;
```

---

## Complete Manual Addition Script

Run these commands in sequence via MySQL:

```sql
-- ================================================================
-- MIFOS m_charge Table - Complete Schema Fix
-- ================================================================

-- STEP 1: Critical fix - adds is_capitalized column
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_capitalized TINYINT(1) NOT NULL DEFAULT 0;

-- STEP 2: Status and flag columns
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS active TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_charge_surcharge_fee TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_penalty TINYINT(1) NOT NULL DEFAULT 0;

-- STEP 3: Surcharge fee relationships
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS surcharge_charge_id BIGINT(20);
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS surcharge_fee_charge_id BIGINT(20);

-- STEP 4: Tax group reference
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS tax_group_id BIGINT(20);

-- STEP 5: Accounting accounts (add only if missing)
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS liabilityaccount_id BIGINT(20);
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS receivable_account_id BIGINT(20);
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS expense_account_id BIGINT(20);

-- ================================================================
-- Verification Queries
-- ================================================================

-- 1. Check current table structure
DESCRIBE m_charge;

-- 2. List all columns with types
SELECT 
  COLUMN_NAME, 
  COLUMN_TYPE, 
  IS_NULLABLE,
  COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'm_charge'
ORDER BY ORDINAL_POSITION;

-- 3. Verify critical columns exist
SELECT 
  COLUMN_NAME, 
  'EXISTS' as status
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

-- 4. Check for data integrity
SELECT 
  COUNT(*) as total_charges,
  COUNT(CASE WHEN is_capitalized IS NULL THEN 1 END) as null_is_capitalized_count
FROM m_charge;

-- ================================================================
-- After adding columns, restart MIFOS application
-- ================================================================
```

---

## Column Reference Table

| Column Name | Type | Default | Purpose | Priority |
|---|---|---|---|---|
| `is_capitalized` | TINYINT(1) | 0 | Whether charge is capitalized into loan amount | **CRITICAL** |
| `active` | TINYINT(1) | 1 | Soft delete flag for inactive charges | High |
| `is_charge_surcharge_fee` | TINYINT(1) | 0 | Mark charges that are surcharge on other charges | High |
| `is_penalty` | TINYINT(1) | 0 | Distinguish penalty charges from regular fees | Medium |
| `surcharge_charge_id` | BIGINT(20) | NULL | References another charge (for surcharges) | Medium |
| `surcharge_fee_charge_id` | BIGINT(20) | NULL | FK for surcharge fee relationship | Medium |
| `tax_group_id` | BIGINT(20) | NULL | Reference to tax configuration | Low |
| `liabilityaccount_id` | BIGINT(20) | NULL | GL account for liability side | Low |
| `receivable_account_id` | BIGINT(20) | NULL | GL account for receivables | Low |
| `expense_account_id` | BIGINT(20) | NULL | GL account for expense recognition | Low |

---

## Execution Steps

1. **Connect to MIFOS MySQL**
   ```bash
   mysql -h <your-mifos-host> -u root -p <mifos_dbname>
   ```

2. **Copy and paste the "Complete Manual Addition Script" above**

3. **Run verification queries** to confirm columns were added

4. **Restart MIFOS Application**
   ```bash
   docker restart mifos-app
   # or
   sudo systemctl restart mifos
   ```

5. **Verify the fix with diagnostic tool**
   ```bash
   cd /opt/ess
   node scripts/maintenance/check-fix-mifos-schema.js
   ```

---

## Important Notes

- ✅ All `ADD COLUMN IF NOT EXISTS` - safe to run multiple times
- ✅ All have DEFAULT values - backward compatible
- ✅ No data migration required
- ✅ Affects both tenants equally (shared schema)
- ⚠️ Backup database before making changes
- ⚠️ Restart MIFOS after all column additions

---

## Expected Result After Fix

```
✓ Charges endpoint is working
Response status: 200

✓ Can create charges
✓ Can create loan products
✓ Can create loans
```
