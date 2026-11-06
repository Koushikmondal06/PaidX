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
      agent_connections: {
        Row: {
          id: string;
          user_id: string;
          wallet_id: string;
          agent_name: string;
          api_key_hash: string;
          api_key_prefix: string;
          status: string;
          revoked_at: string | null;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          wallet_id: string;
          agent_name: string;
          api_key_hash: string;
          api_key_prefix: string;
          status?: string;
          revoked_at?: string | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          wallet_id?: string;
          agent_name?: string;
          api_key_hash?: string;
          api_key_prefix?: string;
          status?: string;
          revoked_at?: string | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_connections_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_connections_wallet_id_fkey";
            columns: ["wallet_id"];
            isOneToOne: false;
            referencedRelation: "wallets";
            referencedColumns: ["id"];
          }
        ];
      };
      agent_policies: {
        Row: {
          id: string;
          agent_id: string;
          max_amount_per_tx: string;
          daily_budget: string;
          monthly_budget: string;
          spent_today: string;
          spent_this_month: string;
          period_start_date: string;
          autonomous_payments_enabled: boolean;
          require_approval_above: string | null;
          allowed_networks: string[];
          allowed_assets: string[];
          allowed_recipients: string[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          max_amount_per_tx: string;
          daily_budget: string;
          monthly_budget: string;
          spent_today?: string;
          spent_this_month?: string;
          period_start_date?: string;
          autonomous_payments_enabled?: boolean;
          require_approval_above?: string | null;
          allowed_networks?: string[];
          allowed_assets?: string[];
          allowed_recipients?: string[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agent_id?: string;
          max_amount_per_tx?: string;
          daily_budget?: string;
          monthly_budget?: string;
          spent_today?: string;
          spent_this_month?: string;
          period_start_date?: string;
          autonomous_payments_enabled?: boolean;
          require_approval_above?: string | null;
          allowed_networks?: string[];
          allowed_assets?: string[];
          allowed_recipients?: string[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_policies_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: true;
            referencedRelation: "agent_connections";
            referencedColumns: ["id"];
          }
        ];
      };
      agent_spending_reservations: {
        Row: {
          id: string;
          agent_id: string;
          idempotency_key: string;
          amount: string;
          asset: string;
          network: string;
          recipient: string;
          status: string;
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          idempotency_key: string;
          amount: string;
          asset: string;
          network: string;
          recipient: string;
          status?: string;
          expires_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agent_id?: string;
          idempotency_key?: string;
          amount?: string;
          asset?: string;
          network?: string;
          recipient?: string;
          status?: string;
          expires_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_spending_reservations_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agent_connections";
            referencedColumns: ["id"];
          }
        ];
      };
      agent_payments: {
        Row: {
          id: string;
          agent_id: string;
          user_id: string;
          wallet_id: string;
          reservation_id: string | null;
          recipient: string;
          amount_atomic: string;
          amount_display: string;
          asset: string;
          asset_id: string;
          network: string;
          payment_scheme: string;
          status: string;
          idempotency_key: string;
          tx_id: string | null;
          hashscan_url: string | null;
          hcs_topic_id: string | null;
          hcs_sequence_number: number | null;
          failure_reason: string | null;
          confirmed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          user_id: string;
          wallet_id: string;
          reservation_id?: string | null;
          recipient: string;
          amount_atomic: string;
          amount_display: string;
          asset: string;
          asset_id: string;
          network?: string;
          payment_scheme?: string;
          status?: string;
          idempotency_key: string;
          tx_id?: string | null;
          hashscan_url?: string | null;
          hcs_topic_id?: string | null;
          hcs_sequence_number?: number | null;
          failure_reason?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agent_id?: string;
          user_id?: string;
          wallet_id?: string;
          reservation_id?: string | null;
          recipient?: string;
          amount_atomic?: string;
          amount_display?: string;
          asset?: string;
          asset_id?: string;
          network?: string;
          payment_scheme?: string;
          status?: string;
          idempotency_key?: string;
          tx_id?: string | null;
          hashscan_url?: string | null;
          hcs_topic_id?: string | null;
          hcs_sequence_number?: number | null;
          failure_reason?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_payments_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agent_connections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_payments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_payments_wallet_id_fkey";
            columns: ["wallet_id"];
            isOneToOne: false;
            referencedRelation: "wallets";
            referencedColumns: ["id"];
          }
        ];
      };
      hcs_audit_events: {
        Row: {
          id: string;
          payment_id: string | null;
          topic_id: string;
          sequence_number: number | null;
          event_type: string;
          payload: Json;
          running_hash: string | null;
          published_at: string;
        };
        Insert: {
          id?: string;
          payment_id?: string | null;
          topic_id: string;
          sequence_number?: number | null;
          event_type: string;
          payload?: Json;
          running_hash?: string | null;
          published_at?: string;
        };
        Update: {
          id?: string;
          payment_id?: string | null;
          topic_id?: string;
          sequence_number?: number | null;
          event_type?: string;
          payload?: Json;
          running_hash?: string | null;
          published_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hcs_audit_events_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "agent_payments";
            referencedColumns: ["id"];
          }
        ];
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
