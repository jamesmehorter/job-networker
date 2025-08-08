'use client';

import { useState, useEffect } from 'react';
import { Clock, Monitor, Save } from 'lucide-react';
import type { CrawlSettings } from '@/types';
import { StorageManager } from '@/lib/storage';

export default function CrawlSettings() {
  const [settings, setSettings] = useState<CrawlSettings>({
    rateLimit: 2500,
    headless: false // Set to false for debugging
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const storedSettings = StorageManager.getCrawlSettings();
    setSettings(storedSettings);
    setIsLoaded(true);
  }, []);

  const handleSave = () => {
    setIsSaving(true);
    StorageManager.saveCrawlSettings(settings);
    
    setTimeout(() => {
      setIsSaving(false);
    }, 500);
  };

  const handleRateLimitChange = (value: string) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 1000) {
      setSettings(prev => ({ ...prev, rateLimit: numValue }));
    }
  };

  if (!isLoaded) {
    return <div className="animate-pulse bg-gray-200 h-64 rounded-lg"></div>;
  }

  return (
    <div className="bg-white rounded-lg border shadow-sm p-6">
      <div className="flex items-center gap-2 mb-6">
        <Clock className="h-5 w-5 text-purple-600" />
        <h2 className="text-lg font-semibold">Crawl Settings</h2>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Rate Limiting (milliseconds)
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="1000"
              max="10000"
              step="500"
              value={settings.rateLimit}
              onChange={(e) => handleRateLimitChange(e.target.value)}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="flex items-center gap-2 min-w-[120px]">
              <input
                type="number"
                min="1000"
                max="10000"
                step="500"
                value={settings.rateLimit}
                onChange={(e) => handleRateLimitChange(e.target.value)}
                className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
              <span className="text-sm text-gray-500">ms</span>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Delay between requests to avoid rate limiting. Recommended: 2500ms (2.5 seconds)
          </p>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Faster (1s)</span>
            <span>Safer (10s)</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Maximum Connections (Friends of Friends mode)
          </label>
          <input
            type="number"
            min="10"
            max="500"
            value={settings.maxConnections || 50}
            onChange={(e) => setSettings(prev => ({ 
              ...prev, 
              maxConnections: parseInt(e.target.value, 10) || 50 
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
          <p className="text-xs text-gray-600 mt-1">
            Maximum number of 1st degree connections to analyze in Friends of Friends mode
          </p>
        </div>

        <div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="headless"
              checked={settings.headless}
              onChange={(e) => setSettings(prev => ({ ...prev, headless: e.target.checked }))}
              className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
            />
            <label htmlFor="headless" className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Monitor className="h-4 w-4" />
              Run browser in headless mode
            </label>
          </div>
          <p className="text-xs text-gray-600 mt-2 ml-7">
            When enabled, the browser will run invisibly in the background. 
            Disable to see the browser window during crawling (useful for debugging).
          </p>
        </div>

        <div className="pt-4 border-t">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saved!' : 'Save Settings'}
          </button>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-900 mb-2">Rate Limiting Guidelines</h4>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>• <strong>1000-1500ms:</strong> Fastest but higher risk of detection</li>
            <li>• <strong>2500ms (recommended):</strong> Good balance of speed and safety</li>
            <li>• <strong>5000ms+:</strong> Safest for large crawls but slower</li>
          </ul>
        </div>
      </div>
    </div>
  );
}