const axios = require('axios');
const xml2js = require('xml2js');

const API_URL = 'http://5.75.185.137:3006/api/process';
// const API_URL = 'http://localhost:3006/api/process';

async function testTakeoverPayoffRequest() {
    console.log('🧪 Testing TAKEOVER_PAY_OFF_BALANCE_REQUEST');
    console.log('='.repeat(80));
    
    // Use loan 000000031 which exists in MIFOS
    const loanNumber = '000000031';
    
    const xmlRequest = `<?xml version="1.0" encoding="UTF-8"?>
<Document>
    <Data>
        <Header>
            <SenderID>ESS_UTUMISHI</SenderID>
            <ReceiverID>ZE</ReceiverID>
            <MsgId>MSG${Date.now()}</MsgId>
            <MessageType>TAKEOVER_PAY_OFF_BALANCE_REQUEST</MessageType>
            <CreDtTm>${new Date().toISOString()}</CreDtTm>
        </Header>
        <MessageDetails>
            <ApplicationNumber>APP${Date.now()}</ApplicationNumber>
            <LoanNumber>${loanNumber}</LoanNumber>
            <DeductionBalance>5000000</DeductionBalance>
            <FSPReferenceNumber>FSP${Date.now()}</FSPReferenceNumber>
        </MessageDetails>
    </Data>
</Document>`;

    console.log('\n📤 REQUEST XML:');
    console.log(xmlRequest);
    console.log('\n' + '='.repeat(80));

    try {
        console.log('\n🚀 Sending request...');
        const startTime = Date.now();
        
        const response = await axios.post(API_URL, xmlRequest, {
            headers: {
                'Content-Type': 'application/xml'
            },
            timeout: 30000
        });

        const duration = Date.now() - startTime;
        console.log(`✅ Response received in ${duration}ms`);
        console.log('\n📥 RESPONSE XML:');
        console.log(response.data);
        console.log('\n' + '='.repeat(80));

        // Parse the response
        const parser = new xml2js.Parser({ explicitArray: false });
        const parsedResponse = await parser.parseStringPromise(response.data);
        
        const responseHeader = parsedResponse.Document.Data.Header;
        const responseDetails = parsedResponse.Document.Data.MessageDetails;
        
        console.log('\n📊 PARSED RESPONSE:');
        console.log('Message Type:', responseHeader.MessageType);
        console.log('Status Code:', responseDetails.StatusCode);
        console.log('Status Description:', responseDetails.StatusDescription);
        console.log('');
        console.log('💰 FINANCIAL DETAILS:');
        console.log('Loan Number:', responseDetails.LoanNumber);
        console.log('Total Payoff Amount:', responseDetails.TotalPayOffAmount);
        console.log('Outstanding Balance:', responseDetails.OutstandingBalance);
        console.log('Last Deduction Date:', responseDetails.LastDeductionDate);
        console.log('End Date:', responseDetails.EndDate);
        console.log('Final Payment Date:', responseDetails.FinalPaymentDate);
        console.log('');
        console.log('🔍 VERIFICATION:');
        console.log('- Response Type:', responseHeader.MessageType === 'LOAN_TAKEOVER_BALANCE_RESPONSE' ? '✅ Correct' : '❌ Wrong');
        console.log('- Has Payoff Amount:', responseDetails.TotalPayOffAmount ? '✅ Yes' : '❌ No');
        console.log('- Has Outstanding Balance:', responseDetails.OutstandingBalance ? '✅ Yes' : '❌ No');
        console.log('- Status Success:', responseDetails.StatusCode === '8000' ? '✅ Success' : '⚠️ ' + responseDetails.StatusDescription);
        
        console.log('\n' + '='.repeat(80));
        console.log('✅ TEST COMPLETED SUCCESSFULLY');
        
    } catch (error) {
        console.error('\n❌ TEST FAILED');
        console.error('Error:', error.message);
        
        if (error.response) {
            console.error('\n📥 ERROR RESPONSE:');
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
        
        if (error.code === 'ECONNREFUSED') {
            console.error('\n⚠️  Connection refused. Make sure the server is running.');
        }
    }
}

// Run the test
testTakeoverPayoffRequest();
