import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { Search, RefreshCw, Eye, Download, Filter, Calendar } from 'lucide-react';
import ApiService from '../../services/apiService';

const LoanManagementComponent = () => {
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [filters, setFilters] = useState({
    status: '',
    applicationNumber: '',
    clientName: '',
    startDate: '',
    endDate: '',
    page: 1,
    limit: 20
  });
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pages: 1
  });

  useEffect(() => {
    fetchLoans();
  }, [filters.page, filters.limit]);

  const fetchLoans = async () => {
    try {
      setLoading(true);
      
      const response = await ApiService.getEmployeeLoans({
        ...filters,
        sort: 'createdAt',
        order: 'desc'
      });

      if (response.success) {
        setLoans(response.data.loans || []);
        setPagination(response.data.pagination || { total: 0, page: 1, pages: 1 });
      } else {
        throw new Error(response.message || 'Failed to fetch loans');
      }
    } catch (error) {
      console.error('Fetch loans error:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch loans. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setFilters(prev => ({ ...prev, page: 1 }));
    fetchLoans();
  };

  const handleClearFilters = () => {
    setFilters({
      status: '',
      applicationNumber: '',
      clientName: '',
      startDate: '',
      endDate: '',
      page: 1,
      limit: 20
    });
  };

  const getStatusBadgeVariant = (status) => {
    const statusMap = {
      'APPROVED': 'success',
      'DISBURSED': 'success',
      'FINAL_APPROVAL_RECEIVED': 'success',
      'PENDING': 'warning',
      'INITIAL_OFFER': 'warning',
      'CLIENT_CREATED': 'warning',
      'LOAN_CREATED': 'warning',
      'CANCELLED': 'destructive',
      'REJECTED': 'destructive',
      'FAILED': 'destructive'
    };
    return statusMap[status] || 'default';
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-TZ', {
      style: 'currency',
      currency: 'TZS',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-TZ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const exportLoans = async () => {
    try {
      const response = await ApiService.getEmployeeLoans({
        ...filters,
        export: true,
        format: 'csv'
      });
      
      // Create CSV content
      const csvContent = convertToCSV(loans);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `loans_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: 'Export Successful',
        description: 'Loans data has been exported to CSV',
        variant: 'success'
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: 'Export Failed',
        description: 'Failed to export loans data',
        variant: 'destructive'
      });
    }
  };

  const convertToCSV = (data) => {
    const headers = [
      'Application Number',
      'Client Name',
      'Status',
      'Principal Amount',
      'Interest Rate',
      'Tenure',
      'Created At',
      'Updated At'
    ];

    const rows = data.map(loan => [
      loan.essApplicationNumber || 'N/A',
      `${loan.clientData?.firstName || ''} ${loan.clientData?.lastName || ''}`.trim() || 'N/A',
      loan.status || 'N/A',
      loan.loanData?.principal || 0,
      loan.loanData?.interestRate || 'N/A',
      loan.loanData?.tenure || 'N/A',
      formatDate(loan.createdAt),
      formatDate(loan.updatedAt)
    ]);

    return [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Loan Management</h2>
          <p className="text-gray-600 mt-1">Manage and monitor employee loan applications</p>
        </div>
        <div className="flex space-x-3">
          <Button variant="outline" onClick={exportLoans}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button onClick={fetchLoans}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Search & Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Application Number</label>
              <Input
                placeholder="ESS..."
                value={filters.applicationNumber}
                onChange={(e) => setFilters(prev => ({ ...prev, applicationNumber: e.target.value }))}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700">Status</label>
              <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Statuses</SelectItem>
                  <SelectItem value="INITIAL_OFFER">Initial Offer</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="FINAL_APPROVAL_RECEIVED">Final Approval</SelectItem>
                  <SelectItem value="DISBURSED">Disbursed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Start Date</label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">End Date</label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
          </div>
          
          <div className="flex justify-between items-center mt-4">
            <div className="flex space-x-2">
              <Button onClick={handleSearch}>
                <Search className="w-4 h-4 mr-2" />
                Search
              </Button>
              <Button variant="outline" onClick={handleClearFilters}>
                Clear Filters
              </Button>
            </div>
            <div className="text-sm text-gray-600">
              Showing {loans.length} of {pagination.total} loans
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loans Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading loans...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application Number</TableHead>
                  <TableHead>Client Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Principal Amount</TableHead>
                  <TableHead>Interest Rate</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      No loans found matching your criteria
                    </TableCell>
                  </TableRow>
                ) : (
                  loans.map((loan) => (
                    <TableRow key={loan._id}>
                      <TableCell className="font-medium">
                        {loan.essApplicationNumber}
                      </TableCell>
                      <TableCell>
                        {loan.clientData?.firstName} {loan.clientData?.lastName}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(loan.status)}>
                          {loan.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {formatCurrency(loan.loanData?.principal)}
                      </TableCell>
                      <TableCell>
                        {loan.loanData?.interestRate}%
                      </TableCell>
                      <TableCell>
                        {formatDate(loan.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setSelectedLoan(loan)}
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              View
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Loan Details</DialogTitle>
                              <DialogDescription>
                                Application Number: {selectedLoan?.essApplicationNumber}
                              </DialogDescription>
                            </DialogHeader>
                            {selectedLoan && (
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <h4 className="font-medium text-gray-900">Client Information</h4>
                                    <div className="mt-2 text-sm text-gray-600">
                                      <p>Name: {selectedLoan.clientData?.firstName} {selectedLoan.clientData?.lastName}</p>
                                      <p>Email: {selectedLoan.clientData?.email}</p>
                                      <p>Phone: {selectedLoan.clientData?.mobileNo}</p>
                                      <p>National ID: {selectedLoan.clientData?.nationalId}</p>
                                    </div>
                                  </div>
                                  
                                  <div>
                                    <h4 className="font-medium text-gray-900">Loan Information</h4>
                                    <div className="mt-2 text-sm text-gray-600">
                                      <p>Principal: {formatCurrency(selectedLoan.loanData?.principal)}</p>
                                      <p>Interest Rate: {selectedLoan.loanData?.interestRate}%</p>
                                      <p>Tenure: {selectedLoan.loanData?.tenure} months</p>
                                      <p>Monthly Payment: {formatCurrency(selectedLoan.loanData?.monthlyPayment)}</p>
                                    </div>
                                  </div>
                                </div>
                                
                                <div>
                                  <h4 className="font-medium text-gray-900">Employment Information</h4>
                                  <div className="mt-2 text-sm text-gray-600">
                                    <p>Employee Number: {selectedLoan.employmentData?.employeeNumber}</p>
                                    <p>Department: {selectedLoan.employmentData?.department}</p>
                                    <p>Monthly Salary: {formatCurrency(selectedLoan.employmentData?.monthlySalary)}</p>
                                    <p>Employment Date: {formatDate(selectedLoan.employmentData?.employmentDate)}</p>
                                  </div>
                                </div>

                                <div>
                                  <h4 className="font-medium text-gray-900">Status History</h4>
                                  <div className="mt-2 space-y-1">
                                    <div className="flex justify-between text-sm">
                                      <span>Created:</span>
                                      <span>{formatDate(selectedLoan.createdAt)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                      <span>Last Updated:</span>
                                      <span>{formatDate(selectedLoan.updatedAt)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                      <span>Current Status:</span>
                                      <Badge variant={getStatusBadgeVariant(selectedLoan.status)}>
                                        {selectedLoan.status}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Page {pagination.page} of {pagination.pages}
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              disabled={pagination.page <= 1}
              onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={pagination.page >= pagination.pages}
              onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoanManagementComponent;