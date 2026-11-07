/**
 * PaidX MCP Tools Definitions
 * Standard schema definitions for all 16 Model Context Protocol tools.
 */

export interface McpToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export const MCP_TOOL_DEFINITIONS: McpToolSchema[] = [
  // ==========================================
  // 1. WALLET TOOLS
  // ==========================================
  {
    name: 'get_connected_wallet',
    description: 'Retrieves metadata about the currently connected PaidX wallet authorized for this AI agent.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_wallet_status',
    description:
      'Returns the comprehensive status of the connected PaidX wallet, including native MPC enrollment, network, balances, signer type, and passkey security status.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_wallet_address',
    description: 'Returns the Hedera Account ID (e.g. 0.0.123456) of the connected PaidX wallet.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_wallet_balance',
    description: 'Queries the current on-chain HBAR and token balances (such as USDC) for the connected PaidX wallet.',
    inputSchema: {
      type: 'object',
      properties: {
        asset: { type: 'string', description: 'Optional token symbol (e.g. USDC, HBAR) or token ID.' },
      },
    },
  },
  {
    name: 'get_supported_assets',
    description: 'Returns the list of assets supported by the PaidX Hedera x402 payment facilitator (USDC, HBAR).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_supported_networks',
    description: 'Returns the blockchain networks supported for agent payments (Hedera Testnet).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // ==========================================
  // 2. PAYMENT TOOLS
  // ==========================================
  {
    name: 'prepare_wallet_payment',
    description:
      'Prepares a recipient-directed Hedera x402 payment estimate, validating recipient address (native account ID or EVM address), atomic amount, price normalization, spending limits, and payment requirements before execution.',
    inputSchema: {
      type: 'object',
      properties: {
        recipient: { type: 'string', description: 'Recipient Hedera Account ID (e.g. 0.0.123456) or EVM address (e.g. 0x...)' },
        amount: { type: 'string', description: 'Amount to send (e.g. "5" or "5.00")' },
        asset: { type: 'string', description: 'Asset symbol (e.g. USDC, HBAR). Defaults to USDC.' },
        network: { type: 'string', description: 'Blockchain network (e.g. "hedera:testnet"). Defaults to "hedera:testnet".' },
      },
      required: ['recipient', 'amount'],
    },
  },
  {
    name: 'execute_wallet_payment',
    description:
      'Executes a real recipient-directed payment using the connected PaidX wallet via the Hedera x402 payment protocol. The recipient receives exactly the requested amount.',
    inputSchema: {
      type: 'object',
      properties: {
        recipient: { type: 'string', description: 'Recipient Hedera Account ID (e.g. 0.0.123456)' },
        amount: { type: 'string', description: 'Amount to send (e.g. "5" for 5 USDC)' },
        asset: { type: 'string', description: 'Asset symbol (e.g. "USDC" or "HBAR"). Defaults to "USDC".' },
        network: { type: 'string', description: 'Blockchain network ("hedera:testnet").' },
        paymentReference: { type: 'string', description: 'Optional client payment reference or memo.' },
      },
      required: ['recipient', 'amount'],
    },
  },
  {
    name: 'get_payment_status',
    description: 'Retrieves the current status of an agent payment by payment ID or transaction ID scoped to this agent.',
    inputSchema: {
      type: 'object',
      properties: {
        paymentId: { type: 'string', description: 'PaidX Payment UUID' },
        transactionId: { type: 'string', description: 'Hedera Transaction ID' },
      },
    },
  },
  {
    name: 'get_transaction_details',
    description: 'Fetches on-chain settlement details for a Hedera transaction from the Mirror Node.',
    inputSchema: {
      type: 'object',
      properties: {
        transactionId: { type: 'string', description: 'Hedera Transaction ID (e.g. 0.0.123456@1700000000.000000000)' },
      },
      required: ['transactionId'],
    },
  },
  {
    name: 'get_payment_history',
    description: 'Returns historical payments settled by this connected AI agent.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum records to return (default: 10)' },
      },
    },
  },

  // ==========================================
  // 3. AGENT POLICY TOOLS
  // ==========================================
  {
    name: 'get_agent_permissions',
    description: 'Returns the permissions and capability flags configured for this connected agent.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_agent_spending_limit',
    description: 'Returns the spending limits, daily budget, monthly budget, and remaining allowance for this agent.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_agent_spending_history',
    description: 'Returns active spending reservations and recent budget deductions for this agent.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'revoke_agent_access',
    description:
      'Instantly revokes agent access, purges session signing permissions, and disables autonomous payments for the connected AI agent.',
    inputSchema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Reason for revoking agent access (optional)',
        },
      },
    },
  },
  {
    name: 'request_payment_approval',
    description:
      'Creates a pending payment request requiring explicit human authorization when spending limits or autonomous policy requires user review.',
    inputSchema: {
      type: 'object',
      properties: {
        recipient: { type: 'string', description: 'Recipient Hedera Account ID' },
        amount: { type: 'string', description: 'Payment amount' },
        asset: { type: 'string', description: 'Payment asset (e.g. USDC)' },
        reason: { type: 'string', description: 'Reason human approval is required' },
      },
      required: ['recipient', 'amount', 'reason'],
    },
  },

  // ==========================================
  // 4. AUDIT TOOLS (Hedera Native Services Track)
  // ==========================================
  {
    name: 'get_hedera_payment_audit',
    description:
      'Retrieves immutable audit messages published to the PaidX Hedera Consensus Service (HCS) topic.',
    inputSchema: {
      type: 'object',
      properties: {
        topicId: { type: 'string', description: 'Optional HCS Topic ID. Defaults to configured PaidX audit topic.' },
        limit: { type: 'number', description: 'Maximum messages to return (default: 5)' },
      },
    },
  },
  {
    name: 'verify_hedera_payment',
    description:
      'Cross-verifies an x402 payment settlement against both the Hedera Mirror Node and the HCS audit trail.',
    inputSchema: {
      type: 'object',
      properties: {
        transactionId: { type: 'string', description: 'Hedera Transaction ID to verify' },
      },
      required: ['transactionId'],
    },
  },

  // ==========================================
  // 5. MPC & AUTONOMOUS SIGNING DIAGNOSTIC TOOLS
  // ==========================================
  {
    name: 'get_mpc_enrollment_status',
    description:
      'Queries MPC threshold enrollment status, public key fingerprint, key share distribution, and rotation metadata for the connected account.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'verify_hedera_account_authorization',
    description:
      "Cross-checks on-chain Hedera Mirror Node account key structure to verify whether the account authorizes the user's primary MetaMask key and the PaidX MPC threshold key.",
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_agent_signing_status',
    description:
      'Returns the operational signing state of the agent, including threshold signing provider, share availability, autonomous spending permissions, and session validity.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];
