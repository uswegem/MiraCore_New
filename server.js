const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
dotenv.config();
// Import routes
const apiRouter = require('./src/routes/api');
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const auditRoutes = require('./src/routes/audit');

// Import middleware
const { verifySignatureMiddleware } = require('./src/middleware/signatureMiddleware');
const { auditMiddleware } = require('./src/middleware/authMiddleware');

// Import database
const connectDB = require('./src/config/database');

console.log('=== SERVER STARTING AT', new Date().toISOString(), '===');

// Clear require cache for development
delete require.cache[require.resolve('./src/services/loanService')];



const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// ========== MIDDLEWARE ORDER ==========

// 1. Security middleware
app.use(helmet());
app.use(cors());

// 2. Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use(limiter);

// 3. Body parsing middleware for both XML and JSON
app.use(express.raw({ 
    type: ['application/xml', 'text/xml'],
    limit: '10mb'
}));

app.use(express.json({ 
    limit: '10mb'
}));

app.use(express.text({ 
    type: ['text/plain'],
    limit: '10mb'
}));

// 4. Custom content-type middleware
app.use((req, res, next) => {
    const contentType = req.headers['content-type'];
    
    console.log('📨 Incoming Request:');
    console.log('   Method:', req.method);
    console.log('   Path:', req.path);
    console.log('   Content-Type:', contentType);
    console.log('   Body type:', typeof req.body);
    
    // Handle XML content
    if (contentType && (contentType.includes('application/xml') || contentType.includes('text/xml'))) {
        if (Buffer.isBuffer(req.body)) {
            // Convert buffer to string for XML
            req.body = req.body.toString('utf8');
            console.log('   📝 Converted buffer to XML string');
        }
    }
    
    next();
});

// 5. Debug middleware
app.use((req, res, next) => {
    console.log('=== INCOMING REQUEST ===');
    console.log('Method:', req.method);
    console.log('Path:', req.path);
    console.log('Content-Type:', req.get('Content-Type'));
    console.log('Body exists:', !!req.body);
    
    if (req.body) {
        if (typeof req.body === 'string') {
            console.log('Body type: XML/String');
            console.log('Body length:', req.body.length);
            console.log('Body sample:', req.body.substring(0, 200));
        } else if (typeof req.body === 'object') {
            console.log('Body type: JSON/Object');
            console.log('Body keys:', Object.keys(req.body));
            console.log('Body sample:', JSON.stringify(req.body).substring(0, 200));
        }
    }
    console.log('========================');
    next();
});

// 6. Audit middleware for all routes
app.use(auditMiddleware);

// 7. Signature verification for XML endpoints
app.use(verifySignatureMiddleware);

// ========== ROUTES ==========

// Authentication routes
app.use('/api/v1/auth', authRoutes);

// User management routes (protected)
app.use('/api/v1/users', userRoutes);

// Audit routes (protected)
app.use('/api/v1/audit', auditRoutes);

// Miracore API routes
app.use('/api', apiRouter);

// Health check endpoint (supports both JSON and XML)
app.get('/health', (req, res) => {
    const acceptHeader = req.get('Accept');
    const responseData = { 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'Miracore Backend',
        database: 'Connected',
        environment: process.env.NODE_ENV || 'development'
    };

    // Return XML if client prefers XML, otherwise JSON
    if (acceptHeader && acceptHeader.includes('application/xml')) {
        const xml2js = require('xml2js');
        const builder = new xml2js.Builder({
            rootName: 'HealthResponse',
            renderOpts: { pretty: true }
        });
        
        const xmlResponse = builder.buildObject(responseData);
        res.set('Content-Type', 'application/xml');
        res.send(xmlResponse);
    } else {
        res.json(responseData);
    }
});

// Test endpoint for both XML and JSON
app.post('/api/v1/test', (req, res) => {
    const contentType = req.get('Content-Type');
    const acceptHeader = req.get('Accept');
    
    console.log('Test endpoint called:');
    console.log('   Content-Type:', contentType);
    console.log('   Accept:', acceptHeader);
    console.log('   Body type:', typeof req.body);
    
    const responseData = {
        message: 'Request received successfully',
        contentType: contentType,
        bodyType: typeof req.body,
        timestamp: new Date().toISOString()
    };

    // Return response in same format as request, or JSON by default
    if (acceptHeader && acceptHeader.includes('application/xml')) {
        const xml2js = require('xml2js');
        const builder = new xml2js.Builder({
            rootName: 'TestResponse',
            renderOpts: { pretty: true }
        });
        
        const xmlResponse = builder.buildObject(responseData);
        res.set('Content-Type', 'application/xml');
        res.send(xmlResponse);
    } else {
        res.json(responseData);
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    
    const acceptHeader = req.get('Accept');
    
    if (acceptHeader && acceptHeader.includes('application/xml')) {
        const xml2js = require('xml2js');
        const builder = new xml2js.Builder({
            rootName: 'ErrorResponse',
            renderOpts: { pretty: true }
        });
        
        const errorResponse = builder.buildObject({
            success: false,
            message: 'Internal server error',
            timestamp: new Date().toISOString()
        });
        
        res.set('Content-Type', 'application/xml');
        res.status(500).send(errorResponse);
    } else {
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// 404 handler
app.use('*', (req, res) => {
    const acceptHeader = req.get('Accept');
    
    if (acceptHeader && acceptHeader.includes('application/xml')) {
        const xml2js = require('xml2js');
        const builder = new xml2js.Builder({
            rootName: 'ErrorResponse',
            renderOpts: { pretty: true }
        });
        
        const errorResponse = builder.buildObject({
            success: false,
            message: 'Endpoint not found',
            timestamp: new Date().toISOString()
        });
        
        res.set('Content-Type', 'application/xml');
        res.status(404).send(errorResponse);
    } else {
        res.status(404).json({
            success: false,
            message: 'Endpoint not found'
        });
    }
});

app.listen(PORT, () => {
    console.log(`Miracore Backend running on port ${PORT}`);
    console.log(`Supports: XML & JSON`);
    console.log(`Authentication: Enabled`);
    console.log(`Database: MongoDB`);
    console.log(`Initial Super Admin: superadmin / SuperAdmin123!`);
    console.log(`Digital signature: ${process.env.PRIVATE_KEY_PATH ? 'Enabled' : 'Disabled'}`);
});