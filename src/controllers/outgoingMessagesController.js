const axios = require('axios');
const digitalSignature = require('../utils/signatureUtils');
const { getMessageId } = require('../utils/messageIdGenerator');
const logger = require('../utils/logger');
const xml2js = require('xml2js');
const { getHttpsAgent } = require('../utils/httpsAgentManager');
const { formatDateForUTUMISHI, formatDateTimeForUTUMISHI } = require('../utils/dateUtils');

const DATE_TIME_FIELDS = new Set([
  'DisbursementDate',
  'FinalPaymentDate',
  'LastDeductionDate',
  'LastPayDate',
  'EndDate',
  'ValidityDate',
  'LastRepaymentDate',
  'MaturityDate',
  'DeductionEndDate',
  'FSP1FinalPaymentDate',
  'PaymentDate',
  'PayDate',
  'StopDate'
]);

const DATE_ONLY_FIELDS = new Set([
  'TCEffectiveDate',
  'EmploymentDate',
  'ConfirmationDate',
  'ContractStartDate',
  'ContractEndDate',
  'PayrollDate',
  'CheckDate'
]);

function normalizeMessageDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return details;
  }

  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => {
      if (value == null) {
        return [key, value];
      }

      if (DATE_TIME_FIELDS.has(key)) {
        return [key, formatDateTimeForUTUMISHI(value) || value];
      }

      if (DATE_ONLY_FIELDS.has(key)) {
        return [key, formatDateForUTUMISHI(value) || value];
      }

      if (typeof value === 'object' && !Array.isArray(value)) {
        return [key, normalizeMessageDetails(value)];
      }

      return [key, value];
    })
  );
}

async function sendToESS(signedXml) {
  const essUrl = process.env.THIRD_PARTY_BASE_URL || 'https://gateway.ess.utumishi.go.tz/ess-loans/mvtyztwq/consume';
  return axios.post(essUrl, signedXml, { 
    headers: { 
      'Content-Type': 'application/xml',
      'Accept': 'application/xml'
    },
    timeout: 30000,
    httpsAgent: getHttpsAgent()
  });
}

exports.triggerOutgoingMessage = async (req, res) => {
  try {
    const { Sender = 'ZE DONE', Receiver = 'ESS_UTUMISHI', FSPCode = 'FL8090', MsgId, MessageType, MessageDetails } = req.body;
    
    if (!MessageType || !MessageDetails) {
      return res.status(400).json({ success: false, error: 'MessageType and MessageDetails are required' });
    }
    
    const msgId = MsgId || getMessageId(MessageType);

    // Parse MessageDetails if it's a string (XML fragment)
    let parsedMessageDetails = MessageDetails;
    if (typeof MessageDetails === 'string' && MessageDetails.trim().startsWith('<')) {
      try {
        // Wrap in a root element for parsing
        const wrappedXml = `<MessageDetails>${MessageDetails}</MessageDetails>`;
        const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
        const result = await parser.parseStringPromise(wrappedXml);
        parsedMessageDetails = result.MessageDetails;
        logger.info('📝 Parsed MessageDetails from XML string to object');
      } catch (parseError) {
        logger.error('❌ Failed to parse MessageDetails XML string:', parseError.message);
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid MessageDetails XML format: ' + parseError.message 
        });
      }
    }

    parsedMessageDetails = normalizeMessageDetails(parsedMessageDetails);

    // Build data object
    const dataObject = {
      Header: {
        Sender,
        Receiver,
        FSPCode,
        MsgId: msgId,
        MessageType
      },
      MessageDetails: parsedMessageDetails
    };

    logger.info('Building outgoing message:', MessageType);

    // Use createSignedXML for proper signature generation
    const signedXml = digitalSignature.createSignedXML(dataObject);

    logger.info('Message signed successfully, sending to ESS...');

    const essResponse = await sendToESS(signedXml);
    
    logger.info('ESS Response received:', essResponse.status);

    res.status(200).json({ success: true, sent: signedXml, essResponse: essResponse.data });
  } catch (error) {
    logger.error('Error sending outgoing message:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};
