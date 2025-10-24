const LoanMapping = require('../models/LoanMapping');

class LoanMappingService {
  /**
   * Generate loan number alias in format: YYYYMMDDHHMM + 3 unique numbers
   */
  static generateLoanNumberAlias() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    // Generate 3 unique numbers (using milliseconds for uniqueness)
    const unique = String(now.getMilliseconds()).padStart(3, '0').slice(-3);

    return `${year}${month}${day}${hours}${minutes}${unique}`;
  }

  /**
   * Create initial loan mapping when LOAN_INITIAL_APPROVAL_NOTIFICATION is sent
   */
  static async createInitialMapping(essApplicationNumber, essCheckNumber, fspReferenceNumber, loanDetails) {
    try {
      const mapping = new LoanMapping({
        essApplicationNumber,
        essCheckNumber,
        fspReferenceNumber,
        productCode: loanDetails.productCode,
        requestedAmount: loanDetails.requestedAmount,
        tenure: loanDetails.tenure,
        mifosClientId: loanDetails.clientId,
        mifosLoanId: loanDetails.loanId,
        status: 'INITIAL_OFFER',
        metadata: {
          initialOfferDetails: loanDetails
        }
      });

      await mapping.save();
      console.log(`✅ Created initial loan mapping for application: ${essApplicationNumber}, check: ${essCheckNumber}`);
      return mapping;
    } catch (error) {
      console.error('❌ Error creating initial loan mapping:', error);
      throw error;
    }
  }

  /**
   * Update mapping when LOAN_FINAL_APPROVAL_NOTIFICATION is received
   * Note: The loan number from ESS will be the same as our generated alias
   */
  static async updateWithFinalApproval(essLoanNumberAlias, finalApprovalData) {
    try {
      // Find mapping by ESS application number
      const mapping = await LoanMapping.findOne({
        essApplicationNumber: finalApprovalData.applicationNumber
      });

      if (!mapping) {
        throw new Error(`No loan mapping found for application: ${finalApprovalData.applicationNumber}`);
      }

      // The loan number from ESS should match our generated alias
      if (mapping.essLoanNumberAlias && mapping.essLoanNumberAlias !== essLoanNumberAlias) {
        console.warn(`⚠️ ESS loan number alias mismatch. Expected: ${mapping.essLoanNumberAlias}, Received: ${essLoanNumberAlias}`);
      }

      // Update with final approval data (loan number alias should already be set)
      mapping.essLoanNumberAlias = essLoanNumberAlias; // Ensure it's set
      mapping.status = 'FINAL_APPROVAL_RECEIVED';
      mapping.finalApprovalReceivedAt = new Date();
      mapping.metadata = {
        ...mapping.metadata,
        finalApprovalDetails: finalApprovalData
      };

      await mapping.save();
      console.log(`✅ Updated loan mapping with final approval for loan alias: ${essLoanNumberAlias}`);
      return mapping;
    } catch (error) {
      console.error('❌ Error updating loan mapping with final approval:', error);
      throw error;
    }
  }

  /**
   * Update mapping when MIFOS client is created
   */
  static async updateWithClientCreation(essLoanNumberAlias, mifosClientId) {
    try {
      const mapping = await LoanMapping.findOne({ essLoanNumberAlias });
      if (!mapping) {
        throw new Error(`No loan mapping found for ESS loan alias: ${essLoanNumberAlias}`);
      }

      mapping.mifosClientId = mifosClientId;
      mapping.status = 'CLIENT_CREATED';
      mapping.clientCreatedAt = new Date();

      await mapping.save();
      console.log(`✅ Updated loan mapping with MIFOS client ID: ${mifosClientId}`);
      return mapping;
    } catch (error) {
      console.error('❌ Error updating loan mapping with client creation:', error);
      throw error;
    }
  }

  /**
   * Update mapping when MIFOS loan is created
   */
  static async updateWithLoanCreation(essLoanNumberAlias, mifosLoanId, mifosLoanAccountNumber) {
    try {
      const mapping = await LoanMapping.findOne({ essLoanNumberAlias });
      if (!mapping) {
        throw new Error(`No loan mapping found for ESS loan alias: ${essLoanNumberAlias}`);
      }

      mapping.mifosLoanId = mifosLoanId;
      mapping.mifosLoanAccountNumber = mifosLoanAccountNumber;
      mapping.status = 'LOAN_CREATED';
      mapping.loanCreatedAt = new Date();

      await mapping.save();
      console.log(`✅ Updated loan mapping with MIFOS loan ID: ${mifosLoanId}, Account: ${mifosLoanAccountNumber}`);
      return mapping;
    } catch (error) {
      console.error('❌ Error updating loan mapping with loan creation:', error);
      throw error;
    }
  }

  /**
   * Update mapping when loan is disbursed
   */
  static async updateWithDisbursement(mifosLoanId) {
    try {
      const mapping = await LoanMapping.findByMifosLoanId(mifosLoanId);
      if (!mapping) {
        throw new Error(`No loan mapping found for MIFOS loan ID: ${mifosLoanId}`);
      }

      mapping.status = 'DISBURSED';
      mapping.disbursedAt = new Date();

      await mapping.save();
      console.log(`✅ Updated loan mapping with disbursement for loan ID: ${mifosLoanId}`);
      return mapping;
    } catch (error) {
      console.error('❌ Error updating loan mapping with disbursement:', error);
      throw error;
    }
  }

  /**
   * Get loan mapping by ESS loan number alias
   */
  static async getByEssLoanNumberAlias(essLoanNumberAlias) {
    try {
      const mapping = await LoanMapping.findOne({ essLoanNumberAlias });
      if (!mapping) {
        throw new Error(`No loan mapping found for ESS loan alias: ${essLoanNumberAlias}`);
      }
      return mapping;
    } catch (error) {
      console.error('❌ Error retrieving loan mapping:', error);
      throw error;
    }
  }

  /**
   * Get loan mapping by ESS application number
   */
  static async getByEssApplicationNumber(essApplicationNumber) {
    try {
      const mapping = await LoanMapping.findOne({ essApplicationNumber });
      if (!mapping) {
        throw new Error(`No loan mapping found for ESS application: ${essApplicationNumber}`);
      }
      return mapping;
    } catch (error) {
      console.error('❌ Error retrieving loan mapping:', error);
      throw error;
    }
  }

  /**
   * Get loan mapping by FSP reference number
   */
  static async getByFspReference(fspReferenceNumber) {
    try {
      const mapping = await LoanMapping.findByFspReference(fspReferenceNumber);
      if (!mapping) {
        throw new Error(`No loan mapping found for FSP reference: ${fspReferenceNumber}`);
      }
      return mapping;
    } catch (error) {
      console.error('❌ Error retrieving loan mapping:', error);
      throw error;
    }
  }

  /**
   * Get loan mapping by MIFOS loan ID
   */
  static async getByMifosLoanId(mifosLoanId) {
    try {
      const mapping = await LoanMapping.findByMifosLoanId(mifosLoanId);
      if (!mapping) {
        throw new Error(`No loan mapping found for MIFOS loan ID: ${mifosLoanId}`);
      }
      return mapping;
    } catch (error) {
      console.error('❌ Error retrieving loan mapping:', error);
      throw error;
    }
  }

  /**
   * Add error to mapping
   */
  static async addError(essLoanNumber, stage, error) {
    try {
      const mapping = await LoanMapping.findByEssLoanNumber(essLoanNumber);
      if (mapping) {
        await mapping.addError(stage, error);
      }
    } catch (error) {
      console.error('❌ Error adding error to loan mapping:', error);
    }
  }

  /**
   * Get all mappings by status
   */
  static async getByStatus(status) {
    try {
      return await LoanMapping.find({ status }).sort({ createdAt: -1 });
    } catch (error) {
      console.error('❌ Error retrieving loan mappings by status:', error);
      throw error;
    }
  }

  /**
   * Get mapping statistics
   */
  static async getStats() {
    try {
      const stats = await LoanMapping.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const result = {};
      stats.forEach(stat => {
        result[stat._id] = stat.count;
      });

      return result;
    } catch (error) {
      console.error('❌ Error getting loan mapping stats:', error);
      throw error;
    }
  }
}

module.exports = LoanMappingService;