const { sendResponse } = require("../utils/responseHelper");
const api = require("./cbs.api");
const { API_ENDPOINTS } = require("./cbs.endpoints");


const LoanCalculate = async (data) => {
    try {
        const {
            checkNumber,
            designationCode,
            designationName,
            basicSalary,
            netSalary,
            oneThirdAmount,
            deductibleAmount,
            retirementDate,
            termsOfEmployment,
            requestedAmount,
            desiredDeductibleAmount,
            tenure,
            fspCode,
            productCode,
            voteCode,
            totalEmployeeDeduction,
            jobClassCode
        } = data;

        const productId = productCode || 17; // Use product ID 17 as default if not provided
        console.log('Using product ID:', productId);

        //check loan product
        let loanProduct;
        try {
            loanProduct = await api.get(API_ENDPOINTS.PRODUCT + '/' + productId);
        } catch (error) {
            console.log('Product ID', productId, 'not found, falling back to product ID 17');
            loanProduct = await api.get(API_ENDPOINTS.PRODUCT + '/17');
        }


        const { response, status } = loanProduct
        if (!status) {
            throw new Error(response.error || "Product not found");
        }

        console.log('Full MIFOS product response:', JSON.stringify(response, null, 2));

        let {
            interestRatePerPeriod,
            charges,
            maxPrincipal,
            minPrincipal,
            minNumberOfRepayments,
            maxNumberOfRepayments,
            numberOfRepayments
        } = response;


        // pick usable tenure values
        const defaultTenure = numberOfRepayments || maxNumberOfRepayments;

        if (!defaultTenure) {
            throw new Error("Unable to find loan tenure");
        }

        if (!interestRatePerPeriod) {
            throw new Error("Unable to find Interest Rate");
        }

        let principal = (requestedAmount && requestedAmount > 0) ? requestedAmount : null;
        let months = (tenure && tenure > 0) ? tenure : null;
        let desiredDeduction = (desiredDeductibleAmount && desiredDeductibleAmount > 0) ? desiredDeductibleAmount : null;

        // Handle charges - use defaults if not available
        let insuranceCharge = null;
        let processingFeeCharge = null;

        if (charges && charges.length > 0) {
            insuranceCharge = charges.find(c => c.name && c.name.includes("Insurance"));
            processingFeeCharge = charges.find(c => c.name && c.name.includes("Arrangement"));
        }

        // Use default values if charges not found
        if (!insuranceCharge) {
            insuranceCharge = { amount: 1 }; // 1% insurance
            console.log('Using default insurance charge: 1%');
        }
        if (!processingFeeCharge) {
            processingFeeCharge = { amount: 2 }; // 2% processing fee
            console.log('Using default processing fee charge: 2%');
        }

        console.log('TEST: Code has been updated - using default charges');

        // --- CASE 1: requestedAmount only ---
        if (principal && !months && !desiredDeduction) {
            months = defaultTenure;
        }

        // --- CASE 2: tenure only ---
        if (!principal && months && !desiredDeduction) {
            if (!maxPrincipal) {
                throw new Error("Unable to find maxPrincipal");
            }
            principal = maxPrincipal;
        }

        // --- CASE 3: desiredDeductibleAmount only ---
        if (!principal && !months && desiredDeduction) {
            months = defaultTenure;
            principal = (desiredDeduction * months) / (1 + (interestRatePerPeriod / 100) * months);
        }

        // --- CASE 4: requestedAmount + tenure ---
        // just use directly

        // --- CASE 5: requestedAmount + desiredDeductibleAmount ---
        if (principal && desiredDeduction && !months) {
            const totalInterest = (principal * (interestRatePerPeriod / 100)) * defaultTenure;
            const approxTotalPay = principal + totalInterest;
            months = Math.ceil(approxTotalPay / desiredDeduction);
        }

        // --- CASE 6: tenure + desiredDeductibleAmount ---
        if (!principal && months && desiredDeduction) {
            principal = (desiredDeduction * months) / (1 + (interestRatePerPeriod / 100) * months);
        }

        // --- Charges & Interest ---
        const totalInsurance = (principal * (insuranceCharge?.amount || 0)) / 100;
        const totalProcessingFees = (principal * (processingFeeCharge?.amount || 0)) / 100;

        // Interest is per *year*, convert to monthly if repayment is in months
        const monthlyInterestRate = (interestRatePerPeriod / 100) / 12;

        const totalInterestRateAmount = months
            ? principal * monthlyInterestRate * months
            : 0;

        const netLoanAmount = principal - (totalInsurance + totalProcessingFees);
        const totalAmountToPay = principal + totalInterestRateAmount + totalInsurance + totalProcessingFees;
        const monthlyReturnAmount = months ? totalAmountToPay / months : 0;

        // fallback if user didn’t provide deduction
        if (!desiredDeduction) {
            desiredDeduction = monthlyReturnAmount;
        }

        const result = {
            requestedAmount: principal.toFixed(2),
            desiredDeductibleAmount: (desiredDeduction ?? monthlyReturnAmount).toFixed(2),
            totalInsurance: totalInsurance.toFixed(2),
            totalProcessingFees: totalProcessingFees.toFixed(2),
            totalInterestRateAmount: totalInterestRateAmount.toFixed(2),
            netLoanAmount: netLoanAmount.toFixed(2),
            totalAmountToPay: totalAmountToPay.toFixed(2),
            tenure: months,
            eligibleAmount: maxPrincipal.toFixed(2),
            monthlyReturnAmount: monthlyReturnAmount.toFixed(2),
        };


        return result

    } catch (error) {
        console.error('LoanCalculate error:', error);
        throw error;
    }
}

