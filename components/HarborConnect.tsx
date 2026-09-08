'use client';

import { useState } from 'react';
import { getHarborConnectUrl, isHarborConfigured } from '@/lib/harbor';
import Link from 'next/link';

export function HarborConnect() {
  const [isLoading, setIsLoading] = useState(false);
  const harborConfigured = isHarborConfigured();

  const handleConnect = () => {
    if (!harborConfigured) {
      alert('Harbor SEO is not configured. Please set HARBOR_API_KEY environment variable.');
      return;
    }

    setIsLoading(true);
    const connectUrl = getHarborConnectUrl();
    window.location.href = connectUrl;
  };

  if (!harborConfigured) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h3 className="text-sm font-semibold text-yellow-900">
          Harbor SEO Not Configured
        </h3>
        <p className="text-sm text-yellow-700 mt-1">
          To connect with Harbor SEO, please add your API key to the environment variables.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={handleConnect}
        disabled={isLoading}
        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? 'Connecting...' : 'Connect to Harbor SEO'}
      </button>
      
      <p className="text-sm text-gray-600">
        You'll be redirected to Harbor SEO to authorize the connection.
      </p>
    </div>
  );
}

export function HarborConnectStatus({ connected }: { connected: boolean }) {
  if (connected) {
    return (
      <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
        <div className="w-3 h-3 bg-green-500 rounded-full" />
        <div>
          <h3 className="text-sm font-semibold text-green-900">Connected to Harbor SEO</h3>
          <p className="text-sm text-green-700">Your account is successfully connected.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-3">
      <div className="w-3 h-3 bg-gray-400 rounded-full" />
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Not Connected</h3>
        <p className="text-sm text-gray-700">
          <Link href="/harbor/connect" className="underline hover:no-underline">
            Connect your Harbor SEO account
          </Link>
        </p>
      </div>
    </div>
  );
}
