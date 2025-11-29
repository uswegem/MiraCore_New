const axios = require('axios');
const digitalSignature = require('../utils/signatureUtils');
const xml2js = require('xml2js');
const { getMessageId } = require('../utils/messageIdGenerator');

// Helper to build the XML payload
function buildLoanStatusRequestXML({ Sender, Receiver, FSPCode, MsgId, ApplicationNumber }) {
  return `<Document>
  <Data>
    <Header>
      <Sender>${Sender}</Sender>
      <Receiver>${Receiver}</Receiver>
      <FSPCode>${FSPCode}</FSPCode>
      <MsgId>${MsgId}</MsgId>
      <MessageType>LOAN_STATUS_REQUEST</MessageType>
    </Header>
    <MessageDetails>
      <ApplicationNumber>${ApplicationNumber}</ApplicationNumber>
    </MessageDetails>
  </Data>
  <Signature>{{signature}}</Signature>
</Document>`;
}

// Main controller function
exports.triggerLoanStatusRequest = async (req, res) => {
  try {
    // Get parameters from request body
    const { Sender = 'ZE DONE', Receiver = 'ESS_UTUMISHI', FSPCode = 'FL8090', ApplicationNumber } = req.body;
    const MsgId = req.body.MsgId || getMessageId('LOAN_STATUS_REQUEST');
    if (!ApplicationNumber) {
      return res.status(400).json({ success: false, error: 'ApplicationNumber is required' });
    }

    // Build XML without signature
    const xmlPayload = buildLoanStatusRequestXML({ Sender, Receiver, FSPCode, MsgId, ApplicationNumber });

    // Parse XML to object for signing
    const parser = new xml2js.Parser({ explicitArray: false });
    const parsedXml = await parser.parseStringPromise(xmlPayload.replace('<Signature>{{signature}}</Signature>', ''));
    const dataToSign = parsedXml.Document.Data;
    const signature = digitalSignature.generateSignature(
      new xml2js.Builder({ renderOpts: { pretty: false } }).buildObject({ Data: dataToSign })
    ).trim();

    // Insert signature into XML
    const signedXml = xmlPayload.replace('{{signature}}', signature);

    // Send to ESS endpoint
    const essUrl = 'http://154.118.230.140:9802/ess-loans/mvtyztwq/consume';
    const essResponse = await axios.post(essUrl, signedXml, {
      headers: { 'Content-Type': 'application/xml' }
    });

    // Return ESS response
    res.status(200).json({ success: true, sent: signedXml, essResponse: essResponse.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
