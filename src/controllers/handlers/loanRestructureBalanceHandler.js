const logger = require('../../utils/logger');
const { sendCallback } = require('../../utils/callbackUtils');
const { sendErrorResponse } = require('../../utils/responseUtils');
const LoanMappingService = require('../../services/loanMappingService');
const cbsApi = require('../../services/cbs.api');
const { formatDateForMifos } = require('../../utils/dateUtils');

/**
 * Handle LOAN_RESTRUCTURE_BALANCE_REQUEST from ESS
 * ESS sends this to get current loan balance details before initiating restructuring
 * 
 * Request fields:
 * - CheckNumber: Employee ID
 * - LoanNumber: Loan reference number
 * - FirstName, MiddleName, LastName: Employee names
 * - VoteCode, VoteName: Employer details
 * - DeductionAmount, DeductionCode, DeductionName: Deduction details
 * - DeductionBalance: Current deduction balance
 * - PaymentOption: Full payment option
 * 
 * Response fields (LOAN_RESTRUCTURE_BALANCE_RESPONSE):
 * - LoanNumber: Employee Loan reference number
 * - OutstandingBalance: Principal + Interest Amount
 * - PrincipalBalance: Principal Balance amount
 * - InstallmentAmount: Monthly EMI amount
 * - LastRepaymentDate: Last Monthly Repayment Date
 * - MaturityDate: Last Installment Date
 * - ValidityDate: Validity date for completion of the request
 */
async function handleLoanRestructureBalanceRequest(parsedData, res) {
    const startTime = Date.now();
    
    try {
        logger.info('📊 Processing LOAN_RESTRUCTURE_BALANCE_REQUEST');
        
        // Extract message details
        const messageDetails = parsedData.Document.Data.MessageDetails;
        const header = parsedData.Document.Data.Header;
        
        const {
            CheckNumber,
            LoanNumber,
            FirstName,
            MiddleName,
            LastName,
            VoteCode,
            VoteName,
            DeductionAmount,
            DeductionCode,
            DeductionName,
            DeductionBalance,
            PaymentOption
        } = messageDetails;
        
        logger.info('Request details:', {
            CheckNumber,
            LoanNumber,
            CustomerName: `${FirstName} ${MiddleName} ${LastName}`,
            DeductionBalance
        });
        
        // Find loan mapping in database
        const loanMapping = await LoanMappingService.findByLoanNumber(LoanNumber);
        
        if (!loanMapping) {
            logger.error('Loan mapping not found', { LoanNumber });
            return sendErrorResponse(
                res,
                '8002',
                `Loan not found: ${LoanNumber}`,
                'xml',
                parsedData
            );
        }
        
        const mifosLoanId = loanMapping.mifosLoanId;
        logger.info('Found MIFOS loan ID:', { mifosLoanId, LoanNumber });
        
        // Fetch loan details from MIFOS
        const api = cbsApi.maker;
        const loanResponse = await api.get(`/v1/loans/${mifosLoanId}?associations=repaymentSchedule,transactions`);
        
        if (!loanResponse.data) {
            logger.error('Failed to fetch loan from MIFOS', { mifosLoanId });
            return sendErrorResponse(
                res,
                '8003',
                'Failed to retrieve loan details from CBS',
                'xml',
                parsedData
            );
        }
        
        const loanData = loanResponse.data;
        const summary = loanData.summary || {};
        
        // Calculate outstanding balance (principal + interest + fees)
        const principalOutstanding = summary.principalOutstanding || 0;
        const interestOutstanding = summary.interestOutstanding || 0;
        const feeChargesOutstanding = summary.feeChargesOutstanding || 0;
        const penaltyChargesOutstanding = summary.penaltyChargesOutstanding || 0;
        
        const outstandingBalance = principalOutstanding + interestOutstanding + 
                                  feeChargesOutstanding + penaltyChargesOutstanding;
        
        // Get repayment schedule to calculate installment amount
        const repaymentSchedule = loanData.repaymentSchedule?.periods || [];
        let installmentAmount = 0;
        let lastRepaymentDate = null;
        let maturityDate = null;
        
        // Find a completed period to get the installment amount
        const completedPeriod = repaymentSchedule.find(p => p.period > 0 && p.complete === false);
        if (completedPeriod) {
            installmentAmount = (completedPeriod.principalDue || 0) + 
                               (completedPeriod.interestDue || 0) + 
                               (completedPeriod.feeChargesDue || 0);
        }
        
        // Get last payment date from transactions
        const transactions = loanData.transactions || [];
        const repaymentTransactions = transactions.filter(t => 
            t.type?.value === 'Repayment' && t.date
        );
        
        if (repaymentTransactions.length > 0) {
            const lastTransaction = repaymentTransactions[repaymentTransactions.length - 1];
            lastRepaymentDate = formatDateForMifos(new Date(
                lastTransaction.date[0],
                lastTransaction.date[1] - 1,
                lastTransaction.date[2]
            ));
        }
        
        // Get maturity date from repayment schedule
        const lastPeriod = repaymentSchedule[repaymentSchedule.length - 1];
        if (lastPeriod && lastPeriod.dueDate) {
            maturityDate = formatDateForMifos(new Date(
                lastPeriod.dueDate[0],
                lastPeriod.dueDate[1] - 1,
                lastPeriod.dueDate[2]
            ));
        }
        
        // Set validity date (30 days from now)
        const validityDate = new Date();
        validityDate.setDate(validityDate.getDate() + 30);
        const formattedValidityDate = formatDateForMifos(validityDate);
        
        logger.info('Loan balance details:', {
            LoanNumber,
            mifosLoanId,
            principalOutstanding,
            interestOutstanding,
            outstandingBalance,
            installmentAmount,
            lastRepaymentDate,
            maturityDate
        });
        
        // Prepare response data
        const responseData = {
            LoanNumber: LoanNumber,
            OutstandingBalance: outstandingBalance.toFixed(2),
            PrincipalBalance: principalOutstanding.toFixed(2),
            InstallmentAmount: installmentAmount.toFixed(2),
            LastRepaymentDate: lastRepaymentDate || formatDateForMifos(new Date()),
            MaturityDate: maturityDate || formatDateForMifos(validityDate),
            ValidityDate: formattedValidityDate
        };
        
        logger.info('Sending LOAN_RESTRUCTURE_BALANCE_RESPONSE:', responseData);
        
        // Send response via callback with 2 second delay
        setTimeout(async () => {
            try {
                await sendCallback(
                    'LOAN_RESTRUCTURE_BALANCE_RESPONSE',
                    responseData,
                    header
                );
                logger.info('✅ LOAN_RESTRUCTURE_BALANCE_RESPONSE sent successfully');
            } catch (callbackError) {
                logger.error('Failed to send LOAN_RESTRUCTURE_BALANCE_RESPONSE:', callbackError);
            }
        }, 2000);
        
        // Send immediate acknowledgment
        const duration = Date.now() - startTime;
        logger.info(`✅ LOAN_RESTRUCTURE_BALANCE_REQUEST processed in ${duration}ms`);
        
        return res.status(200).json({
            responseCode: '8000',
            responseDescription: 'Request received successfully',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error('❌ Error processing LOAN_RESTRUCTURE_BALANCE_REQUEST:', error);
        return sendErrorResponse(
            res,
            '8999',
            'Internal server error: ' + error.message,
            'xml',
            parsedData
        );
    }
}

module.exports = handleLoanRestructureBalanceRequest;
