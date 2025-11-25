/**
 * Validates a Zcash transparent address
 */
export function validateZcashAddress(address: string): { valid: boolean; error?: string } {
  const trimmed = address.trim();
  
  // Check if empty
  if (!trimmed) {
    return { valid: false, error: 'Address is required' };
  }
  
  // Check if starts with t1 (Zcash transparent address)
  if (!trimmed.startsWith('t1')) {
    return { 
      valid: false, 
      error: 'Invalid address format. Zcash transparent addresses start with "t1"' 
    };
  }
  
  // Check length (Zcash t-addresses are typically 35 characters)
  if (trimmed.length < 34 || trimmed.length > 36) {
    return { 
      valid: false, 
      error: 'Invalid address length. Expected 35 characters' 
    };
  }
  
  // Check for valid characters (base58: no 0, O, I, l)
  const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
  if (!base58Regex.test(trimmed)) {
    return { 
      valid: false, 
      error: 'Invalid characters in address. Use only base58 characters' 
    };
  }
  
  return { valid: true };
}

/**
 * Validates ZEC amount
 */
export function validateZecAmount(amount: string, balance: number): { valid: boolean; error?: string } {
  const num = Number(amount);
  
  if (!amount || amount.trim() === '') {
    return { valid: false, error: 'Amount is required' };
  }
  
  if (!Number.isFinite(num)) {
    return { valid: false, error: 'Please enter a valid number' };
  }
  
  if (num <= 0) {
    return { valid: false, error: 'Amount must be greater than zero' };
  }
  
  if (num > balance / 100000000) {
    return { 
      valid: false, 
      error: `Insufficient balance. You have ${(balance / 100000000).toFixed(8)} ZEC` 
    };
  }
  
  return { valid: true };
}
