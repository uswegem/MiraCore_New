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

      // Extract product parameters with fallback to constants
      const productDetails = loanOfferDTO.productDetails || {};
      const interestRate = productDetails.interestRate || LOAN_CONSTANTS.DEFAULT_INTEREST_RATE;
      const maxPrincipal = productDetails.maxPrincipal || LOAN_CONSTANTS.MAX_LOAN_AMOUNT;
      const minPrincipal = productDetails.minPrincipal || LOAN_CONSTANTS.MIN_LOAN_AMOUNT;
      const maxTenure = productDetails.maxNumberOfRepayments || LOAN_CONSTANTS.MAX_TENURE;
      
      // Validate against minimum loan amount
      if (loanOfferDTO.requestedAmount && loanOfferDTO.requestedAmount < minPrincipal) {
        throw new ApplicationException(
          'LOAN_AMOUNT_TOO_LOW',
          `Requested amount ${loanOfferDTO.requestedAmount} is below minimum ${minPrincipal}`
        );
      }

      console.log('Using product parameters:', {
        interestRate,
        maxPrincipal,
        minPrincipal,
        maxTenure,
        source: productDetails.interestRate ? 'MIFOS' : 'CONSTANTS'
      });

      let adjustedLoanAmount;
      let calculatedEMI;

      if (affordabilityType === 'REVERSE') {
        // For reverse calculation: use centralRegAffordability as target EMI
        const targetEMI = loanOfferDTO.centralRegAffordability;
        console.log(`Reverse calculation: Using ${targetEMI} as target EMI`);
        // Calculate minimum EMI required for MIN_LOAN_AMOUNT
        const minEMI = this.calculateEMI(LOAN_CONSTANTS.MIN_LOAN_AMOUNT, interestRate, tenure);
        const effectiveEMI = Math.max(targetEMI, minEMI);
        console.log(`Min required EMI: ${minEMI}, Using effective EMI: ${effectiveEMI}`);
        adjustedLoanAmount = this.calculateMaxLoanAmount(effectiveEMI, interestRate, tenure);
        calculatedEMI = effectiveEMI;
        console.log(`Calculated max loan amount: ${adjustedLoanAmount} for EMI: ${calculatedEMI}`);
      } else {
        // For forward calculation: check if requested amount fits within affordability
        const maxAffordableEMI = loanOfferDTO.centralRegAffordability || this.calculateEMI(requestedAmount, interestRate, tenure);

        // Calculate EMI for requested amount
        calculatedEMI = this.calculateEMI(requestedAmount, interestRate, tenure);

        // If calculated EMI exceeds maximum affordable EMI, adjust the loan amount
        adjustedLoanAmount = requestedAmount;
        if (calculatedEMI > maxAffordableEMI) {
          console.log(`Calculated EMI ${calculatedEMI} exceeds max affordable EMI ${maxAffordableEMI}, adjusting loan amount`);
          // Calculate maximum loan amount that fits within maxAffordableEMI
          adjustedLoanAmount = this.calculateMaxLoanAmount(maxAffordableEMI, interestRate, tenure);
          calculatedEMI = maxAffordableEMI;
          console.log(`Adjusted loan amount from ${requestedAmount} to ${adjustedLoanAmount} to fit EMI constraint`);
        } else {
          console.log(`Requested amount ${requestedAmount} fits within affordability (EMI: ${calculatedEMI})`);
        }
      }

        // Mock eligibility response using dynamic product parameters
      // Ensure loan amount is not less than minimum principal
      adjustedLoanAmount = Math.max(adjustedLoanAmount, minPrincipal);

      const mockOffer = {
        loanOffer: {
          product: {
            loanTerm: tenure,
            totalMonthlyInst: calculatedEMI,
            loanAmount: adjustedLoanAmount,
            totalLoanAmount: adjustedLoanAmount * (productDetails.totalLoanMultiplier || LOAN_CONSTANTS.TOTAL_LOAN_MULTIPLIER), // with interest
            maximumAmount: maxPrincipal,
            maximumTerm: maxTenure
          },
          totalInterestAmount: (calculatedEMI * tenure) - adjustedLoanAmount,
          adminFee: adjustedLoanAmount * (productDetails.adminFeeRate || LOAN_CONSTANTS.ADMIN_FEE_RATE),
          insurance: {
            oneTimeAmount: adjustedLoanAmount * (productDetails.insuranceRate || LOAN_CONSTANTS.INSURANCE_RATE)
          },
          bpi: 0, // Bank Processing Fee
          maxEligibleAmount: maxPrincipal,
          maxEligibleTerm: maxTenure,
          baseTotalLoanAmount: adjustedLoanAmount * (productDetails.totalLoanMultiplier || LOAN_CONSTANTS.TOTAL_LOAN_MULTIPLIER)
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
    // Minimum loan amount validation
    const MIN_LOAN_AMOUNT = 100000; // 100,000 minimum

    const monthlyRate = annualInterestRate / 100 / 12;
    const maxAmount = (targetEMI * (Math.pow(1 + monthlyRate, tenureMonths) - 1)) /
                      (monthlyRate * Math.pow(1 + monthlyRate, tenureMonths));
                      
    // Ensure calculated amount meets minimum requirement
    const calculatedAmount = Math.max(MIN_LOAN_AMOUNT, Math.round(maxAmount * 100) / 100);
    
    // If amount is less than minimum, throw an error
    if (maxAmount < MIN_LOAN_AMOUNT) {
      throw new ApplicationException(
        'LOAN_AMOUNT_TOO_LOW',
        `Calculated loan amount ${maxAmount} is below minimum ${MIN_LOAN_AMOUNT}`
      );
    }
    
    return calculatedAmount; // Return amount that meets minimum requirement
  }
}

module.exports = new EligibilityService();