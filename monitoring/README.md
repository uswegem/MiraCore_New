# 📊 ESS Grafana Monitoring Setup

This document explains how to set up Grafana for visualizing all ESS logs, including LOAN_OFFER_REQUEST processing and LOAN_INITIAL_APPROVAL_NOTIFICATION callbacks.

## 🎯 What You'll Get

✅ **Real-time log visualization** for all ESS operations  
✅ **Pre-built dashboards** for loan processing workflows  
✅ **LOAN_OFFER_REQUEST tracking** with detailed processing steps  
✅ **Callback monitoring** for LOAN_INITIAL_APPROVAL_NOTIFICATION  
✅ **Error log aggregation** and alerting  
✅ **Search and filtering** across all log sources  

## 🚀 Quick Setup

### 1. Deploy to Remote Server

```bash
# Copy monitoring files to server
scp -r monitoring/ miracore:/home/uswege/ess/

# SSH to server and run setup
ssh miracore
cd /home/uswege/ess/monitoring
chmod +x setup-grafana-monitoring.sh
./setup-grafana-monitoring.sh
```

### 2. Access Grafana Dashboard

- **URL**: `http://5.75.185.137:3001`
- **Username**: `admin`
- **Password**: `admin123`

### 3. View ESS Logs

Navigate to **"ESS Loan Processing Logs"** dashboard to see:

- **LOAN_OFFER_REQUEST Processing**: Real-time loan request handling
- **LOAN_INITIAL_APPROVAL_NOTIFICATION**: Callback execution tracking
- **All Message Types**: Complete ESS message flow
- **Error Logs**: Centralized error monitoring
- **Callback Activity**: Delayed notification scheduling

## 📋 Pre-configured Dashboards

### ESS Loan Processing Dashboard

**Panel 1: LOAN_OFFER_REQUEST Processing**
```
Query: {service="ess-app"} |= "LOAN_OFFER_REQUEST"
Shows: Request reception, client data extraction, affordability calculations
```

**Panel 2: LOAN_INITIAL_APPROVAL_NOTIFICATION Callbacks**
```
Query: {service="ess-app"} |= "LOAN_INITIAL_APPROVAL_NOTIFICATION"
Shows: Callback scheduling, execution, and delivery status
```

**Panel 3: All Message Types Processing**
```
Query: {service="ess-app"} |= "MessageType"
Shows: Complete message flow across all ESS operations
```

**Panel 4: Error Logs**
```
Query: {service="ess-app",level="error"}
Shows: All application errors with stack traces
```

**Panel 5: Callback Activity**
```
Query: {service="ess-app"} |= "callback" or "sendCallback" or "Scheduled"
Shows: All callback-related activities and scheduling
```

## 🔍 Checking LOAN_INITIAL_APPROVAL_NOTIFICATION

### Real-time Monitoring

1. **Open Grafana Dashboard**
   ```
   http://5.75.185.137:3001
   ```

2. **Navigate to "LOAN_INITIAL_APPROVAL_NOTIFICATION Callbacks" Panel**

3. **Send LOAN_OFFER_REQUEST** (as we did earlier)

4. **Watch Live Logs** for:
   - ✅ Initial ACK response sent
   - ⏰ Callback scheduled for 20 seconds
   - 📤 LOAN_INITIAL_APPROVAL_NOTIFICATION callback execution
   - 📥 Third-party response handling

### Log Search Queries

**Check if callback was scheduled:**
```
{service="ess-app"} |= "Scheduled LOAN_INITIAL_APPROVAL_NOTIFICATION"
```

**Check callback execution:**
```
{service="ess-app"} |= "Sending delayed LOAN_INITIAL_APPROVAL_NOTIFICATION"
```

**Check callback success:**
```
{service="ess-app"} |= "Successfully sent LOAN_INITIAL_APPROVAL_NOTIFICATION"
```

**Check callback errors:**
```
{service="ess-app",level="error"} |= "LOAN_INITIAL_APPROVAL_NOTIFICATION"
```

## 🛠 Management Commands

### Start/Stop Monitoring Stack
```bash
# Start all monitoring services
./manage-monitoring.sh start

# Stop all services
./manage-monitoring.sh stop

# Restart services
./manage-monitoring.sh restart

# Check status
./manage-monitoring.sh status

# View logs
./manage-monitoring.sh logs grafana
./manage-monitoring.sh logs loki
```

### Direct Docker Commands
```bash
cd /home/uswege/ess/monitoring

# Start stack
docker-compose up -d

# View logs
docker-compose logs -f grafana
docker-compose logs -f loki
docker-compose logs -f promtail

# Stop stack
docker-compose down
```

## 📊 Architecture

```
ESS Application Logs
        ↓
    Promtail (Log Collection)
        ↓
    Loki (Log Storage)
        ↓
    Grafana (Visualization)
        ↓
    Your Browser Dashboard
```

## 🎯 Monitoring LOAN_OFFER_REQUEST Flow

With Grafana, you can track the complete LOAN_OFFER_REQUEST processing:

1. **Request Reception**: See incoming XML validation
2. **Client Data Extraction**: Monitor personal/financial data parsing
3. **Affordability Calculation**: Track EMI capacity validation
4. **Loan Offer Generation**: View final loan amount calculations
5. **Data Storage**: Monitor MongoDB operations
6. **ACK Response**: See immediate response generation
7. **Callback Scheduling**: Track 20-second delay setup
8. **Callback Execution**: Monitor LOAN_INITIAL_APPROVAL_NOTIFICATION delivery
9. **Third-party Response**: See callback success/failure

## 🚨 Alerting (Optional Enhancement)

Add alerting rules to get notified of:
- Failed LOAN_INITIAL_APPROVAL_NOTIFICATION callbacks
- High error rates in loan processing
- System performance issues
- Callback delivery failures

## 📈 Benefits Over PM2 Logs

| Feature | PM2 Logs | Grafana + Loki |
|---------|----------|----------------|
| **Real-time Viewing** | ✅ | ✅ |
| **Historical Search** | ❌ | ✅ |
| **Visual Dashboards** | ❌ | ✅ |
| **Log Aggregation** | ❌ | ✅ |
| **Filtering & Search** | Limited | ✅ Advanced |
| **Alerting** | ❌ | ✅ |
| **Multiple Log Sources** | ❌ | ✅ |
| **Time-based Analysis** | ❌ | ✅ |

This setup gives you complete visibility into the LOAN_INITIAL_APPROVAL_NOTIFICATION callback execution and all other ESS operations through a powerful, searchable dashboard interface.