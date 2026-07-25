/**
 * Test Both Message Types Using Shared Handler
 */

const axios = require('axios');
const digitalSignature = require('./src/utils/signatureUtils');

// Test data for LOAN_CHARGES_REQUEST
const loanChargesXML = `
<Document>
    <Data>
        <Header>
            <Sender>ESS_UTUMISHI</Sender>
            <Receiver>ZE DONE</Receiver>
            <FSPCode>FL8090</FSPCode>
            <MsgId>TEST_LC_${Date.now()}</MsgId>
            <MessageType>LOAN_CHARGES_REQUEST</MessageType>
        </Header>
        <MessageDetails>
            <CheckNumber>83274</CheckNumber>
            <DesignationCode>DG01</DesignationCode>
            <DesignationName>DEVELOPMENT GEOLOGIST I</DesignationName>
            <BasicSalary>1500000</BasicSalary>
            <NetSalary>1150000</NetSalary>
            <OneThirdAmount>383333</OneThirdAmount>
            <DeductibleAmount>400000</DeductibleAmount>
            <RetirementDate>2050-01-15</RetirementDate>
            <TermsOfEmployment>PERMANENT</TermsOfEmployment>
            <RequestedAmount>2000000</RequestedAmount>
            <DesiredDeductibleAmount>350000</DesiredDeductibleAmount>
            <Tenure>36</Tenure>
            <ProductCode>DAS</ProductCode>
            <VoteCode>002</VoteCode>
            <TotalEmployeeDeduction>250000</TotalEmployeeDeduction>
            <JobClassCode>A01</JobClassCode>
        </MessageDetails>
    </Data>
</Document>`;

// Test data for LOAN_RESTRUCTURE_AFFORDABILITY_REQUEST (identical fields)
const restructureAffordabilityXML = `
<Document>
    <Data>
        <Header>
            <Sender>ESS_UTUMISHI</Sender>
            <Receiver>ZE DONE</Receiver>
            <FSPCode>FL8090</FSPCode>
            <MsgId>TEST_LRAR_${Date.now()}</MsgId>
            <MessageType>LOAN_RESTRUCTURE_AFFORDABILITY_REQUEST</MessageType>
        </Header>
        <MessageDetails>
            <CheckNumber>83274</CheckNumber>
            <DesignationCode>DG01</DesignationCode>
            <DesignationName>DEVELOPMENT GEOLOGIST I</DesignationName>
            <BasicSalary>1500000</BasicSalary>
            <NetSalary>1150000</NetSalary>
            <OneThirdAmount>383333</OneThirdAmount>
            <DeductibleAmount>400000</DeductibleAmount>
            <RetirementDate>2050-01-15</RetirementDate>
            <TermsOfEmployment>PERMANENT</TermsOfEmployment>
            <RequestedAmount>2000000</RequestedAmount>
            <DesiredDeductibleAmount>350000</DesiredDeductibleAmount>
            <Tenure>36</Tenure>
            <ProductCode>DAS</ProductCode>
            <VoteCode>002</VoteCode>
            <TotalEmployeeDeduction>250000</TotalEmployeeDeduction>
            <JobClassCode>A01</JobClassCode>
        </MessageDetails>
    </Data>
</Document>`;

const sendToServer = async (xmlData, messageType) => {
    try {
        const signedXML = digitalSignature.createSignedXML(xmlData);
        
        console.log(`\n📤 Sending ${messageType}...`);
        
        const response = await axios.post('http://5.75.185.137:3002/api/loan', signedXML, {
            headers: {
                'Content-Type': 'application/xml',
                'Accept': 'application/xml'
            },
            timeout: 30000
        });

        console.log(`✅ ${messageType} Response Status:`, response.status);
        console.log(`📋 ${messageType} Response:`, response.data);
        
        return response.data;
    } catch (error) {
        console.error(`❌ Error sending ${messageType}:`, error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', error.response.data);
        }
        throw error;
    }
};

