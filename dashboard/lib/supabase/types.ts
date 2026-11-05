export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          email: string | null;
          phone: string | null;
          role: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          email?: string | null;
          phone?: string | null;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          email?: string | null;
          phone?: string | null;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      wallets: {
        Row: {
          id: string;
          user_id: string;
          address: string;
          chain_id: number;
          kind: string;
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
          kind: string;
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
          kind?: string;
          is_primary?: boolean;
          smart_account_upgraded?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
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
          limit_per_period: string;
          remaining_in_period: string;
          current_period_start: string;
          valid_after: string;
          valid_until: string;
          status: string;
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
          status?: string;
          grant_payload?: Json;
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
          status?: string;
          grant_payload?: Json;
          revocation_tx_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      cards: {
        Row: {
          id: string;
          user_id: string;
          uid_hash: string;
          status: string;
          registration_tx_hash: string | null;
          registered_at_block: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          uid_hash: string;
          status?: string;
          registration_tx_hash?: string | null;
          registered_at_block?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          uid_hash?: string;
          status?: string;
          registration_tx_hash?: string | null;
          registered_at_block?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
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
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          idempotency_key: string;
          merchant_id: string;
          user_id: string;
          card_id: string;
          permission_id: string;
          amount: string;
          token_address: string;
          chain_id: number;
          status: string;
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
          status?: string;
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
          status?: string;
          user_op_hash?: string | null;
          tx_hash?: string | null;
          block_number?: number | null;
          failure_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
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
        Update: {
          id?: string;
          chain_id?: number;
          tx_hash?: string;
          log_index?: number;
          event_name?: string;
          contract_address?: string;
          block_number?: number;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
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
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
