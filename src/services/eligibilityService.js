const LOAN_CONSTANTS = require('../utils/loanConstants');
const { ApplicationException } = require('../utils/loanUtils');

// Mock Eligibility Service
class EligibilityService {
  /**
   * Check if customer is active in CBS
   */
  async isActiveCBSCustomer(country, customerNumber) {
    // Mock implementation - in real scenario, this would call CBS API
    console.log(`Checking if customer ${customerNumber} is active in CBS for ${country}`);

    // For demo purposes, assume customer is active
    // In real implementation, this would validate against CBS
    return true;
  }

  /**
   * Get loan offer from eligibility engine
   */
  async getOffer(loanOfferDTO, isPossibleCharges = false) {
    console.log('Getting loan offer from eligibility service:', loanOfferDTO);

    try {
      const requestedAmount = loanOfferDTO.loanAmount || LOAN_CONSTANTS.DEFAULT_LOAN_AMOUNT;
      const tenure = loanOfferDTO.tenure || LOAN_CONSTANTS.DEFAULT_TENURE;
      const affordabilityType = loanOfferDTO.affordabilityType || 'FORWARD';

      let adjustedLoanAmount;
      let calculatedEMI;

      if (affordabilityType === 'REVERSE') {
        // For reverse calculation: use centralRegAffordability as target EMI
        const targetEMI = loanOfferDTO.centralRegAffordability;
        console.log(`Reverse calculation: Using ${targetEMI} as target EMI`);
        adjustedLoanAmount = this.calculateMaxLoanAmount(targetEMI, LOAN_CONSTANTS.DEFAULT_INTEREST_RATE, tenure);
        calculatedEMI = targetEMI;
        console.log(`Calculated max loan amount: ${adjustedLoanAmount} for EMI: ${calculatedEMI}`);
      } else {
        // For forward calculation: check if requested amount fits within affordability
        const maxAffordableEMI = loanOfferDTO.centralRegAffordability || this.calculateEMI(requestedAmount, LOAN_CONSTANTS.DEFAULT_INTEREST_RATE, tenure);

        // Calculate EMI for requested amount
        calculatedEMI = this.calculateEMI(requestedAmount, LOAN_CONSTANTS.DEFAULT_INTEREST_RATE, tenure);

        // If calculated EMI exceeds maximum affordable EMI, adjust the loan amount
        adjustedLoanAmount = requestedAmount;
        if (calculatedEMI > maxAffordableEMI) {
          console.log(`Calculated EMI ${calculatedEMI} exceeds max affordable EMI ${maxAffordableEMI}, adjusting loan amount`);
          // Calculate maximum loan amount that fits within maxAffordableEMI
          adjustedLoanAmount = this.calculateMaxLoanAmount(maxAffordableEMI, LOAN_CONSTANTS.DEFAULT_INTEREST_RATE, tenure);
          calculatedEMI = maxAffordableEMI;
          console.log(`Adjusted loan amount from ${requestedAmount} to ${adjustedLoanAmount} to fit EMI constraint`);
        } else {
          console.log(`Requested amount ${requestedAmount} fits within affordability (EMI: ${calculatedEMI})`);
        }
      }

      // Mock eligibility response
      const mockOffer = {
        loanOffer: {
          product: {
            loanTerm: tenure,
            totalMonthlyInst: calculatedEMI,
            loanAmount: adjustedLoanAmount,
            totalLoanAmount: adjustedLoanAmount * LOAN_CONSTANTS.TOTAL_LOAN_MULTIPLIER, // with interest
            maximumAmount: LOAN_CONSTANTS.MAX_LOAN_AMOUNT,
            maximumTerm: LOAN_CONSTANTS.MAX_TENURE
          },
          totalInterestAmount: adjustedLoanAmount * LOAN_CONSTANTS.INTEREST_MULTIPLIER,
          adminFee: adjustedLoanAmount * LOAN_CONSTANTS.ADMIN_FEE_RATE,
          insurance: {
            oneTimeAmount: adjustedLoanAmount * LOAN_CONSTANTS.INSURANCE_RATE
          },
          bpi: 0, // Bank Processing Fee
          maxEligibleAmount: LOAN_CONSTANTS.MAX_LOAN_AMOUNT,
          maxEligibleTerm: LOAN_CONSTANTS.MAX_TENURE,
          baseTotalLoanAmount: adjustedLoanAmount * LOAN_CONSTANTS.TOTAL_LOAN_MULTIPLIER
        }
      };

      return mockOffer;
    } catch (error) {
      console.error('Error getting offer from eligibility service:', error);
      throw new ApplicationException(LOAN_CONSTANTS.ERROR_CODES.INTERNAL_ERROR, 'Eligibility service error');
    }
  }

  /**
   * Calculate EMI using standard formula
   */
  calculateEMI(principal, annualInterestRate, tenureMonths) {
    const monthlyRate = annualInterestRate / 100 / 12;
    const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) /
                (Math.pow(1 + monthlyRate, tenureMonths) - 1);
    return Math.round(emi * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Calculate maximum loan amount for a given EMI, interest rate, and tenure
   */
  calculateMaxLoanAmount(targetEMI, annualInterestRate, tenureMonths) {
    const monthlyRate = annualInterestRate / 100 / 12;
    const maxAmount = (targetEMI * (Math.pow(1 + monthlyRate, tenureMonths) - 1)) /
                      (monthlyRate * Math.pow(1 + monthlyRate, tenureMonths));
    return Math.round(maxAmount * 100) / 100; // Round to 2 decimal places
  }
}

module.exports = new EligibilityService();