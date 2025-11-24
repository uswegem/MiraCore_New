import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Copy, Download } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const MessageDetailsModal = ({ message }) => {
  const [activeTab, setActiveTab] = useState('overview');

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Copied',
        description: 'Content copied to clipboard'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy to clipboard',
        variant: 'destructive'
      });
    }
  };

  const downloadXml = (xmlContent, filename) => {
    const blob = new Blob([xmlContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status) => {
    const variants = {
      sent: 'default',
      failed: 'destructive',
      pending: 'secondary',
      resent: 'outline'
    };

    return (
      <Badge variant={variants[status] || 'secondary'}>
        {status.toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="request">Request XML</TabsTrigger>
          <TabsTrigger value="response">Response</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Message Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <label className="text-sm font-medium text-gray-600">Message ID</label>
                  <p className="font-mono text-sm">{message.messageId}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Message Type</label>
                  <p>{message.messageType}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Direction</label>
                  <p>{message.direction}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Status</label>
                  <div className="mt-1">{getStatusBadge(message.status)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Created At</label>
                  <p>{formatDate(message.createdAt)}</p>
                </div>
                {message.sentAt && (
                  <div>
                    <label className="text-sm font-medium text-gray-600">Sent At</label>
                    <p>{formatDate(message.sentAt)}</p>
                  </div>
                )}
                {message.resentAt && (
                  <div>
                    <label className="text-sm font-medium text-gray-600">Resent At</label>
                    <p>{formatDate(message.resentAt)}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Business Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <label className="text-sm font-medium text-gray-600">Application Number</label>
                  <p>{message.applicationNumber || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Loan Number</label>
                  <p>{message.loanNumber || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">FSP Reference Number</label>
                  <p>{message.fspReferenceNumber || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Sender</label>
                  <p>{message.sender}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Receiver</label>
                  <p>{message.receiver}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Sent By</label>
                  <p>{message.sentBy?.username || 'System'}</p>
                </div>
                {message.retryCount > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-600">Retry Count</label>
                    <p>{message.retryCount}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {message.errorMessage && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-red-600">Error Information</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-red-600">{message.errorMessage}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="request" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                Request XML Payload
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(message.xmlPayload)}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadXml(message.xmlPayload, `${message.messageId}_request.xml`)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <pre className="text-xs font-mono whitespace-pre-wrap bg-gray-50 p-4 rounded">
                  {message.xmlPayload}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="response" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                Response Data
                {message.response && (
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(message.response)}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadXml(message.response, `${message.messageId}_response.xml`)}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {message.response ? (
                <ScrollArea className="h-96">
                  <pre className="text-xs font-mono whitespace-pre-wrap bg-gray-50 p-4 rounded">
                    {message.response}
                  </pre>
                </ScrollArea>
              ) : (
                <p className="text-gray-500">No response data available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metadata" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Additional Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              {message.metadata && Object.keys(message.metadata).length > 0 ? (
                <ScrollArea className="h-96">
                  <pre className="text-sm bg-gray-50 p-4 rounded">
                    {JSON.stringify(message.metadata, null, 2)}
                  </pre>
                </ScrollArea>
              ) : (
                <p className="text-gray-500">No additional metadata available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MessageDetailsModal;