const parseResponseFields = (xmlResponse) => {
    const fields = {
        DesiredDeductibleAmount: (xmlResponse.match(/<DesiredDeductibleAmount>(.*?)<\/DesiredDeductibleAmount>/) || [])[1],
        TotalInsurance: (xmlResponse.match(/<TotalInsurance>(.*?)<\/TotalInsurance>/) || [])[1],
        TotalProcessingFees: (xmlResponse.match(/<TotalProcessingFees>(.*?)<\/TotalProcessingFees>/) || [])[1],
        TotalInterestRateAmount: (xmlResponse.match(/<TotalInterestRateAmount>(.*?)<\/TotalInterestRateAmount>/) || [])[1],
        OtherCharges: (xmlResponse.match(/<OtherCharges>(.*?)<\/OtherCharges>/) || [])[1],
        NetLoanAmount: (xmlResponse.match(/<NetLoanAmount>(.*?)<\/NetLoanAmount>/) || [])[1],
        TotalAmountToPay: (xmlResponse.match(/<TotalAmountToPay>(.*?)<\/TotalAmountToPay>/) || [])[1],
        Tenure: (xmlResponse.match(/<Tenure>(.*?)<\/Tenure>/) || [])[1],
        EligibleAmount: (xmlResponse.match(/<EligibleAmount>(.*?)<\/EligibleAmount>/) || [])[1],
        MonthlyReturnAmount: (xmlResponse.match(/<MonthlyReturnAmount>(.*?)<\/MonthlyReturnAmount>/) || [])[1],
        MessageType: (xmlResponse.match(/<MessageType>(.*?)<\/MessageType>/) || [])[1]
    };
    return fields;
};

async function testSharedHandler() {
    console.log('🧪 Testing Shared Handler for Both Message Types');
    console.log('='*60);

    try {
        // Test 1: LOAN_CHARGES_REQUEST
        console.log('\n📋 TEST 1: LOAN_CHARGES_REQUEST');
        const loanChargesResponse = await sendToServer(loanChargesXML, 'LOAN_CHARGES_REQUEST');
        const loanChargesFields = parseResponseFields(loanChargesResponse);
        
        console.log('\n🔍 LOAN_CHARGES_REQUEST Response Fields:');
        Object.entries(loanChargesFields).forEach(([key, value]) => {
            console.log(`   ${key}: ${value}`);
        });

        // Test 2: LOAN_RESTRUCTURE_AFFORDABILITY_REQUEST  
        console.log('\n📋 TEST 2: LOAN_RESTRUCTURE_AFFORDABILITY_REQUEST');
        const restructureResponse = await sendToServer(restructureAffordabilityXML, 'LOAN_RESTRUCTURE_AFFORDABILITY_REQUEST');
        const restructureFields = parseResponseFields(restructureResponse);
        
        console.log('\n🔍 LOAN_RESTRUCTURE_AFFORDABILITY_REQUEST Response Fields:');
        Object.entries(restructureFields).forEach(([key, value]) => {
            console.log(`   ${key}: ${value}`);
        });

        // Compare responses
        console.log('\n📊 COMPARISON ANALYSIS:');
        console.log('='*40);
        
        const fieldsToCompare = ['DesiredDeductibleAmount', 'TotalInsurance', 'TotalProcessingFees', 
                                'TotalInterestRateAmount', 'OtherCharges', 'NetLoanAmount', 
                                'TotalAmountToPay', 'Tenure', 'EligibleAmount', 'MonthlyReturnAmount'];
        
        let identical = true;
        fieldsToCompare.forEach(field => {
            const lc_val = loanChargesFields[field];
            const ra_val = restructureFields[field];
            const match = lc_val === ra_val;
            if (!match) identical = false;
            
            console.log(`${match ? '✅' : '❌'} ${field}:`);
            console.log(`   LOAN_CHARGES: ${lc_val}`);
            console.log(`   RESTRUCTURE:  ${ra_val}`);
        });

        // Check response types
        console.log('\n🏷️  RESPONSE TYPE ANALYSIS:');
        console.log(`LOAN_CHARGES Response Type: ${loanChargesFields.MessageType}`);
        console.log(`RESTRUCTURE Response Type: ${restructureFields.MessageType}`);
        
        const correctResponseTypes = 
            loanChargesFields.MessageType === 'LOAN_CHARGES_RESPONSE' &&
            restructureFields.MessageType === 'LOAN_RESTRUCTURE_AFFORDABILITY_RESPONSE';

        console.log('\n🎯 FINAL RESULTS:');
        console.log('='*40);
        console.log(`${identical ? '✅' : '❌'} Calculation Results Identical: ${identical}`);
        console.log(`${correctResponseTypes ? '✅' : '❌'} Response Types Correct: ${correctResponseTypes}`);
        
        if (identical && correctResponseTypes) {
            console.log('\n🎉 SUCCESS: Both message types processed identically with correct response types!');
            console.log('✅ Shared handler implementation working perfectly');
        } else {
            console.log('\n⚠️  ISSUES DETECTED: Please review the implementation');
        }

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}

// Run the test
testSharedHandler().then(() => {
    console.log('\n✅ Test completed successfully');
}).catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
});