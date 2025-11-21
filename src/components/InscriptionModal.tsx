import { type FormEvent } from 'react';

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
  const updateField = (field: string, value: string) => {
    onDataChange({ ...data, [field]: value });
  };

  let title = '';
  let fields: Array<{ name: string; label: string; placeholder: string }> = [];

  if (type === 'zrc20-deploy') {
    title = 'Deploy ZRC-20 Token';
    fields = [
      { name: 'tick', label: 'Token Ticker (4 chars)', placeholder: 'ZYNC' },
      { name: 'max', label: 'Max Supply', placeholder: '21000000' },
      { name: 'lim', label: 'Mint Limit (per tx)', placeholder: '1000' },
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
    ];
  } else if (type === 'nft-mint') {
    title = 'Mint NFT';
    fields = [
      { name: 'collection', label: 'Collection Symbol', placeholder: 'MNFT' },
      { name: 'metadata', label: 'Metadata JSON', placeholder: '{"name": "NFT #1", "image": "..."}' },
    ];
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-darker border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>
        <form className="space-y-4" onSubmit={onSubmit}>
          {fields.map((field) => (
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
          ))}
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
