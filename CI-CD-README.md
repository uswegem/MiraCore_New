# CI/CD Pipeline Documentation

## Overview

This repository uses GitHub Actions for automated CI/CD pipelines that handle testing, security scanning, and deployment to staging and production environments.

## Workflows

### 1. Pull Request Checks (`pr-checks.yml`)
- **Trigger**: Pull requests to `main` branch
- **Purpose**: Quality assurance before merging
- **Jobs**:
  - Code linting
  - Unit tests
  - Security audit
  - Syntax validation
  - Build checks

### 2. Production Deployment (`deploy.yml`)
- **Trigger**: Push to `main` branch or manual dispatch
- **Purpose**: Deploy to production environment
- **Jobs**:
  - Test suite execution
  - Security vulnerability scanning
  - Automated deployment with backup
  - Health checks and verification

### 3. Staging Deployment (`staging-deploy.yml`)
- **Trigger**: Push to `develop`/`staging` branches or manual dispatch
- **Purpose**: Deploy to staging environment for testing
- **Jobs**:
  - Test execution
  - Staging environment deployment
  - Health verification

## Required Secrets

Configure these secrets in your GitHub repository settings:

### Production Deployment
```
SSH_PRIVATE_KEY     # Private SSH key for production server access
REMOTE_HOST         # Production server hostname/IP
REMOTE_USER         # SSH username for production server
```

### Staging Deployment (Optional)
```
STAGING_SSH_PRIVATE_KEY  # Private SSH key for staging server
STAGING_HOST            # Staging server hostname/IP
STAGING_USER            # SSH username for staging server
```

## Environment Configuration

### Production Environment
- **Port**: 3002
- **PM2 Process**: `ess-app`
- **Health Check**: `http://localhost:3002/health`

### Staging Environment
- **Port**: 3003
- **PM2 Process**: `ess-staging`
- **Health Check**: `http://localhost:3003/health`

## Deployment Process

### Automatic Deployment
1. Push code to `main` branch → Production deployment
2. Push code to `develop` branch → Staging deployment
3. Create pull request → PR checks run

### Manual Deployment
1. Go to Actions tab in GitHub
2. Select desired workflow
3. Click "Run workflow"
4. Choose environment (for staging workflow)

## Backup Strategy

The deployment process automatically:
- Creates timestamped backups before deployment
- Preserves `.env` files and SSL certificates
- Keeps last 5 backups for rollback capability
- Cleans up old backups automatically

## Health Checks

Deployment verification includes:
- Service startup confirmation
- HTTP health endpoint checks
- PM2 process status validation
- External accessibility testing

## Rollback Procedure

If deployment fails:
1. Check deployment logs in GitHub Actions
2. SSH to server and check PM2 logs: `pm2 logs ess-app`
3. Restore from backup if needed:
   ```bash
   cd /home/uswege/ess
   tar -xzf ../ess_backup_[timestamp].tar.gz
   pm2 restart ess-app
   ```

## Monitoring

- **Deployment Status**: GitHub Actions tab
- **Service Health**: PM2 monitoring (`pm2 monit`)
- **Application Logs**: `logs/app-*.log` files
- **PM2 Logs**: `pm2 logs ess-app`

## Security Features

- SSH key-based authentication
- No sensitive files in repository
- Automatic backup of certificates and config
- Security vulnerability scanning
- Dependency audit checks

## Troubleshooting

### Common Issues

1. **SSH Connection Failed**
   - Verify SSH key is correctly configured
   - Check server firewall settings
   - Ensure SSH key has proper permissions

2. **Health Check Failed**
   - Check PM2 logs: `pm2 logs ess-app`
   - Verify environment variables are set
   - Check MongoDB connectivity

3. **Tests Failing**
   - Run tests locally: `npm test`
   - Check for missing dependencies
   - Verify environment setup

### Emergency Commands

```bash
# Check service status
pm2 list
pm2 show ess-app

# View recent logs
pm2 logs ess-app --lines 50

# Restart service
pm2 restart ess-app

# Stop service
pm2 stop ess-app

# Start service manually
npm start
```

## Branch Strategy

- `main`: Production-ready code
- `develop`: Development integration branch
- `staging`: Staging environment deployments
- Feature branches: Individual feature development

## Contact

For deployment issues, check:
1. GitHub Actions logs
2. Server PM2 logs
3. Application log files
4. Network connectivity