const axios = require('axios');
const digitalSignature = require('../utils/signatureUtils');
const { getMessageId } = require('../utils/messageIdGenerator');
const logger = require('../utils/logger');

async function sendToESS(signedXml) {
  const essUrl = process.env.THIRD_PARTY_BASE_URL || 'http://154.118.230.140:9802/ess-loans/mvtyztwq/consume';
  return axios.post(essUrl, signedXml, { 
    headers: { 
      'Content-Type': 'application/xml',
      'Accept': 'application/xml'
    },
    timeout: 30000
  });
}

exports.triggerOutgoingMessage = async (req, res) => {
  try {
    const { Sender = 'ZE DONE', Receiver = 'ESS_UTUMISHI', FSPCode = 'FL8090', MsgId, MessageType, MessageDetails } = req.body;
    
    if (!MessageType || !MessageDetails) {
      return res.status(400).json({ success: false, error: 'MessageType and MessageDetails are required' });
    }
    
    const msgId = MsgId || getMessageId(MessageType);

    // Build data object
    const dataObject = {
      Header: {
        Sender,
        Receiver,
        FSPCode,
        MsgId: msgId,
        MessageType
      },
      MessageDetails: MessageDetails  // Use MessageDetails as provided (object or string)
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
