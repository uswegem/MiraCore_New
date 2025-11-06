const axios = require('axios');

async function verifyClient() {
    try {
        console.log('Checking CBS for client AARON USWEGE...');
        const response = await axios.get('https://zedone-uat.miracore.co.tz/fineract-provider/api/v1/clients?externalId=19900615111450000123', {
            headers: {
                'Content-Type': 'application/json',
                'fineract-platform-tenantid': 'zedone-uat'
            },
            auth: {
                username: 'ess_creater',
                password: 'Jothan@123456'
            }
        });
        console.log('\nClient Status:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Error checking client:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

verifyClient();