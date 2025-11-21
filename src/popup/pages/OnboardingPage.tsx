import { useState } from 'react';
import browser from 'webextension-polyfill';

interface Props {
  onComplete: () => void;
}

export default function OnboardingPage({ onComplete }: Props) {
  const [mode, setMode] = useState<'select' | 'create' | 'import'>('select');
  const [importMethod, setImportMethod] = useState<'phrase' | 'privateKey'>('phrase');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showMnemonic, setShowMnemonic] = useState(false);

  async function handleCreateWallet() {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'CREATE_WALLET',
        data: { password },
      });

      setGeneratedMnemonic(response.mnemonic);
      setShowMnemonic(true);
    } catch (err: any) {
      setError(err.message || 'Failed to create wallet');
    } finally {
      setLoading(false);
    }
  }

  async function handleImportWallet() {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (importMethod === 'phrase' && !mnemonic.trim()) {
      setError('Please enter your seed phrase');
      return;
    }

    if (importMethod === 'privateKey' && !privateKey.trim()) {
      setError('Please enter your private key');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'IMPORT_WALLET',
        data: { 
          method: importMethod,
          mnemonic: importMethod === 'phrase' ? mnemonic.trim() : undefined,
          privateKey: importMethod === 'privateKey' ? privateKey.trim() : undefined,
          password 
        },
      });

      onComplete();
    } catch (err: any) {
      setError(err.message || 'Failed to import wallet');
    } finally {
      setLoading(false);
    }
  }

  if (mode === 'select') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
        <div className="card max-w-md w-full text-center">
          <div className="flex justify-center mb-6">
            <img 
              src="/icons/ZYNCWALLETICON.png" 
              alt="Zync Wallet Logo" 
              className="w-20 h-20"
            />
          </div>
          <h1 className="text-3xl font-bold mb-2 text-white">Zync Wallet</h1>
          <p className="text-zinc-600 mb-8">Your gateway to Zcash inscriptions, ZRC-20 tokens, and NFTs</p>
          
          <div className="space-y-4">
            <button
              onClick={() => setMode('create')}
              className="btn btn-primary w-full text-lg py-3"
            >
              Create New Wallet
            </button>
            
            <button
              onClick={() => setMode('import')}
              className="btn btn-secondary w-full text-lg py-3"
            >
              Import Existing Wallet
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'create' && showMnemonic) {
    return (
      <div className="min-h-screen bg-zinc-darker flex items-center justify-center p-6">
        <div className="card max-w-md w-full">
          <h2 className="text-2xl font-bold mb-4 text-white">Backup Your Seed Phrase</h2>
          <div className="bg-zinc-900 border border-zinc-700 p-4 rounded-lg mb-4">
            <p className="text-sm text-zinc-300 mb-3 font-medium">
              Write down these 24 words in order and store them safely:
            </p>
            <div className="grid grid-cols-3 gap-2 font-mono text-sm">
              {generatedMnemonic.split(' ').map((word, i) => (
                <div key={i} className="bg-zinc-800 border border-zinc-700 p-2 rounded text-white">
                  <span className="text-zinc-500 mr-1">{i + 1}.</span>
                  {word}
                </div>
              ))}
            </div>
          </div>
          
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-4 mb-4">
            <p className="text-sm text-amber-200 font-medium">
              Never share your seed phrase with anyone. Anyone with these words can access your funds.
            </p>
          </div>

          <button
            onClick={onComplete}
            className="btn btn-primary w-full"
          >
            I Have Saved My Seed Phrase
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'create') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card max-w-md w-full">
          <button
            onClick={() => setMode('select')}
            className="text-zinc-600 hover:text-zinc-900 mb-4"
          >
            ← Back
          </button>
          
          <h2 className="text-2xl font-bold mb-6">Create New Wallet</h2>
          
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="Enter password (min 8 characters)"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input"
                placeholder="Confirm password"
              />
            </div>
            
            <button
              onClick={handleCreateWallet}
              disabled={loading}
              className="btn btn-primary w-full"
            >
              {loading ? 'Creating...' : 'Create Wallet'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card max-w-md w-full">
        <button
          onClick={() => setMode('select')}
          className="text-zinc-600 hover:text-zinc-900 mb-4"
        >
          ← Back
        </button>
        
        <h1 className="text-4xl font-bold mb-4">Zync Wallet</h1>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}
        
        <div className="space-y-4">
          {/* Import Method Selector */}
          <div className="flex gap-2 border-b border-zinc-700 mb-4">
            <button
              onClick={() => setImportMethod('phrase')}
              className={`flex-1 py-2 px-4 text-sm font-medium transition-colors ${
                importMethod === 'phrase'
                  ? 'text-amber-500 border-b-2 border-amber-500'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Seed Phrase
            </button>
            <button
              onClick={() => setImportMethod('privateKey')}
              className={`flex-1 py-2 px-4 text-sm font-medium transition-colors ${
                importMethod === 'privateKey'
                  ? 'text-amber-500 border-b-2 border-amber-500'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Private Key
            </button>
          </div>

          {importMethod === 'phrase' ? (
            <div>
              <label className="block text-sm font-medium mb-2">Seed Phrase (12 or 24 words)</label>
              <textarea
                value={mnemonic}
                onChange={(e) => setMnemonic(e.target.value)}
                className="input"
                rows={4}
                placeholder="word1 word2 word3 ..."
              />
              <p className="text-xs text-zinc-500 mt-1">
                Enter your 12 or 24-word seed phrase separated by spaces
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-2">Private Key</label>
              <textarea
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                className="input"
                rows={3}
                placeholder="L... or 0x..."
              />
              <p className="text-xs text-zinc-500 mt-1">
                Supports WIF format (L...) or hex format (0x...)
              </p>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="Enter password (min 8 characters)"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input"
              placeholder="Confirm password"
            />
          </div>
          
          <button
            onClick={handleImportWallet}
            disabled={loading}
            className="btn btn-primary w-full"
          >
            {loading ? 'Importing...' : 'Import Wallet'}
          </button>
        </div>
      </div>
    </div>
  );
}
