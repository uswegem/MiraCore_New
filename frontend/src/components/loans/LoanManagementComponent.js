import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { Search, RefreshCw, Eye } from 'lucide-react';
import ApiService from '../../services/apiService';
import { LOAN_STATUS } from '../../config/index.js';

const STATUS_COLORS = {
  green: 'bg-green-100 text-green-800',
  blue: 'bg-blue-100 text-blue-800',
  orange: 'bg-orange-100 text-orange-800',
  red: 'bg-red-100 text-red-800',
};

const statusBadgeClass = (status) => {
  const config = LOAN_STATUS[status];
  return config ? STATUS_COLORS[config.color] || 'bg-gray-100 text-gray-800' : 'bg-gray-100 text-gray-800';
};

const statusLabel = (status) => LOAN_STATUS[status]?.label || status;

const formatAmount = (amount) =>
  amount != null ? `TZS ${Number(amount).toLocaleString()}` : '—';

const formatDate = (dateString) =>
  dateString ? new Date(dateString).toLocaleString() : '—';

const empty = (value) => value == null || value === '' ? '—' : value;

const LoanManagementComponent = () => {
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [stats, setStats] = useState({ total: 0, disbursed: 0, pending: 0, rejected: 0 });

  const fetchLoans = useCallback(async () => {
    try {
      setLoading(true);
      const response = await ApiService.getEmployeeLoans({
        applicationNumber: search || undefined,
        status: statusFilter || undefined,
      });

      if (response.success) {
        const data = response.data?.loans || [];
        setLoans(data);
        setStats({
          total: data.length,
          disbursed: data.filter(l => l.status === 'DISBURSED').length,
          pending: data.filter(l => ['INITIAL_OFFER', 'OFFER_SUBMITTED', 'INITIAL_APPROVAL_SENT', 'APPROVED', 'FINAL_APPROVAL_RECEIVED', 'CLIENT_CREATED', 'LOAN_CREATED'].includes(l.status)).length,
          rejected: data.filter(l => ['REJECTED', 'CANCELLED', 'FAILED'].includes(l.status)).length,
        });
      } else {
        throw new Error(response.message || 'Failed to fetch loans');
      }
    } catch (error) {
      console.error('Fetch loans error:', error);
      toast({ title: 'Error', description: 'Failed to load loans', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchLoans();
  }, []);

  const handleSearch = () => fetchLoans();

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') fetchLoans();
  };

  const clientName = (loan) => {
    const cd = loan.clientData;
    if (!cd) return '—';
    return [cd.firstName, cd.middleName, cd.lastName].filter(Boolean).join(' ') || '—';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Loan Management</h1>
        <Button onClick={fetchLoans} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Loans', value: stats.total, color: 'text-gray-900' },
          { label: 'Disbursed', value: stats.disbursed, color: 'text-green-700' },
          { label: 'Pending', value: stats.pending, color: 'text-blue-700' },
          { label: 'Rejected / Failed', value: stats.rejected, color: 'text-red-700' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-5">
              <p className="text-sm font-medium text-gray-500">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search application number..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-9"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              {Object.entries(LOAN_STATUS).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <Button onClick={handleSearch} disabled={loading}>Search</Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application #</TableHead>
                  <TableHead>Client Name</TableHead>
                  <TableHead>Mobile Number</TableHead>
                  <TableHead>Account Number</TableHead>
                  <TableHead>SWIFT</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Tenure</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-10 text-gray-500">
                      Loading loans...
                    </TableCell>
                  </TableRow>
                ) : loans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-10 text-gray-500">
                      No loans found
                    </TableCell>
                  </TableRow>
                ) : (
                  loans.map(loan => (
                    <TableRow key={loan._id}>
                      <TableCell className="font-mono text-xs">{loan.essApplicationNumber}</TableCell>
                      <TableCell>{clientName(loan)}</TableCell>
                      <TableCell>{empty(loan.mobileNumber)}</TableCell>
                      <TableCell className="font-mono text-xs">{empty(loan.bankAccountNumber)}</TableCell>
                      <TableCell className="font-mono text-xs">{empty(loan.swiftCode)}</TableCell>
                      <TableCell>{empty(loan.productCode)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatAmount(loan.requestedAmount)}</TableCell>
                      <TableCell>{loan.tenure ? `${loan.tenure}m` : '—'}</TableCell>
                      <TableCell>
                        <Badge className={statusBadgeClass(loan.status)}>
                          {statusLabel(loan.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-gray-500 whitespace-nowrap">{formatDate(loan.createdAt)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLoan(loan)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail dialog */}
      {selectedLoan && (
        <Dialog open={!!selectedLoan} onOpenChange={() => setSelectedLoan(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Loan Details — {selectedLoan.essApplicationNumber}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Section title="Client">
                <Field label="Name" value={clientName(selectedLoan)} />
                <Field label="Mobile Number" value={empty(selectedLoan.mobileNumber)} />
                <Field label="Account Number" value={empty(selectedLoan.bankAccountNumber)} />
                <Field label="SWIFT Code" value={empty(selectedLoan.swiftCode)} />
                <Field label="Email" value={empty(selectedLoan.clientData?.emailAddress)} />
                <Field label="NIN" value={empty(selectedLoan.clientData?.nin)} />
              </Section>
              <Section title="Loan">
                <Field label="Product" value={empty(selectedLoan.productCode)} />
                <Field label="Requested Amount" value={formatAmount(selectedLoan.requestedAmount)} />
                <Field label="Tenure" value={selectedLoan.tenure ? `${selectedLoan.tenure} months` : '—'} />
                <Field label="Status">
                  <Badge className={statusBadgeClass(selectedLoan.status)}>
                    {statusLabel(selectedLoan.status)}
                  </Badge>
                </Field>
                <Field label="FSP Ref #" value={empty(selectedLoan.fspReferenceNumber)} />
                <Field label="Loan Number" value={empty(selectedLoan.essLoanNumberAlias)} />
                <Field label="MIFOS Loan ID" value={empty(selectedLoan.mifosLoanId)} />
                <Field label="MIFOS Account #" value={empty(selectedLoan.mifosLoanAccountNumber)} />
              </Section>
              <Section title="Employment" className="col-span-2">
                <Field label="Employer" value={empty(selectedLoan.employmentData?.employerName)} />
                <Field label="Check Number" value={empty(selectedLoan.essCheckNumber)} />
                <Field label="Net Salary" value={formatAmount(selectedLoan.employmentData?.netSalary)} />
              </Section>
              <Section title="Timestamps" className="col-span-2">
                <Field label="Created" value={formatDate(selectedLoan.createdAt)} />
                <Field label="Updated" value={formatDate(selectedLoan.updatedAt)} />
              </Section>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

const Section = ({ title, children, className = '' }) => (
  <div className={`space-y-2 ${className}`}>
    <h3 className="font-semibold text-gray-700 border-b pb-1">{title}</h3>
    <div className="space-y-1">{children}</div>
  </div>
);

const Field = ({ label, value, children }) => (
  <div className="flex gap-2">
    <span className="text-gray-500 min-w-[120px] shrink-0">{label}:</span>
    <span className="font-medium text-gray-900">{children ?? value}</span>
  </div>
);

export default LoanManagementComponent;