const CreateTopUpLoanOffer = async (data) => {
    try {
        const {
            checkNumber, // Now mandatory
            existingLoanNumber,
            firstName,
            middleName,
            lastName,
            nin, // Used as external ID
            mobileNo,
            sex,
            dateOfBirth,
            employmentDate,
            bankAccountNumber,
            swiftCode,
            requestedTopUpAmount,
            productCode,
            interestRate,
            tenure,
            processingFee,
            insurance,
            fspCode
        } = data;

        // Validate mandatory check number
        if (!checkNumber) {
            throw new Error('CheckNumber is mandatory for client onboarding');
        }

        console.log('Creating top-up loan offer for:', { checkNumber, existingLoanNumber, nin });

        // 1. Check if client exists, if not create client
        let clientExists = false;
        let clientId = null;
        
        try {
            const clientSearch = await api.get(`/v1/clients?externalId=${nin}`);
            clientExists = clientSearch.status && clientSearch.response && clientSearch.response.length > 0;
            if (clientExists) {
                clientId = clientSearch.response[0].id;
            }
        } catch (error) {
            console.log('Client search failed, will create new client');
        }

        if (!clientExists) {
            console.log('Creating new client in MIFOS...');
            
            // Format phone number with country code 255
            const formattedMobile = mobileNo ? (mobileNo.startsWith('+') ? mobileNo : `+255${mobileNo.replace(/^0/, '')}`) : null;
            
            // Map gender (now configured in MIFOS)
            const genderMapping = { 'M': 1, 'F': 2 }; // M=1, F=2
            const genderId = genderMapping[sex] || null;
            
            // Create client payload with all required fields
            const clientPayload = {
                firstname: firstName,
                lastname: lastName,
                middlename: middleName || '', // Handle missing middle names gracefully
                externalId: nin, // Use NIN as unique external identifier
                dateOfBirth: dateOfBirth, // Ensure YYYY-MM-DD format
                mobileNo: formattedMobile,
                genderId: genderId,
                clientTypeId: 1, // Default to Retail (Position 1)
                officeId: 1, // Head Office
                activationDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
                submittedOnDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
                legalFormId: 1, // Person
                isStaff: false
            };

            const clientResponse = await api.post('/v1/clients', clientPayload);
            if (!clientResponse.status) {
                throw new Error('Failed to create client: ' + JSON.stringify(clientResponse.response));
            }
            
            clientId = clientResponse.response.clientId;
            console.log('✅ Client created successfully:', clientId);
            
            // 2. Add client onboarding datatable data
            // Format employment date to MIFOS expected format: "dd MMMM yyyy"
            const formatEmploymentDate = (dateString) => {
                if (!dateString) return null;
                const date = new Date(dateString);
                const day = date.getDate();
                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                  'July', 'August', 'September', 'October', 'November', 'December'];
                const month = monthNames[date.getMonth()];
                const year = date.getFullYear();
                return `${day} ${month} ${year}`;
            };

            const onboardingData = {
                dateFormat: 'dd MMMM yyyy',
                locale: 'en',
                EmploymentDate: formatEmploymentDate(employmentDate), // Convert to "dd MMMM yyyy" format
                SwiftCode: swiftCode,
                BankAccountNumber: bankAccountNumber,
                CheckNumber: checkNumber // Mandatory field
            };
            
            console.log('Inserting client onboarding data:', onboardingData);
            
            try {
                const datatableResponse = await api.post(`/v1/datatables/client_onboarding/${clientId}`, onboardingData);
                if (datatableResponse.status) {
                    console.log('✅ Client onboarding data inserted successfully');
                } else {
                    console.log('⚠️ Failed to insert onboarding data:', datatableResponse.message);
                    // Don't fail the entire process for datatable issues
                }
            } catch (datatableError) {
                console.log('⚠️ Datatable insertion failed (datatable may not exist yet):', datatableError.message);
                // Continue with the process even if datatable fails
            }
            
        } else {
            console.log('Client already exists with NIN:', nin, 'ID:', clientId);
        }

        // 3. Validate existing loan
        const existingLoanResponse = await api.get(`${API_ENDPOINTS.LOAN}${existingLoanNumber}`);
        if (!existingLoanResponse.status) {
            throw new Error('Existing loan not found in CBS');
        }

        const existingLoan = existingLoanResponse.response;
        console.log('Existing loan found:', existingLoan.id);

        // 4. Get loan product details
        const productResponse = await api.get(`${API_ENDPOINTS.PRODUCT}/${productCode}`);
        if (!productResponse.status) {
            throw new Error('Loan product not found');
        }

        const product = productResponse.response;
        console.log('Product details retrieved:', product.name);

        // 5. Calculate loan schedule
        const principal = requestedTopUpAmount;
        const annualInterestRate = interestRate;
        const numberOfInstallments = tenure;

        const monthlyRate = annualInterestRate / 100 / 12;
        const monthlyInstallment = (principal * monthlyRate * Math.pow(1 + monthlyRate, numberOfInstallments)) / 
                                  (Math.pow(1 + monthlyRate, numberOfInstallments) - 1);

        const totalPayable = monthlyInstallment * numberOfInstallments;
        const totalInterest = totalPayable - principal;

        console.log('Calculated loan terms:', {
            principal,
            monthlyInstallment: monthlyInstallment.toFixed(2),
            totalPayable: totalPayable.toFixed(2),
            totalInterest: totalInterest.toFixed(2)
        });

        // 6. Return offer details
        const offerResult = {
            loanId: `TOPUP_${Date.now()}`,
            offeredAmount: principal,
            monthlyInstallment: monthlyInstallment.toFixed(2),
            totalPayable: totalPayable.toFixed(2),
            interestRate: annualInterestRate,
            tenure: numberOfInstallments,
            processingFee: processingFee,
            insurance: insurance,
            clientCreated: !clientExists,
            clientId: clientId
        };

        console.log('Top-up loan offer created:', offerResult);
        return offerResult;

    } catch (error) {
        console.error('CreateTopUpLoanOffer error:', error);
        throw error;
    }
}


module.exports = {
    LoanCalculate,
    CreateTopUpLoanOffer
}