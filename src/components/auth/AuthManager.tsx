'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, Key, User, Lock, ExternalLink } from 'lucide-react';
import { LinkedInCredentials, OpenAIConfig } from '@/types';
import { StorageManager } from '@/lib/storage';

interface AuthManagerProps {
  onCredentialsChange: (credentials: LinkedInCredentials | null) => void;
  onOpenAIConfigChange: (config: OpenAIConfig | null) => void;
}

export default function AuthManager({ onCredentialsChange, onOpenAIConfigChange }: AuthManagerProps) {
  const [credentials, setCredentials] = useState<LinkedInCredentials>({ email: '', password: '' });
  const [openAIConfig, setOpenAIConfig] = useState<OpenAIConfig>({ apiKey: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Load stored credentials on component mount
    const storedCredentials = StorageManager.getLinkedInCredentials();
    const storedOpenAI = StorageManager.getOpenAIConfig();
    
    if (storedCredentials) {
      setCredentials(storedCredentials);
      onCredentialsChange(storedCredentials);
    }
    
    if (storedOpenAI) {
      setOpenAIConfig(storedOpenAI);
      onOpenAIConfigChange(storedOpenAI);
    }
    
    setIsLoaded(true);
  }, [onCredentialsChange, onOpenAIConfigChange]);

  const handleLinkedInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (credentials.email && credentials.password) {
      StorageManager.saveLinkedInCredentials(credentials);
      onCredentialsChange(credentials);
    }
  };

  const handleOpenAISubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (openAIConfig.apiKey) {
      StorageManager.saveOpenAIConfig(openAIConfig);
      onOpenAIConfigChange(openAIConfig);
    }
  };

  const handleClearCredentials = () => {
    StorageManager.removeLinkedInCredentials();
    setCredentials({ email: '', password: '' });
    onCredentialsChange(null);
  };

  const handleClearOpenAI = () => {
    StorageManager.removeOpenAIConfig();
    setOpenAIConfig({ apiKey: '' });
    onOpenAIConfigChange(null);
  };

  const isLinkedInConfigured = credentials.email && credentials.password;
  const isOpenAIConfigured = openAIConfig.apiKey;

  if (!isLoaded) {
    return <div className="animate-pulse bg-gray-200 h-64 rounded-lg"></div>;
  }

  return (
    <div className="space-y-6">
      {/* LinkedIn Credentials */}
      <div className="bg-white rounded-lg border shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold">LinkedIn Credentials</h2>
          {isLinkedInConfigured && (
            <div className="ml-auto">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Configured
              </span>
            </div>
          )}
        </div>
        
        <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start gap-2">
            <Lock className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Your credentials are stored securely</p>
              <p>LinkedIn credentials are encrypted and stored locally on your device only. They are never sent to external servers except for direct LinkedIn authentication.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleLinkedInSubmit} className="space-y-4">
          <div>
            <label htmlFor="linkedin-email" className="block text-sm font-medium text-gray-700 mb-1">
              LinkedIn Email
            </label>
            <input
              type="email"
              id="linkedin-email"
              value={credentials.email}
              onChange={(e) => setCredentials(prev => ({ ...prev, email: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="your.email@example.com"
              required
            />
          </div>
          
          <div>
            <label htmlFor="linkedin-password" className="block text-sm font-medium text-gray-700 mb-1">
              LinkedIn Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="linkedin-password"
                value={credentials.password}
                onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Your LinkedIn password"
                required
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-gray-400" />
                ) : (
                  <Eye className="h-4 w-4 text-gray-400" />
                )}
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              Save LinkedIn Credentials
            </button>
            {isLinkedInConfigured && (
              <button
                type="button"
                onClick={handleClearCredentials}
                className="px-4 py-2 border border-red-300 text-red-700 rounded-md hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </form>
      </div>

      {/* OpenAI API Key */}
      <div className="bg-white rounded-lg border shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Key className="h-5 w-5 text-green-600" />
          <h2 className="text-lg font-semibold">OpenAI API Configuration</h2>
          {isOpenAIConfigured && (
            <div className="ml-auto">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Configured
              </span>
            </div>
          )}
        </div>

        <div className="mb-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
          <div className="flex items-start gap-2">
            <Key className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">How to get your OpenAI API Key:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Go to <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">OpenAI API Keys <ExternalLink className="h-3 w-3" /></a></li>
                <li>Sign in or create an OpenAI account</li>
                <li>Click &quot;Create new secret key&quot;</li>
                <li>Copy the key and paste it below</li>
              </ol>
              <p className="mt-2 text-xs">Your API key is stored locally and only used for job analysis features.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleOpenAISubmit} className="space-y-4">
          <div>
            <label htmlFor="openai-key" className="block text-sm font-medium text-gray-700 mb-1">
              OpenAI API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                id="openai-key"
                value={openAIConfig.apiKey}
                onChange={(e) => setOpenAIConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="sk-..."
                required
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4 text-gray-400" />
                ) : (
                  <Eye className="h-4 w-4 text-gray-400" />
                )}
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors"
            >
              Save OpenAI API Key
            </button>
            {isOpenAIConfigured && (
              <button
                type="button"
                onClick={handleClearOpenAI}
                className="px-4 py-2 border border-red-300 text-red-700 rounded-md hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}