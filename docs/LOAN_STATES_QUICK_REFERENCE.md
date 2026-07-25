# Loan States - Quick Reference Card

## 🎯 New States Available

| State | Use When | Actor Tracked |
|-------|----------|---------------|
| **COMPLETED** | Loan fully repaid | No |
| **WAITING_FOR_LIQUIDATION** | Takeover awaiting old loan payoff | No |

## 👥 Actor Tracking

| Actor | Used For | Examples |
|-------|----------|----------|
| **FSP** | FSP rejects/cancels | Credit check failed, Business rules |
| **EMPLOYEE** | Employee rejects/cancels | Declined offer, Changed mind |
| **EMPLOYER** | Employer rejects | Not approved, Policy violation |
| **SYSTEM** | Automated rejection/cancellation | Timeout, Technical error |

## 📝 Quick Code Examples

### Reject with Actor
```javascript
const { rejectLoan } = require('./src/utils/loanStatusHelpers');

// FSP rejection
await rejectLoan(loanMapping, 'FSP', 'Credit score insufficient');

// Employee rejection  
await rejectLoan(loanMapping, 'EMPLOYEE', 'Declined offer');

// Employer rejection
await rejectLoan(loanMapping, 'EMPLOYER', 'Policy violation');
```

### Cancel with Actor
```javascript
const { cancelLoan } = require('./src/utils/loanStatusHelpers');

// Employee cancellation
await cancelLoan(loanMapping, 'EMPLOYEE', 'Customer requested');

// FSP cancellation
await cancelLoan(loanMapping, 'FSP', 'Unable to process');
```

### Mark as Completed
```javascript
const { completeLoan } = require('./src/utils/loanStatusHelpers');

await completeLoan(loanMapping);
```

### Set Liquidation State
```javascript
const { setWaitingForLiquidation } = require('./src/utils/loanStatusHelpers');

await setWaitingForLiquidation(loanMapping);
```

## 🔍 Query Examples

### Find by Actor
```javascript
// FSP rejections
const fspRejects = await LoanMapping.find({ 
  status: 'REJECTED', 
  rejectedBy: 'FSP' 
});

// Employee cancellations
const empCancels = await LoanMapping.find({ 
  status: 'CANCELLED', 
  cancelledBy: 'EMPLOYEE' 
});

// Completed loans
const completed = await LoanMapping.find({ 
  status: 'COMPLETED' 
}).sort({ completedAt: -1 });
```

## 📊 Get Statistics
```javascript
const { getStatusStatistics } = require('./src/utils/loanStatusHelpers');

const stats = await getStatusStatistics(LoanMapping);
console.log(stats.rejections);  // { FSP: 45, EMPLOYEE: 12, ... }
console.log(stats.cancellations);  // { FSP: 10, EMPLOYEE: 25, ... }
```

## ✅ State Transitions

### Valid Transitions
```
DISBURSED → COMPLETED ✅
APPROVED → WAITING_FOR_LIQUIDATION ✅
WAITING_FOR_LIQUIDATION → DISBURSED ✅
Any state → REJECTED ✅ (with actor)
Any state → CANCELLED ✅ (with actor)
```

### Invalid Transitions
```
COMPLETED → anything ❌ (terminal)
REJECTED → anything ❌ (terminal)
CANCELLED → anything ❌ (terminal)
```

## 🚀 Update Handler Template

### Before
```javascript
if (approval === 'REJECTED') {
  loanMapping.status = 'REJECTED';
  await loanMapping.save();
}
```

### After
```javascript
const { rejectLoan } = require('../utils/loanStatusHelpers');

if (approval === 'REJECTED') {
  const reason = parsedData.Document.Data.MessageDetails.Reason;
  await rejectLoan(loanMapping, 'FSP', reason);
}
```

## 📁 Files to Update

### High Priority
- [ ] `src/controllers/apiController.js` - LOAN_FINAL_APPROVAL_NOTIFICATION (~line 1103)
- [ ] `src/controllers/apiController.js` - LOAN_CANCELLATION_NOTIFICATION (~line 987)
- [ ] `src/webhooks/mifosWebhookHandler.js` - Loan closure detection

### Medium Priority
- [ ] `src/controllers/handlers/takeoverOfferHandler.js` - Liquidation state
- [ ] `frontend/src/components/LoanDetails.jsx` - Display actor info
- [ ] `frontend/src/components/LoanList.jsx` - Actor filters

## 🧪 Testing

### Run Tests
```bash
ssh uswege@5.75.185.137
cd /home/uswege/ess
node test-new-loan-states.js
```

### Run Migration (Dry Run)
```bash
node migrate-loan-states.js --dry-run
```

### Check Statistics
```bash
node -e "
require('dotenv').config();
const mongoose = require('mongoose');
const { getStatusStatistics } = require('./src/utils/loanStatusHelpers');
const LoanMapping = require('./src/models/LoanMapping');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const stats = await getStatusStatistics(LoanMapping);
  console.log(JSON.stringify(stats, null, 2));
  process.exit(0);
});
"
```

## 📚 Documentation Files

- `ESS_LOAN_STATES_COMPARISON.md` - Gap analysis
- `LOAN_STATES_IMPLEMENTATION_GUIDE.md` - Complete guide
- `LOAN_STATES_DEPLOYMENT_SUMMARY.md` - Deployment details
- `LOAN_STATES_QUICK_REFERENCE.md` - This file

---

**Status:** ✅ Live in Production  
**Version:** 1.0  
**Last Updated:** December 19, 2025
