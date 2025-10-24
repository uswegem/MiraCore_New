const { format } = require('date-fns');
const LOAN_CONSTANTS = require('./loanConstants');

/**
 * Format date to Utumishi format
 */
function formattedToUtumishiDate(dateString, isEndOfDay = false) {
  try {
    const date = new Date(dateString);
    if (isEndOfDay) {
      date.setHours(23, 59, 59, 999);
    } else {
      date.setHours(0, 0, 0, 0);
    }
    return format(date, "yyyy-MM-dd'T'HH:mm:ss");
  } catch (error) {
    console.error("Invalid utumishi date-format, given date:", dateString, "error:", error);
    return "";
  }
}

/**
 * Construct full name from components
 */
function constructName(firstName, middleName, lastName) {
  const parts = [firstName, middleName, lastName].filter(name => name && name.trim());
  return parts.join(' ') || '';
}

/**
 * Validate retirement age and adjust tenure
 */
function validateRetirementAge(tenure, retirementMonthsLeft) {
  if (!retirementMonthsLeft || retirementMonthsLeft <= 0) {
    return tenure || LOAN_CONSTANTS.DEFAULT_TENURE;
  }

  if (tenure === null || tenure === undefined) {
    return retirementMonthsLeft > LOAN_CONSTANTS.DEFAULT_TENURE ? null : retirementMonthsLeft;
  }

  return tenure < retirementMonthsLeft ? tenure : retirementMonthsLeft;
}

/**
 * Calculate months until retirement
 */
function calculateMonthsUntilRetirement(retirementDate) {
  if (!retirementDate) return null;

  const retirement = new Date(retirementDate);
  const now = new Date();

  const yearsDiff = retirement.getFullYear() - now.getFullYear();
  const monthsDiff = retirement.getMonth() - now.getMonth();

  return yearsDiff * 12 + monthsDiff;
}

/**
 * Custom Application Exception class
 */
class ApplicationException extends Error {
  constructor(errorCode, errorMsg) {
    super(errorMsg);
    this.errorCode = errorCode;
    this.errorMsg = errorMsg;
    this.name = 'ApplicationException';
  }
}

module.exports = {
  formattedToUtumishiDate,
  constructName,
  validateRetirementAge,
  calculateMonthsUntilRetirement,
  ApplicationException,
  LOAN_CONSTANTS
};