const axios = require('axios');
const digitalSignature = require('../utils/signatureUtils');
const xml2js = require('xml2js');
const { getMessageId } = require('../utils/messageIdGenerator');

function buildOutgoingXML({ Sender, Receiver, FSPCode, MsgId, MessageType, MessageDetails }) {
  return `<Document>
  <Data>
    <Header>
      <Sender>${Sender}</Sender>
      <Receiver>${Receiver}</Receiver>
      <FSPCode>${FSPCode}</FSPCode>
      <MsgId>${MsgId}</MsgId>
      <MessageType>${MessageType}</MessageType>
    </Header>
    <MessageDetails>${MessageDetails}</MessageDetails>
  </Data>
  <Signature>{{signature}}</Signature>
</Document>`;
}

async function sendToESS(signedXml) {
  const essUrl = 'http://154.118.230.140:9802/ess-loans/mvtyztwq/consume';
  return axios.post(essUrl, signedXml, { headers: { 'Content-Type': 'application/xml' } });
}

exports.triggerOutgoingMessage = async (req, res) => {
  try {
    const { Sender = 'ZE DONE', Receiver = 'ESS_UTUMISHI', FSPCode = 'FL8090', MsgId, MessageType, MessageDetails } = req.body;
    if (!MessageType || !MessageDetails) {
      return res.status(400).json({ success: false, error: 'MessageType and MessageDetails are required' });
    }
    const msgId = MsgId || getMessageId(MessageType);
    const xmlPayload = buildOutgoingXML({ Sender, Receiver, FSPCode, MsgId: msgId, MessageType, MessageDetails });
    const parser = new xml2js.Parser({ explicitArray: false });
    const parsedXml = await parser.parseStringPromise(xmlPayload.replace('<Signature>{{signature}}</Signature>', ''));
    const dataToSign = parsedXml.Document.Data;
    const signature = digitalSignature.generateSignature(
      new xml2js.Builder({ renderOpts: { pretty: false } }).buildObject({ Data: dataToSign })
    ).trim();
    const signedXml = xmlPayload.replace('{{signature}}', signature);
    const essResponse = await sendToESS(signedXml);
    res.status(200).json({ success: true, sent: signedXml, essResponse: essResponse.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
