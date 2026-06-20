'use client';

import * as React from 'react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-typescript';
import { Copy, Check } from 'lucide-react';

interface SdkCodeBlockProps {
  code: string;
  language: string;
}

export const SdkCodeBlock = ({ code, language }: SdkCodeBlockProps) => {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    Prism.highlightAll();
  }, [code, language]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getPrismLanguage = (lang: string) => {
    switch (lang.toLowerCase()) {
      case 'javascript':
      case 'typescript':
        return 'typescript';
      case 'python':
        return 'python';
      case 'go':
        return 'go';
      case 'curl':
        return 'bash';
      default:
        return 'typescript';
    }
  };

  return (
    <div className="relative group rounded-md overflow-hidden bg-[#1d1f21] border border-gray-800">
      <div className="absolute right-4 top-4 z-10 flex items-center space-x-2">
        <button
          onClick={handleCopy}
          className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition flex items-center justify-center"
          title="Copy code"
        >
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      <pre className="!m-0 !p-6 text-sm overflow-auto max-h-[400px]">
        <code className={`language-${getPrismLanguage(language)}`}>
          {code}
        </code>
      </pre>
    </div>
  );
};
