# MIFOS m_charge Missing Columns - Quick Reference

## 🔴 CRITICAL (Causes immediate error)
```sql
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_capitalized TINYINT(1) NOT NULL DEFAULT 0;
```
**Error it fixes**: `Unknown column 'isCapitalized' in 'INSERT INTO'`

---

## 🟠 HIGH PRIORITY (Status & Flags)

### 1. Active Flag
```sql
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS active TINYINT(1) NOT NULL DEFAULT 1;
```
**Purpose**: Mark charges as active/inactive (soft delete)

### 2. Surcharge Fee Flag
```sql
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_charge_surcharge_fee TINYINT(1) NOT NULL DEFAULT 0;
```
**Purpose**: Identify charges that are surcharges on other charges

### 3. Penalty Flag
```sql
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_penalty TINYINT(1) NOT NULL DEFAULT 0;
```
**Purpose**: Distinguish penalty charges from regular fees

---

## 🟡 MEDIUM PRIORITY (Relationships)

### 4. Surcharge Charge Reference
```sql
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS surcharge_charge_id BIGINT(20);
```
**Purpose**: FK reference to parent charge (for compound surcharges)

### 5. Surcharge Fee Charge Reference
```sql
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS surcharge_fee_charge_id BIGINT(20);
```
**Purpose**: FK reference for surcharge fee relationships

### 6. Tax Group Reference
```sql
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS tax_group_id BIGINT(20);
```
**Purpose**: Reference to tax configuration for tax calculation

---

## 🟢 LOW PRIORITY (Accounting GL Accounts)

### 7. Liability Account
```sql
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS liabilityaccount_id BIGINT(20);
```
**Purpose**: GL account for liability side of charge (if applicable)

### 8. Receivable Account
```sql
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS receivable_account_id BIGINT(20);
```
**Purpose**: GL account for charge receivables

### 9. Expense Account
```sql
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS expense_account_id BIGINT(20);
```
**Purpose**: GL account for expense recognition of charges

---

## ✅ COPY-PASTE READY

### Option 1: Add ALL columns at once
```sql
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_capitalized TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS active TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_charge_surcharge_fee TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_penalty TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS surcharge_charge_id BIGINT(20);
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS surcharge_fee_charge_id BIGINT(20);
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS tax_group_id BIGINT(20);
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS liabilityaccount_id BIGINT(20);
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS receivable_account_id BIGINT(20);
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS expense_account_id BIGINT(20);
```

### Option 2: Add by priority (safer)
**Step 1: CRITICAL**
```sql
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_capitalized TINYINT(1) NOT NULL DEFAULT 0;
-- Restart MIFOS and test here
```

**Step 2: HIGH PRIORITY**
```sql
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS active TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_charge_surcharge_fee TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_penalty TINYINT(1) NOT NULL DEFAULT 0;
-- Restart MIFOS and test
```

**Step 3: MEDIUM PRIORITY**
```sql
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS surcharge_charge_id BIGINT(20);
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS surcharge_fee_charge_id BIGINT(20);
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS tax_group_id BIGINT(20);
-- Restart MIFOS and test
```

**Step 4: LOW PRIORITY (optional)**
```sql
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS liabilityaccount_id BIGINT(20);
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS receivable_account_id BIGINT(20);
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS expense_account_id BIGINT(20);
-- Restart MIFOS and test
```

---

## 🔍 VERIFICATION COMMANDS

### After adding columns, check they exist:
```sql
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT 
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'm_charge'
ORDER BY ORDINAL_POSITION;
```

### Check for NULL values (should be 0 after addition):
```sql
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN is_capitalized IS NULL THEN 1 END) as null_is_capitalized
FROM m_charge;
```

---

## 📋 SUMMARY TABLE

| # | Column | Type | Priority | Status |
|---|--------|------|----------|--------|
| 1 | `is_capitalized` | TINYINT(1) | 🔴 CRITICAL | Fixes error |
| 2 | `active` | TINYINT(1) | 🟠 HIGH | Status flag |
| 3 | `is_charge_surcharge_fee` | TINYINT(1) | 🟠 HIGH | Surcharge flag |
| 4 | `is_penalty` | TINYINT(1) | 🟠 HIGH | Penalty flag |
| 5 | `surcharge_charge_id` | BIGINT(20) | 🟡 MEDIUM | FK reference |
| 6 | `surcharge_fee_charge_id` | BIGINT(20) | 🟡 MEDIUM | FK reference |
| 7 | `tax_group_id` | BIGINT(20) | 🟡 MEDIUM | FK reference |
| 8 | `liabilityaccount_id` | BIGINT(20) | 🟢 LOW | GL account |
| 9 | `receivable_account_id` | BIGINT(20) | 🟢 LOW | GL account |
| 10 | `expense_account_id` | BIGINT(20) | 🟢 LOW | GL account |

---

## 🚀 Quick Start

**Minimum to fix the error:**
```sql
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_capitalized TINYINT(1) NOT NULL DEFAULT 0;
```

**Recommended (Critical + High Priority):**
```sql
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_capitalized TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS active TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_charge_surcharge_fee TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE m_charge ADD COLUMN IF NOT EXISTS is_penalty TINYINT(1) NOT NULL DEFAULT 0;
```

---

## 📌 IMPORTANT NOTES

✅ All commands use `IF NOT EXISTS` - safe to run multiple times
✅ All columns have DEFAULT values - no data migration needed
✅ Order doesn't matter (use `IF NOT EXISTS`)
✅ Backup database before running
✅ Restart MIFOS after adding columns
✅ Run verification queries to confirm
