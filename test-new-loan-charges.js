const { LoanCalculate } = require('./src/services/loanService');

async function testNewLoanChargesLogic() {
    console.log('🧪 Testing new enhanced loan charges logic...');

    try {
        // Test data matching the UtumishiOfferRequest structure
        const testData = {
            checkNumber: 'CHK123456',
            designationCode: 'DC001',
            designationName: 'Software Engineer',
            basicSalary: 2000000, // 2,000,000 TZS
            netSalary: 1800000, // 1,800,000 TZS
            oneThirdAmount: 600000, // 600,000 TZS
            deductibleAmount: 500000, // 500,000 TZS (desired EMI)
            retirementDate: '2055-12-31', // Far in future
            termsOfEmployment: 'PERMANENT',
            requestedAmount: 5000000, // 5,000,000 TZS
            desiredDeductibleAmount: 500000, // 500,000 TZS
            tenure: 60, // 60 months
            fspCode: 'FL8090',
            productCode: '17',
            voteCode: 'V001',
            totalEmployeeDeduction: 200000, // 200,000 TZS
            jobClassCode: 'JC001'
        };

        console.log('📊 Test Input Data:', testData);

        const result = await LoanCalculate(testData);

        console.log('✅ Loan Charges Calculation Result:');
        console.log(JSON.stringify(result, null, 2));

        // Verify the response structure
        const expectedFields = [
            'monthlyReturnAmount',
            'tenure',
            'totalAmountToPay',
            'netLoanAmount',
            'eligibleAmount',
            'totalInterestRateAmount',
            'totalProcessingFees',
            'totalInsurance',
            'otherCharges',
            'desiredDeductibleAmount'
        ];

        const missingFields = expectedFields.filter(field => !(field in result));
        if (missingFields.length > 0) {
            console.error('❌ Missing fields in response:', missingFields);
        } else {
            console.log('✅ All expected fields present in response');
        }

        // Verify numeric values are strings
        const numericFields = [
            'monthlyReturnAmount',
            'totalAmountToPay',
            'netLoanAmount',
            'eligibleAmount',
            'totalInterestRateAmount',
            'totalProcessingFees',
            'totalInsurance',
            'otherCharges',
            'desiredDeductibleAmount'
        ];

        for (const field of numericFields) {
            if (typeof result[field] !== 'string') {
                console.error(`❌ Field ${field} should be string, got ${typeof result[field]}`);
            }
        }

        console.log('✅ Response validation completed');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.errorCode) {
            console.error('Error Code:', error.errorCode);
            console.error('Error Message:', error.errorMsg);
        }
    }
}

// Run the test
testNewLoanChargesLogic().then(() => {
    console.log('🧪 Test completed');
    process.exit(0);
}).catch(error => {
    console.error('💥 Test crashed:', error);
    process.exit(1);
});