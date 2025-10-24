// Loan Service Constants
const LOAN_CONSTANTS = {
  // NPA and loan constants
  NPA_LOAN_ARR_DAYS: 90,
  DEFAULT_TENURE: 96,

  // Date formats
  RESPONSE_DATE_FORMAT: "yyyy-MM-dd'T'HH:mm:ss",
  YEAR_MONTH_DAY_FORMAT: "yyyy-MM-dd",

  // Closure note IDs
  notifiableClosureNoteIds: [1, 4, 5, 7, 8],
  cancellationClosureNoteId: 5,

  // Affordability types
  AFFORDABILITY_TYPE: {
    REVERSE: 'REVERSE',
    FORWARD: 'FORWARD'
  },

  // Error codes (using existing system error codes from responseHelper.js)
  ERROR_CODES: {
    NOT_ELIGIBLE: '8014',       // "Invalid code, mismatch of supplied code on information and header"
    INTERNAL_ERROR: '8012',     // "Request cannot be completed at this time, try later"
    INVALID_REQUEST: '8001'     // "Required header is not given"
  }
};

module.exports = LOAN_CONSTANTS;