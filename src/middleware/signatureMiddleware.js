const digitalSignature = require('../utils/signatureUtils');

function verifySignatureMiddleware(req, res, next) {
  console.log('Signature Middleware - Option 2 (Auto-generate)');
  console.log('Request path:', req.path);
  console.log('Content-Type:', req.get('Content-Type'));

  // Skip for health check
  if (req.path === '/health' || !req.path.includes('/emkopo')) {
    return next();
  }

  // Check if it's an XML request
  const contentType = req.get('Content-Type');
  const isXmlRequest = contentType && (
    contentType.includes('application/xml') || 
    contentType.includes('text/xml')
  );

  if (!isXmlRequest) {
    console.log('❌ Not an XML request');
    return res.status(400).json({
      responseCode: '8001',
      description: 'Content-Type must be application/xml'
    });
  }

  const xmlData = req.body;
  console.log('XML data length:', xmlData ? xmlData.length : 0);

  if (!xmlData || xmlData.trim().length === 0) {
    console.log('❌ Empty XML data');
    return res.status(400).json({
      responseCode: '8009',
      description: 'XML data is required'
    });
  }

  // ========== OPTION 2: AUTO-GENERATE MODE ==========
  // Just parse the XML to ensure it's valid, but don't verify signature
  // since frontend sends unsigned XML and backend will auto-sign it
  
  const xml2js = require('xml2js');
  const parser = new xml2js.Parser({
    explicitArray: false,
    mergeAttrs: true
  });

  parser.parseString(xmlData, (err, result) => {
    if (err) {
      console.error('❌ Invalid XML format:', err.message);
      return res.status(400).json({
        responseCode: '8001',
        description: 'Invalid XML format: ' + err.message
      });
    }

    console.log('✅ XML is valid, proceeding with auto-signature generation');
    
    // Attach parsed data to request
    req.parsedXmlData = result;
    next();
  });
}

module.exports = {
  verifySignatureMiddleware
};