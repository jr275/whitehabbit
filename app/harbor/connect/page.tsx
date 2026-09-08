'use client';

import { useSearchParams } from 'next/navigation';
import { HarborConnect } from '@/components/HarborConnect';

export default function HarborConnectPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-md mx-auto mt-20">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Harbor SEO</h1>
            <p className="text-gray-600">Connect your account to get started</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">
                <span className="font-semibold">Connection Error:</span> {error}
              </p>
            </div>
          )}

          <HarborConnect />

          <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">What's next?</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-1">✓</span>
                <span>Monitor your SEO performance</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-1">✓</span>
                <span>Track keyword rankings</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-1">✓</span>
                <span>Analyze competitor data</span>
              </li>
            </ul>
          </div>
        </div>

        <p className="text-center text-sm text-gray-600 mt-6">
          Don't have a Harbor SEO account?{' '}
          <a
            href="https://www.harborseo.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Sign up for free
          </a>
        </p>
      </div>
    </div>
  );
}