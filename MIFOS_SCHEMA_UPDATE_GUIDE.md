# MIFOS Database Schema Update Guide - Zedone Tenant

## Issue Summary

The MIFOS instance at `https://zedone.miracore.app` is experiencing database schema issues that prevent:
- Creating charges (HTTP 500 error)
- Creating loan products that depend on charges
- Accessing the charges endpoint

## Root Cause

The `m_charge` table in the MIFOS database is missing critical columns required by the current MIFOS version:
- **is_capitalized**: Boolean flag to indicate if charge is capitalized
- **is_charge_surcharge_fee**: Boolean flag for surcharge fees  
- **surcharge_fee_charge_id**: FK reference for surcharge relationships
- **tax_group_id**: Reference to tax group configuration
- **is_active**: Boolean flag for charge status

### Database Error Signature
```
Unknown column 'isCapitalized' in 'INSERT INTO'
(conn=12009)
```

## Impact Assessment

| Component | Status | Impact |
|-----------|--------|--------|
| Charges | ❌ Failing | Cannot create or list charges |
| Loan Products | ✅ Working | Can list but cannot create (depends on charges) |
| Delinquency Buckets | ✅ Working | Full functionality |
| Core Lending | ❌ Blocked | Cannot originate loans |

## Tenant Considerations

- **Zedone**: Primary affected tenant (loan product creation blocked)
- **Creditconnect**: Also affected (shares database schema)
- **Multi-tenant Architecture**: Both tenants use the same `m_charge` table

## Solution

### Why Both Tenants Need This Fix

In a multi-tenant MIFOS deployment:
- **Shared Tables**: The `m_charge`, `m_product_loan`, and related tables are shared across all tenants
- **Schema Consistency**: All tenants require the same table structure
- **Safe Operation**: Adding columns with DEFAULT values doesn't break existing code
- **Backward Compatibility**: NULL-safe defaults ensure existing data remains valid

### Migration Script

A SQL migration script has been created at:
```
/opt/ess/scripts/migrations/fix-mifos-charges-schema-zedone.sql
```

**Key features:**
- ✓ Checks if columns exist before adding (idempotent)
- ✓ Includes verification queries
- ✓ Includes rollback guidance
- ✓ Safe for multi-tenant environment
- ✓ Uses DEFAULT values for backward compatibility

## Step-by-Step Fix Procedure

### Prerequisites
- MySQL client access to the MIFOS database
- Database administrator credentials
- Backup of the MIFOS database
- Maintenance window scheduled

### Step 1: Backup Database (CRITICAL)

```bash
# Create backup before any changes
mysqldump -h <MIFOS_HOST> -u root -p <MIFOS_DATABASE> > mifos_backup_$(date +%Y%m%d_%H%M%S).sql
```

### Step 2: Apply Schema Migration

**Option A: Direct SQL file execution**
```bash
mysql -h <MIFOS_HOST> -u root -p <MIFOS_DATABASE> < /opt/ess/scripts/migrations/fix-mifos-charges-schema-zedone.sql
```

**Option B: Line-by-line (safer for production)**
```bash
mysql -h <MIFOS_HOST> -u root -p <MIFOS_DATABASE>
```

Then paste the contents of the SQL script, reviewing each step.

### Step 3: Verify Schema Changes

```sql
-- Check m_charge table structure
DESCRIBE m_charge;

-- Verify key columns exist
SELECT 
  COLUMN_NAME, 
  COLUMN_TYPE, 
  IS_NULLABLE, 
  COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'MIFOS_DATABASE_NAME' 
AND TABLE_NAME = 'm_charge'
ORDER BY ORDINAL_POSITION;

-- Check data integrity
SELECT COUNT(*) as charge_count FROM m_charge;

-- Verify no NULL values in is_capitalized
SELECT COUNT(*) as null_count 
FROM m_charge 
WHERE is_capitalized IS NULL;
```

### Step 4: Restart MIFOS Application

```bash
# For Docker
docker restart mifos-app

# For systemd service
sudo systemctl restart mifos

# Verify it's running
curl -s https://zedone.miracore.app/fineract-provider/api/v1/about
```

