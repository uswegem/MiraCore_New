const axios = require("axios");
const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs')
const https = require('https');

const CBS_USERNAME = process.env.CBS_AUTH_USERNAME;
const CBS_PASSWORD = process.env.CBS_AUTH_PASSWORD;
const CBS_Tenant = process.env.CBS_Tenant;


const api = axios.create({
  baseURL: process.env.CBS_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
    "fineract-platform-tenantid": CBS_Tenant
  },
  auth: {
    username: CBS_USERNAME,
    password: CBS_PASSWORD
  }
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => Promise.reject(error)
);


// Response interceptor
api.interceptors.response.use(
  (response) => {
    return { status: true, message: 'Success', response: response.data }
  },
  (error) => {
    if (error.response) {
      return { status: false, message: 'Error', response: error.response.data }
    }

    // For network or other errors without response
    return Promise.reject(error.message);
  }
);


module.exports = api;
