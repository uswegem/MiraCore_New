const { API_ENDPOINTS } = require('./cbs.endpoints');
const { maker: cbsApi } = require('./cbs.api');

/**
 * Service for handling client operations with CBS
 */
class ClientService {
    /**
     * Create a new client in CBS
     * @param {Object} clientData Client information
     * @param {string} clientData.fullname Full name of the client
     * @param {string} clientData.officeId Office ID where client belongs
     * @param {string} clientData.dateFormat Date format for date fields
     * @param {string} clientData.locale Locale for the request
     * @param {string} clientData.active Whether to activate the client immediately
     * @param {string} clientData.activationDate Date of activation if active is true
     * @returns {Promise<Object>} Response from CBS
     */
    static async createClient(clientData) {
        try {
            const payload = {
                fullname: clientData.fullname,
                externalId: clientData.externalId || null,
                mobileNo: clientData.mobileNo || null,
                officeId: clientData.officeId || 1, // Default office ID
                dateFormat: clientData.dateFormat || "dd MMMM yyyy",
                locale: clientData.locale || "en",
                active: clientData.active !== undefined ? clientData.active : true,
                activationDate: clientData.activationDate || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
            };

            console.log('🔵 Creating client in CBS:', payload);
            const response = await cbsApi.post(API_ENDPOINTS.CLIENTS, payload);
            console.log('🟢 CBS client creation response:', JSON.stringify(response, null, 2));
            return response;
        } catch (error) {
            console.error('🔴 Error creating client:', error);
            throw error;
        }
    }

    /**
     * Search for a client by external ID
     * @param {string} externalId External ID to search for
     * @returns {Promise<Object>} Response from CBS
     */
    static async searchClientByExternalId(externalId) {
        try {
            console.log('🔵 Searching for client by external ID:', externalId);
            const response = await cbsApi.get(`${API_ENDPOINTS.CLIENTS}?externalId=${externalId}`);
            console.log('🟢 CBS client search response:', response);
            return response;
        } catch (error) {
            console.error('🔴 Error searching client:', error);
            throw error;
        }
    }

    /**
     * Get client details by client ID
     * @param {string} clientId Client ID in CBS
     * @returns {Promise<Object>} Response from CBS
     */
    static async getClientDetails(clientId) {
        try {
            console.log('🔵 Getting client details for ID:', clientId);
            const response = await cbsApi.get(`${API_ENDPOINTS.CLIENTS}/${clientId}`);
            console.log('🟢 CBS client details response:', response);
            return response;
        } catch (error) {
            console.error('🔴 Error getting client details:', error);
            throw error;
        }
    }
}

module.exports = ClientService;