'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { getHarborStatus } from '@/lib/harbor';
import { HarborConnectStatus } from '@/components/HarborConnect';

export default function HarborConnectedPage() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatus() {
      const result = await getHarborStatus();
      setStatus(result);
      setLoading(false);
    }

    fetchStatus();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto mt-20">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Successfully Connected!
            </h1>
            <p className="text-gray-600">
              Your Harbor SEO account is now connected
            </p>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-600 mt-2">Loading status...</p>
            </div>
          ) : (
            <>
              {status && <HarborConnectStatus connected={status.success} />}

              {status?.data && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold text-gray-900 mb-3">Account Details</h3>
                  <dl className="space-y-2 text-sm">
                    {status.data.email && (
                      <>
                        <dt className="text-gray-600">Email</dt>
                        <dd className="text-gray-900 font-medium">{status.data.email}</dd>
                      </>
                    )}
                    {status.data.accountId && (
                      <>
                        <dt className="text-gray-600 mt-3">Account ID</dt>
                        <dd className="text-gray-900 font-medium font-mono text-xs">
                          {status.data.accountId}
                        </dd>
                      </>
                    )}
                  </dl>
                </div>
              )}

              <div className="mt-8 flex gap-4">
                <Link
                  href="/"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-center font-medium"
                >
                  Go to Dashboard
                </Link>
                <a
                  href="https://www.harborseo.ai/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition-colors text-center font-medium"
                >
                  Open Harbor SEO
                </a>
              </div>
            </>
          )}

          <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Next Steps</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-1">→</span>
                <span>Configure your SEO tracking settings</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-1">→</span>
                <span>Add your website and keywords</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-1">→</span>
                <span>Start monitoring your SEO performance</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}