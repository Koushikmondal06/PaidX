import 'server-only';
import {
  type Address,
  type Hex,
} from 'viem';
import { getServerPublicClient, CHAIN_ID } from '@/lib/chain';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  CARD_REGISTRY_ABI,
  MERCHANT_REGISTRY_ABI,
  getCardRegistryAddress,
  getMerchantRegistryAddress,
} from '@/lib/contracts';
import type { Json } from '@/lib/supabase/types';

const CARD_STATUS_NAMES = ['inactive', 'active', 'frozen', 'revoked'] as const;

export interface IndexerRunResult {
  startBlock: number;
  endBlock: number;
  eventsProcessed: number;
  cursorAdvanced: boolean;
}

/**
 * Runs an idempotent sync cycle across Sepolia event logs for CardRegistry and MerchantRegistry.
 */
export async function runIndexerSync(): Promise<IndexerRunResult> {
  const supabase = createServerSupabaseClient();
  const publicClient = getServerPublicClient();

  const cardRegistryAddress = (getCardRegistryAddress() as Address).toLowerCase() as Address;
  const merchantRegistryAddress = (getMerchantRegistryAddress() as Address).toLowerCase() as Address;

  // 1. Get or create indexer cursor for CardRegistry
  const { data: cursor } = await supabase
    .from('indexer_cursors')
    .select('*')
    .eq('contract_address', cardRegistryAddress)
    .eq('chain_id', CHAIN_ID)
    .maybeSingle();

  const currentBlock = Number(await publicClient.getBlockNumber());
  let lastBlock = cursor?.last_block ? Number(cursor.last_block) : currentBlock - 100;
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

  // 2. Fetch logs from CardRegistry
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
      const serializedArgs = JSON.parse(
        JSON.stringify(log.args || {}, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
      ) as Json;

      const { error: eventError } = await supabase.from('chain_events').insert({
        chain_id: CHAIN_ID,
        tx_hash: txHash,
        log_index: logIndex,
        event_name: eventName,
        contract_address: cardRegistryAddress,
        block_number: blockNumber,
        args: serializedArgs,
        payload: serializedArgs,
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
    throw err;
  }

  // 3. Fetch logs from MerchantRegistry
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

      const serializedMerchantArgs = JSON.parse(
        JSON.stringify(log.args || {}, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
      ) as Json;

      await supabase.from('chain_events').insert({
        chain_id: CHAIN_ID,
        tx_hash: txHash,
        log_index: logIndex,
        event_name: eventName,
        contract_address: merchantRegistryAddress,
        block_number: blockNumber,
        args: serializedMerchantArgs,
        payload: serializedMerchantArgs,
      });

      if (eventName === 'MerchantRegistered' && log.args) {
        const { payoutAddress } = log.args as { merchantId: Hex; payoutAddress: Address };
        await supabase
          .from('merchants')
          .update({
            status: 'active',
            payout_address: payoutAddress.toLowerCase(),
            register_tx_hash: txHash,
            registration_tx_hash: txHash,
            updated_at: new Date().toISOString(),
          })
          .eq('payout_address', payoutAddress.toLowerCase());
      }
    }
  } catch (err) {
    console.error('[Indexer] Error reading MerchantRegistry events:', err);
    throw err;
  }

  // 4. Advance indexer cursor ONLY after successful range
  await supabase.from('indexer_cursors').upsert(
    {
      chain_id: CHAIN_ID,
      contract_address: cardRegistryAddress,
      last_block: toBlock,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'chain_id,contract_address' }
  );

  return {
    startBlock: lastBlock,
    endBlock: toBlock,
    eventsProcessed,
    cursorAdvanced: true,
  };
}
