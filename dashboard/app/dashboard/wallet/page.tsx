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
        .catch(() => { });
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
      // For ETH, reserve gas buffer
      try {
        const publicClient = getBrowserPublicClient();
        const gasPrice = await publicClient.getGasPrice();
        const gasBuffer = gasPrice * 25000n; // ~25k gas safety margin
        if (ethRawBalance > gasBuffer) {
          const maxEth = ethRawBalance - gasBuffer;
          setAmount(formatUnits(maxEth, 18));
        } else {
          setAmount('0');
        }
      } catch {
        // Fallback default buffer: 0.001 ETH
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
        } catch (switchErr: unknown) {
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
        // Native ETH transfer
        hash = await walletClient.sendTransaction({
          account: senderAddress,
          to: recipientAddr,
          value: parsedAmount,
        });
      } else {
        // USDC ERC-20 transfer
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

      // Wait for authoritative receipt with timeout handling
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
          // Refresh balances after confirmed transaction
          await fetchBalances();
        } else {
          setTxStatus('failed');
          setTxErrorMessage('Transaction reverted on Ethereum Sepolia.');
        }
      } catch (receiptErr: unknown) {
        // RPC timeout or pending: tx may still be processed on-chain!
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
          'Insufficient Sepolia ETH for gas. Even when transferring USDC, Ethereum requires Sepolia ETH to pay network gas fees.'
        );
      } else {
        setTxErrorMessage(msg);
      }
    }
  };

  const isSelfSend =
    connectedAddress && recipient.trim().toLowerCase() === connectedAddress.toLowerCase();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Testnet Banner */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start sm:items-center justify-between gap-3 text-amber-300 text-xs sm:text-sm">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
          <span>
            <strong>TESTNET ENVIRONMENT:</strong> This console uses Ethereum Sepolia (Chain ID: {CHAIN_ID}). All coins are free test funds with no monetary value.
          </span>
        </div>
      </div>

      {/* Header & Connected Account Card */}
      <Card className="p-6 border-slate-800 bg-slate-900/90 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                <Wallet className="w-6 h-6 text-indigo-400" />
                Console Wallet
              </h1>
              <Badge variant="info" className="border-indigo-500/40 bg-indigo-500/10 text-indigo-300 text-xs">
                Sepolia Testnet
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-slate-400">
              Manage your self-custody wallet balances, claim faucets, and transfer test coins.
            </p>
          </div>

          {connectedAddress ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyAddress}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono text-slate-200 transition-colors"
                title="Click to copy full address"
              >
                <span>{truncateAddress(connectedAddress)}</span>
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              </button>

              <a
                href={getExplorerAddressUrl(connectedAddress)}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
                title="View on Sepolia Etherscan"
              >
                <ExternalLink className="w-4 h-4" />
              </a>

              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchBalances()}
                disabled={isLoadingBalances}
                className="border-slate-700 hover:bg-slate-800 text-slate-300"
                title="Refresh balances"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBalances ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleConnectMetaMask}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm"
            >
              Connect MetaMask
            </Button>
          )}
        </div>
      </Card>

      {/* Balances Card */}
      <Card className="p-6 border-slate-800 bg-slate-900/90 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <h2 className="text-base font-semibold text-white">Your Balances</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddUsdcToMetaMask}
            className="text-xs border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 flex items-center gap-1.5"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            {watchAssetStatus === 'success'
              ? 'USDC Added!'
              : watchAssetStatus === 'rejected'
                ? 'Request Cancelled'
                : 'Add USDC to MetaMask'}
          </Button>
        </div>

        {balanceError && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3">
            <span>{balanceError}</span>
            <Button size="sm" variant="outline" onClick={() => fetchBalances()} className="text-xs h-7 border-rose-500/40 text-rose-300">
              Retry
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* USDC Balance */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Payment Currency</span>
              <Badge variant="active" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs">
                ERC-20
              </Badge>
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight text-white">
                {isLoadingBalances ? (
                  <div className="h-8 w-24 bg-slate-800 animate-pulse rounded"></div>
                ) : (
                  `${formatUnits(usdcRawBalance, SUPPORTED_TOKENS.USDC.decimals)} USDC`
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">Circle Official Sepolia USDC</p>
            </div>
            {usdcRawBalance === 0n && !isLoadingBalances && (
              <div className="pt-2 border-t border-slate-800/80">
                <a
                  href={FAUCET_CONFIG.USDC.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1"
                >
                  Claim 10 USDC from Circle Faucet <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>

          {/* Sepolia ETH Balance */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Gas Currency</span>
              <Badge variant="info" className="border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs">
                Native
              </Badge>
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight text-white">
                {isLoadingBalances ? (
                  <div className="h-8 w-24 bg-slate-800 animate-pulse rounded"></div>
                ) : (
                  `${Number(formatUnits(ethRawBalance, 18)).toFixed(5)} ETH`
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">Required for network transaction fees</p>
            </div>
            {ethRawBalance === 0n && !isLoadingBalances && (
              <div className="pt-2 border-t border-slate-800/80">
                <a
                  href={FAUCET_CONFIG.ETH.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium inline-flex items-center gap-1"
                >
                  Claim Free Sepolia ETH Faucet <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Session Relayer Gas Card */}
      {relayerAddress && (
        <Card className="p-4 sm:p-5 border-slate-800 bg-slate-900/60 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white">POS Tap Settlement Relayer</span>
              <Badge variant={relayerBalance > 0n ? 'active' : 'warning'} className="text-[10px]">
                {relayerBalance > 0n ? 'Gas Ready' : 'Low Gas'}
              </Badge>
            </div>
            <p className="text-[11px] font-mono text-slate-400">
              Address: <span className="text-slate-300">{truncateAddress(relayerAddress)}</span> • Balance:{' '}
              <strong className="text-white">{Number(formatUnits(relayerBalance, 18)).toFixed(5)} ETH</strong>
            </p>
            <p className="text-[11px] text-slate-500">
              PaidX server account that submits on-chain card tap redemptions.
            </p>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={handleFundRelayer}
            disabled={isFundingRelayer || !connectedAddress}
            className="border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/10 font-mono text-xs whitespace-nowrap self-start sm:self-auto"
          >
            {isFundingRelayer ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                Funding Relayer...
              </>
            ) : (
              <>Fund Relayer (0.005 ETH)</>
            )}
          </Button>
        </Card>
      )}

      {/* Send Form Card */}
      <Card className="p-6 border-slate-800 bg-slate-900/90 shadow-xl space-y-6">
        <div className="border-b border-slate-800 pb-4">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Send className="w-4 h-4 text-indigo-400" />
            Send Testnet Coins
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Transfer Sepolia ETH or USDC directly from your connected MetaMask wallet.
          </p>
        </div>

        {/* Currency Selector Segmented Control */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-300">Select Currency</label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setSelectedCurrency('USDC')}
              className={`py-2 px-4 rounded-lg text-xs font-medium transition-all ${selectedCurrency === 'USDC'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              USDC (Circle Sepolia)
            </button>
            <button
              type="button"
              onClick={() => setSelectedCurrency('ETH')}
              className={`py-2 px-4 rounded-lg text-xs font-medium transition-all ${selectedCurrency === 'ETH'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              ETH (Sepolia Native)
            </button>
          </div>
        </div>

        <form onSubmit={handleReview} className="space-y-4">
          {/* Recipient Address */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Recipient Address
              </label>
              {isSelfSend && (
                <span className="text-xs text-amber-400 font-medium">
                  Notice: This matches your own connected address
                </span>
              )}
            </div>
            <Input
              type="text"
              required
              placeholder="0x..."
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="bg-slate-950 border-slate-800 font-mono text-xs text-white"
            />
          </div>

          {/* Amount with MAX button */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Amount ({selectedCurrency})
              </label>
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <span>
                  Available:{' '}
                  {selectedCurrency === 'USDC'
                    ? `${formatUnits(usdcRawBalance, 6)} USDC`
                    : `${Number(formatUnits(ethRawBalance, 18)).toFixed(4)} ETH`}
                </span>
                <button
                  type="button"
                  onClick={handleSetMax}
                  className="text-indigo-400 hover:text-indigo-300 font-semibold underline"
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
              className="bg-slate-950 border-slate-800 text-white"
            />
          </div>

          {txErrorMessage && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{txErrorMessage}</span>
            </div>
          )}

          {/* Transaction Execution Status Feedback */}
          {txStatus !== 'idle' && (
            <div className="p-4 rounded-xl border bg-slate-950/70 border-slate-800 space-y-2">
              {txStatus === 'prompting_wallet' && (
                <div className="flex items-center gap-2 text-indigo-400 text-xs">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Waiting for confirmation in MetaMask...</span>
                </div>
              )}
              {txStatus === 'confirming' && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-blue-400 text-xs">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Submitted to network. Waiting for block confirmation...</span>
                  </div>
                  {txHash && (
                    <a
                      href={getExplorerTxUrl(txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      View on Sepolia Etherscan: {truncateAddress(txHash)} <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
              {txStatus === 'confirmed' && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Transaction confirmed on Ethereum Sepolia!</span>
                  </div>
                  {txHash && (
                    <a
                      href={getExplorerTxUrl(txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      View Receipt on Sepolia Etherscan <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
              {txStatus === 'timeout' && (
                <div className="space-y-1 text-xs text-amber-300">
                  <p>Confirmation polling reached timeout. Your transaction was broadcast and may still confirm shortly.</p>
                  {txHash && (
                    <a
                      href={getExplorerTxUrl(txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-400 hover:underline flex items-center gap-1 mt-1"
                    >
                      Check Sepolia Etherscan for status <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          <Button
            type="submit"
            disabled={!connectedAddress || txStatus === 'prompting_wallet' || txStatus === 'confirming'}
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
          >
            Review Transfer
          </Button>
        </form>
      </Card>

      {/* Review Modal */}
      {showReviewModal && (
        <Modal
          isOpen={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          title="Review Transfer Details"
        >
          <div className="space-y-4 pt-2">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Network:</span>
                <span className="text-white font-medium">Ethereum Sepolia (11155111)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Asset:</span>
                <span className="text-white font-medium">
                  {selectedCurrency} ({SUPPORTED_TOKENS[selectedCurrency].name})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Amount:</span>
                <span className="text-emerald-400 font-bold text-sm">
                  {amount} {selectedCurrency}
                </span>
              </div>
              <div className="flex flex-col gap-1 border-t border-slate-800 pt-2">
                <span className="text-slate-400">Recipient:</span>
                <span className="text-white font-mono break-all">{recipient}</span>
              </div>
              {selectedCurrency === 'USDC' && (
                <div className="border-t border-slate-800 pt-2 text-slate-400 text-xs">
                  ℹ️ MetaMask will request Sepolia ETH for network gas to submit this ERC-20 transfer.
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowReviewModal(false)}
                className="flex-1 border-slate-700 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmSend}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white"
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

