module.exports = {
  apps: [{
    name: 'ess-app',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    time: true,
    env: {
      NODE_ENV: 'production',
      PORT: 3002
    },
    max_memory_restart: '1G',
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    exp_backoff_restart_delay: 100,
    wait_ready: true,
    listen_timeout: 10000,
    kill_timeout: 5000
  }]
};