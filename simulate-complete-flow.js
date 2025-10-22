const axios = require('axios');

async function simulateLoanFlow() {
    console.log('🚀 Simulating Complete Loan Flow with Updated Client\n');
    console.log('='.repeat(70) + '\n');

    // Test 1: LOAN_CHARGES_REQUEST
    console.log('📋 TEST 1: LOAN_CHARGES_REQUEST');
    console.log('-'.repeat(50));

    const loanChargesRequest = `<?xml version="1.0" encoding="UTF-8"?>
<Document>
    <Data>
        <Header>
            <Sender>ESS_UTUMISHI</Sender>
            <Receiver>ZE DONE</Receiver>
            <FSPCode>FL8090</FSPCode>
            <MsgId>CHARGES_TEST_${Date.now()}</MsgId>
            <MessageType>LOAN_CHARGES_REQUEST</MessageType>
        </Header>
        <MessageDetails>
            <CheckNumber>CHK${Date.now()}</CheckNumber>
            <DesignationCode>D001</DesignationCode>
            <DesignationName>Teacher</DesignationName>
            <BasicSalary>1500000</BasicSalary>
            <NetSalary>1400000</NetSalary>
            <OneThirdAmount>500000</OneThirdAmount>
            <DeductibleAmount>100000</DeductibleAmount>
            <RetirementDate>2050-01-01</RetirementDate>
            <TermsOfEmployment>PERMANENT</TermsOfEmployment>
            <RequestedAmount>5000000</RequestedAmount>
            <DesiredDeductibleAmount>150000</DesiredDeductibleAmount>
            <Tenure>24</Tenure>
            <ProductCode>17</ProductCode>
            <VoteCode>V001</VoteCode>
            <TotalEmployeeDeduction>100000</TotalEmployeeDeduction>
            <JobClassCode>J001</JobClassCode>
        </MessageDetails>
    </Data>
</Document>`;

    console.log('📤 REQUEST XML:');
    console.log(loanChargesRequest);
    console.log('\n📥 RESPONSE XML:');

    try {
        const response1 = await axios.post('http://localhost:3002/api/loan', loanChargesRequest, {
            headers: { 'Content-Type': 'application/xml' },
            timeout: 30000
        });
        console.log(response1.data);
    } catch (error) {
        console.log('❌ Error:', error.message);
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Response:', error.response.data);
        } else if (error.code) {
            console.log('Error Code:', error.code);
        } else {
            console.log('Full Error:', error);
        }
    }

    console.log('\n' + '='.repeat(70) + '\n');

    // Test 2: LOAN_OFFER_REQUEST
    console.log('📋 TEST 2: LOAN_OFFER_REQUEST');
    console.log('-'.repeat(50));

    const loanOfferRequest = `<?xml version="1.0" encoding="UTF-8"?>
<Document>
    <Data>
        <Header>
            <Sender>ESS_UTUMISHI</Sender>
            <Receiver>ZE DONE</Receiver>
            <FSPCode>FL8090</FSPCode>
            <MsgId>OFFER_TEST_${Date.now()}</MsgId>
            <MessageType>LOAN_OFFER_REQUEST</MessageType>
        </Header>
        <MessageDetails>
            <CheckNumber>CHK${Date.now()}</CheckNumber>
            <DesignationCode>D001</DesignationCode>
            <DesignationName>Teacher</DesignationName>
            <BasicSalary>1500000</BasicSalary>
            <NetSalary>1400000</NetSalary>
            <OneThirdAmount>500000</OneThirdAmount>
            <DeductibleAmount>100000</DeductibleAmount>
            <RetirementDate>2050-01-01</RetirementDate>
            <TermsOfEmployment>PERMANENT</TermsOfEmployment>
            <RequestedAmount>5000000</RequestedAmount>
            <DesiredDeductibleAmount>150000</DesiredDeductibleAmount>
            <Tenure>24</Tenure>
            <ProductCode>17</ProductCode>
            <VoteCode>V001</VoteCode>
            <TotalEmployeeDeduction>100000</TotalEmployeeDeduction>
            <JobClassCode>J001</JobClassCode>
        </MessageDetails>
    </Data>
</Document>`;

    console.log('📤 REQUEST XML:');
    console.log(loanOfferRequest);
    console.log('\n📥 RESPONSE XML:');

    try {
        const response2 = await axios.post('http://localhost:3002/api/loan', loanOfferRequest, {
            headers: { 'Content-Type': 'application/xml' },
            timeout: 30000
        });
        console.log(response2.data);
    } catch (error) {
        console.log('❌ Error:', error.message);
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Response:', error.response.data);
        } else if (error.code) {
            console.log('Error Code:', error.code);
        } else {
            console.log('Full Error:', error);
        }
    }

    console.log('\n' + '='.repeat(70) + '\n');

    // Test 3: LOAN_FINAL_APPROVAL_NOTIFICATION
    console.log('📋 TEST 3: LOAN_FINAL_APPROVAL_NOTIFICATION');
    console.log('-'.repeat(50));

    const finalApprovalRequest = `<?xml version="1.0" encoding="UTF-8"?>
<Document>
    <Data>
        <Header>
            <Sender>ESS_UTUMISHI</Sender>
            <Receiver>ZE DONE</Receiver>
            <FSPCode>FL8090</FSPCode>
            <MsgId>FINAL_APPROVAL_TEST_${Date.now()}</MsgId>
            <MessageType>LOAN_FINAL_APPROVAL_NOTIFICATION</MessageType>
        </Header>
        <MessageDetails>
            <ApplicationNumber>APP${Date.now()}</ApplicationNumber>
            <FSPReferenceNumber>FSP${Date.now()}</FSPReferenceNumber>
            <LoanNumber>LOAN${Date.now()}</LoanNumber>
            <Approval>APPROVED</Approval>
            <NIN>1234567890123456</NIN>
            <FirstName>John</FirstName>
            <LastName>Doe</LastName>
            <MobileNo>0712345678</MobileNo>
            <Sex>M</Sex>
            <DateOfBirth>1990-01-01</DateOfBirth>
            <EmploymentDate>2020-01-01</EmploymentDate>
            <BankAccountNumber>1234567890</BankAccountNumber>
            <SwiftCode>TESTSWFT</SwiftCode>
            <CheckNumber>CHK${Date.now()}</CheckNumber>
            <RequestedAmount>5000000</RequestedAmount>
            <ProductCode>17</ProductCode>
            <Tenure>24</Tenure>
            <InterestRate>28</InterestRate>
            <ProcessingFee>500</ProcessingFee>
            <Insurance>200</Insurance>
        </MessageDetails>
    </Data>
</Document>`;

    console.log('📤 REQUEST XML:');
    console.log(finalApprovalRequest);
    console.log('\n📥 RESPONSE XML:');

    try {
        const response3 = await axios.post('http://localhost:3002/api/loan', finalApprovalRequest, {
            headers: { 'Content-Type': 'application/xml' },
            timeout: 30000
        });
        console.log(response3.data);
    } catch (error) {
        console.log('❌ Error:', error.message);
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Response:', error.response.data);
        } else if (error.code) {
            console.log('Error Code:', error.code);
        } else {
            console.log('Full Error:', error);
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ Complete loan flow simulation completed!');
    console.log('\n📋 SUMMARY:');
    console.log('1. LOAN_CHARGES_REQUEST → Calculates loan charges and fees');
    console.log('2. LOAN_OFFER_REQUEST → Processes loan application and sends initial approval');
    console.log('3. LOAN_FINAL_APPROVAL_NOTIFICATION → Creates client, loan, disburses funds, and sends disbursement notification');
}

simulateLoanFlow().catch(console.error);