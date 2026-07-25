## Callback Failure Diagnosis & Fix - Quick Reference

### Issue
Callback to ESS gateway failing with:
```
unable to verify the first certificate
```

### Why It Happened
- Axios was making HTTPS requests without proper SSL certificate configuration
- CA certificate bundle was available but not being used
- Node.js couldn't verify the remote server's certificate

### Quick Validation

#### Check if CA bundle exists:
```bash
ls -la /opt/ess/keys/utumishi_ca_bundle.pem
cat /opt/ess/keys/utumishi_ca_bundle.pem | head -5
```

#### Check environment variable:
```bash
grep UTUMISHI_CA_BUNDLE_PATH /opt/ess/.env
```

#### Verify the fix is in place:
```bash
grep "httpsAgent: getHttpsAgent()" /opt/ess/src/utils/callbackUtils.js
grep "httpsAgent: getHttpsAgent()" /opt/ess/src/controllers/loanStatusController.js
grep "httpsAgent: getHttpsAgent()" /opt/ess/src/services/thirdPartyService.js
```

### How to Test After Fix

1. **Restart the application:**
   ```bash
   npm restart  # or supervisorctl restart ess-app
   ```

2. **Monitor logs for success:**
   ```bash
   tail -f /opt/ess/logs/app-*.log | grep -E "HTTPS agent|LOAN_INITIAL_APPROVAL|Callback response"
   ```

3. **Expected log messages:**
   ```
   ✅ HTTPS agent initialized with CA bundle from: /opt/ess/keys/utumishi_ca_bundle.pem
   📤 Sending callback: (message details)
   📥 Callback response: {"status": 200, "statusText": "OK"}
   ```

4. **Check for errors (should NOT appear):**
   ```bash
   grep "unable to verify the first certificate" /opt/ess/logs/*.log
   ```

### Files Changed

| File | Change |
|------|--------|
| `src/utils/httpsAgentManager.js` | **NEW** - Central HTTPS agent management |
| `src/utils/callbackUtils.js` | Updated to use getHttpsAgent() |
| `src/controllers/loanStatusController.js` | Updated to use getHttpsAgent() |
| `src/services/thirdPartyService.js` | Updated to use getHttpsAgent() |

### Troubleshooting

**If still seeing certificate errors:**
1. Verify CA bundle path is correct
2. Check CA bundle file is readable by the Node.js process
3. Ensure environment variable is set correctly
4. Check file permissions: `chmod 644 /opt/ess/keys/utumishi_ca_bundle.pem`

**If callbacks work but performance is slow:**
- Check connection pooling is enabled (should be)
- Monitor network connectivity to `gateway.ess.utumishi.go.tz`
- Check DNS resolution: `dig gateway.ess.utumishi.go.tz`

**If you see "CA bundle not found" warning:**
1. Verify path in `.env` matches the file location
2. Create symlink if file moved: `ln -s /new/path /opt/ess/keys/utumishi_ca_bundle.pem`
3. Check file wasn't deleted: `find /opt/ess/keys -name "*ca*" -o -name "*bundle*"`

### Performance Metrics

After the fix, you should see:
- **Connection reuse**: Multiple requests using same TCP connection
- **Reduced latency**: ~200ms per callback (down from timeouts)
- **No SSL renegotiation**: Certificate verified once per connection
- **Proper keep-alive**: Connections held open for 30 seconds

### Additional Notes

- Fix applies to ALL HTTPS callbacks (not just LOAN_INITIAL_APPROVAL)
- Connection pooling helps with high-volume loan processing
- Fallback agent maintains compatibility if CA bundle becomes unavailable
- All certificate verification is enforced (`rejectUnauthorized: true`)

### Support

For issues, check:
1. Application logs: `/opt/ess/logs/app-*.log`
2. Error logs: `/opt/ess/logs/error-*.log`
3. Certificate validity: `openssl x509 -in /opt/ess/keys/utumishi_ca_bundle.pem -text -noout`
