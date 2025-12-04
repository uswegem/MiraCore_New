import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { 
  Users, 
  CreditCard, 
  TrendingUp, 
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw,
  LogOut,
  Settings
} from 'lucide-react';
import ApiService from '../../services/apiService';

const DashboardComponent = ({ user, onLogout }) => {
  const [stats, setStats] = useState({
    loans: {
      total: 0,
      approved: 0,
      pending: 0,
      cancelled: 0,
      disbursed: 0
    },
    users: {
      total: 0,
      active: 0
    }
  });
  const [recentLoans, setRecentLoans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      const [dashboardStats, recentLoansData] = await Promise.all([
        ApiService.getDashboardStats(),
        ApiService.getEmployeeLoans({ limit: 10, sort: 'createdAt', order: 'desc' })
      ]);

      if (dashboardStats.success) {
        setStats(dashboardStats.data);
      }

      if (recentLoansData.success) {
        setRecentLoans(recentLoansData.data.loans || []);
      }

    } catch (error) {
      console.error('Dashboard error:', error);
      toast({
        title: 'Error',
        description: 'Failed to load dashboard data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await ApiService.logout();
      toast({
        title: 'Logged out',
        description: 'You have been successfully logged out',
        variant: 'success'
      });
      if (onLogout) onLogout();
    } catch (error) {
      console.error('Logout error:', error);
      toast({
        title: 'Logout Error',
        description: 'Failed to logout properly',
        variant: 'destructive'
      });
    }
  };

  const getStatusBadgeVariant = (status) => {
    const statusMap = {
      'APPROVED': 'success',
      'DISBURSED': 'success',
      'PENDING': 'warning',
      'INITIAL_OFFER': 'warning',
      'CANCELLED': 'destructive',
      'REJECTED': 'destructive',
      'FAILED': 'destructive'
    };
    return statusMap[status] || 'default';
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-TZ', {
      style: 'currency',
      currency: 'TZS'
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-TZ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">
                MiraCore Admin Dashboard
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Welcome, {user?.name || user?.email || 'Admin'}
              </span>
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <CreditCard className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Loans</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.loans.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Approved</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.loans.approved}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Clock className="h-8 w-8 text-yellow-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Pending</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.loans.pending}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Users</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.users.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Loans */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Loan Applications</CardTitle>
              <Button variant="outline" size="sm" onClick={fetchDashboardData}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentLoans.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <CreditCard className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No recent loan applications</p>
                  </div>
                ) : (
                  recentLoans.map((loan) => (
                    <div key={loan._id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-gray-900">
                            {loan.essApplicationNumber}
                          </p>
                          <Badge variant={getStatusBadgeVariant(loan.status)}>
                            {loan.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {loan.clientData?.firstName} {loan.clientData?.lastName}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-sm font-medium text-gray-900">
                            {formatCurrency(loan.loanData?.principal)}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatDate(loan.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* System Status */}
          <Card>
            <CardHeader>
              <CardTitle>System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                    <div>
                      <p className="font-medium text-gray-900">ESS Backend</p>
                      <p className="text-sm text-gray-600">135.181.33.13:3002</p>
                    </div>
                  </div>
                  <Badge variant="success">Online</Badge>
                </div>

                <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                    <div>
                      <p className="font-medium text-gray-900">MIFOS CBS</p>
                      <p className="text-sm text-gray-600">zedone-uat.miracore.co.tz</p>
                    </div>
                  </div>
                  <Badge variant="success">Connected</Badge>
                </div>

                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center">
                    <TrendingUp className="w-5 h-5 text-blue-600 mr-3" />
                    <div>
                      <p className="font-medium text-gray-900">API Performance</p>
                      <p className="text-sm text-gray-600">Average response time</p>
                    </div>
                  </div>
                  <Badge variant="default">~250ms</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DashboardComponent;