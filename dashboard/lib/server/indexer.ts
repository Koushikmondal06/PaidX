import 'server-only';
import {
  createPublicClient,
  http,
  parseAbiItem,
  type Address,
  type Hex,
} from 'viem';
import { sepolia } from 'viem/chains';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { CHAIN_ID } from '@/lib/base';
import { CARD_REGISTRY_ABI, MERCHANT_REGISTRY_ABI, ERC20_ABI } from '@/lib/contracts';

const CURSOR_NAME = 'sepolia_paidx';

const CARD_STATUS_NAMES = ['inactive', 'active', 'frozen', 'revoked'] as const;

export interface IndexerRunResult {
  startBlock: number;
  endBlock: number;
  eventsProcessed: number;
  cursorAdvanced: boolean;
}

/**
 * Runs an idempotent sync cycle across Sepolia event logs.
 */
export async function runIndexerSync(): Promise<IndexerRunResult> {
  const rpcUrl = process.env.RPC_URL_SERVER || process.env.NEXT_PUBLIC_RPC_URL;
  if (!rpcUrl) {
    throw new Error('[Indexer] Missing RPC endpoint for indexer');
  }

  const supabase = createServerSupabaseClient();
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });

  // 1. Get or create indexer cursor
  const { data: cursor } = await supabase
    .from('indexer_cursors')
    .select('*')
    .eq('cursor_name', CURSOR_NAME)
    .eq('chain_id', CHAIN_ID)
    .maybeSingle();

  const currentBlock = Number(await publicClient.getBlockNumber());
  let lastBlock = cursor?.last_block ? Number(cursor.last_block) : currentBlock - 50;
  if (lastBlock < 0) lastBlock = 0;

  // Sync up to 500 blocks at a time to prevent RPC limits
  const toBlock = Math.min(currentBlock, lastBlock + 500);

  if (lastBlock >= toBlock) {
    return {
      startBlock: lastBlock,
      endBlock: toBlock,
      eventsProcessed: 0,
      cursorAdvanced: false,
    };
  }

  let eventsProcessed = 0;
  const cardRegistryAddress = process.env.NEXT_PUBLIC_CARD_REGISTRY_ADDRESS as Address | undefined;
  const merchantRegistryAddress = process.env.NEXT_PUBLIC_MERCHANT_REGISTRY_ADDRESS as Address | undefined;

  // 2. Fetch logs from CardRegistry if deployed
  if (cardRegistryAddress) {
    try {
      const cardLogs = await publicClient.getContractEvents({
        address: cardRegistryAddress,
        abi: CARD_REGISTRY_ABI,
        fromBlock: BigInt(lastBlock + 1),
        toBlock: BigInt(toBlock),
      });

      for (const log of cardLogs) {
        const txHash = log.transactionHash;
        const logIndex = Number(log.logIndex);
        const blockNumber = Number(log.blockNumber);
        const eventName = log.eventName;

        // Idempotent insertion into chain_events
        const { error: eventError } = await supabase.from('chain_events').insert({
          chain_id: CHAIN_ID,
          tx_hash: txHash,
          log_index: logIndex,
          event_name: eventName,
          contract_address: cardRegistryAddress.toLowerCase(),
          block_number: blockNumber,
          payload: (log.args as unknown as Record<string, unknown>) || {},
        });

        if (!eventError) {
          eventsProcessed++;
        }

        // Apply state updates to cards
        if (eventName === 'CardRegistered' && log.args) {
          const { cardHash } = log.args as { cardHash: Hex; owner: Address };
          await supabase
            .from('cards')
            .update({
              status: 'active',
              registration_tx_hash: txHash,
              registered_at_block: blockNumber,
              updated_at: new Date().toISOString(),
            })
            .eq('uid_hash', cardHash);
        } else if (eventName === 'CardStatusUpdated' && log.args) {
          const { cardHash, newStatus } = log.args as { cardHash: Hex; newStatus: number };
          const mappedStatus = CARD_STATUS_NAMES[newStatus] || 'active';
          if (mappedStatus !== 'inactive') {
            await supabase
              .from('cards')
              .update({
                status: mappedStatus as 'active' | 'frozen' | 'revoked',
                updated_at: new Date().toISOString(),
              })
              .eq('uid_hash', cardHash);
          }
        }
      }
    } catch (err) {
      console.error('[Indexer] Error reading CardRegistry events:', err);
    }
  }

  // 3. Fetch logs from MerchantRegistry if deployed
  if (merchantRegistryAddress) {
    try {
      const merchantLogs = await publicClient.getContractEvents({
        address: merchantRegistryAddress,
        abi: MERCHANT_REGISTRY_ABI,
        fromBlock: BigInt(lastBlock + 1),
        toBlock: BigInt(toBlock),
      });

      for (const log of merchantLogs) {
        const txHash = log.transactionHash;
        const logIndex = Number(log.logIndex);
        const blockNumber = Number(log.blockNumber);
        const eventName = log.eventName;

        await supabase.from('chain_events').insert({
          chain_id: CHAIN_ID,
          tx_hash: txHash,
          log_index: logIndex,
          event_name: eventName,
          contract_address: merchantRegistryAddress.toLowerCase(),
          block_number: blockNumber,
          payload: (log.args as unknown as Record<string, unknown>) || {},
        });

        if (eventName === 'MerchantRegistered' && log.args) {
          const { payoutAddress } = log.args as { merchantId: Hex; payoutAddress: Address };
          await supabase
            .from('merchants')
            .update({
              is_active: true,
              payout_address: payoutAddress.toLowerCase(),
              registration_tx_hash: txHash,
              updated_at: new Date().toISOString(),
            })
            .eq('payout_address', payoutAddress.toLowerCase());
        }
      }
    } catch (err) {
      console.error('[Indexer] Error reading MerchantRegistry events:', err);
    }
  }

  // 4. Advance indexer cursor atomically
  await supabase.from('indexer_cursors').upsert({
    cursor_name: CURSOR_NAME,
    chain_id: CHAIN_ID,
    last_block: toBlock,
    updated_at: new Date().toISOString(),
  });

  return {
    startBlock: lastBlock,
    endBlock: toBlock,
    eventsProcessed,
    cursorAdvanced: true,
  };
}
