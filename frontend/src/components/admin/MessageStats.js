import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, MessageSquare, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

const MessageStats = ({ stats }) => {
  const { stats: messageStats, totalMessages, period } = stats;

  const getStatusColor = (status) => {
    switch (status) {
      case 'sent': return 'text-green-600';
      case 'failed': return 'text-red-600';
      case 'resent': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'sent': return <CheckCircle className="w-4 h-4" />;
      case 'failed': return <XCircle className="w-4 h-4" />;
      case 'resent': return <MessageSquare className="w-4 h-4" />;
      default: return <MessageSquare className="w-4 h-4" />;
    }
  };

  const calculateSuccessRate = (stat) => {
    const total = stat.sent + stat.failed;
    return total > 0 ? ((stat.sent / total) * 100).toFixed(1) : 0;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Messages */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalMessages.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">
            Last {period.replace('30 days', '30 days')}
          </p>
        </CardContent>
      </Card>

      {/* Success Rate */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {messageStats.length > 0
              ? `${calculateSuccessRate(messageStats.reduce((acc, stat) => ({
                  sent: acc.sent + stat.sent,
                  failed: acc.failed + stat.failed
                }), { sent: 0, failed: 0 }))}%`
              : '0%'
            }
          </div>
          <p className="text-xs text-muted-foreground">
            Overall delivery rate
          </p>
        </CardContent>
      </Card>

      {/* Failed Messages */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Failed Messages</CardTitle>
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">
            {messageStats.reduce((sum, stat) => sum + stat.failed, 0).toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">
            Require attention
          </p>
        </CardContent>
      </Card>

      {/* Resent Messages */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Resent Messages</CardTitle>
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600">
            {messageStats.reduce((sum, stat) => sum + stat.resent, 0).toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">
            Manual resends
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default MessageStats;