'use client';

import * as React from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { SdkCodeBlock } from '@/components/SdkCodeBlock';
import { Layers } from 'lucide-react';

const API_OPTIONS = ['Fluxa', 'CrowdPay'];
const LANGUAGE_OPTIONS = ['TypeScript', 'Python', 'Go', 'cURL'];

export default function SdkGeneratorPage() {
  const [selectedApi, setSelectedApi] = React.useState('Fluxa');
  const [selectedLang, setSelectedLang] = React.useState('TypeScript');
  const [generatedCode, setGeneratedCode] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    const fetchCode = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('http://localhost:3001/api/v1/sdkgen/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            spec: selectedApi.toLowerCase(),
            language: selectedLang.toLowerCase()
          })
        });
        const data = await response.json();
        setGeneratedCode(data.code || 'Failed to generate code');
      } catch (error) {
        console.error('Error fetching code:', error);
        setGeneratedCode('// Error connecting to backend\n// Ensure API is running on port 3001');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchCode();
  }, [selectedApi, selectedLang]);

  const getInstallCommand = () => {
    switch (selectedLang) {
      case 'TypeScript':
        return 'npm install axios';
      case 'Python':
        return 'pip install requests';
      case 'Go':
        return 'go mod init example \ngo get net/http';
      default:
        return '';
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-10 flex items-center space-x-4 border-b border-gray-800 pb-6">
          <div className="p-3 bg-blue-600/20 rounded-lg text-blue-400">
            <Layers className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">SDK Generator</h1>
            <p className="text-gray-400 mt-1">Copy-paste ready client code for your favorite languages.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-1 space-y-6">
            <div>
              <h2 className="text-sm uppercase tracking-wider text-gray-500 font-semibold mb-3">API Definition</h2>
              <div className="space-y-2">
                {API_OPTIONS.map(api => (
                  <button
                    key={api}
                    onClick={() => setSelectedApi(api)}
                    className={`w-full text-left px-4 py-2 rounded-md transition ${
                      selectedApi === api 
                        ? 'bg-blue-600 text-white font-medium' 
                        : 'bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    {api}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Instructions</h3>
              <p className="text-sm text-gray-500 mb-4">
                1. Select the API spec.<br/>
                2. Choose your language.<br/>
                3. Copy the generated code.<br/>
                4. Replace `API_KEY` and variables with your own values.
              </p>
              
              {getInstallCommand() && (
                <>
                  <h4 className="text-xs uppercase text-gray-500 font-semibold mb-2 mt-4">Install Depenendencies</h4>
                  <pre className="bg-black p-3 rounded border border-gray-800 text-xs text-blue-300 overflow-x-auto whitespace-pre-wrap">
                    {getInstallCommand()}
                  </pre>
                </>
              )}
            </div>
          </div>

          <div className="md:col-span-3">
            <Tabs.Root value={selectedLang} onValueChange={setSelectedLang}>
              <Tabs.List className="flex border-b border-gray-800 mb-4 overflow-x-auto">
                {LANGUAGE_OPTIONS.map(lang => (
                  <Tabs.Trigger
                    key={lang}
                    value={lang}
                    className={`px-6 py-3 text-sm font-medium transition border-b-2 whitespace-nowrap ${
                      selectedLang === lang 
                        ? 'border-blue-500 text-blue-400' 
                        : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-700'
                    }`}
                  >
                    {lang}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
              
              <Tabs.Content value={selectedLang} className="outline-none focus:ring-2 focus:ring-blue-500 rounded-lg">
                {isLoading ? (
                  <div className="h-64 flex items-center justify-center border border-gray-800 rounded-lg bg-[#1d1f21]">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : (
                  <SdkCodeBlock code={generatedCode} language={selectedLang} />
                )}
              </Tabs.Content>
            </Tabs.Root>
          </div>
        </div>
      </div>
    </div>
  );
}
