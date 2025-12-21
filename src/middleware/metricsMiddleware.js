const promClient = require('prom-client');

// Create a Registry to register metrics
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({
    register,
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
    prefix: 'nodejs_'
});

// Custom metrics for ESS application
const httpRequestDuration = new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
});

const httpRequestsTotal = new promClient.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code']
});

const loanMessagesTotal = new promClient.Counter({
    name: 'loan_messages_total',
    help: 'Total number of loan messages processed',
    labelNames: ['message_type', 'status']
});

const loanErrorsTotal = new promClient.Counter({
    name: 'loan_errors_total',
    help: 'Total number of loan processing errors',
    labelNames: ['error_type', 'message_type']
});

const databaseQueriesTotal = new promClient.Counter({
    name: 'database_queries_total',
    help: 'Total number of database queries',
    labelNames: ['operation', 'table']
});

const processMemoryUsage = new promClient.Gauge({
    name: 'process_memory_usage',
    help: 'Process memory usage in bytes'
});

const processCpuUsage = new promClient.Gauge({
    name: 'process_cpu_usage',
    help: 'Process CPU usage percentage'
});

const activeHandles = new promClient.Gauge({
    name: 'nodejs_active_handles_total',
    help: 'Total number of active handles'
});

const pm2Instances = new promClient.Gauge({
    name: 'pm2_instances',
    help: 'Number of PM2 instances running'
});

const logLevelTotal = new promClient.Counter({
    name: 'log_level_total',
    help: 'Total number of logs by level',
    labelNames: ['level', 'service']
});



// Register custom metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);
register.registerMetric(loanMessagesTotal);
register.registerMetric(loanErrorsTotal);
register.registerMetric(databaseQueriesTotal);
register.registerMetric(processMemoryUsage);
register.registerMetric(processCpuUsage);
register.registerMetric(activeHandles);
register.registerMetric(pm2Instances);
register.registerMetric(logLevelTotal);


// Middleware to track HTTP requests
const httpMetricsMiddleware = (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        const route = req.route ? req.route.path : req.path;
        
        httpRequestDuration
            .labels(req.method, route, res.statusCode.toString())
            .observe(duration);
            
        httpRequestsTotal
            .labels(req.method, route, res.statusCode.toString())
            .inc();
    });
    
    next();
};

// Function to track loan messages
const trackLoanMessage = (messageType, status = 'success') => {
    // Validate inputs to prevent Prometheus label errors
    const safeMessageType = (typeof messageType === 'string' && messageType.trim()) ? messageType.trim() : 'unknown';
    const safeStatus = (typeof status === 'string' && status.trim()) ? status.trim() : 'unknown';

    try {
        loanMessagesTotal
            .labels(safeMessageType, safeStatus)
            .inc();
    } catch (error) {
        logger.error('Error tracking loan message:', { error: error.message, messageType, status });
    }
};

// Function to track loan errors
const trackLoanError = (errorType, messageType) => {
    // Validate inputs to prevent Prometheus label errors
    const safeErrorType = (typeof errorType === 'string' && errorType.trim()) ? errorType.trim() : 'unknown_error';
    const safeMessageType = (typeof messageType === 'string' && messageType.trim()) ? messageType.trim() : 'unknown';

    try {
        loanErrorsTotal
            .labels(safeErrorType, safeMessageType)
            .inc();
    } catch (error) {
        logger.error('Error tracking loan error:', { error: error.message, errorType, messageType });
    }
};

// Function to track database queries
const trackDatabaseQuery = (operation, table) => {
    databaseQueriesTotal
        .labels(operation, table)
        .inc();
};

// Function to track log levels
const trackLogLevel = (level, service = 'ess-app') => {
    logLevelTotal
        .labels(level, service)
        .inc();
};

// Variables for CPU calculation
let previousCpuUsage = process.cpuUsage();
let previousTime = Date.now();

// Function to update system metrics
const updateSystemMetrics = () => {
    const memUsage = process.memoryUsage();
    processMemoryUsage.set(memUsage.rss);
    
    // Proper CPU usage percentage calculation
    const currentTime = Date.now();
    const currentCpuUsage = process.cpuUsage();
    
    // Calculate elapsed time in microseconds
    const elapsedTime = (currentTime - previousTime) * 1000; // Convert to microseconds
    
    // Calculate CPU time used in microseconds
    const cpuTimeUsed = (currentCpuUsage.user - previousCpuUsage.user) + 
                       (currentCpuUsage.system - previousCpuUsage.system);
    
    // Calculate CPU percentage (0-100)
    const cpuPercentage = (cpuTimeUsed / elapsedTime) * 100;
    
    // Set the percentage (bounded between 0 and 100)
    processCpuUsage.set(Math.min(Math.max(cpuPercentage, 0), 100));
    
    // Update previous values for next calculation
    previousCpuUsage = currentCpuUsage;
    previousTime = currentTime;
    
    // Active handles
    if (process._getActiveHandles) {
        activeHandles.set(process._getActiveHandles().length);
    }
};

// Update system metrics every 30 seconds (skip in test mode)
if (process.env.NODE_ENV !== 'test') {
    setInterval(updateSystemMetrics, 30000);
}

// Metrics endpoint
const metricsHandler = async (req, res) => {
    try {
        res.set('Content-Type', register.contentType);
        const metrics = await register.metrics();
        res.end(metrics);
    } catch (error) {
        res.status(500).end(error);
    }
};

module.exports = {
    httpMetricsMiddleware,
    metricsHandler,
    trackLoanMessage,
    trackLoanError,
    trackDatabaseQuery,
    trackLogLevel,
    register
};