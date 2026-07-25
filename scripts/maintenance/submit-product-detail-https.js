const fs = require('fs');
const https = require('https');
const xml2js = require('xml2js');
const axios = require('axios');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const digitalSignature = require('../../src/utils/signatureUtils');

const PREVIEW_XML_PATH = '/opt/ess/generated-documents/PRODUCT_DETAIL_preview.xml';
const SIGNED_XML_PATH = '/opt/ess/generated-documents/PRODUCT_DETAIL_signed.xml';
const RESPONSE_PATH = '/opt/ess/generated-documents/PRODUCT_DETAIL_submit_response_https.txt';
const URL = process.env.UTUMISHI_HTTPS_URL || 'https://gateway.ess.utumishi.go.tz/ess-loans/mvtyztwq/consume';
const CA_BUNDLE_PATH = process.env.UTUMISHI_CA_BUNDLE_PATH || '/etc/ssl/certs/ca-certificates.crt';

function buildStrictAgent() {
  const agentOptions = { rejectUnauthorized: true };

  if (CA_BUNDLE_PATH && fs.existsSync(CA_BUNDLE_PATH)) {
    agentOptions.ca = fs.readFileSync(CA_BUNDLE_PATH);
  }

  return new https.Agent(agentOptions);
}

async function submit(agent, modeLabel) {
  const rawXml = fs.readFileSync(PREVIEW_XML_PATH, 'utf8');
  const parser = new xml2js.Parser({ explicitArray: false, trim: true });
  const parsed = await parser.parseStringPromise(rawXml);
  const dataObj = parsed?.Document?.Data;
  if (!dataObj) throw new Error('Invalid preview XML: missing Document.Data');

  const signedXml = digitalSignature.createSignedXML(dataObj);
  fs.writeFileSync(SIGNED_XML_PATH, signedXml);

  const response = await axios.post(URL, signedXml, {
    headers: {
      'Content-Type': 'application/xml',
      Accept: 'application/xml'
    },
    timeout: 45000,
    validateStatus: () => true,
    httpsAgent: agent
  });

  const body = typeof response.data === 'string'
    ? response.data
    : JSON.stringify(response.data, null, 2);

  fs.writeFileSync(
    RESPONSE_PATH,
    `URL=${URL}\nMODE=${modeLabel}\nSTATUS=${response.status}\n\n${body}`
  );

  return { status: response.status, body };
}

(async () => {
  try {
    const strictAgent = buildStrictAgent();
    const modeLabel = fs.existsSync(CA_BUNDLE_PATH)
      ? `strict_tls_with_ca_bundle:${CA_BUNDLE_PATH}`
      : 'strict_tls_default_trust_store';
    const result = await submit(strictAgent, modeLabel);
    console.log(`STATUS=${result.status}`);
    console.log(`RESPONSE_FILE=${RESPONSE_PATH}`);
    process.exit(0);
  } catch (error) {
    const allowInsecureFallback = process.env.ALLOW_INSECURE_TLS_FALLBACK === 'true';
    if (!allowInsecureFallback) {
      fs.writeFileSync(
        RESPONSE_PATH,
        `ERROR=${error.message}` +
          `\n\nStrict TLS failed.` +
          `\n- Ensure UTUMISHI_CA_BUNDLE_PATH points to a valid CA bundle.` +
          `\n- Current UTUMISHI_CA_BUNDLE_PATH=${CA_BUNDLE_PATH}` +
          `\n- Set ALLOW_INSECURE_TLS_FALLBACK=true only as temporary last resort.`
      );
      console.error(`ERROR=${error.message}`);
      console.error(`RESPONSE_FILE=${RESPONSE_PATH}`);
      process.exit(1);
    }

    try {
      const insecureAgent = new https.Agent({ rejectUnauthorized: false });
      const result = await submit(insecureAgent, 'insecure_tls_fallback');
      console.log(`STATUS=${result.status}`);
      console.log(`RESPONSE_FILE=${RESPONSE_PATH}`);
      process.exit(0);
    } catch (secondError) {
      fs.writeFileSync(RESPONSE_PATH, `ERROR=${secondError.message}`);
      console.error(`ERROR=${secondError.message}`);
      console.error(`RESPONSE_FILE=${RESPONSE_PATH}`);
      process.exit(1);
    }
  }
})();
