import 'server-only';
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  type Hex,
  type Address,
} from 'viem';
import { sepolia } from 'viem/chains';
import { getSmartAccountsEnvironment, contracts, ExecutionMode } from '@metamask/smart-accounts-kit';
import { getSessionAccount } from './sessionAccount';
import { ERC20_ABI } from '@/lib/contracts';
import { CHAIN_ID } from '@/lib/base';

export interface PaymentExecutionResult {
  success: boolean;
  userOpHash?: string;
  txHash?: string;
  blockNumber?: number;
  failureReason?: string;
  errorCode?: string;
}

/**
 * Authoritatively executes an on-chain delegation redemption on Ethereum Sepolia.
 * NEVER returns fake hashes, mock receipts, or synthetic confirmation.
 */
export async function executeDelegationRedemption({
  tokenAddress,
  recipientAddress,
  amount,
  grantPayload,
}: {
  tokenAddress: string;
  recipientAddress: string;
  amount: bigint;
  grantPayload: any;
}): Promise<PaymentExecutionResult> {
  const rpcUrl = process.env.RPC_URL_SERVER || process.env.NEXT_PUBLIC_RPC_URL;
  if (!rpcUrl) {
    return {
      success: false,
      errorCode: 'RPC_UNCONFIGURED',
      failureReason: 'Server RPC endpoint (RPC_URL_SERVER or NEXT_PUBLIC_RPC_URL) is not configured',
    };
  }

  let sessionAccount;
  try {
    sessionAccount = getSessionAccount();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Session account error';
    return {
      success: false,
      errorCode: 'SESSION_ACCOUNT_UNCONFIGURED',
      failureReason: msg,
    };
  }

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account: sessionAccount,
    chain: sepolia,
    transport: http(rpcUrl),
  });

  const env = getSmartAccountsEnvironment(CHAIN_ID);
  const delegationManagerAddress = (env?.DelegationManager || '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3') as Address;

  // 1. Encode the target ERC-20 transfer: transfer(recipient, amount)
  const transferCalldata = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [recipientAddress as Address, amount],
  });

  try {
    // Check if bundler RPC URL is provided for ERC-4337 submission
    const bundlerRpcUrl = process.env.BUNDLER_RPC_URL;
    let userOpHash: string | undefined = undefined;

    // Build the redemption call
    let txHash: Hex;

    // Check if grantPayload includes a signed delegation
    const signedDelegation = grantPayload?.delegation || grantPayload;
    if (signedDelegation && signedDelegation.delegator) {
      // Encode redeemDelegations call using MetaMask Smart Accounts Kit contracts
      const redeemCalldata = contracts.DelegationManager.encode.redeemDelegations({
        delegations: [[signedDelegation]],
        modes: [ExecutionMode.SingleDefault],
        executions: [
          [
            {
              target: tokenAddress as Address,
              value: 0n,
              callData: transferCalldata,
            },
          ],
        ],
      });

      // Submit transaction to the network via session account
      txHash = await walletClient.sendTransaction({
        to: delegationManagerAddress,
        data: redeemCalldata,
      });
    } else {
      // If user permission is direct relayer transfer (fallback session authorization)
      txHash = await walletClient.sendTransaction({
        to: tokenAddress as Address,
        data: transferCalldata,
      });
    }

    // Wait for the authoritative on-chain receipt
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
      timeout: 60_000,
    });

    if (receipt.status === 'success') {
      return {
        success: true,
        txHash,
        userOpHash,
        blockNumber: Number(receipt.blockNumber),
      };
    } else {
      return {
        success: false,
        txHash,
        userOpHash,
        errorCode: 'TRANSACTION_REVERTED',
        failureReason: 'Transaction reverted on Ethereum Sepolia',
      };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Execution error';
    return {
      success: false,
      errorCode: 'TRANSACTION_FAILED',
      failureReason: msg,
    };
  }
}

