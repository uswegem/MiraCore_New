module.exports = {
  apps: [{
    name: 'ess-app',
    script: 'server.js',
    instances: 'max', // Use all CPU cores (2 vCPU = 2 instances)
    exec_mode: 'cluster', // Changed from 'fork' for load balancing
    autorestart: true,
    watch: false,
    time: true,
    env_production: {
      NODE_ENV: 'production',
      PORT: 3002
    },
    max_memory_restart: '512M', // Reduced from 1G (per instance, 2 instances = 1GB total)
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    exp_backoff_restart_delay: 100,
    listen_timeout: 10000, // Increased for graceful startup
    kill_timeout: 5000,
    // Graceful shutdown configuration
    wait_ready: true, // Wait for ready signal from app
    shutdown_with_message: true // Enable graceful shutdown
  }, {
    name: 'ess-keep-alive',
    script: 'keep-alive-daemon.js',
    instances: 1, // Single instance for keep-alive
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    time: true,
    env_production: {
      NODE_ENV: 'production',
      UTUMISHI_ENDPOINT: 'http://154.118.230.140:9802'
    },
    max_memory_restart: '100M', // Keep-alive service is lightweight
    error_file: 'logs/keep-alive-error.log',
    out_file: 'logs/keep-alive.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    exp_backoff_restart_delay: 100,
    restart_delay: 5000, // Wait 5 seconds before restart
    max_restarts: 10, // Limit restarts to prevent cascading failures
    min_uptime: '30s' // Must run for 30 seconds to be considered stable
  }]
};