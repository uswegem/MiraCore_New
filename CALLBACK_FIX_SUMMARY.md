## Callback Failure: SSL/TLS Certificate Verification Issue

### Problem Summary

The callback to `https://gateway.ess.utumishi.go.tz/ess-loans/mvtyztwq/consume` was failing with the following error:

```
❌ Error sending callback: unable to verify the first certificate; if the root CA is installed locally, try running Node.js with --use-system-ca
```

### Root Cause

The Node.js application was making HTTPS requests using axios without configuring proper SSL/TLS certificate verification. While the server had CA certificate bundles available in `/opt/ess/keys/`, the axios HTTP client was not configured to use them.

The environment had:
- `UTUMISHI_CA_BUNDLE_PATH=/opt/ess/keys/utumishi_ca_bundle.pem`
- `THIRD_PARTY_BASE_URL=https://gateway.ess.utumishi.go.tz/ess-loans/mvtyztwq/consume`

But the axios requests were missing:
```javascript
httpsAgent: new https.Agent({
  ca: fs.readFileSync(caBundlePath),
  rejectUnauthorized: true
})
```

### Solution Implemented

Created a centralized **HTTPS Agent Manager** (`/opt/ess/src/utils/httpsAgentManager.js`) that:

1. **Loads the CA bundle** from the configured path
2. **Creates an HTTPS agent** with proper certificate verification enabled
3. **Provides fallback logic** if the CA bundle is not available
4. **Includes connection pooling** for better performance (keepAlive, maxSockets)
5. **Is reusable** across all services making HTTPS requests

### Files Modified

#### 1. **New File: `/opt/ess/src/utils/httpsAgentManager.js`**
   - Initializes HTTPS agent with CA bundle
   - Exports `getHttpsAgent()` function for use across the application
   - Handles missing CA bundles gracefully with fallback

#### 2. **Updated: `/opt/ess/src/utils/callbackUtils.js`**
   - Imported `getHttpsAgent` from httpsAgentManager
   - Passed `httpsAgent: getHttpsAgent()` to axios configuration
   - Removed inline HTTPS agent initialization

#### 3. **Updated: `/opt/ess/src/controllers/loanStatusController.js`**
   - Imported `getHttpsAgent` from httpsAgentManager
   - Added `httpsAgent: getHttpsAgent()` to the axios.post() call
   - Ensures LOAN_STATUS_REQUEST callbacks use proper certificate verification

#### 4. **Updated: `/opt/ess/src/services/thirdPartyService.js`**
   - Imported `getHttpsAgent` from httpsAgentManager
   - Added `httpsAgent: getHttpsAgent()` to axios configuration
   - Ensures all third-party API calls verify SSL certificates properly

### How It Works

The HTTPS Agent Manager follows this sequence:

```
1. Application loads → httpsAgentManager initializes
   ↓
2. Check environment variable UTUMISHI_CA_BUNDLE_PATH
   ↓
3. Load CA certificate from file
   ↓
4. Create https.Agent with:
   - ca: CA certificate content
   - rejectUnauthorized: true (enforce certificate verification)
   - keepAlive: true (connection pooling)
   ↓
5. Return configured agent to axios/https requests
   ↓
6. HTTPS requests now verify against the proper CA certificates
```

### Testing the Fix

To verify the callback now works:

```bash
# Check logs for successful callback
grep "LOAN_INITIAL_APPROVAL_NOTIFICATION" /opt/ess/logs/app-*.log | tail -5

# Look for these messages indicating success:
# ✅ HTTPS agent initialized with CA bundle from: /opt/ess/keys/utumishi_ca_bundle.pem
# 📤 Sending callback:
# 📥 Callback response: (with status 200)
```

### SSL Certificate Chain

The application uses DigiCert certificates:
- `/opt/ess/keys/utumishi_ca_bundle.pem` - Full CA bundle
- `/opt/ess/keys/DigiCertGlobalRootG2.pem` - Root CA
- `/opt/ess/keys/DigiCertGlobalG2TLSRSASHA2562020CA1-1.pem` - Intermediate CA

### Performance Benefits

The solution also improves performance:
- **Connection pooling** (`keepAlive: true`) reuses TCP connections
- **Max sockets** limited to 10 to prevent resource exhaustion
- **Timeout configuration** prevents hanging connections

### Fallback Behavior

If the CA bundle is not found:
1. Logs a warning message
2. Falls back to basic HTTPS agent (without CA verification)
3. Application continues to work but with reduced security
4. Logs clearly indicate the degradation

### Next Steps

1. **Restart the application** for changes to take effect
2. **Monitor logs** for successful callbacks
3. **Verify** that LOAN_OFFER_REQUEST messages are being processed correctly
4. **Test** the full loan flow from request to approval notification

### Environment Variables

Ensure these are set in your `.env`:
```
UTUMISHI_CA_BUNDLE_PATH=/opt/ess/keys/utumishi_ca_bundle.pem
THIRD_PARTY_BASE_URL=https://gateway.ess.utumishi.go.tz/ess-loans/mvtyztwq/consume
NODE_ENV=production (or development)
```

### References

- **Error**: SSL/TLS certificate verification in Node.js
- **Library**: Axios HTTP client with custom HTTPS agent
- **Standard**: RFC 5280 (X.509 Certificate validation)
