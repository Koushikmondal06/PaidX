/*
 * PaidX POS provisioning secrets (LOCAL ONLY — gitignored, never committed).
 *
 * Wi-Fi: PAIDX_WIFI_SSID/PAIDX_WIFI_PASSWORD are the compile-time fallback used on the
 * very first boot. The touch-panel setup always wins once credentials are saved there.
 *
 * Device token / merchant id / CA cert are filled in later ("rest I will do later").
 */

#pragma once

#define PAIDX_WIFI_SSID     "0day"
#define PAIDX_WIFI_PASSWORD "Nwolf@123"

// Device credentials — minted from pos_devices (8.2 authenticated device path).
// After running supabase/migrations/20261031200000_text_ids_demo_001.sql the demo
// POS is the '#001' row (id and device_uuid are both '#001'). The row the migration
// re-seeds has NO provisioning secret yet: run `node mint-device.mjs` and paste the
// TOKEN_FOR_HEADER it prints over PAIDX_DEVICE_TOKEN below, keeping PAIDX_DEVICE_UUID '#001'.
#define PAIDX_DEVICE_UUID   "#001"
#define PAIDX_DEVICE_TOKEN  "psk_d6187915992b28f7acaf227169a211072b92a0d2b1989168"  // re-paste after mint-device.mjs

// The API call needs the merchant row id before sales will go through (demo merchant '#001').
#define PAIDX_MERCHANT_ID "#001"

// Merchant receiving address base (0x + 40 hex); must equal merchants.receiving_address
#define PAIDX_MERCHANT_ADDRESS "0xC8C1b0BE0b1DE52c0341129456964fa95100bB40"

// Expected Chain ID: Ethereum Sepolia Testnet (11155111)
#define PAIDX_EXPECTED_CHAIN_ID 11155111UL

// Backend API Base for Console
#define PAIDX_API_BASE "https://console.paidx.cc/api"
#define PAIDX_ALLOW_INSECURE 1


