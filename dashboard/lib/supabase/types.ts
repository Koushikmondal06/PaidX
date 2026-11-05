export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          email: string | null;
          phone: string | null;
          role: 'user' | 'merchant' | 'admin';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          email?: string | null;
          phone?: string | null;
          role?: 'user' | 'merchant' | 'admin';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          email?: string | null;
          phone?: string | null;
          role?: 'user' | 'merchant' | 'admin';
          created_at?: string;
          updated_at?: string;
        };
      };
      wallets: {
        Row: {
          id: string;
          user_id: string;
          address: string;
          chain_id: number;
          kind: 'eoa' | 'metamask_smart_account';
          is_primary: boolean;
          smart_account_upgraded: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          address: string;
          chain_id: number;
          kind: 'eoa' | 'metamask_smart_account';
          is_primary?: boolean;
          smart_account_upgraded?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          address?: string;
          chain_id?: number;
          kind?: 'eoa' | 'metamask_smart_account';
          is_primary?: boolean;
          smart_account_upgraded?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      permissions: {
        Row: {
          id: string;
          user_id: string;
          wallet_id: string;
          chain_id: number;
          session_account_address: string;
          token_address: string;
          permission_type: string;
          period_seconds: number;
          limit_per_period: string; // numeric(78,0)
          remaining_in_period: string; // numeric(78,0)
          current_period_start: string;
          valid_after: string;
          valid_until: string;
          status: 'active' | 'revoked' | 'expired';
          grant_payload: Json;
          revocation_tx_hash: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          wallet_id: string;
          chain_id: number;
          session_account_address: string;
          token_address: string;
          permission_type: string;
          period_seconds: number;
          limit_per_period: string;
          remaining_in_period: string;
          current_period_start?: string;
          valid_after: string;
          valid_until: string;
          status?: 'active' | 'revoked' | 'expired';
          grant_payload: Json;
          revocation_tx_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          wallet_id?: string;
          chain_id?: number;
          session_account_address?: string;
          token_address?: string;
          permission_type?: string;
          period_seconds?: number;
          limit_per_period?: string;
          remaining_in_period?: string;
          current_period_start?: string;
          valid_after?: string;
          valid_until?: string;
          status?: 'active' | 'revoked' | 'expired';
          grant_payload?: Json;
          revocation_tx_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      cards: {
        Row: {
          id: string;
          user_id: string;
          uid_hash: string;
          status: 'active' | 'frozen' | 'revoked';
          registration_tx_hash: string | null;
          registered_at_block: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          uid_hash: string;
          status?: 'active' | 'frozen' | 'revoked';
          registration_tx_hash?: string | null;
          registered_at_block?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          uid_hash?: string;
          status?: 'active' | 'frozen' | 'revoked';
          registration_tx_hash?: string | null;
          registered_at_block?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      merchants: {
        Row: {
          id: string;
          user_id: string;
          business_name: string;
          slug: string;
          payout_address: string;
          chain_id: number;
          is_active: boolean;
          registration_tx_hash: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          business_name: string;
          slug: string;
          payout_address: string;
          chain_id: number;
          is_active?: boolean;
          registration_tx_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          business_name?: string;
          slug?: string;
          payout_address?: string;
          chain_id?: number;
          is_active?: boolean;
          registration_tx_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      payments: {
        Row: {
          id: string;
          idempotency_key: string;
          merchant_id: string;
          user_id: string;
          card_id: string;
          permission_id: string;
          amount: string; // numeric(78,0)
          token_address: string;
          chain_id: number;
          status: 'created' | 'submitted' | 'confirmed' | 'failed';
          user_op_hash: string | null;
          tx_hash: string | null;
          block_number: number | null;
          failure_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          idempotency_key: string;
          merchant_id: string;
          user_id: string;
          card_id: string;
          permission_id: string;
          amount: string;
          token_address: string;
          chain_id: number;
          status?: 'created' | 'submitted' | 'confirmed' | 'failed';
          user_op_hash?: string | null;
          tx_hash?: string | null;
          block_number?: number | null;
          failure_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          idempotency_key?: string;
          merchant_id?: string;
          user_id?: string;
          card_id?: string;
          permission_id?: string;
          amount?: string;
          token_address?: string;
          chain_id?: number;
          status?: 'created' | 'submitted' | 'confirmed' | 'failed';
          user_op_hash?: string | null;
          tx_hash?: string | null;
          block_number?: number | null;
          failure_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      chain_events: {
        Row: {
          id: string;
          chain_id: number;
          tx_hash: string;
          log_index: number;
          event_name: string;
          contract_address: string;
          block_number: number;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          chain_id: number;
          tx_hash: string;
          log_index: number;
          event_name: string;
          contract_address: string;
          block_number: number;
          payload: Json;
          created_at?: string;
        };
      };
      indexer_cursors: {
        Row: {
          cursor_name: string;
          chain_id: number;
          last_block: number;
          updated_at: string;
        };
        Insert: {
          cursor_name: string;
          chain_id: number;
          last_block: number;
          updated_at?: string;
        };
        Update: {
          cursor_name?: string;
          chain_id?: number;
          last_block?: number;
          updated_at?: string;
        };
      };
    };
  };
}
