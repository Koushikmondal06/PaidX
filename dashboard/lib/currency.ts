export const WEI_PER_ETH = 1000000000000000000n; // 10^18
export const UNITS_PER_USDC = 1000000n; // 10^6 (6 decimals for USDC)

export function ethToWei(eth: string | number): bigint {
  const [whole, decimal = ''] = eth.toString().split('.');
  const paddedDecimal = decimal.padEnd(18, '0').slice(0, 18);
  return BigInt(whole) * WEI_PER_ETH + BigInt(paddedDecimal);
}

export function weiToEth(wei: string | bigint): string {
  const weiBigInt = BigInt(wei);
  const whole = weiBigInt / WEI_PER_ETH;
  const remainder = weiBigInt % WEI_PER_ETH;
  const decimalStr = remainder.toString().padStart(18, '0').replace(/0+$/, '');
  return decimalStr.length > 0 ? `${whole}.${decimalStr}` : `${whole}`;
}

export function formatWei(wei: string | bigint, decimals: number = 4): string {
  const ethStr = weiToEth(wei);
  const parts = ethStr.split('.');
  if (!parts[1]) return parts[0];
  return `${parts[0]}.${parts[1].slice(0, decimals)}`;
}

export function formatUsdc(amountRaw: string | bigint): string {
  const rawBigInt = BigInt(amountRaw);
  const whole = rawBigInt / UNITS_PER_USDC;
  const remainder = rawBigInt % UNITS_PER_USDC;
  const decimalStr = remainder.toString().padStart(6, '0');
  return `${whole}.${decimalStr.slice(0, 2)}`;
}
