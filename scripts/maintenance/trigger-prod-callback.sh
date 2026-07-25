#!/bin/bash

echo "��� Triggering Production Callback via ESS Application"
echo "=" 

# Check production server PM2 logs for recent callback attempts
echo "��� Checking recent production callback activity..."
ssh miracore "cd /home/uswege/ess && pm2 logs ess-app --lines 50 | grep -E 'LOAN_FINAL_APPROVAL_NOTIFICATION|LOAN_INITIAL_APPROVAL_NOTIFICATION|ResponseCode|callback|UTUMISHI' | tail -10"

echo -e "\n��� Checking production certificate hash (for reference)..."
ssh miracore "openssl x509 -in /home/uswege/ess/keys/certificate.crt -noout -modulus | openssl md5"

echo -e "\n��� Testing production network connectivity to UTUMISHI..."
ssh miracore "curl -I -m 10 https://gateway.ess.utumishi.go.tz/ess-loans/mvtyztwq/consume 2>/dev/null | head -1 || echo 'Connection test failed'"

echo -e "\n��� To trigger actual production callback:"
echo "1. Process a real loan application through the ESS system"
echo "2. Or check PM2 logs: ssh miracore 'pm2 logs ess-app --lines 100 | grep callback'"
echo "3. Production callbacks are automatically sent after loan processing"
