import 'server-only';
import {
  createWalletClient,
  encodeFunctionData,
  type Hex,
  type Address,
} from 'viem';
import { getServerPublicClient, getServerTransport, sepolia, CHAIN_ID } from '@/lib/chain';
import { getSmartAccountsEnvironment, contracts, ExecutionMode } from '@metamask/smart-accounts-kit';
import { getSessionAccount } from './sessionAccount';
import { ERC20_ABI } from '@/lib/contracts';

export interface PaymentExecutionResult {
  success: boolean;
  userOpHash?: string;
  txHash?: string;
  blockNumber?: number;
  failureReason?: string;
  errorCode?: string;
}

/**
 * Authoritatively executes an on-chain settlement on Ethereum Sepolia.
 * Uses customer's approved allowance to transfer tokens directly to the merchant.
 * The session relayer only pays gas; it NEVER spends its own funds for customer retail purchases.
 */
export async function executeDelegationRedemption({
  tokenAddress,
  recipientAddress,
  amount,
  grantPayload,
  payerAddress,
}: {
  tokenAddress: string;
  recipientAddress: string;
  amount: bigint;
  grantPayload: any;
  payerAddress?: string;
}): Promise<PaymentExecutionResult> {
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

  let publicClient;
  let walletClient;
  try {
    publicClient = getServerPublicClient();
    walletClient = createWalletClient({
      account: sessionAccount,
      chain: sepolia,
      transport: getServerTransport(),
    });
  } catch (rpcErr: unknown) {
    const msg = rpcErr instanceof Error ? rpcErr.message : 'RPC transport configuration error';
    return {
      success: false,
      errorCode: 'RPC_UNCONFIGURED',
      failureReason: msg,
    };
  }

  const env = getSmartAccountsEnvironment(CHAIN_ID);
  const delegationManagerAddress = (
    process.env.DELEGATION_MANAGER_ADDRESS ||
    env?.DelegationManager ||
    '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3'
  ) as Address;

  const transferCalldata = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [recipientAddress as Address, amount],
  });

  try {
    let txHash: Hex;
    let userOpHash: string | undefined = undefined;

    // Check if grantPayload includes a signed delegation
    const signedDelegation = grantPayload?.delegation || grantPayload;
    if (signedDelegation && signedDelegation.delegator) {
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

      // Submit transaction to DelegationManager via session account
      txHash = await walletClient.sendTransaction({
        to: delegationManagerAddress,
        data: redeemCalldata,
      });
    } else {
      // Direct session transfer via customer-approved spending allowance
      const resolvedPayer = (payerAddress || grantPayload?.payerAddress) as Address;
      if (!resolvedPayer || resolvedPayer.toLowerCase() === sessionAccount.address.toLowerCase()) {
        throw new Error('Valid customer payer wallet address is required. Session relayer cannot be the payer.');
      }

      const transferFromCalldata = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transferFrom',
        args: [resolvedPayer, recipientAddress as Address, amount],
      });

      txHash = await walletClient.sendTransaction({
        to: tokenAddress as Address,
        data: transferFromCalldata,
      });
    }

    // Wait for the authoritative on-chain receipt on Ethereum Sepolia
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
