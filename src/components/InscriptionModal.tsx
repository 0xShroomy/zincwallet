import { type FormEvent, useState } from 'react';

interface Props {
  type: string;
  data: Record<string, string>;
  onDataChange: (data: Record<string, string>) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  status: 'idle' | 'creating' | 'success';
  error: string | null;
}

export default function InscriptionModal({ type, data, onDataChange, onSubmit, onCancel, status, error }: Props) {
  const [gasFee, setGasFee] = useState<'low' | 'normal' | 'high'>('normal');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const updateField = (field: string, value: string) => {
    onDataChange({ ...data, [field]: value, gasFee });
  };
  
  const handleFileUpload = (file: File) => {
    // Check file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    
    // Check file size (20KB max)
    const maxSize = 20 * 1024;
    if (file.size > maxSize) {
      alert('Image must be less than 20KB');
      return;
    }
    
    // Convert to base64
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setImagePreview(base64);
      onDataChange({ ...data, imageData: base64, gasFee });
    };
    reader.readAsDataURL(file);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = () => {
    setIsDragging(false);
  };

  let title = '';
  let fields: Array<{ name: string; label: string; placeholder: string }> = [];

  if (type === 'zrc20-deploy') {
    title = 'Deploy ZRC-20 Token';
    fields = [
      { name: 'tick', label: 'Token Ticker (4 chars)', placeholder: 'ZYNC' },
      { name: 'max', label: 'Max Supply', placeholder: '21000000' },
      { name: 'lim', label: 'Mint Limit (per tx)', placeholder: '1000' },
      { name: 'mintPrice', label: 'Mint Price (ZEC, optional)', placeholder: '0.01' },
    ];
  } else if (type === 'zrc20-mint') {
    title = 'Mint ZRC-20 Token';
    fields = [
      { name: 'tick', label: 'Token Ticker', placeholder: 'ZYNC' },
      { name: 'amt', label: 'Amount to Mint', placeholder: '1000' },
    ];
  } else if (type === 'nft-deploy') {
    title = 'Deploy NFT Collection';
    fields = [
      { name: 'name', label: 'Collection Name', placeholder: 'My NFT Collection' },
      { name: 'symbol', label: 'Symbol (4 chars)', placeholder: 'MNFT' },
      { name: 'max', label: 'Max Supply', placeholder: '10000' },
      { name: 'mintPrice', label: 'Mint Price (ZEC, optional)', placeholder: '0.05' },
    ];
  } else if (type === 'nft-mint') {
    title = 'Mint NFT';
    fields = [
      { name: 'collection', label: 'Collection Symbol', placeholder: 'MNFT' },
      { name: 'metadata', label: 'Metadata JSON', placeholder: '{"name": "NFT #1", "image": "..."}' },
    ];
  } else if (type === 'zerdinals-zrc20-deploy') {
    title = 'Deploy ZRC-20 (Zerdinals)';
    fields = [
      { name: 'tick', label: 'Token Ticker (1-4 chars)', placeholder: 'ZERO' },
      { name: 'max', label: 'Max Supply', placeholder: '21000000' },
      { name: 'lim', label: 'Mint Limit (per tx)', placeholder: '1000' },
    ];
  } else if (type === 'zerdinals-zrc20-mint') {
    title = 'Mint ZRC-20 (Zerdinals)';
    fields = [
      { name: 'tick', label: 'Token Ticker', placeholder: 'ZERO' },
      { name: 'amt', label: 'Amount to Mint', placeholder: '1000' },
    ];
  } else if (type === 'zerdinals-text') {
    title = 'Inscribe Text (Zerdinals)';
    fields = [
      { name: 'text', label: 'Text Content', placeholder: 'Enter your text inscription...' },
    ];
  } else if (type === 'zerdinals-json') {
    title = 'Inscribe JSON (Zerdinals)';
    fields = [
      { name: 'json', label: 'JSON Content', placeholder: '{"key": "value"}' },
    ];
  } else if (type === 'zerdinals-image') {
    title = 'Inscribe Image (Zerdinals)';
    fields = [];  // Special handling for image upload
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-darker border border-zinc-700 rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>
        <form className="space-y-4" onSubmit={onSubmit}>
          {type === 'zerdinals-image' ? (
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Image</label>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDragging
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-zinc-700 hover:border-zinc-600'
                }`}
              >
                {imagePreview ? (
                  <div className="space-y-2">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="max-w-full max-h-48 mx-auto rounded"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setImagePreview(null);
                        onDataChange({ ...data, imageData: '', gasFee });
                      }}
                      className="text-sm text-red-400 hover:text-red-300"
                    >
                      Remove Image
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="text-4xl mb-2">📁</div>
                    <p className="text-white mb-1">Drop image here</p>
                    <p className="text-sm text-zinc-400 mb-3">or click to browse</p>
                    <p className="text-xs text-zinc-500">PNG, JPEG, SVG • Max 20KB</p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                      className="hidden"
                      id="image-upload"
                    />
                    <label
                      htmlFor="image-upload"
                      className="inline-block mt-3 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg cursor-pointer transition-colors text-white"
                    >
                      Choose File
                    </label>
                  </div>
                )}
              </div>
            </div>
          ) : (
            fields.map((field) => (
              <div key={field.name}>
                <label className="block text-sm text-zinc-400 mb-1">{field.label}</label>
                <input
                  className="input"
                  value={data[field.name] || ''}
                  onChange={(e) => updateField(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  required
                />
              </div>
            ))
          )}
          
          {/* Gas Fee Selector */}
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Gas Fee</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setGasFee('low')}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  gasFee === 'low'
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-zinc-700 hover:border-zinc-600'
                }`}
              >
                <div className="text-center">
                  <p className="text-xs text-zinc-400">Low</p>
                  <p className="text-sm font-medium text-white">0.0005</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setGasFee('normal')}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  gasFee === 'normal'
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-zinc-700 hover:border-zinc-600'
                }`}
              >
                <div className="text-center">
                  <p className="text-xs text-zinc-400">Normal</p>
                  <p className="text-sm font-medium text-white">0.001</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setGasFee('high')}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  gasFee === 'high'
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-zinc-700 hover:border-zinc-600'
                }`}
              >
                <div className="text-center">
                  <p className="text-xs text-zinc-400">High</p>
                  <p className="text-sm font-medium text-white">0.002</p>
                </div>
              </button>
            </div>
          </div>
          
          {/* Transaction Summary */}
          <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-800/50">
            <p className="text-sm font-medium text-white mb-3">Transaction Summary</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-400">Gas Fee:</span>
                <span className="text-white font-medium">
                  {gasFee === 'low' ? '0.0005' : gasFee === 'high' ? '0.002' : '0.001'} ZEC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Treasury Tip:</span>
                <span className="text-white font-medium">0.0015 ZEC</span>
              </div>
              {data.mintPrice && parseFloat(data.mintPrice) > 0 && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">Mint Price:</span>
                  <span className="text-white font-medium">{data.mintPrice} ZEC</span>
                </div>
              )}
              <div className="border-t border-zinc-700 pt-2 mt-2"></div>
              <div className="flex justify-between">
                <span className="text-zinc-300 font-medium">Total:</span>
                <span className="text-amber-500 font-bold">
                  {(
                    (gasFee === 'low' ? 0.0005 : gasFee === 'high' ? 0.002 : 0.001) +
                    0.0015 +
                    (data.mintPrice ? parseFloat(data.mintPrice) : 0)
                  ).toFixed(4)} ZEC
                </span>
              </div>
            </div>
          </div>
          
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          {status === 'success' && (
            <p className="text-sm text-emerald-400">Inscription created successfully!</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
              disabled={status === 'creating'}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={status === 'creating'}
            >
              {status === 'creating' ? 'Creating...' : 'Create Inscription'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
