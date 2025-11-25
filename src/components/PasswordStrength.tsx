import { useMemo } from 'react';

interface Props {
  password: string;
}

export default function PasswordStrength({ password }: Props) {
  const strength = useMemo(() => {
    if (!password) return { level: 0, label: '', color: '' };
    
    let score = 0;
    
    // Length scoring
    if (password.length >= 6) score += 1;
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    
    // Character variety
    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^a-zA-Z0-9]/.test(password)) score += 1;
    
    // Determine strength level
    if (score <= 2) return { level: 1, label: 'Weak', color: 'bg-red-500' };
    if (score <= 4) return { level: 2, label: 'Fair', color: 'bg-orange-500' };
    if (score <= 5) return { level: 3, label: 'Good', color: 'bg-yellow-500' };
    return { level: 4, label: 'Strong', color: 'bg-green-500' };
  }, [password]);
  
  if (!password) return null;
  
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={`h-1 flex-1 rounded-full transition-all ${
              level <= strength.level ? strength.color : 'bg-zinc-700'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-zinc-400">
        Password strength: <span className={strength.color.replace('bg-', 'text-')}>{strength.label}</span>
      </p>
    </div>
  );
}
