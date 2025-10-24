const { LOAN_CONSTANTS } = require('../utils/loanConstants');

// Mock Active Loan Provider
class ActiveLoanProvider {
  /**
   * Enquire loan account details
   */
  async enquireLoanAccount(country, customerNumber) {
    console.log(`Enquiring loan accounts for customer ${customerNumber} in ${country}`);

    // Mock response - in real implementation, this would call the actual loan provider API
    return {
      accountDetailList: [
        // Mock active loan
        // {
        //   accountNumber: 'ACC001',
        //   accountStatus: 'FULL' // or 'PART' for partial payment
        // }
      ]
    };
  }

  /**
   * View active loan details
   */
  async viewActiveLoanDetail(country, accountNumber) {
    console.log(`Viewing loan details for account ${accountNumber} in ${country}`);

    // Mock response
    return {
      accountNumber: accountNumber,
      isPositiveArrears: () => false, // Mock: no arrears
      dayArr: 0 // Days in arrears
    };
  }
}

module.exports = new ActiveLoanProvider();