### Step 5: Verify Fix

```bash
# Run the diagnostic tool
cd /opt/ess
node scripts/maintenance/check-fix-mifos-schema.js
```

Expected output:
```
✓ Charges endpoint is working
Response status: 200
```

## Testing the Fix

### Test 1: Create a Charge

```bash
curl -X POST https://zedone.miracore.app/fineract-provider/api/v1/charges \
  -H "Authorization: Basic <TOKEN>" \
  -H "Fineract-Platform-TenantId: zedone" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Charge 1%",
    "chargeAppliesTo": 1,
    "chargeTimeType": 1,
    "chargeCalculationType": 2,
    "chargePaymentMode": 1,
    "amount": 1.0,
    "currencyCode": "TZS",
    "locale": "en"
  }'
```

Expected: HTTP 200 with resourceId

### Test 2: Create Loan Product

Once charges work, loan product creation can proceed:

```bash
# Note: Requires processing fee and insurance charges to exist
curl -X POST https://zedone.miracore.app/fineract-provider/api/v1/loanproducts \
  -H "Authorization: Basic <TOKEN>" \
  -H "Fineract-Platform-TenantId: zedone" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Watumishi wezesha loan",
    "shortName": "17",
    ...
  }'
```

## Rollback Procedure (If Needed)

If the migration causes unexpected issues:

```sql
-- Rollback schema changes
ALTER TABLE m_charge DROP COLUMN IF EXISTS is_capitalized;
ALTER TABLE m_charge DROP COLUMN IF EXISTS is_charge_surcharge_fee;
ALTER TABLE m_charge DROP COLUMN IF EXISTS surcharge_fee_charge_id;
ALTER TABLE m_charge DROP COLUMN IF EXISTS tax_group_id;

-- Restore backup
mysql -h <MIFOS_HOST> -u root -p <MIFOS_DATABASE> < mifos_backup_YYYYMMDD_HHMMSS.sql
```

## Tenant-Specific Notes

### For Zedone Tenant
- ✓ Primary focus of this fix
- ✓ Can proceed with loan product creation after fix
- ✓ Will benefit from delinquency bucket configurations

### For Creditconnect Tenant
- ✓ Also benefits from schema fix (shares tables)
- ⚠️ Monitor for any issues after MIFOS restart
- ✓ No changes to creditconnect-specific configurations

## Verification Checklist

- [ ] Backup created and verified
- [ ] SQL migration script reviewed
- [ ] Database changes applied
- [ ] Verification queries passed
- [ ] MIFOS application restarted
- [ ] Diagnostic tool shows charges endpoint working
- [ ] Test charge creation succeeds
- [ ] Loan product creation tested
- [ ] Both tenants operational
- [ ] Backup retained for safety

## Troubleshooting

### Issue: Column already exists error

**Cause**: Column was partially added
**Solution**: The migration script uses `ADD COLUMN IF NOT EXISTS` which handles this safely

### Issue: MIFOS won't start after migration

**Cause**: Possible schema incompatibility
**Action**: 
1. Check MIFOS logs
2. Verify MySQL connection
3. Roll back using the rollback procedure above
4. Contact MIFOS support

### Issue: Charges endpoint still returns 500

**Cause**: Other schema issues may exist
**Solution**:
1. Check MIFOS application logs
2. Verify all columns were added
3. Run verification queries
4. Check for other missing columns

## Support Resources

- Migration script: `/opt/ess/scripts/migrations/fix-mifos-charges-schema-zedone.sql`
- Diagnostic tool: `/opt/ess/scripts/maintenance/check-fix-mifos-schema.js`
- MIFOS Documentation: https://docs.mifos.org/
- MIFOS API Reference: https://mifos.gitbook.io/docs/

## Notes for DevOps/DBA

- This is a schema ADD operation (can be applied multiple times safely)
- No data migration required
- Minimal downtime (MIFOS app restart only)
- Backup highly recommended despite low risk
- All changes are tracked in the migration script with verification

---

**Created**: April 16, 2026
**Scope**: Zedone Tenant (affects shared schema, benefits both tenants)
**Status**: Ready for Implementation
