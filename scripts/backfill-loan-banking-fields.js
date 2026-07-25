#!/usr/bin/env node
/**
 * Backfill swiftCode, bankAccountNumber, mobileNumber from metadata.clientData
 * to top-level fields on existing LoanMapping records.
 *
 * Usage: node scripts/backfill-loan-banking-fields.js
 * Add --dry-run to preview without writing.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const LoanMapping = require('../src/models/LoanMapping');
const logger = require('../src/utils/logger');

const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI or MONGO_URI env var is required');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');
  if (DRY_RUN) console.log('DRY RUN — no writes will be made');

  // Find records that have clientData in metadata but are missing at least one top-level field
  const cursor = LoanMapping.find({
    $and: [
      { 'metadata.clientData': { $exists: true } },
      {
        $or: [
          { swiftCode: { $exists: false } },
          { bankAccountNumber: { $exists: false } },
          { mobileNumber: { $exists: false } }
        ]
      }
    ]
  }).lean().cursor();

  let processed = 0;
  let updated = 0;
  let skipped = 0;

  for await (const loan of cursor) {
    processed++;
    const cd = loan.metadata?.clientData;
    if (!cd) { skipped++; continue; }

    const fields = {};
    if (!loan.swiftCode && cd.swiftCode)             fields.swiftCode = cd.swiftCode;
    if (!loan.bankAccountNumber && cd.bankAccountNumber) fields.bankAccountNumber = cd.bankAccountNumber;
    if (!loan.mobileNumber && cd.mobileNumber)       fields.mobileNumber = cd.mobileNumber;

    if (Object.keys(fields).length === 0) { skipped++; continue; }

    if (!DRY_RUN) {
      await LoanMapping.updateOne({ _id: loan._id }, { $set: fields });
    } else {
      console.log(`Would update ${loan.essApplicationNumber}:`, fields);
    }
    updated++;
  }

  console.log(`Done. Processed: ${processed} | Updated: ${updated} | Skipped (no data): ${skipped}`);
  await mongoose.disconnect();
}

run().catch(err => {
  logger.error('Backfill failed:', err);
  process.exit(1);
});
