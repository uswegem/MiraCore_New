const mongoose = require('mongoose');

const loanMappingSchema = new mongoose.Schema({
  // ESS identifiers
  essApplicationNumber: {
    type: String,
    required: true,
    index: true
  },
  essCheckNumber: {
    type: String,
    index: true
  },
  essLoanNumberAlias: {
    type: String,
    index: true
  },

  // FSP generated identifiers
  fspReferenceNumber: {
    type: String,
    required: false,  // Not required initially, added during final approval
    sparse: true,     // Allow multiple nulls
    index: true
  },

  // MIFOS identifiers (populated after loan creation)
  mifosClientId: {
    type: Number,
    index: true
  },
  mifosLoanId: {
    type: Number,
    index: true
  },
  mifosLoanAccountNumber: {
    type: String,
    index: true
  },

  // Loan details
  productCode: {
    type: String,
    required: true
  },
  requestedAmount: {
    type: Number,
    required: true
  },
  tenure: {
    type: Number,
    required: true
  },

  // Status tracking
  status: {
    type: String,
    enum: ['INITIAL_OFFER', 'APPROVED', 'REJECTED', 'FINAL_APPROVAL_RECEIVED', 'CLIENT_CREATED', 'LOAN_CREATED', 'DISBURSED', 'FAILED'],
    default: 'INITIAL_OFFER'
  },

  // Timestamps for each stage
  initialOfferSentAt: {
    type: Date,
    default: Date.now
  },
  finalApprovalReceivedAt: {
    type: Date
  },
  clientCreatedAt: {
    type: Date
  },
  loanCreatedAt: {
    type: Date
  },
  disbursedAt: {
    type: Date
  },

  // Error tracking
  errorLogs: [{
    stage: String,
    error: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],

  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Compound indexes for efficient lookups
loanMappingSchema.index({ essApplicationNumber: 1, essLoanNumber: 1 });
loanMappingSchema.index({ status: 1 });

// Additional compound indexes for optimized queries
loanMappingSchema.index({ status: 1, createdAt: -1 }); // Status queries with sorting
loanMappingSchema.index({ essApplicationNumber: 1, status: 1 }); // Application + status lookups

// Instance methods
loanMappingSchema.methods.updateStatus = function(newStatus) {
  this.status = newStatus;

  // Update timestamp based on status
  const timestampFields = {
    'FINAL_APPROVAL_RECEIVED': 'finalApprovalReceivedAt',
    'CLIENT_CREATED': 'clientCreatedAt',
    'LOAN_CREATED': 'loanCreatedAt',
    'DISBURSED': 'disbursedAt'
  };

  if (timestampFields[newStatus]) {
    this[timestampFields[newStatus]] = new Date();
  }

  return this.save();
};

loanMappingSchema.methods.addError = function(stage, error) {
  this.errorLogs.push({
    stage,
    error: error.message || error,
    timestamp: new Date()
  });
  return this.save();
};

// Static methods (return lean queries for read-only operations)
loanMappingSchema.statics.findByEssLoanNumber = function(essLoanNumber) {
  return this.findOne({ essLoanNumber });
};

loanMappingSchema.statics.findByFspReference = function(fspReferenceNumber) {
  return this.findOne({ fspReferenceNumber });
};

loanMappingSchema.statics.findByMifosLoanId = function(mifosLoanId) {
  return this.findOne({ mifosLoanId });
};

const LoanMapping = mongoose.model('LoanMapping', loanMappingSchema);

module.exports = LoanMapping;