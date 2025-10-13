const crypto = require('crypto');
const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

class DigitalSignature {
  constructor() {
    this.privateKey = null;
    this.publicKey = null;
    this.certificate = null;
    this.loadKeys();
  }

  loadKeys() {
    try {
      // Load CA-provided certificate (ESS provides this)
      const certPath = process.env.CERTIFICATE_PATH || path.join(__dirname, '../../keys/fspNameCertificate.crt');
      if (fs.existsSync(certPath)) {
        this.certificate = fs.readFileSync(certPath, 'utf8');
        console.log('✅ FSP Certificate loaded from:', certPath);
        
        // Extract public key from certificate
        this.extractPublicKeyFromCertificate();
        
        // Validate certificate
        this.validateCertificate();
      } else {
        console.log('❌ FSP Certificate not found at:', certPath);
        console.log('💡 You need to obtain fspNameCertificate.crt from ESS/CA');
      }

      // Load private key (you generate this during certificate request)
      const privateKeyPath = process.env.PRIVATE_KEY_PATH || path.join(__dirname, '../../keys/private.pem');
      if (fs.existsSync(privateKeyPath)) {
        this.privateKey = fs.readFileSync(privateKeyPath, 'utf8');
        console.log('✅ Private key loaded from:', privateKeyPath);
        this.validatePrivateKey();
      } else {
        console.log('❌ Private key not found at:', privateKeyPath);
        console.log('💡 Generate private key using: openssl genrsa -out private.pem 2048');
      }

    } catch (error) {
      console.error('❌ Error loading keys:', error);
    }
  }

  validatePrivateKey() {
    try {
      // Try to use the private key to ensure it's valid
      const testSign = crypto.createSign('SHA256');
      testSign.update('test');
      testSign.end();
      testSign.sign(this.privateKey, 'base64');
      console.log('✅ Private key validation: PASSED');
    } catch (error) {
      console.error('❌ Private key validation: FAILED -', error.message);
    }
  }

  extractPublicKeyFromCertificate() {
    try {
      const pki = forge.pki;
      const cert = pki.certificateFromPem(this.certificate);
      this.publicKey = pki.publicKeyToPem(cert.publicKey);
      console.log('✅ Public key extracted from FSP certificate');
    } catch (error) {
      console.error('❌ Failed to extract public key from certificate:', error);
    }
  }

  validateCertificate() {
    try {
      const pki = forge.pki;
      const cert = pki.certificateFromPem(this.certificate);
      
      console.log('📜 FSP Certificate Information:');
      console.log('   Subject:', cert.subject.attributes.map(attr => `${attr.name}=${attr.value}`).join(', '));
      console.log('   Issuer:', cert.issuer.attributes.map(attr => `${attr.name}=${attr.value}`).join(', '));
      console.log('   Valid From:', cert.validity.notBefore);
      console.log('   Valid To:', cert.validity.notAfter);
      console.log('   Serial Number:', cert.serialNumber);
      
      // Check if certificate is valid
      const now = new Date();
      if (now < cert.validity.notBefore) {
        console.warn('⚠️  Certificate not yet valid');
      } else if (now > cert.validity.notAfter) {
        console.warn('⚠️  Certificate has expired');
      } else {
        console.log('✅ Certificate validity: PASSED');
      }
    } catch (error) {
      console.error('❌ Certificate validation failed:', error);
    }
  }

  /**
   * Generate SHA256withRSA signature as per e-MKOPO specification
   */
  generateSignature(xmlData) {
    if (!this.privateKey) {
      throw new Error('Private key not available for signing');
    }

    try {
      console.log('🔐 Generating SHA256withRSA signature...');
      
      // Normalize XML for consistent signing
      const cleanXml = this.normalizeXMLForSigning(xmlData);
      console.log('Data to sign length:', cleanXml.length, 'characters');
      
      // Create sign object with SHA256
      const sign = crypto.createSign('SHA256');
      sign.update(cleanXml, 'utf8');
      sign.end();

      // Generate signature with RSA
      const signature = sign.sign({
        key: this.privateKey,
        padding: crypto.constants.RSA_PKCS1_PADDING
      }, 'base64');

      console.log('✅ Signature generated');
      console.log('   Signature length:', signature.length, 'characters');
      
      return signature;
    } catch (error) {
      console.error('❌ Error generating signature:', error);
      throw new Error('Failed to generate digital signature: ' + error.message);
    }
  }

  /**
   * Normalize XML for consistent signing
   */
  normalizeXMLForSigning(xmlData) {
    // Remove the Signature element if it exists
    let cleanXml = xmlData.replace(/<Signature>.*?<\/Signature>/s, '');
    
    // Normalize whitespace
    cleanXml = cleanXml
      .replace(/>\s+</g, '><')
      .replace(/\s+/g, ' ')
      .trim();
    
    return cleanXml;
  }

  /**
   * Extract the Data element from XML for signing
   */
  extractDataElement(xmlData) {
    try {
      const startTag = '<Data>';
      const endTag = '</Data>';
      const startIndex = xmlData.indexOf(startTag);
      const endIndex = xmlData.indexOf(endTag);

      if (startIndex === -1 || endIndex === -1) {
        throw new Error('Data element not found in XML');
      }

      const dataElement = xmlData.substring(startIndex, endIndex + endTag.length);
      console.log('📄 Extracted Data element for signing');
      
      return dataElement;
    } catch (error) {
      console.error('❌ Error extracting Data element:', error);
      throw new Error('Invalid XML structure for signing');
    }
  }

  /**
   * Create signed XML payload according to e-MKOPO specification
   */
  createSignedXML(dataObject) {
    const xml2js = require('xml2js');
    const builder = new xml2js.Builder({
      rootName: 'Document',
      renderOpts: { 
        pretty: false,
        indent: '',
        newline: ''
      },
      xmldec: {
        version: '1.0',
        encoding: 'UTF-8',
        standalone: true
      }
    });

    console.log('📝 Building signed XML payload...');
    
    // Build XML without signature first
    const tempDoc = {
      Data: dataObject
    };
    
    const xmlWithoutSignature = builder.buildObject(tempDoc);
    
    // Extract just the Data element for signing
    const dataElement = this.extractDataElement(xmlWithoutSignature);
    
    // Generate signature for the Data part ONLY
    const signature = this.generateSignature(dataElement);
    
    // Build final XML with signature
    const finalDoc = {
      Data: dataObject,
      Signature: signature
    };

    const signedXml = builder.buildObject(finalDoc);
    console.log('✅ Signed XML created successfully');
    
    return signedXml;
  }

  /**
   * Get certificate information for debugging
   */
  getCertificateInfo() {
    if (!this.certificate) return null;
    
    try {
      const pki = forge.pki;
      const cert = pki.certificateFromPem(this.certificate);
      
      return {
        subject: cert.subject.attributes,
        issuer: cert.issuer.attributes,
        validFrom: cert.validity.notBefore,
        validTo: cert.validity.notAfter,
        serialNumber: cert.serialNumber
      };
    } catch (error) {
      console.error('Error reading certificate info:', error);
      return null;
    }
  }
}

// Create singleton instance
const digitalSignature = new DigitalSignature();

module.exports = digitalSignature;