import type { UTXO } from '@/types/wallet';
import type { InscriptionData } from '@/types/inscriptions';
import { WebZjsWallet, estimateTransactionFee } from '@/shared/webzjs';
import { DEFAULT_CONFIG } from '@/shared/config';

export interface TransactionParams {
  wallet: WebZjsWallet;
  inscription: InscriptionData;
  changeAddress: string;
}

/**
 * Builds and broadcasts an inscription transaction
 */
export async function buildInscriptionTransaction(params: TransactionParams): Promise<string> {
  const { wallet, inscription, changeAddress } = params;
  
  // Get UTXOs
  const utxos = await wallet.getUtxos();
  if (utxos.length === 0) {
    throw new Error('No UTXOs available');
  }
  
  // Calculate required amount
  const treasuryTip = inscription.tip;
  const recipientAmount = inscription.recipient ? 1000 : 0; // Dust amount if recipient exists
  
  // Estimate fee
  const opReturnSize = inscription.payload.length;
  const estimatedFee = estimateTransactionFee(
    1, // inputs (will adjust)
    recipientAmount > 0 ? 3 : 2, // outputs: treasury + change (+ recipient if exists)
    opReturnSize
  );
  
  const requiredAmount = treasuryTip + recipientAmount + estimatedFee;
  
  // Select UTXOs
  const selectedUtxos = selectUtxos(utxos, requiredAmount);
  const inputAmount = selectedUtxos.reduce((sum, utxo) => sum + utxo.value, 0);
  
  if (inputAmount < requiredAmount) {
    throw new Error(`Insufficient balance. Need ${requiredAmount} zatoshis, have ${inputAmount}`);
  }
  
  // Calculate actual fee with selected inputs
  const actualFee = estimateTransactionFee(
    selectedUtxos.length,
    recipientAmount > 0 ? 3 : 2,
    opReturnSize
  );
  
  const changeAmount = inputAmount - treasuryTip - recipientAmount - actualFee;
  
  if (changeAmount < 0) {
    throw new Error('Insufficient funds after fee calculation');
  }
  
  // Build transaction
  const txBuilder = wallet.createTransactionBuilder();
  
  // Add inputs
  for (const utxo of selectedUtxos) {
    txBuilder.addInput(utxo);
  }
  
  // Add OP_RETURN output
  txBuilder.addOpReturn(inscription.payload);
  
  // Add treasury tip output
  txBuilder.addOutput(DEFAULT_CONFIG.zincTreasuryAddress, treasuryTip);
  
  // Add recipient output if specified
  if (inscription.recipient && recipientAmount > 0) {
    txBuilder.addOutput(inscription.recipient, recipientAmount);
  }
  
  // Add change output (if significant amount)
  if (changeAmount > 1000) { // Dust threshold
    txBuilder.addOutput(changeAddress, changeAmount);
  }
  
  txBuilder.setFee(actualFee);
  
  // Build, sign, and broadcast
  await txBuilder.build();
  
  const account = wallet.getAccount();
  if (!account) {
    throw new Error('No account available');
  }
  
  await txBuilder.sign(account.privateKey);
  const txid = await txBuilder.broadcast();
  
  return txid;
}

/**
 * Selects UTXOs to cover the required amount
 * Uses a simple greedy algorithm
 */
function selectUtxos(utxos: UTXO[], requiredAmount: number): UTXO[] {
  // Sort by value descending
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  
  const selected: UTXO[] = [];
  let total = 0;
  
  for (const utxo of sorted) {
    selected.push(utxo);
    total += utxo.value;
    
    if (total >= requiredAmount) {
      break;
    }
  }
  
  return selected;
}

/**
 * Estimates the total cost of an inscription transaction
 */
export function estimateInscriptionCost(inscriptionSize: number, hasRecipient: boolean = false): {
  treasuryTip: number;
  recipientAmount: number;
  estimatedFee: number;
  total: number;
} {
  const treasuryTip = DEFAULT_CONFIG.zincMinTip;
  const recipientAmount = hasRecipient ? 1000 : 0;
  const estimatedFee = estimateTransactionFee(
    1,
    hasRecipient ? 3 : 2,
    inscriptionSize
  );
  
  return {
    treasuryTip,
    recipientAmount,
    estimatedFee,
    total: treasuryTip + recipientAmount + estimatedFee,
  };
}
