const logger = require('../utils/logger');
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
            const formattedEmploymentDate = clientData.employmentDate ? 
                new Date(clientData.employmentDate).toISOString().split('T')[0] : null;

            const payload = {
                firstname: clientData.firstname,
                middlename: clientData.middlename,
                lastname: clientData.lastname,
                externalId: clientData.externalId,
                dateFormat: "yyyy-MM-dd",
                locale: "en",
                active: true,
                submittedOnDate: new Date().toISOString().split('T')[0],
                activationDate: new Date().toISOString().split('T')[0],
                officeId: 1,
                savingsProductId: null,
                dateOfBirth: clientData.dateOfBirth,
                genderId: clientData.gender === 'M' ? 15 : 16,
                clientTypeId: 17, // Individual Client
                staffId: null,
                // Include datatable fields in main payload
                datatables: [{
                    registeredTableName: "client_onboarding",
                    data: {
                        CheckNumber: clientData.checkNumber || clientData.applicationNumber,
                        EmploymentDate: formattedEmploymentDate,
                        SwiftCode: clientData.swiftCode || null,
                        BankAccountNumber: clientData.bankAccountNumber || null,
                        PhoneNumber: clientData.mobileNo || clientData.mobileNumber,
                        EmailAddress: clientData.emailAddress,
                        PhysicalAddress: clientData.physicalAddress,
                        MaritalStatus: clientData.maritalStatus,
                        locale: "en",
                        dateFormat: "yyyy-MM-dd"
                    }
                }]
            };

            logger.info('🔵 Creating client in CBS:', payload);
            const response = await cbsApi.post(API_ENDPOINTS.CLIENTS, payload);
            logger.info('🟢 CBS client creation response:', JSON.stringify(response, null, 2));
            
            // Client creation includes datatable, no need for separate call
            
            return response;
        } catch (error) {
            logger.error('🔴 Error creating client:', error);
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
            logger.info('🔵 Searching for client by external ID:', externalId);
            const response = await cbsApi.get(`${API_ENDPOINTS.CLIENTS}?externalId=${externalId}`);
            logger.info('🟢 CBS client search response:', response);
            return response;
        } catch (error) {
            logger.error('🔴 Error searching client:', error);
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
            logger.info('🔵 Getting client details for ID:', clientId);
            const response = await cbsApi.get(`${API_ENDPOINTS.CLIENTS}/${clientId}`);
            logger.info('🟢 CBS client details response:', response);
            return response;
        } catch (error) {
            logger.error('🔴 Error getting client details:', error);
            throw error;
        }
    }
}

module.exports = ClientService;