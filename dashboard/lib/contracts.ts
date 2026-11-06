/**
 * PaidX Typed Contract Interfaces and ABIs
 * Generated from Foundry compilation artifacts
 * Target Network: Ethereum Sepolia (11155111)
 */

export const CARD_REGISTRY_ABI = [
  {
    type: "constructor",
    inputs: [{ name: "initialOwner", type: "address", internalType: "address" }],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "cards",
    inputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    outputs: [
      { name: "owner", type: "address", internalType: "address" },
      { name: "status", type: "uint8", internalType: "enum CardRegistry.CardStatus" },
      { name: "registeredAt", type: "uint64", internalType: "uint64" },
      { name: "statusUpdatedAt", type: "uint64", internalType: "uint64" }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getOwnerCards",
    inputs: [{ name: "owner", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "bytes32[]", internalType: "bytes32[]" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "registerCard",
    inputs: [
      { name: "cardHash", type: "bytes32", internalType: "bytes32" },
      { name: "owner", type: "address", internalType: "address" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setCardStatus",
    inputs: [
      { name: "cardHash", type: "bytes32", internalType: "bytes32" },
      { name: "newStatus", type: "uint8", internalType: "enum CardRegistry.CardStatus" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "verifyCardActive",
    inputs: [{ name: "cardHash", type: "bytes32", internalType: "bytes32" }],
    outputs: [
      { name: "isActive", type: "bool", internalType: "bool" },
      { name: "owner", type: "address", internalType: "address" }
    ],
    stateMutability: "view"
  },
  {
    type: "event",
    name: "CardRegistered",
    inputs: [
      { name: "cardHash", type: "bytes32", indexed: true, internalType: "bytes32" },
      { name: "owner", type: "address", indexed: true, internalType: "address" },
      { name: "timestamp", type: "uint64", indexed: false, internalType: "uint64" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "CardStatusUpdated",
    inputs: [
      { name: "cardHash", type: "bytes32", indexed: true, internalType: "bytes32" },
      { name: "previousStatus", type: "uint8", indexed: true, internalType: "enum CardRegistry.CardStatus" },
      { name: "newStatus", type: "uint8", indexed: true, internalType: "enum CardRegistry.CardStatus" },
      { name: "timestamp", type: "uint64", indexed: false, internalType: "uint64" }
    ],
    anonymous: false
  }
] as const;

export const MERCHANT_REGISTRY_ABI = [
  {
    type: "constructor",
    inputs: [{ name: "initialOwner", type: "address", internalType: "address" }],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "isMerchantActive",
    inputs: [{ name: "merchantId", type: "bytes32", internalType: "bytes32" }],
    outputs: [
      { name: "isActive", type: "bool", internalType: "bool" },
      { name: "payoutAddress", type: "address", internalType: "address" }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "merchants",
    inputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    outputs: [
      { name: "payoutAddress", type: "address", internalType: "address" },
      { name: "isActive", type: "bool", internalType: "bool" },
      { name: "registeredAt", type: "uint64", internalType: "uint64" }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "registerMerchant",
    inputs: [
      { name: "merchantId", type: "bytes32", internalType: "bytes32" },
      { name: "payoutAddress", type: "address", internalType: "address" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "updatePayoutAddress",
    inputs: [
      { name: "merchantId", type: "bytes32", internalType: "bytes32" },
      { name: "newPayoutAddress", type: "address", internalType: "address" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setMerchantActive",
    inputs: [
      { name: "merchantId", type: "bytes32", internalType: "bytes32" },
      { name: "active", type: "bool", internalType: "bool" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "event",
    name: "MerchantRegistered",
    inputs: [
      { name: "merchantId", type: "bytes32", indexed: true, internalType: "bytes32" },
      { name: "payoutAddress", type: "address", indexed: true, internalType: "address" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "MerchantPayoutAddressUpdated",
    inputs: [
      { name: "merchantId", type: "bytes32", indexed: true, internalType: "bytes32" },
      { name: "oldAddress", type: "address", indexed: true, internalType: "address" },
      { name: "newAddress", type: "address", indexed: true, internalType: "address" }
    ],
    anonymous: false
  }
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8", internalType: "uint8" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" }
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address", internalType: "address" },
      { name: "spender", type: "address", internalType: "address" }
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true, internalType: "address" },
      { name: "to", type: "address", indexed: true, internalType: "address" },
      { name: "value", type: "uint256", indexed: false, internalType: "uint256" }
    ],
    anonymous: false
  }
] as const;

export function getCardRegistryAddress(): string {
  return process.env.NEXT_PUBLIC_CARD_REGISTRY_ADDRESS || '0x7cBD8DE77C16Ba79A1fe10E30913517845D68e51';
}

export function getMerchantRegistryAddress(): string {
  return process.env.NEXT_PUBLIC_MERCHANT_REGISTRY_ADDRESS || '0xb11dAE79F1B187E95CB93655A983D6e86E574145';
}

export function getPaymentTokenAddress(): string {
  return process.env.NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
}

