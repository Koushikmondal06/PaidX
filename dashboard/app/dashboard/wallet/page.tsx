'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { getRealUserSession, UserSession } from '@/lib/auth';
import { CHAIN_ID, EXPLORER_URL, getExplorerTxUrl, getExplorerAddressUrl, truncateAddress } from '@/lib/base';
import { getBrowserPublicClient, getBrowserWalletClient } from '@/lib/chain';
import { SUPPORTED_TOKENS, SupportedTokenSymbol, FAUCET_CONFIG } from '@/lib/tokens';
import { ERC20_ABI } from '@/lib/contracts';
import {
  isAddress,
  zeroAddress,
  parseUnits,
  parseEther,
  formatUnits,
  type Address,
  type Hash,
} from 'viem';
import {
  Wallet,
  ArrowUpRight,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  PlusCircle,
  AlertTriangle,
  Send,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Zap,
} from 'lucide-react';

export default function ConsoleWalletPage() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<Address | null>(null);

  // Balances
  const [ethRawBalance, setEthRawBalance] = useState<bigint>(0n);
  const [usdcRawBalance, setUsdcRawBalance] = useState<bigint>(0n);
  const [isLoadingBalances, setIsLoadingBalances] = useState(true);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  // Currency selection & Send Form
  const [selectedCurrency, setSelectedCurrency] = useState<SupportedTokenSymbol>('USDC');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [showReviewModal, setShowReviewModal] = useState(false);

  // Transaction execution status
  type TxStatus = 'idle' | 'prompting_wallet' | 'submitted' | 'confirming' | 'confirmed' | 'failed' | 'timeout';
  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [txHash, setTxHash] = useState<Hash | null>(null);
  const [txErrorMessage, setTxErrorMessage] = useState<string | null>(null);

  // Copy feedback
  const [copied, setCopied] = useState(false);
  const [watchAssetStatus, setWatchAssetStatus] = useState<'idle' | 'success' | 'rejected'>('idle');

  // Backend session relayer state
  const [relayerAddress, setRelayerAddress] = useState<Address | null>(null);
  const [relayerBalance, setRelayerBalance] = useState<bigint>(0n);
  const [isFundingRelayer, setIsFundingRelayer] = useState(false);

  // Load active session and connected address
  useEffect(() => {
    async function loadSession() {
      const s = await getRealUserSession();
      setSession(s);
      const addr = (s?.smartAccountAddress || s?.eoaAddress) as Address | undefined;
      if (addr && isAddress(addr)) {
        setConnectedAddress(addr);
      }
      fetch('/api/session-account')
        .then((r) => r.json())
        .then((d) => {
          if (d?.sessionAccountAddress && isAddress(d.sessionAccountAddress)) {
            setRelayerAddress(d.sessionAccountAddress as Address);
          }
        })
        .catch(() => {});
    }
    loadSession();
  }, []);

  // Fetch balances from on-chain public client
  const fetchBalances = useCallback(async (addr?: Address) => {
    const target = addr || connectedAddress;
    if (!target) {
      setIsLoadingBalances(false);
      return;
    }

    setIsLoadingBalances(true);
    setBalanceError(null);

    try {
      const publicClient = getBrowserPublicClient();

      // 1. ETH native balance
      const ethBal = await publicClient.getBalance({ address: target });
      setEthRawBalance(ethBal);

      // 2. USDC contract balance
      const usdcAddress = SUPPORTED_TOKENS.USDC.address;
      if (usdcAddress) {
        const usdcBal = (await publicClient.readContract({
          address: usdcAddress,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [target],
        })) as bigint;
        setUsdcRawBalance(usdcBal);
      }

      // 3. Relayer gas balance
      if (relayerAddress) {
        const rBal = await publicClient.getBalance({ address: relayerAddress });
        setRelayerBalance(rBal);
      }
    } catch (err: unknown) {
      console.error('[Console Wallet] Balance fetch error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to query on-chain balances';
      setBalanceError(msg);
    } finally {
      setIsLoadingBalances(false);
    }
  }, [connectedAddress, relayerAddress]);

  const handleFundRelayer = async () => {
    if (!relayerAddress || !connectedAddress) return;
    setIsFundingRelayer(true);
    setBalanceError(null);
    try {
      const walletClient = await getBrowserWalletClient(connectedAddress);
      const publicClient = getBrowserPublicClient();
      const hash = await walletClient.sendTransaction({
        account: connectedAddress,
        to: relayerAddress,
        value: parseEther('0.005'),
      });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      await fetchBalances();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fund session relayer';
      setBalanceError(msg);
    } finally {
      setIsFundingRelayer(false);
    }
  };

  useEffect(() => {
    if (connectedAddress) {
      fetchBalances(connectedAddress);
    }
  }, [connectedAddress, fetchBalances]);

  // Connect MetaMask if not loaded from session
  const handleConnectMetaMask = async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      alert('MetaMask is not installed. Please install MetaMask to use this wallet.');
      return;
    }
    try {
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[];
      if (accounts && accounts[0] && isAddress(accounts[0])) {
        setConnectedAddress(accounts[0] as Address);
        await fetchBalances(accounts[0] as Address);
      }
    } catch (err) {
      console.warn('[Connect MetaMask Exception]:', err);
    }
  };

  // Add USDC to MetaMask via EIP-747 (wallet_watchAsset)
  const handleAddUsdcToMetaMask = async () => {
    if (typeof window === 'undefined' || !window.ethereum) return;
    setWatchAssetStatus('idle');

    try {
      const success = await window.ethereum.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: SUPPORTED_TOKENS.USDC.address,
            symbol: 'USDC',
            decimals: SUPPORTED_TOKENS.USDC.decimals,
          },
        },
      });

      if (success) {
        setWatchAssetStatus('success');
        setTimeout(() => setWatchAssetStatus('idle'), 4000);
      } else {
        setWatchAssetStatus('rejected');
        setTimeout(() => setWatchAssetStatus('idle'), 4000);
      }
    } catch (err: unknown) {
      console.warn('[Add Asset Exception]:', err);
      setWatchAssetStatus('rejected');
      setTimeout(() => setWatchAssetStatus('idle'), 4000);
    }
  };

  // Copy address to clipboard
  const handleCopyAddress = () => {
    if (!connectedAddress) return;
    navigator.clipboard.writeText(connectedAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Calculate Max amount
  const handleSetMax = async () => {
    if (selectedCurrency === 'USDC') {
      const formatted = formatUnits(usdcRawBalance, SUPPORTED_TOKENS.USDC.decimals);
      setAmount(formatted);
    } else {
      try {
        const publicClient = getBrowserPublicClient();
        const gasPrice = await publicClient.getGasPrice();
        const gasBuffer = gasPrice * 25000n;
        if (ethRawBalance > gasBuffer) {
          const maxEth = ethRawBalance - gasBuffer;
          setAmount(formatUnits(maxEth, 18));
        } else {
          setAmount('0');
        }
      } catch {
        const buffer = 1000000000000000n; // 0.001 ETH
        if (ethRawBalance > buffer) {
          setAmount(formatUnits(ethRawBalance - buffer, 18));
        } else {
          setAmount('0');
        }
      }
    }
  };

  // Validate form before opening Review Modal
  const handleReview = (e: React.FormEvent) => {
    e.preventDefault();
    setTxErrorMessage(null);

    const trimmedTo = recipient.trim();
    if (!isAddress(trimmedTo)) {
      setTxErrorMessage('Please enter a valid Ethereum address.');
      return;
    }
    if (trimmedTo.toLowerCase() === zeroAddress.toLowerCase()) {
      setTxErrorMessage('Cannot send to the zero address (0x000...000).');
      return;
    }

    try {
      const tokenConfig = SUPPORTED_TOKENS[selectedCurrency];
      const parsed = parseUnits(amount.trim(), tokenConfig.decimals);
      if (parsed <= 0n) {
        setTxErrorMessage('Amount must be greater than 0.');
        return;
      }
      const available = selectedCurrency === 'USDC' ? usdcRawBalance : ethRawBalance;
      if (parsed > available) {
        setTxErrorMessage(`Insufficient ${selectedCurrency} balance.`);
        return;
      }
    } catch {
      setTxErrorMessage('Invalid amount entered.');
      return;
    }

    setShowReviewModal(true);
  };

  // Execute on-chain transfer via MetaMask
  const handleConfirmSend = async () => {
    setShowReviewModal(false);
    setTxStatus('prompting_wallet');
    setTxErrorMessage(null);
    setTxHash(null);

    try {
      if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('MetaMask is not available.');
      }

      // Check Chain ID and prompt switch if not Sepolia
      const currentChainHex = await window.ethereum.request({ method: 'eth_chainId' });
      const currentChainId = parseInt(currentChainHex as string, 16);
      if (currentChainId !== CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }],
          });
        } catch {
          throw new Error('Please switch MetaMask to Ethereum Sepolia Testnet before sending.');
        }
      }

      const senderAddress = connectedAddress as Address;
      const walletClient = await getBrowserWalletClient(senderAddress);
      const publicClient = getBrowserPublicClient();
      const targetToken = SUPPORTED_TOKENS[selectedCurrency];
      const parsedAmount = parseUnits(amount.trim(), targetToken.decimals);
      const recipientAddr = recipient.trim() as Address;

      let hash: Hash;

      if (selectedCurrency === 'ETH') {
        hash = await walletClient.sendTransaction({
          account: senderAddress,
          to: recipientAddr,
          value: parsedAmount,
        });
      } else {
        const tokenAddr = targetToken.address;
        if (!tokenAddr) throw new Error('Payment token contract address is not configured.');

        hash = await walletClient.writeContract({
          account: senderAddress,
          address: tokenAddr,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [recipientAddr, parsedAmount],
        });
      }

      setTxHash(hash);
      setTxStatus('confirming');

      try {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 1,
          timeout: 60_000,
        });

        if (receipt.status === 'success') {
          setTxStatus('confirmed');
          setAmount('');
          setRecipient('');
          await fetchBalances();
        } else {
          setTxStatus('failed');
          setTxErrorMessage('Transaction reverted on Base/Sepolia.');
        }
      } catch (receiptErr: unknown) {
        console.warn('[Tx Receipt Notice]:', receiptErr);
        setTxStatus('timeout');
      }
    } catch (err: unknown) {
      console.error('[Tx Send Exception]:', err);
      setTxStatus('failed');
      const msg = err instanceof Error ? err.message : 'Transaction failed';

      if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('denied')) {
        setTxErrorMessage('Transaction request was rejected in MetaMask.');
      } else if (msg.toLowerCase().includes('insufficient funds')) {
        setTxErrorMessage(
          'Insufficient gas funds. Network transactions require gas tokens.'
        );
      } else {
        setTxErrorMessage(msg);
      }
    }
  };

  const isSelfSend =
    connectedAddress && recipient.trim().toLowerCase() === connectedAddress.toLowerCase();

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header & Connected Account Card */}
      <div className="bg-white dark:bg-[#09152D] rounded-[24px] border border-[#E2E8F0] dark:border-white/10 p-6 sm:p-8 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0] dark:border-white/10">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-semibold font-archivo tracking-tight text-[#111111] dark:text-[#F5F8FF] flex items-center gap-2.5">
                <Wallet className="w-6 h-6 text-[#1749F5] dark:text-[#5B8EFF]" />
                Console Wallet
              </h1>
              <Badge variant="info">
                TESTNET
              </Badge>
            </div>
            <p className="text-xs sm:text-sm font-archivo text-[#64748B] dark:text-[#94A3B8]">
              Manage your smart account balances, claim test assets, and transfer tokens
            </p>
          </div>

          {connectedAddress ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyAddress}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#F8FAFC] dark:bg-white/5 hover:bg-[#F1F5F9] border border-[#E2E8F0] dark:border-white/10 text-xs font-mono text-[#111111] dark:text-[#F5F8FF] transition-colors"
                title="Click to copy full address"
              >
                <span>{truncateAddress(connectedAddress)}</span>
                {copied ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5 text-[#64748B]" />}
              </button>

              <a
                href={getExplorerAddressUrl(connectedAddress)}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-xl bg-[#F8FAFC] dark:bg-white/5 hover:bg-[#F1F5F9] border border-[#E2E8F0] dark:border-white/10 text-[#64748B] hover:text-[#1749F5] transition-colors"
                title="View on Explorer"
              >
                <ExternalLink className="w-4 h-4" />
              </a>

              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchBalances()}
                disabled={isLoadingBalances}
                title="Refresh balances"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBalances ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleConnectMetaMask}
              variant="primary"
              size="md"
            >
              Connect MetaMask
            </Button>
          )}
        </div>

        {/* Balances Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-archivo font-semibold text-[#111111] dark:text-[#F5F8FF]">
              Your Balances
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddUsdcToMetaMask}
              className="text-xs"
            >
              <PlusCircle className="w-3.5 h-3.5 mr-1 text-[#1749F5]" />
              {watchAssetStatus === 'success'
                ? 'USDC Added!'
                : watchAssetStatus === 'rejected'
                ? 'Request Cancelled'
                : 'Add USDC to MetaMask'}
            </Button>
          </div>

          {balanceError && (
            <div className="p-3.5 rounded-xl bg-[#FEF2F2] border border-red-200 text-[#EF4444] text-xs flex items-center justify-between gap-3">
              <span>{balanceError}</span>
              <Button size="sm" variant="outline" onClick={() => fetchBalances()} className="text-xs">
                Retry
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* USDC Balance Card in Lavender */}
            <div className="p-5 rounded-2xl bg-[#ECEEFF] dark:bg-[#0C1838] border border-[#DFE3F8] dark:border-white/10 flex flex-col justify-between space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-archivo font-semibold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider">
                  Settlement Currency
                </span>
                <Badge variant="active">USDC</Badge>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-semibold font-archivo tracking-tight text-[#111111] dark:text-[#F5F8FF]">
                  {isLoadingBalances ? (
                    <div className="h-8 w-28 bg-white/60 dark:bg-white/10 animate-pulse rounded-lg" />
                  ) : (
                    `$${formatUnits(usdcRawBalance, SUPPORTED_TOKENS.USDC.decimals)} USDC`
                  )}
                </div>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1">Circle Native Sepolia USDC</p>
              </div>
              {usdcRawBalance === 0n && !isLoadingBalances && (
                <div className="pt-2 border-t border-[#DFE3F8] dark:border-white/10">
                  <a
                    href={FAUCET_CONFIG.USDC.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#1749F5] dark:text-[#5B8EFF] font-medium inline-flex items-center gap-1 hover:underline"
                  >
                    Claim 10 USDC from Faucet <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            {/* ETH Balance Card */}
            <div className="p-5 rounded-2xl bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/10 flex flex-col justify-between space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-archivo font-semibold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider">
                  Gas Currency
                </span>
                <Badge variant="info">ETH</Badge>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-semibold font-archivo tracking-tight text-[#111111] dark:text-[#F5F8FF]">
                  {isLoadingBalances ? (
                    <div className="h-8 w-28 bg-[#E2E8F0] dark:bg-white/10 animate-pulse rounded-lg" />
                  ) : (
                    `${Number(formatUnits(ethRawBalance, 18)).toFixed(5)} ETH`
                  )}
                </div>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1">Required for network transaction fees</p>
              </div>
              {ethRawBalance === 0n && !isLoadingBalances && (
                <div className="pt-2 border-t border-[#E2E8F0] dark:border-white/10">
                  <a
                    href={FAUCET_CONFIG.ETH.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#1749F5] dark:text-[#5B8EFF] font-medium inline-flex items-center gap-1 hover:underline"
                  >
                    Claim Free Testnet ETH <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Session Relayer Gas Card */}
        {relayerAddress && (
          <div className="p-5 rounded-2xl bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-semibold font-archivo text-[#111111] dark:text-[#F5F8FF]">
                  POS Tap Settlement Relayer
                </span>
                <Badge variant={relayerBalance > 0n ? 'active' : 'warning'}>
                  {relayerBalance > 0n ? 'Gas Ready' : 'Low Gas'}
                </Badge>
              </div>
              <p className="text-xs font-mono text-[#64748B] dark:text-[#94A3B8]">
                Address: <span className="text-[#111111] dark:text-white font-medium">{truncateAddress(relayerAddress)}</span> • Balance:{' '}
                <strong className="text-[#111111] dark:text-white">{Number(formatUnits(relayerBalance, 18)).toFixed(5)} ETH</strong>
              </p>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                PaidX relayer that executes on-chain card tap redemptions.
              </p>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={handleFundRelayer}
              disabled={isFundingRelayer || !connectedAddress}
              className="text-xs whitespace-nowrap self-start sm:self-auto"
            >
              {isFundingRelayer ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Funding...
                </>
              ) : (
                <>Fund Relayer (0.005 ETH)</>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Send Form Card */}
      <div className="bg-white dark:bg-[#09152D] rounded-[24px] border border-[#E2E8F0] dark:border-white/10 p-6 sm:p-8 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] space-y-6">
        <div className="border-b border-[#E2E8F0] dark:border-white/10 pb-4">
          <h2 className="text-base sm:text-lg font-semibold font-archivo text-[#111111] dark:text-[#F5F8FF] flex items-center gap-2">
            <Send className="w-4 h-4 text-[#1749F5] dark:text-[#5B8EFF]" />
            Send Tokens
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#94A3B8] mt-0.5">
            Transfer ETH or USDC directly from your connected smart account
          </p>
        </div>

        {/* Currency Selector Segmented Control */}
        <div className="space-y-2">
          <label className="block text-xs sm:text-[13px] font-archivo font-medium text-[#111111] dark:text-[#F5F8FF]">
            Select Currency
          </label>
          <div className="grid grid-cols-2 gap-2 p-1.5 bg-[#F8FAFC] dark:bg-white/5 rounded-2xl border border-[#E2E8F0] dark:border-white/10">
            <button
              type="button"
              onClick={() => setSelectedCurrency('USDC')}
              className={`py-2 px-4 rounded-xl text-xs sm:text-sm font-archivo font-medium transition-all ${
                selectedCurrency === 'USDC'
                  ? 'bg-white dark:bg-[#09152D] text-[#1749F5] dark:text-[#5B8EFF] shadow-sm font-semibold'
                  : 'text-[#64748B] hover:text-[#111111] dark:hover:text-white'
              }`}
            >
              USDC (Circle Sepolia)
            </button>
            <button
              type="button"
              onClick={() => setSelectedCurrency('ETH')}
              className={`py-2 px-4 rounded-xl text-xs sm:text-sm font-archivo font-medium transition-all ${
                selectedCurrency === 'ETH'
                  ? 'bg-white dark:bg-[#09152D] text-[#1749F5] dark:text-[#5B8EFF] shadow-sm font-semibold'
                  : 'text-[#64748B] hover:text-[#111111] dark:hover:text-white'
              }`}
            >
              ETH (Sepolia Native)
            </button>
          </div>
        </div>

        <form onSubmit={handleReview} className="space-y-5">
          {/* Recipient Address */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs sm:text-[13px] font-archivo font-medium text-[#111111] dark:text-[#F5F8FF]">
                Recipient Address
              </label>
              {isSelfSend && (
                <span className="text-xs text-amber-500 font-medium">
                  Notice: Matches connected account
                </span>
              )}
            </div>
            <Input
              type="text"
              required
              placeholder="0x..."
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="font-mono text-xs sm:text-sm"
            />
          </div>

          {/* Amount with MAX button */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs sm:text-[13px] font-archivo font-medium text-[#111111] dark:text-[#F5F8FF]">
                Amount ({selectedCurrency})
              </label>
              <div className="text-xs text-[#64748B] dark:text-[#94A3B8] flex items-center gap-2">
                <span>
                  Available:{' '}
                  {selectedCurrency === 'USDC'
                    ? `${formatUnits(usdcRawBalance, 6)} USDC`
                    : `${Number(formatUnits(ethRawBalance, 18)).toFixed(4)} ETH`}
                </span>
                <button
                  type="button"
                  onClick={handleSetMax}
                  className="text-[#1749F5] dark:text-[#5B8EFF] font-semibold hover:underline"
                >
                  Max
                </button>
              </div>
            </div>
            <Input
              type="text"
              required
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {txErrorMessage && (
            <div className="p-3.5 rounded-xl bg-[#FEF2F2] border border-red-200 text-[#EF4444] text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{txErrorMessage}</span>
            </div>
          )}

          {/* Transaction Execution Status Feedback */}
          {txStatus !== 'idle' && (
            <div className="p-4 rounded-xl border bg-[#F8FAFC] dark:bg-white/5 border-[#E2E8F0] dark:border-white/10 space-y-2">
              {txStatus === 'prompting_wallet' && (
                <div className="flex items-center gap-2 text-[#1749F5] text-xs">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Waiting for confirmation in MetaMask...</span>
                </div>
              )}
              {txStatus === 'confirming' && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[#1749F5] text-xs font-medium">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Submitted to network. Waiting for block confirmation...</span>
                  </div>
                  {txHash && (
                    <a
                      href={getExplorerTxUrl(txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-[#1749F5] hover:underline flex items-center gap-1 font-mono"
                    >
                      Receipt: {truncateAddress(txHash)} <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
              {txStatus === 'confirmed' && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[#10B981] text-xs font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Transaction confirmed on Base L2!</span>
                  </div>
                  {txHash && (
                    <a
                      href={getExplorerTxUrl(txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-[#1749F5] hover:underline flex items-center gap-1 font-mono"
                    >
                      View Receipt on Explorer <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
              {txStatus === 'timeout' && (
                <div className="space-y-1 text-xs text-amber-600 dark:text-amber-300">
                  <p>Confirmation timeout. Transaction was broadcast and may confirm shortly.</p>
                  {txHash && (
                    <a
                      href={getExplorerTxUrl(txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#1749F5] hover:underline flex items-center gap-1 mt-1 font-mono"
                    >
                      Check Explorer for status <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          <Button
            type="submit"
            disabled={!connectedAddress || txStatus === 'prompting_wallet' || txStatus === 'confirming'}
            variant="primary"
            size="lg"
            className="w-full"
          >
            Review Transfer
          </Button>
        </form>
      </div>

      {/* Review Modal */}
      {showReviewModal && (
        <Modal
          isOpen={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          title="Review Transfer Details"
        >
          <div className="space-y-5 pt-2 font-archivo">
            <div className="bg-[#F8FAFC] dark:bg-white/5 p-5 rounded-2xl border border-[#E2E8F0] dark:border-white/10 space-y-3 text-xs sm:text-[13px]">
              <div className="flex justify-between">
                <span className="text-[#64748B] dark:text-[#94A3B8]">Network:</span>
                <span className="text-[#111111] dark:text-[#F5F8FF] font-medium">Base L2 / Sepolia</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B] dark:text-[#94A3B8]">Asset:</span>
                <span className="text-[#111111] dark:text-[#F5F8FF] font-medium">
                  {selectedCurrency} ({SUPPORTED_TOKENS[selectedCurrency].name})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B] dark:text-[#94A3B8]">Amount:</span>
                <span className="text-[#10B981] font-semibold text-sm">
                  {amount} {selectedCurrency}
                </span>
              </div>
              <div className="flex flex-col gap-1 border-t border-[#E2E8F0] dark:border-white/10 pt-2.5">
                <span className="text-[#64748B] dark:text-[#94A3B8]">Recipient:</span>
                <span className="text-[#111111] dark:text-[#F5F8FF] font-mono break-all font-medium">{recipient}</span>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2 border-t border-[#E2E8F0] dark:border-white/10">
              <Button
                variant="outline"
                size="md"
                onClick={() => setShowReviewModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleConfirmSend}
                className="flex-1"
              >
                Confirm in MetaMask
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
