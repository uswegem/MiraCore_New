const { LOAN_CONSTANTS } = require('../utils/loanConstants');
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
      // Mock eligibility response
      const mockOffer = {
        loanOffer: {
          product: {
            loanTerm: loanOfferDTO.tenure || LOAN_CONSTANTS.DEFAULT_TENURE,
            totalMonthlyInst: this.calculateEMI(
              loanOfferDTO.loanAmount || 1000000,
              24, // interest rate
              loanOfferDTO.tenure || LOAN_CONSTANTS.DEFAULT_TENURE
            ),
            loanAmount: loanOfferDTO.loanAmount || 1000000,
            totalLoanAmount: (loanOfferDTO.loanAmount || 1000000) * 1.1, // with interest
            maximumAmount: 5000000,
            maximumTerm: 120
          },
          totalInterestAmount: (loanOfferDTO.loanAmount || 1000000) * 0.1,
          adminFee: (loanOfferDTO.loanAmount || 1000000) * 0.02,
          insurance: {
            oneTimeAmount: (loanOfferDTO.loanAmount || 1000000) * 0.015
          },
          bpi: 0, // Bank Processing Fee
          maxEligibleAmount: 5000000,
          maxEligibleTerm: 120,
          baseTotalLoanAmount: (loanOfferDTO.loanAmount || 1000000) * 1.1
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
}

module.exports = new EligibilityService();