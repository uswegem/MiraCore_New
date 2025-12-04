import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { Eye, EyeOff, LogIn, Shield } from 'lucide-react';
import ApiService from '../../services/apiService';

const LoginComponent = ({ onLogin }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.email || !formData.password) {
      toast({
        title: 'Validation Error',
        description: 'Please enter both email and password',
        variant: 'destructive'
      });
      return;
    }

    try {
      setLoading(true);
      
      const response = await ApiService.login({
        email: formData.email,
        password: formData.password
      });

      if (response.success) {
        toast({
          title: 'Login Successful',
          description: `Welcome back, ${response.data.user?.name || 'Admin'}!`,
          variant: 'success'
        });
        
        // Call parent callback
        if (onLogin) {
          onLogin(response.data.user);
        }
      } else {
        throw new Error(response.message || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      
      toast({
        title: 'Login Failed',
        description: error.message || 'Invalid credentials. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
              <Shield className="w-8 h-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            MiraCore Admin Portal
          </CardTitle>
          <p className="text-gray-600 mt-2">
            Sign in to access the ESS management system
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="admin@miracore.com"
                value={formData.email}
                onChange={handleChange}
                required
                disabled={loading}
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  className="w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  disabled={loading}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4 mr-2" />
                  Sign In
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            <p>ESS Backend: 135.181.33.13:3002</p>
            <p className="mt-1">
              Need help? Contact your system administrator
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginComponent;