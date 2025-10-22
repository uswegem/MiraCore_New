
const CBS_BASE_URL = process.env.CBS_BASE_URL


const API_ENDPOINTS = {
    AUTHENTICATION: '/v1/authentication',
    PRODUCT: '/v1/loanproducts',
    LOAN: '/v1/loans',
    CLIENTS: '/v1/clients',


    LIST_PRODUCTS: '/v1/loanproducts',
    GET_EMPLOYEES_LOAN: '/v1/loans',
    CALCULATE_POSSIBLE_LOAN_CHARGES: '/v1/loans?command=calculateLoanSchedule',
    SUBMIT_LOAN_REQ: '/v1/loans',
    GET_LOAN_DETAILS: '/v1/loans/',
    LOAN_CANCEL: '/v1/loans/',
    GET_LOAN_TEMPLATE: '/v1/loans/template',
    LOAN_TOP_UP: '/v1/loans/',
    LOAN_PAYOFF: '/v1/loans/',

    LOAN_RESHEDULE: '/v1/rescheduleloans'
}

module.exports = {
    API_ENDPOINTS,
    CBS_BASE_URL
}