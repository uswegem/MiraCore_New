const axios = require("axios");
const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs')
const https = require('https');

const CBS_MAKER_USERNAME = process.env.CBS_MAKER_USERNAME;
const CBS_MAKER_PASSWORD = process.env.CBS_MAKER_PASSWORD;
const CBS_Tenant = process.env.CBS_Tenant;


const api = axios.create({
  baseURL: process.env.CBS_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
    "fineract-platform-tenantid": CBS_Tenant
  },
  auth: {
    username: CBS_MAKER_USERNAME,
    password: CBS_MAKER_PASSWORD
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


// Create a separate instance for checker operations
const checkerApi = axios.create({
  baseURL: process.env.CBS_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
    "fineract-platform-tenantid": CBS_Tenant
  },
  auth: {
    username: process.env.CBS_CHECKER_USERNAME,
    password: process.env.CBS_CHECKER_PASSWORD
  }
});

// Apply the same interceptors to checkerApi
checkerApi.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => Promise.reject(error)
);

checkerApi.interceptors.response.use(
  (response) => {
    return { status: true, message: 'Success', response: response.data }
  },
  (error) => {
    if (error.response) {
      return { status: false, message: 'Error', response: error.response.data }
    }
    return Promise.reject(error.message);
  }
);

module.exports = {
  maker: api,
  checker: checkerApi
};
