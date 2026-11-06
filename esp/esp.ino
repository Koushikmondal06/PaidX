/*
 * ===========================================================================
 *  PAIDX  -  NFC DOCTOR & CARD READ/WRITE TERMINAL WITH WIFI CONNECTIVITY
 * ===========================================================================
 *
 *  Board  : ESP32 38-pin dev board   (esp32:esp32:esp32, core 3.3.12, NO PSRAM)
 *  Panel  : 2.8" 240x320 SPI TFT     (ST7789_DRIVER - the silkscreen lies)
 *  Bus    : MISO 19 / MOSI 23 / SCLK 18 / CS 5 / DC 2 / RST 4
 *  Touch  : XPT2046, T_CS = GPIO 32 (calData {300, 3600, 300, 3600, 0x01})
 *  NFC    : PN532 over I2C (P16 SDA / P17 SCL with P21 / P22 auto-probe)
 *
 *  ---------------------------------------------------------------------------
 *  OPERATION & BOOT SEQUENCE:
 *  ---------------------------------------------------------------------------
 *  - [1] BOOT SPLASH (SCR_LOGO)
 *  - [2] NETWORK CONNECTION (SCR_WIFI):
 *        Initial non-blocking WiFi connect screen before the NFC station.
 *        Shows animated 3-stage network status and progress bar.
 *        Includes [SKIP / OFFLINE] button for zero-delay offline doctor use.
 *  - [3] CARD ACTIVATION (SCR_REGISTER):
 *        Prompts operator on first boot to register authorized admin/terminal card.
 *  - [4] NFC DOCTOR & ENCODER STATION (SCR_HOME):
 *        [Read / Inspect Card] : UID (colon & dense for Base), memory block data
 *        [Write / Encode Card] : Write PaidX ID, Base Wallet, or Erase with 100% parity
 *        [POS Pay] / [QR Pay]  : Contactless crypto point-of-sale with 2FA chip auth
 *  - [5] SERIAL DOCTOR (115200 baud):
 *        Commands: READ, WRITE:<text>, FORMAT, REGISTER, WIFI
 * ===========================================================================
 */

#include <Arduino.h>
#include <SPI.h>
#include <SPIFFS.h>
#include <TFT_eSPI.h>
#include <esp_heap_caps.h>
#include <Wire.h>
#include <Adafruit_PN532.h>
#include <qrcode.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ---------------------------------------------------------------------------
//  PROVISIONING & SECRETS
// ---------------------------------------------------------------------------
#if __has_include("paidx_secrets.h")
  #include "paidx_secrets.h"
#endif

#ifndef PAIDX_WIFI_SSID
  #define PAIDX_WIFI_SSID "ETHGlobal"
#endif

#ifndef PAIDX_WIFI_PASSWORD
  #define PAIDX_WIFI_PASSWORD "www.ethgobal.com"
#endif

#ifndef PAIDX_API_BASE
  #define PAIDX_API_BASE "https://console.paidx.cc/api"
#endif

#ifndef PAIDX_DEVICE_UUID
  #define PAIDX_DEVICE_UUID "#001"
#endif

#ifndef PAIDX_DEVICE_TOKEN
  #define PAIDX_DEVICE_TOKEN "psk_d6187915992b28f7acaf227169a211072b92a0d2b1989168"
#endif

#ifndef PAIDX_MERCHANT_ID
  #define PAIDX_MERCHANT_ID "#001"
#endif

#ifndef PAIDX_MERCHANT_ADDRESS
  #define PAIDX_MERCHANT_ADDRESS "0x7B52dcb074EF9C189BDFb0c19bE7094C277a94F6"
#endif

// ---------------------------------------------------------------------------
//  TIMING CONSTANTS
// ---------------------------------------------------------------------------
static const uint32_t SPLASH_MS          = 1500;  // SCR_LOGO dwell
static const uint32_t WIFI_TIMEOUT_MS    = 20000; // 20s generous WiFi connect window
static const uint32_t WIFI_SUCCESS_MS    = 4500;  // 4.5s dwell to clearly view IP & signal
static const uint32_t REG_SUCCESS_MS     = 1600;  // Registration confirmation dwell
static const uint32_t REG_AUTO_PASS_MS   = 4000;  // Auto-proceed to HOME if registered
static const uint32_t TOUCH_DEBOUNCE_MS  = 75;    // Fast tactile typing on numpad
static const uint32_t TOUCH_MASK_MS      = 120;   // Brief screen switch mask
static const uint32_t FLASH_MS           = 60;    // Button press feedback
static const uint32_t NOTE_MS            = 2000;  // Transient on-screen message
static const uint32_t MOCK_QUOTE_MS      = 1000;  // FETCHING dwell
static const uint8_t  AMOUNT_MAX_DIGITS  = 6;     // 999.999 ETH

#define PAYMENT_MOCK 1

// ---------------------------------------------------------------------------
//  HARDWARE INSTANCES
// ---------------------------------------------------------------------------
TFT_eSPI tft = TFT_eSPI();
static Adafruit_PN532 nfc(-1, -1, &Wire);

// ===========================================================================
//  DECLARED TYPES
// ===========================================================================
enum Screen : uint8_t {
  SCR_LOGO,          // boot splash
  SCR_WIFI,          // initial WiFi network connection screen
  SCR_REGISTER,      // Card activation: present card to set UUID
  SCR_HOME,          // Main menu: Read Doctor, Write Encoder, POS Payment, QR
  SCR_KEYPAD,        // POS amount entry
  SCR_CONFIRM,       // POS confirmation gate: payee + amount
  SCR_FETCHING,      // POS rate quote step
  SCR_PENDING,       // POS awaiting customer NFC tap or showing QR
  SCR_VERIFYING,     // Realistic 5-7s animated status & progress bar
  SCR_RECEIPT,       // Operation SUCCESS -> HOME
  SCR_FAIL,          // Operation DECLINED / FAILED -> HOME

  // Doctor & Encoder Screens
  SCR_READ_WAIT,     // Waiting for card to inspect
  SCR_READ_RESULT,   // Display inspected UID, memory block, type
  SCR_WRITE_MENU,    // Choose payload to write (Card ID, Wallet, Erase)
  SCR_WRITE_CONFIRM, // Review payload before writing
  SCR_WRITE_WAIT     // Hold card to encode
};

enum InputMode : uint8_t {
  MODE_NONE,
  MODE_CARD_PAY,     // "POS Card Payment"
  MODE_QR,           // "Scan & Pay (QR)"
  MODE_DOC_READ,     // "Doctor Read / Inspect"
  MODE_DOC_WRITE     // "Card Encoder / Write"
};

struct Heap { uint32_t freeB; uint32_t largest; };

struct Button {
  int16_t x, y, w, h;
  const char* label;
  char id;
};

// ===========================================================================
//  GLOBALS
// ===========================================================================
static Screen     screen     = SCR_LOGO;
static InputMode  inputMode  = MODE_NONE;

// --- wifi state ------------------------------------------------------------
static bool        wifiConnected     = false;
static uint32_t    wifiConnectStart  = 0;
static uint32_t    wifiConnectedAt   = 0;
static char        wifiIpStr[20]     = "0.0.0.0";
static int8_t      wifiRssi          = 0;
static uint8_t     lastWifiStage     = 255;
static uint32_t    lastWifiAnimMs    = 0;
static uint32_t    lastWifiRetryMs   = 0;
static const char* wifiStageMsg[4] = {
  "Searching for 'ETHGlobal' AP",
  "Connecting to ETHGlobal AP",
  "Authorizing credentials",
  "Acquiring DHCP IP lease"
};

// --- card authorization state ----------------------------------------------
static char        authorizedCardUid[32] = "";
static bool        hasRegisteredCard     = false;
static bool        cardJustRegistered    = false;
static uint32_t    regConfirmStart       = 0;
static uint32_t    regStartMs            = 0;
static const char* CARD_FILE             = "/card.uid";

// --- sale state ------------------------------------------------------------
static const char* RECEIVING_WALLET   = PAIDX_MERCHANT_ADDRESS;
static char        amountBuf[8]       = "";   // raw digits
static uint8_t     amountLen          = 0;
static char        wallet[45]         = "";
static bool        haveWallet         = false;
static char        lastScannedUid[32] = "";   // colon form UID: 43:05:01:29
static char        lastDenseUid[20]   = "";   // dense hex UID:  43050129

// --- card doctor & read/write state ----------------------------------------
static char        cardTypeStr[32]    = "Unknown Card";
static char        cardReadAscii[36]  = "";
static char        cardReadHex[50]    = "";
static char        writePayload[36]   = "PAIDX-CARD-001";
static uint8_t     targetBlock        = 4;    // Sector 1, Block 0 (safe user data)
static bool        writeSuccess       = false;
static char        opResultTitle[32]  = "SUCCESS";
static char        opResultMsg[40]    = "Operation Verified";
static char        opFailReason[40]   = "Unauthorized card";
static char        lastTxHash[70]     = "";
static char        lastExplorerUrl[130]= "";
static bool        isLiveOnChainTx    = false;

// Default MIFARE Classic Factory Keys
static uint8_t keyA_Default[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
static uint8_t keyA_MAD[6]     = {0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5};
static uint8_t keyA_NDEF[6]    = {0xD3, 0xF7, 0xD3, 0xF7, 0xD3, 0xF7};

// --- payment verification & animation state --------------------------------
static bool     paymentApproved     = false;
static uint32_t verifyStartMs       = 0;
static uint32_t verifyDurationMs    = 0;
static uint32_t lastVerifyAnimMs    = 0;
static uint8_t  lastVerifyStage     = 255;
static const char* verifyStageMsg[3] = {
  "Connecting to network",
  "Authorizing transaction",
  "Confirming settlement"
};

// --- NFC hardware state ----------------------------------------------------
static bool     nfcReady           = false;
static uint32_t lastNfcStatusMs    = 0;

// --- transient feedback ----------------------------------------------------
static const Button* flashBtn = nullptr;
static uint16_t flashBorder = 0;
static uint16_t flashFg     = 0;
static uint32_t flashUntil  = 0;

static char     noteBuf[40]  = "";
static uint32_t noteUntil    = 0;

// --- 3-gate touch stack ----------------------------------------------------
static uint32_t lastTouchMs    = 0;             // debounce timestamp
static uint32_t touchMaskUntil = 0;             // mask deadline
static bool     touchReleased  = true;          // release latch
static bool     touchContact   = false;

// --- timers ----------------------------------------------------------------
static uint32_t logoStart  = 0;
static uint32_t fetchStart = 0;
static uint32_t pendStart  = 0;

// --- touch calibration (proven fixed mapping from touch_painter.ino) -------
static uint16_t calData[5] = {300, 3600, 300, 3600, 0x01};

// --- layouts ---------------------------------------------------------------
// WiFi Screen buttons
static Button btnWifiSkip     = { 85, 186, 150, 40, "SKIP / OFFLINE", 'S'};
static Button btnWifiContinue = { 85, 186, 150, 40, "CONTINUE",       'C'};

// HOME menu: 3 large, high-contrast, comfortable buttons
static Button btnMenuRead   = { 25,  64, 270, 44, "Read / Inspect Card", 'R'};
static Button btnMenuWrite  = { 25, 116, 270, 44, "Write / Encode Card", 'W'};
static Button btnMenuPay    = { 25, 168, 130, 42, "POS Pay",            'P'};
static Button btnMenuQr     = {165, 168, 130, 42, "QR Pay",             'S'};

// WRITE MENU: Preset payload selections
static Button btnPayPreset1 = { 25,  64, 270, 42, "PaidX ID: PAIDX-001", '1'};
static Button btnPayPreset2 = { 25, 114, 270, 42, "Base Wallet Address", '2'};
static Button btnPayPreset3 = { 25, 164, 270, 42, "Clear Card (0x00)",   '3'};

// Keypad: full height rows with minimal gap for seamless touch capture
static Button keypad[12] = {
  { 40,  56, 80, 44, "1", '1'}, {120,  56, 80, 44, "2", '2'}, {200,  56, 80, 44, "3", '3'},
  { 40, 102, 80, 44, "4", '4'}, {120, 102, 80, 44, "5", '5'}, {200, 102, 80, 44, "6", '6'},
  { 40, 148, 80, 44, "7", '7'}, {120, 148, 80, 44, "8", '8'}, {200, 148, 80, 44, "9", '9'},
  { 40, 194, 80, 44, "CLR",'C'}, {120, 194, 80, 44, "0", '0'}, {200, 194, 80, 44, "OK", 'O'}
};
static Button btnBack        = {  4,   4,  64, 28, "< BACK", 'B'};
static Button btnConfirm     = { 30, 150, 120, 52, "PAY",    'Y'};
static Button btnCancel      = {170, 150, 120, 52, "CANCEL", 'N'};
static Button btnWriteConfirm= { 30, 150, 120, 52, "WRITE",  'Y'};
static Button btnHome        = {100, 174, 120, 46, "HOME",   'H'};
static Button btnQrClose     = { 70, 194, 180, 38, "CLOSE",  'X'};
static Button btnQrCancel    = {  4,   4,  64, 28, "< BACK", 'C'};

// ===========================================================================
//  HEAP PROBE
// ===========================================================================
static Heap heapNow() {
  Heap h;
  h.freeB   = (uint32_t)ESP.getFreeHeap();
  h.largest = (uint32_t)heap_caps_get_largest_free_block(MALLOC_CAP_8BIT);
  return h;
}

static void report(const char* stage, const char* note) {
  Heap h = heapNow();
  Serial.printf("!HEAP,stage=%s,free=%lu,largest=%lu,note=%s\n",
                stage, (unsigned long)h.freeB, (unsigned long)h.largest, note);
}

// ===========================================================================
//  DRAW HELPERS
// ===========================================================================
static void centre(const char* s, int x, int y, uint8_t font) {
  tft.setTextFont(font);
  tft.setTextDatum(MC_DATUM);
  tft.drawString(s, x, y);
}

static bool hit(const Button& b, uint16_t tx, uint16_t ty) {
  const int16_t pad = 4;
  return (tx >= (b.x - pad)) && (tx < (b.x + b.w + pad)) &&
         (ty >= (b.y - pad)) && (ty < (b.y + b.h + pad));
}

static void drawKey(const Button& b, uint16_t border, uint16_t fg) {
  tft.fillRect(b.x, b.y, b.w, b.h, TFT_BLACK);
  tft.drawRect(b.x, b.y, b.w, b.h, border);
  tft.drawRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2, border);
  tft.setTextColor(fg, TFT_BLACK);
  tft.setTextFont(2);
  tft.setTextDatum(MC_DATUM);
  tft.drawString(b.label, b.x + b.w / 2, b.y + b.h / 2);
}

static void formatAmount(char* out, size_t cap) {
  if (amountLen == 0) { snprintf(out, cap, "0.000 ETH"); return; }
  if (amountLen == 1) { snprintf(out, cap, "0.00%c ETH", amountBuf[0]); return; }
  if (amountLen == 2) { snprintf(out, cap, "0.0%s ETH", amountBuf); return; }
  if (amountLen == 3) { snprintf(out, cap, "0.%s ETH", amountBuf); return; }
  const size_t d = amountLen - 3;
  char head[8];
  memcpy(head, amountBuf, d);
  head[d] = 0;
  snprintf(out, cap, "%s.%s ETH", head, amountBuf + d);
}

static void getAmountDecimal(char* out, size_t cap) {
  if (amountLen == 0) { snprintf(out, cap, "0.0001"); return; }
  if (amountLen == 1) { snprintf(out, cap, "0.00%c", amountBuf[0]); return; }
  if (amountLen == 2) { snprintf(out, cap, "0.0%s", amountBuf); return; }
  if (amountLen == 3) { snprintf(out, cap, "0.%s", amountBuf); return; }
  const size_t d = amountLen - 3;
  char head[8];
  memcpy(head, amountBuf, d);
  head[d] = 0;
  snprintf(out, cap, "%s.%s", head, amountBuf + d);
}

static void redrawAmount() {
  tft.fillRect(0, 28, 320, 26, TFT_BLACK);
  char line[24];
  formatAmount(line, sizeof(line));
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  centre(line, 160, 41, 4);
}

static const char* modeName(InputMode m) {
  switch (m) {
    case MODE_CARD_PAY:  return "Card Payment";
    case MODE_QR:        return "Scan & Pay";
    case MODE_DOC_READ:  return "Doctor Read";
    case MODE_DOC_WRITE: return "Card Encoder";
    default:             return "";
  }
}

// ===========================================================================
//  SCREEN PAINTERS
// ===========================================================================
static void drawLogo() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  centre("PaidX", 160, 75, 4);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  centre("NFC DOCTOR & POS TERMINAL", 160, 110, 2);
  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  centre("Crypto Card Read/Write Tool", 160, 175, 1);
}

static void drawWifiScreen() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  centre("PaidX Terminal", 160, 22, 4);

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  centre("CONNECTING TO NETWORK", 160, 48, 2);

  // Status container
  tft.drawRoundRect(25, 68, 270, 96, 6, TFT_CYAN);
  tft.drawRoundRect(26, 69, 268, 94, 5, TFT_DARKGREY);

  char ssidLine[36];
  snprintf(ssidLine, sizeof(ssidLine), "SSID: %s", PAIDX_WIFI_SSID);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  centre(ssidLine, 160, 88, 2);

  char connLine[48];
  snprintf(connLine, sizeof(connLine), "Connecting to %s...", PAIDX_WIFI_SSID);
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  centre(connLine, 160, 114, 2);

  // Progress bar track
  tft.drawRect(45, 138, 230, 8, TFT_DARKGREY);
  tft.fillRect(47, 140, 226, 4, TFT_BLACK);

  drawKey(btnWifiSkip, TFT_DARKGREY, TFT_WHITE);

  char waitLine[64];
  snprintf(waitLine, sizeof(waitLine), "Waiting for %s... Tap SKIP for offline", PAIDX_WIFI_SSID);
  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  centre(waitLine, 160, 232, 1);
}

static void drawWifiSuccess() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  centre("NETWORK ONLINE", 160, 32, 4);

  // Status container
  tft.drawRoundRect(25, 60, 270, 114, 6, TFT_GREEN);
  tft.drawRoundRect(26, 61, 268, 112, 5, TFT_DARKGREY);

  char ssidLine[36];
  snprintf(ssidLine, sizeof(ssidLine), "SSID: %s", PAIDX_WIFI_SSID);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  centre(ssidLine, 160, 80, 2);

  char line[36];
  snprintf(line, sizeof(line), "IP: %s", wifiIpStr);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  centre(line, 160, 110, 4);

  char rssiLine[36];
  snprintf(rssiLine, sizeof(rssiLine), "Signal: %d dBm | Status: READY", wifiRssi);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  centre(rssiLine, 160, 146, 2);

  drawKey(btnWifiContinue, TFT_GREEN, TFT_GREEN);

  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  centre("Tap CONTINUE or wait 4s to start", 160, 232, 1);
}

static void drawRegister() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  centre("CARD ACTIVATION", 160, 32, 4);

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  centre("Present Authorized Card", 160, 68, 2);

  tft.drawRect(30, 96, 260, 60, TFT_CYAN);
  tft.drawRect(31, 97, 258, 58, TFT_CYAN);
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  centre("Hold card on reader to set...", 160, 126, 2);

  if (hasRegisteredCard && authorizedCardUid[0] != 0) {
    char info[40];
    snprintf(info, sizeof(info), "Registered: %s", authorizedCardUid);
    tft.setTextColor(TFT_GREEN, TFT_BLACK);
    centre(info, 160, 175, 2);

    tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
    centre("Tap card to change, or touch screen to start", 160, 205, 1);
  } else {
    tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
    centre("Terminal will authorize this card for payments", 160, 185, 1);
  }
}

static void drawRegisterSuccess() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  centre("CARD AUTHORIZED", 160, 48, 4);

  char line[36];
  snprintf(line, sizeof(line), "UID: %s", authorizedCardUid);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  centre(line, 160, 95, 2);

  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  centre("Terminal ready for operation", 160, 135, 2);
}

static void drawHome() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  centre("PaidX NFC Station", 160, 20, 4);

  // WiFi status indicator strip under title
  if (wifiConnected) {
    tft.setTextColor(TFT_GREEN, TFT_BLACK);
    char netInfo[36];
    snprintf(netInfo, sizeof(netInfo), "WiFi: %s (%s)", PAIDX_WIFI_SSID, wifiIpStr);
    centre(netInfo, 160, 44, 1);
  } else {
    tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
    centre("WiFi: Offline Mode | Touch to Operate", 160, 44, 1);
  }

  drawKey(btnMenuRead,  TFT_CYAN,   TFT_WHITE);
  drawKey(btnMenuWrite, TFT_GREEN,  TFT_GREEN);
  drawKey(btnMenuPay,   TFT_WHITE,  TFT_WHITE);
  drawKey(btnMenuQr,    TFT_YELLOW, TFT_YELLOW);

  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  centre("13.56 MHz ISO14443A Read / Write / Pay", 160, 224, 1);
}

static void drawReadWait() {
  tft.fillScreen(TFT_BLACK);
  drawKey(btnBack, TFT_DARKGREY, TFT_WHITE);

  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  centre("CARD DOCTOR - READ", 160, 26, 4);

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  centre("Hold card flat on PN532", 160, 64, 2);

  tft.drawRect(30, 95, 260, 75, TFT_CYAN);
  tft.drawRect(31, 96, 258, 73, TFT_CYAN);

  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  centre("Awaiting Card Tap...", 160, 122, 4);

  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  centre("Inspects UID, type, & memory blocks", 160, 150, 1);

  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  centre("Tap screen or '< BACK' to cancel", 160, 205, 1);
}

static void drawReadResult() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  centre("CARD INSPECTION OK", 160, 22, 4);

  char lineUid[40];
  snprintf(lineUid, sizeof(lineUid), "UID: %s", lastScannedUid);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  centre(lineUid, 160, 52, 2);

  char lineDense[40];
  snprintf(lineDense, sizeof(lineDense), "Dense: %s", lastDenseUid);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  centre(lineDense, 160, 74, 2);

  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  centre(cardTypeStr, 160, 96, 2);

  // Box for memory content
  tft.drawRect(15, 114, 290, 52, TFT_DARKGREY);
  tft.fillRect(16, 115, 288, 50, TFT_BLACK);

  char lineData[44];
  if (strlen(cardReadAscii) > 0) {
    snprintf(lineData, sizeof(lineData), "Data: \"%s\"", cardReadAscii);
  } else {
    snprintf(lineData, sizeof(lineData), "Data: [Empty / 0x00]");
  }
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  centre(lineData, 160, 130, 2);

  char lineHex[48];
  snprintf(lineHex, sizeof(lineHex), "Hex: %.24s", cardReadHex);
  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  centre(lineHex, 160, 152, 1);

  drawKey(btnHome, TFT_CYAN, TFT_CYAN);
}

static void drawWriteMenu() {
  tft.fillScreen(TFT_BLACK);
  drawKey(btnBack, TFT_DARKGREY, TFT_WHITE);

  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  centre("CARD ENCODER", 160, 22, 4);

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  centre("Choose Payload to Write", 160, 46, 2);

  drawKey(btnPayPreset1, TFT_GREEN,    TFT_WHITE);
  drawKey(btnPayPreset2, TFT_CYAN,     TFT_WHITE);
  drawKey(btnPayPreset3, TFT_RED,      TFT_WHITE);

  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  centre("Or send 'WRITE:<text>' via Serial Monitor", 160, 222, 1);
}

static void drawWriteConfirm() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  centre("Confirm Card Write", 160, 26, 4);

  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  centre("Target: Sector 1, Block 4 (16B)", 160, 56, 2);

  tft.drawRect(25, 78, 270, 52, TFT_GREEN);
  tft.drawRect(26, 79, 268, 50, TFT_GREEN);

  char displayPayload[36];
  snprintf(displayPayload, sizeof(displayPayload), "\"%s\"", writePayload);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  centre(displayPayload, 160, 104, 4);

  drawKey(btnWriteConfirm, TFT_GREEN, TFT_GREEN);
  drawKey(btnCancel,       TFT_RED,   TFT_RED);
}

static void drawWriteWait() {
  tft.fillScreen(TFT_BLACK);
  drawKey(btnBack, TFT_DARKGREY, TFT_WHITE);

  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  centre("ENCODING CARD", 160, 26, 4);

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  centre("Hold card flat on PN532", 160, 62, 2);

  tft.drawRect(30, 90, 260, 80, TFT_GREEN);
  tft.drawRect(31, 91, 258, 78, TFT_GREEN);

  char pLine[36];
  snprintf(pLine, sizeof(pLine), "Payload: %s", writePayload);
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  centre(pLine, 160, 115, 2);

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  centre("Tap Card to Write Now", 160, 142, 2);

  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  centre("Do not remove card during write!", 160, 205, 1);
}

static void drawKeypad() {
  tft.fillScreen(TFT_BLACK);

  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.setTextFont(1);
  tft.setTextDatum(TL_DATUM);
  char head[48];
  if (haveWallet) {
    snprintf(head, sizeof(head), "To: %.11s...%s", wallet, wallet + 36);
  } else {
    snprintf(head, sizeof(head), "PaidX POS Terminal");
  }
  tft.drawString(head, 76, 12);

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextDatum(TR_DATUM);
  tft.drawString(modeName(inputMode), 316, 12);

  redrawAmount();
  for (int i = 0; i < 12; i++) drawKey(keypad[i], TFT_DARKGREY, TFT_WHITE);
  drawKey(btnBack, TFT_DARKGREY, TFT_WHITE);
}

static void drawConfirm() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  centre("Confirm Payment", 160, 26, 4);

  char line[24];
  formatAmount(line, sizeof(line));
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  centre(line, 160, 66, 4);

  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.setTextFont(2);
  tft.setTextDatum(MC_DATUM);
  char addr[44];
  if (haveWallet) {
    snprintf(addr, sizeof(addr), "%.12s...%s", wallet, wallet + 32);
  } else if (inputMode == MODE_CARD_PAY) {
    snprintf(addr, sizeof(addr), "%s", "NFC Card Payment");
  } else {
    snprintf(addr, sizeof(addr), "%s", modeName(inputMode));
  }
  tft.drawString(addr, 160, 104);

  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  if (inputMode == MODE_CARD_PAY) {
    centre("Tap PAY to proceed to card tap", 160, 128, 1);
  } else {
    centre("Check the amount before you pay", 160, 128, 1);
  }

  drawKey(btnConfirm, TFT_GREEN, TFT_GREEN);
  drawKey(btnCancel,  TFT_RED,   TFT_RED);
}

static void drawFetching() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  centre("Fetching rate", 160, 90, 4);
  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  centre("Preparing checkout...", 160, 130, 2);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  centre("tap to cancel", 160, 190, 1);
}

static void renderQrToTft(esp_qrcode_handle_t qrcode) {
  int qrSize = esp_qrcode_get_size(qrcode);
  int scale = 4;
  if (qrSize > 30) scale = 3;

  int qrPixels = qrSize * scale;
  int boxPad = 8;
  int boxSize = qrPixels + (boxPad * 2);
  int boxX = (320 - boxSize) / 2;
  int boxY = 48;

  tft.fillRect(boxX, boxY, boxSize, boxSize, TFT_WHITE);

  int startX = boxX + boxPad;
  int startY = boxY + boxPad;

  for (int y = 0; y < qrSize; y++) {
    for (int x = 0; x < qrSize; x++) {
      if (esp_qrcode_get_module(qrcode, x, y)) {
        tft.fillRect(startX + x * scale, startY + y * scale, scale, scale, TFT_BLACK);
      }
    }
  }
}

static void renderBaseScanQrToTft(esp_qrcode_handle_t qrcode) {
  int qrSize = esp_qrcode_get_size(qrcode);
  int scale = (qrSize > 35) ? 2 : 3;
  int qrPixels = qrSize * scale;
  int boxPad = 5;
  int boxSize = qrPixels + (boxPad * 2);
  int boxX = 238 - (boxSize / 2);
  int boxY = 32;

  tft.fillRect(boxX, boxY, boxSize, boxSize, TFT_WHITE);

  int startX = boxX + boxPad;
  int startY = boxY + boxPad;

  for (int y = 0; y < qrSize; y++) {
    for (int x = 0; x < qrSize; x++) {
      if (esp_qrcode_get_module(qrcode, x, y)) {
        tft.fillRect(startX + x * scale, startY + y * scale, scale, scale, TFT_BLACK);
      }
    }
  }
}

static void drawPending() {
  tft.fillScreen(TFT_BLACK);

  if (inputMode == MODE_CARD_PAY) {
    tft.setTextColor(TFT_WHITE, TFT_BLACK);
    centre("Tap Card to Pay", 160, 50, 4);

    tft.drawRect(40, 85, 240, 60, TFT_CYAN);
    tft.drawRect(41, 86, 238, 58, TFT_CYAN);

    char line[24];
    formatAmount(line, sizeof(line));
    tft.setTextColor(TFT_GREEN, TFT_BLACK);
    centre(line, 160, 104, 2);

    tft.setTextColor(TFT_YELLOW, TFT_BLACK);
    centre("Hold card on NFC reader", 160, 126, 2);

    tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
    centre("tap screen to cancel", 160, 195, 1);
  } else {
    drawKey(btnQrCancel, TFT_DARKGREY, TFT_WHITE);

    tft.setTextColor(TFT_CYAN, TFT_BLACK);
    centre("SCAN TO PAY", 160, 16, 2);

    char line[24];
    formatAmount(line, sizeof(line));
    tft.setTextColor(TFT_GREEN, TFT_BLACK);
    centre(line, 160, 34, 4);

    esp_qrcode_config_t cfg = ESP_QRCODE_CONFIG_DEFAULT();
    cfg.display_func = renderQrToTft;
    cfg.qrcode_ecc_level = ESP_QRCODE_ECC_LOW;
    cfg.max_qrcode_version = 5;
    esp_qrcode_generate(&cfg, RECEIVING_WALLET);

    drawKey(btnQrClose, TFT_GREEN, TFT_GREEN);
  }
}

static void drawVerifying() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);

  if (inputMode == MODE_DOC_WRITE) {
    centre("ENCODING MEMORY", 160, 32, 4);
  } else if (inputMode == MODE_DOC_READ) {
    centre("READING CARD", 160, 32, 4);
  } else {
    centre("VERIFYING PAYMENT", 160, 32, 4);
  }

  char line[24];
  if (inputMode == MODE_CARD_PAY) {
    formatAmount(line, sizeof(line));
    tft.setTextColor(TFT_GREEN, TFT_BLACK);
    centre(line, 160, 72, 4);
  } else if (inputMode == MODE_DOC_WRITE) {
    snprintf(line, sizeof(line), "Block %d", targetBlock);
    tft.setTextColor(TFT_GREEN, TFT_BLACK);
    centre(line, 160, 72, 4);
  } else {
    snprintf(line, sizeof(line), "Sector 1");
    tft.setTextColor(TFT_GREEN, TFT_BLACK);
    centre(line, 160, 72, 4);
  }

  char cardLine[36];
  if (lastScannedUid[0] != 0) {
    snprintf(cardLine, sizeof(cardLine), "Card: %s", lastScannedUid);
  } else {
    snprintf(cardLine, sizeof(cardLine), "Card: NFC Tap");
  }
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  centre(cardLine, 160, 108, 2);

  // Status container outline
  tft.drawRoundRect(30, 132, 260, 74, 6, TFT_CYAN);
  tft.drawRoundRect(31, 133, 258, 72, 5, TFT_DARKGREY);

  // Initial status text inside container
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  centre("Initializing communication...", 160, 156, 2);

  // Progress bar track
  tft.drawRect(50, 182, 220, 8, TFT_DARKGREY);
  tft.fillRect(52, 184, 216, 4, TFT_BLACK);

  // Advisory footer
  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  centre("Please do not remove card or power off", 160, 222, 1);
}

static void drawReceipt() {
  tft.fillScreen(TFT_BLACK);

  if (inputMode == MODE_CARD_PAY && isLiveOnChainTx && lastTxHash[0] != 0) {
    tft.setTextColor(TFT_GREEN, TFT_BLACK);
    tft.setTextFont(4);
    tft.setTextDatum(TL_DATUM);
    tft.drawString("SETTLED", 16, 18);
    tft.drawString("ON SEPOLIA", 16, 44);

    char line[24];
    formatAmount(line, sizeof(line));
    tft.setTextColor(TFT_WHITE, TFT_BLACK);
    tft.drawString(line, 16, 76);

    tft.setTextColor(TFT_CYAN, TFT_BLACK);
    tft.setTextFont(2);
    char shortTx[32];
    snprintf(shortTx, sizeof(shortTx), "Tx: %.8s...%.6s", lastTxHash, lastTxHash + strlen(lastTxHash) - 6);
    tft.drawString(shortTx, 16, 108);

    tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
    tft.drawString("Sepolia (11155111)", 16, 132);

    btnHome.x = 16;
    btnHome.y = 168;
    btnHome.w = 120;
    btnHome.h = 44;
    drawKey(btnHome, TFT_GREEN, TFT_GREEN);

    if (lastExplorerUrl[0] != 0) {
      esp_qrcode_config_t cfg = ESP_QRCODE_CONFIG_DEFAULT();
      cfg.display_func = renderBaseScanQrToTft;
      cfg.qrcode_ecc_level = ESP_QRCODE_ECC_LOW;
      cfg.max_qrcode_version = 7;
      esp_qrcode_generate(&cfg, lastExplorerUrl);
    }

    tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
    tft.setTextFont(1);
    tft.setTextDatum(TC_DATUM);
    tft.drawString("Scan for Etherscan", 238, 168, 1);
  } else {
    btnHome.x = 100;
    btnHome.y = 174;
    btnHome.w = 120;
    btnHome.h = 46;

    tft.setTextColor(TFT_GREEN, TFT_BLACK);
    centre(opResultTitle, 160, 40, 4);

    if (inputMode == MODE_CARD_PAY) {
      char line[24];
      formatAmount(line, sizeof(line));
      tft.setTextColor(TFT_WHITE, TFT_BLACK);
      centre("Paid", 160, 78, 2);
      tft.setTextColor(TFT_GREEN, TFT_BLACK);
      centre(line, 160, 104, 4);
    } else if (inputMode == MODE_DOC_WRITE) {
      char pLine[36];
      snprintf(pLine, sizeof(pLine), "Written: %s", writePayload);
      tft.setTextColor(TFT_WHITE, TFT_BLACK);
      centre("Memory Encoded", 160, 78, 2);
      tft.setTextColor(TFT_GREEN, TFT_BLACK);
      centre(pLine, 160, 104, 2);
    }

    tft.setTextColor(TFT_CYAN, TFT_BLACK);
    tft.setTextFont(2);
    tft.setTextDatum(MC_DATUM);
    char addr[44];
    if (lastScannedUid[0] != 0) {
      snprintf(addr, sizeof(addr), "Card: %s", lastScannedUid);
    } else {
      snprintf(addr, sizeof(addr), "%s", modeName(inputMode));
    }
    tft.drawString(addr, 160, 134);

    tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
    centre(opResultMsg, 160, 154, 1);

    drawKey(btnHome, TFT_CYAN, TFT_CYAN);
  }
}

static void drawFail() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_RED, TFT_BLACK);
  centre("FAILED", 160, 40, 4);

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  centre("Operation Declined", 160, 78, 2);

  char line[32];
  if (lastScannedUid[0] != 0) {
    snprintf(line, sizeof(line), "Card: %s", lastScannedUid);
  } else {
    snprintf(line, sizeof(line), "Card: Unknown");
  }
  tft.setTextColor(TFT_RED, TFT_BLACK);
  centre(line, 160, 108, 2);

  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  centre(opFailReason, 160, 140, 1);

  drawKey(btnHome, TFT_RED, TFT_RED);
}

static void showNote(const char* msg) {
  strncpy(noteBuf, msg, sizeof(noteBuf) - 1);
  noteBuf[sizeof(noteBuf) - 1] = 0;
  noteUntil = millis() + NOTE_MS;
}

static void paintScreen(Screen s) {
  switch (s) {
    case SCR_LOGO:          drawLogo();          break;
    case SCR_WIFI:          drawWifiScreen();    break;
    case SCR_REGISTER:      drawRegister();      break;
    case SCR_HOME:          drawHome();          break;
    case SCR_READ_WAIT:     drawReadWait();      break;
    case SCR_READ_RESULT:   drawReadResult();    break;
    case SCR_WRITE_MENU:    drawWriteMenu();     break;
    case SCR_WRITE_CONFIRM: drawWriteConfirm();  break;
    case SCR_WRITE_WAIT:    drawWriteWait();     break;
    case SCR_KEYPAD:        drawKeypad();        break;
    case SCR_CONFIRM:       drawConfirm();       break;
    case SCR_FETCHING:      drawFetching();      break;
    case SCR_PENDING:       drawPending();       break;
    case SCR_VERIFYING:     drawVerifying();     break;
    case SCR_RECEIPT:       drawReceipt();       break;
    case SCR_FAIL:          drawFail();          break;
  }
  flashBtn = nullptr; flashUntil = 0;
}

static const char* screenName(Screen s) {
  switch (s) {
    case SCR_LOGO:          return "LOGO";
    case SCR_WIFI:          return "WIFI";
    case SCR_REGISTER:      return "REGISTER";
    case SCR_HOME:          return "HOME";
    case SCR_READ_WAIT:     return "READ_WAIT";
    case SCR_READ_RESULT:   return "READ_RESULT";
    case SCR_WRITE_MENU:    return "WRITE_MENU";
    case SCR_WRITE_CONFIRM: return "WRITE_CONFIRM";
    case SCR_WRITE_WAIT:    return "WRITE_WAIT";
    case SCR_KEYPAD:        return "KEYPAD";
    case SCR_CONFIRM:       return "CONFIRM";
    case SCR_FETCHING:      return "FETCHING";
    case SCR_PENDING:       return "PENDING";
    case SCR_VERIFYING:     return "VERIFYING";
    case SCR_RECEIPT:       return "RECEIPT";
    case SCR_FAIL:          return "FAIL";
  }
  return "?";
}

static void enterScreen(Screen s) {
  const char* from = screenName(screen);
  screen = s;
  touchReleased  = false;
  touchMaskUntil = millis() + TOUCH_MASK_MS;
  Serial.printf("[ui] %s -> %s\n", from, screenName(s));
  paintScreen(s);
}

// ===========================================================================
//  WIFI MANAGEMENT
// ===========================================================================
static void startWifiConnect() {
  Serial.printf("[wifi] Initiating connection to SSID: \"%s\"...\n", PAIDX_WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(50);
  WiFi.begin(PAIDX_WIFI_SSID, PAIDX_WIFI_PASSWORD);
  wifiConnectStart = millis();
  lastWifiRetryMs  = millis();
  wifiConnected    = false;
  lastWifiStage    = 255;
  lastWifiAnimMs   = 0;
}

static void proceedPastWifi() {
  if (hasRegisteredCard) {
    enterScreen(SCR_HOME);
  } else {
    regStartMs = millis();
    enterScreen(SCR_REGISTER);
  }
}

// ===========================================================================
//  ON-CHAIN BASE NETWORK SETTLEMENT
// ===========================================================================
static bool executeCardSaleHttp(const char* uidDense, const char* chipSecret, const char* amountEth) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[http-sale] WiFi offline! Cannot reach PaidX API."));
    strncpy(opFailReason, "WiFi offline", sizeof(opFailReason) - 1);
    return false;
  }

  char url[128];
  if (strstr(PAIDX_API_BASE, "/payments") != NULL) {
    snprintf(url, sizeof(url), "%s", PAIDX_API_BASE);
  } else if (strstr(PAIDX_API_BASE, "/pos") != NULL) {
    snprintf(url, sizeof(url), "%s/sale", PAIDX_API_BASE);
  } else {
    snprintf(url, sizeof(url), "%s/payments", PAIDX_API_BASE);
  }
  Serial.printf("[http-sale] POST to %s ...\n", url);

  HTTPClient http;
  http.setConnectTimeout(6000);
  http.setTimeout(18000); // Sepolia broadcast + receipt
  if (!http.begin(url)) {
    Serial.println(F("[http-sale] http.begin failed"));
    strncpy(opFailReason, "HTTP connect failed", sizeof(opFailReason) - 1);
    return false;
  }

  char clientSaleId[36];
  snprintf(clientSaleId, sizeof(clientSaleId), "pos-%lu-%u", (unsigned long)millis(), (unsigned)random(1000, 9999));

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Accept", "application/json");
  http.addHeader("X-Device-UUID", PAIDX_DEVICE_UUID);
  http.addHeader("X-Device-Token", PAIDX_DEVICE_TOKEN);
  http.addHeader("Idempotency-Key", clientSaleId);
  http.addHeader("X-Idempotency-Key", clientSaleId);
  http.addHeader("X-Merchant-Id", PAIDX_MERCHANT_ID);
  http.addHeader("Authorization", "Bearer " PAIDX_DEVICE_TOKEN);

  JsonDocument doc;
  doc["clientSaleId"]    = clientSaleId;
  doc["idempotencyKey"]  = clientSaleId;
  doc["merchantId"]      = PAIDX_MERCHANT_ID;
  doc["merchantAddress"] = PAIDX_MERCHANT_ADDRESS;
  doc["posDeviceId"]     = PAIDX_DEVICE_UUID;
  doc["paymentMethod"]   = "card_tap";
  doc["cardUid"]         = uidDense;
  doc["rawCardUid"]      = uidDense;
  doc["cardSecret"]      = chipSecret;
  doc["amount"]          = amountEth;

  String reqBody;
  serializeJson(doc, reqBody);
  Serial.printf("[http-sale] Payload: %s\n", reqBody.c_str());

  int httpCode = http.POST(reqBody);
  Serial.printf("[http-sale] Response Code: %d\n", httpCode);

  if (httpCode <= 0) {
    Serial.printf("[http-sale] POST failed: %s\n", http.errorToString(httpCode).c_str());
    strncpy(opFailReason, "Network error", sizeof(opFailReason) - 1);
    http.end();
    return false;
  }

  String respBody = http.getString();
  http.end();
  Serial.printf("[http-sale] Response Body: %s\n", respBody.c_str());

  JsonDocument resDoc;
  DeserializationError err = deserializeJson(resDoc, respBody);
  if (err) {
    Serial.printf("[http-sale] JSON parse error: %s\n", err.c_str());
    strncpy(opFailReason, "Invalid server reply", sizeof(opFailReason) - 1);
    return false;
  }

  if (httpCode >= 200 && httpCode < 300) {
    const char* tx = resDoc["payment"]["tx_hash"] | resDoc["txHash"] | "";
    char generatedExplorerUrl[130] = "";
    if (strlen(tx) > 0) {
      strncpy(lastTxHash, tx, sizeof(lastTxHash) - 1);
      lastTxHash[sizeof(lastTxHash) - 1] = 0;
      isLiveOnChainTx = true;
      snprintf(generatedExplorerUrl, sizeof(generatedExplorerUrl), "https://sepolia.etherscan.io/tx/%s", tx);
    }
    const char* expUrl = resDoc["explorerUrl"] | (generatedExplorerUrl[0] != 0 ? generatedExplorerUrl : "");
    if (strlen(expUrl) > 0) {
      strncpy(lastExplorerUrl, expUrl, sizeof(lastExplorerUrl) - 1);
      lastExplorerUrl[sizeof(lastExplorerUrl) - 1] = 0;
    }
    strncpy(opResultTitle, "SETTLED ON SEPOLIA", sizeof(opResultTitle) - 1);
    strncpy(opResultMsg, "On-Chain Verified", sizeof(opResultMsg) - 1);
    Serial.printf("[http-sale] SUCCESS! TxHash: %s\n", lastTxHash);
    return true;
  } else {
    const char* errMsg = resDoc["error"] | resDoc["message"] | "Payment rejected";
    strncpy(opFailReason, errMsg, sizeof(opFailReason) - 1);
    Serial.printf("[http-sale] DECLINED: %s\n", opFailReason);
    return false;
  }
}

// ===========================================================================
//  TRANSITIONS
// ===========================================================================
static void beginSale(InputMode m) {
  inputMode = m;
  amountLen = 0; amountBuf[0] = 0;
  lastScannedUid[0] = 0;
  if (m == MODE_QR) {
    strncpy(wallet, RECEIVING_WALLET, sizeof(wallet) - 1);
    wallet[sizeof(wallet) - 1] = 0;
    haveWallet = true;
  } else {
    wallet[0] = 0;
    haveWallet = false;
  }
  Serial.printf("[ui] input method: %s\n", modeName(m));
  enterScreen(SCR_KEYPAD);
  if (m == MODE_CARD_PAY) {
    showNote("Enter amount, tap OK");
  } else {
    showNote("Scan & Pay");
  }
}

static void goHome() {
  btnHome.x = 100;
  btnHome.y = 174;
  btnHome.w = 120;
  btnHome.h = 46;
  amountLen = 0; amountBuf[0] = 0;
  inputMode = MODE_NONE;
  lastScannedUid[0] = 0;
  wallet[0] = 0;
  haveWallet = false;
  enterScreen(SCR_HOME);
}

// ===========================================================================
//  CARD STORAGE & VALIDATION
// ===========================================================================
static void saveRegisteredCard() {
  fs::File f = SPIFFS.open(CARD_FILE, "w");
  if (f) {
    f.println(authorizedCardUid);
    f.close();
    Serial.printf("[auth] Card UID saved to flash: %s\n", authorizedCardUid);
  }
}

static void loadRegisteredCard() {
  authorizedCardUid[0] = 0;
  hasRegisteredCard = false;

  if (!SPIFFS.exists(CARD_FILE)) {
    Serial.println(F("[auth] No saved card found. First boot registration required."));
    return;
  }
  fs::File f = SPIFFS.open(CARD_FILE, "r");
  if (!f) return;
  char buf[32];
  int len = f.readBytesUntil('\n', buf, sizeof(buf) - 1);
  if (len > 0) {
    buf[len] = 0;
    while (len > 0 && (buf[len-1] == '\r' || buf[len-1] == ' ' || buf[len-1] == '\n')) {
      buf[--len] = 0;
    }
    if (len >= 4) {
      strncpy(authorizedCardUid, buf, sizeof(authorizedCardUid) - 1);
      authorizedCardUid[sizeof(authorizedCardUid) - 1] = 0;
      hasRegisteredCard = true;
      Serial.printf("[auth] Loaded authorized card from storage: %s\n", authorizedCardUid);
    }
  }
  f.close();
}

static void registerCard(const char* uidStr) {
  strncpy(authorizedCardUid, uidStr, sizeof(authorizedCardUid) - 1);
  authorizedCardUid[sizeof(authorizedCardUid) - 1] = 0;
  hasRegisteredCard  = true;
  cardJustRegistered = true;
  regConfirmStart    = millis();

  saveRegisteredCard();

  Serial.printf("[auth] Registered card: %s\n", authorizedCardUid);
  drawRegisterSuccess();
}

static bool isTargetCard(const char* input) {
  if (!input || authorizedCardUid[0] == 0) return false;
  if (strcasecmp(input, authorizedCardUid) == 0) return true;

  char h1[16] = "", h2[16] = "";
  uint8_t l1 = 0, l2 = 0;
  for (const char* p = input; *p && l1 < 15; p++) {
    char c = *p;
    if ((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) h1[l1++] = c;
  }
  for (const char* p = authorizedCardUid; *p && l2 < 15; p++) {
    char c = *p;
    if ((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) h2[l2++] = c;
  }
  h1[l1] = 0; h2[l2] = 0;
  return (strcasecmp(h1, h2) == 0);
}

// ===========================================================================
//  CARD DOCTOR: READ & WRITE OPERATIONS
// ===========================================================================

// Authenticate block with multiple standard keys (default, NDEF, MAD)
static bool authenticateMifare(uint8_t* uid, uint8_t uidLength, uint8_t blockNum) {
  if (nfc.mifareclassic_AuthenticateBlock(uid, uidLength, blockNum, 0, keyA_Default)) {
    return true;
  }
  if (nfc.mifareclassic_AuthenticateBlock(uid, uidLength, blockNum, 0, keyA_NDEF)) {
    return true;
  }
  if (nfc.mifareclassic_AuthenticateBlock(uid, uidLength, blockNum, 0, keyA_MAD)) {
    return true;
  }
  return false;
}

// Perform complete card inspection (Doctor Mode)
static void executeCardRead(uint8_t* uid, uint8_t uidLength) {
  Serial.println(F("\n======================================================="));
  Serial.println(F("  PAIDX NFC DOCTOR - CARD INSPECTION"));
  Serial.println(F("======================================================="));
  Serial.printf(" [+] UID Length: %d bytes\n", uidLength);
  Serial.printf("     Colon form : %s\n", lastScannedUid);
  Serial.printf("     Dense form : %s   <- sha256 of this keys cards.card_uuid\n", lastDenseUid);

  cardReadAscii[0] = 0;
  cardReadHex[0]   = 0;

  if (uidLength == 4) {
    strncpy(cardTypeStr, "MIFARE Classic 1K", sizeof(cardTypeStr) - 1);
    Serial.println(F(" [+] Card Type : MIFARE Classic 1K (ISO 14443A)"));

    // Authenticate Sector 1 (Block 4)
    if (authenticateMifare(uid, uidLength, targetBlock)) {
      uint8_t blockData[16];
      if (nfc.mifareclassic_ReadDataBlock(targetBlock, blockData)) {
        Serial.printf(" [+] Sector 1, Block %d read SUCCESS:\n     Hex  : ", targetBlock);
        for (int i = 0; i < 16; i++) {
          Serial.printf("%02X ", blockData[i]);
          char hexByte[4];
          snprintf(hexByte, sizeof(hexByte), "%02X ", blockData[i]);
          strncat(cardReadHex, hexByte, sizeof(cardReadHex) - strlen(cardReadHex) - 1);
        }
        Serial.print("\n     ASCII: \"");
        int asciiIdx = 0;
        for (int i = 0; i < 16; i++) {
          char c = (char)blockData[i];
          if (c >= 32 && c <= 126) {
            Serial.print(c);
            if (asciiIdx < sizeof(cardReadAscii) - 1) cardReadAscii[asciiIdx++] = c;
          } else {
            Serial.print('.');
          }
        }
        cardReadAscii[asciiIdx] = 0;
        Serial.println("\"");
      } else {
        Serial.println(F(" [-] Read failed on Block 4."));
        strncpy(cardReadAscii, "[Read Error]", sizeof(cardReadAscii) - 1);
      }
    } else {
      Serial.println(F(" [-] Authentication failed with standard keys."));
      strncpy(cardReadAscii, "[Auth Failed]", sizeof(cardReadAscii) - 1);
    }
  } else if (uidLength == 7) {
    strncpy(cardTypeStr, "MIFARE Ultralight / NTAG", sizeof(cardTypeStr) - 1);
    Serial.println(F(" [+] Card Type : MIFARE Ultralight / NTAG2xx"));

    uint8_t pageData[16];
    if (nfc.mifareultralight_ReadPage(targetBlock, pageData)) {
      Serial.printf(" [+] Page %d read SUCCESS:\n     Hex  : ", targetBlock);
      for (int i = 0; i < 16; i++) {
        Serial.printf("%02X ", pageData[i]);
        char hexByte[4];
        snprintf(hexByte, sizeof(hexByte), "%02X ", pageData[i]);
        strncat(cardReadHex, hexByte, sizeof(cardReadHex) - strlen(cardReadHex) - 1);
      }
      Serial.print("\n     ASCII: \"");
      int asciiIdx = 0;
      for (int i = 0; i < 16; i++) {
        char c = (char)pageData[i];
        if (c >= 32 && c <= 126) {
          Serial.print(c);
          if (asciiIdx < sizeof(cardReadAscii) - 1) cardReadAscii[asciiIdx++] = c;
        } else {
          Serial.print('.');
        }
      }
      cardReadAscii[asciiIdx] = 0;
      Serial.println("\"");
    } else {
      Serial.println(F(" [-] Ultralight read page failed."));
      strncpy(cardReadAscii, "[Read Error]", sizeof(cardReadAscii) - 1);
    }
  } else {
    strncpy(cardTypeStr, "ISO14443A Tag", sizeof(cardTypeStr) - 1);
    strncpy(cardReadAscii, "[Generic Tag]", sizeof(cardReadAscii) - 1);
  }
  Serial.println(F("=======================================================\n"));
}

// Perform Card Encoding (Write Operation)
static bool executeCardWrite(uint8_t* uid, uint8_t uidLength) {
  Serial.println(F("\n======================================================="));
  Serial.println(F("  PAIDX CARD ENCODER - WRITE OPERATION"));
  Serial.println(F("======================================================="));
  Serial.printf(" [+] Target Card UID : %s\n", lastScannedUid);
  Serial.printf(" [+] Target Block    : %d (Sector 1, Block 0)\n", targetBlock);
  Serial.printf(" [+] Payload to Write: \"%s\"\n", writePayload);

  uint8_t writeBuf[16];
  memset(writeBuf, 0, sizeof(writeBuf));
  size_t pLen = strlen(writePayload);
  if (pLen > 16) pLen = 16;
  memcpy(writeBuf, writePayload, pLen);

  bool success = false;

  if (uidLength == 4) {
    if (authenticateMifare(uid, uidLength, targetBlock)) {
      Serial.println(F(" [+] Authenticated with Key A. Writing 16 bytes..."));
      if (nfc.mifareclassic_WriteDataBlock(targetBlock, writeBuf)) {
        Serial.println(F(" [+] Write command ACK received. Verifying parity..."));
        uint8_t readBack[16];
        if (nfc.mifareclassic_ReadDataBlock(targetBlock, readBack)) {
          if (memcmp(writeBuf, readBack, 16) == 0) {
            Serial.println(F(" [✓] PARITY VERIFIED 100%! Card successfully encoded!"));
            success = true;
          } else {
            Serial.println(F(" [-] Parity mismatch between written and read-back data."));
          }
        } else {
          Serial.println(F(" [-] Read-back verification failed."));
        }
      } else {
        Serial.println(F(" [-] mifareclassic_WriteDataBlock returned error."));
      }
    } else {
      Serial.println(F(" [-] Authentication failed! Cannot write to locked sector."));
    }
  } else if (uidLength == 7) {
    Serial.println(F(" [+] Writing NTAG pages..."));
    bool allPagesOk = true;
    for (int p = 0; p < 4; p++) {
      uint8_t pageData[4];
      memcpy(pageData, writeBuf + (p * 4), 4);
      if (!nfc.mifareultralight_WritePage(targetBlock + p, pageData)) {
        allPagesOk = false;
        break;
      }
    }
    if (allPagesOk) {
      Serial.println(F(" [✓] Ultralight pages written successfully!"));
      success = true;
    } else {
      Serial.println(F(" [-] Ultralight write page failed."));
    }
  }

  Serial.println(F("=======================================================\n"));
  return success;
}

// ===========================================================================
//  PN532 I2C DRIVER
// ===========================================================================
static bool tryI2CPins(int sdaPin, int sclPin) {
  Wire.end();
  delay(50);
  Wire.begin(sdaPin, sclPin, 100000); // 100kHz standard I2C clock
  delay(100);

  Serial.printf("Scanning I2C with SDA=P%d, SCL=P%d...\n", sdaPin, sclPin);
  Wire.beginTransmission(0x24); // 0x24 is PN532's I2C address
  if (Wire.endTransmission() == 0) {
    Serial.printf(" -> Found PN532 at I2C 0x24 on SDA=P%d, SCL=P%d!\n", sdaPin, sclPin);
    nfc.begin();
    uint32_t versiondata = nfc.getFirmwareVersion();
    if (versiondata) {
      Serial.print(" -> Chip: PN5");
      Serial.println((versiondata >> 24) & 0xFF, HEX);
      Serial.printf(" -> Firmware: v%d.%d\n", (versiondata >> 16) & 0xFF, (versiondata >> 8) & 0xFF);
      return true;
    }
  }
  return false;
}

static void initNFC() {
  bool ok = tryI2CPins(16, 17);
  if (!ok) {
    Serial.println(" -> Not found. Auto-swapping SDA/SCL to P17/P16...");
    ok = tryI2CPins(17, 16);
  }

  if (!ok) {
    Serial.println(" -> Not on P16/P17. Checking PaidX default pins P21/P22...");
    ok = tryI2CPins(21, 22);
    if (!ok) ok = tryI2CPins(22, 21);
  }

  if (ok) {
    nfc.SAMConfig();
    nfcReady = true;
    Serial.println("\n[READY] PN532 active and ready for card scan!");
  } else {
    nfcReady = false;
    Serial.println("\n[!] PN532 did not respond at I2C 0x24 on P16/P17 or P21/P22.");
  }
}

static void pollNFC() {
  if (!nfcReady) return;

  const bool inRegisterMode = (screen == SCR_REGISTER && !cardJustRegistered);
  const bool inPaymentMode  = (screen == SCR_PENDING && inputMode == MODE_CARD_PAY);
  const bool inReadMode     = (screen == SCR_READ_WAIT);
  const bool inWriteMode    = (screen == SCR_WRITE_WAIT);

  if (!inRegisterMode && !inPaymentMode && !inReadMode && !inWriteMode) return;

  uint32_t now = millis();
  if ((uint32_t)(now - lastNfcStatusMs) > 2000) {
    lastNfcStatusMs = now;
    if (inRegisterMode)      Serial.println(F("[nfc] Waiting for card scan to set UUID..."));
    else if (inReadMode)     Serial.println(F("[nfc] Doctor waiting for card to inspect..."));
    else if (inWriteMode)    Serial.println(F("[nfc] Encoder waiting for card to write..."));
    else if (inPaymentMode)  Serial.println(F("[nfc] Terminal awaiting card tap for payment..."));
  }

  uint8_t uid[7];
  uint8_t uidLength = 0;

  if (nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 500)) {
    lastScannedUid[0] = 0;
    lastDenseUid[0]   = 0;
    for (uint8_t i = 0; i < uidLength && i < 7; i++) {
      char byteStr[4];
      snprintf(byteStr, sizeof(byteStr), "%02X%s", uid[i], (i < uidLength - 1) ? ":" : "");
      strncat(lastScannedUid, byteStr, sizeof(lastScannedUid) - strlen(lastScannedUid) - 1);

      char denseByte[3];
      snprintf(denseByte, sizeof(denseByte), "%02X", uid[i]);
      strncat(lastDenseUid, denseByte, sizeof(lastDenseUid) - strlen(lastDenseUid) - 1);
    }

    Serial.printf("[nfc] Card detected: %s (dense: %s)\n", lastScannedUid, lastDenseUid);

    if (inRegisterMode) {
      registerCard(lastScannedUid);
      return;
    }

    if (inReadMode) {
      executeCardRead(uid, uidLength);
      enterScreen(SCR_READ_RESULT);
      return;
    }

    if (inWriteMode) {
      writeSuccess = executeCardWrite(uid, uidLength);
      paymentApproved = writeSuccess;

      verifyStartMs = millis();
      verifyDurationMs = 2500;
      lastVerifyStage = 255;
      lastVerifyAnimMs = 0;

      verifyStageMsg[0] = "Authenticating Sector 1";
      verifyStageMsg[1] = "Writing Memory Block 4";
      verifyStageMsg[2] = "Verifying Parity Checksum";

      if (writeSuccess) {
        strncpy(opResultTitle, "ENCODE SUCCESS", sizeof(opResultTitle) - 1);
        strncpy(opResultMsg, "Card Memory Verified", sizeof(opResultMsg) - 1);
      } else {
        strncpy(opFailReason, "Write or parity failed", sizeof(opFailReason) - 1);
      }

      enterScreen(SCR_VERIFYING);
      return;
    }

    if (inPaymentMode) {
      // 2-Factor Hardware Authentication: Validate UID + Block 4 Memory Secret
      bool uidMatch = isTargetCard(lastScannedUid);
      bool chipAuthOk = false;
      char chipSecret[20] = "";

      if (uidLength == 4 && authenticateMifare(uid, uidLength, targetBlock)) {
        uint8_t blk[16];
        if (nfc.mifareclassic_ReadDataBlock(targetBlock, blk)) {
          int sIdx = 0;
          for (int i = 0; i < 16; i++) {
            if (blk[i] >= 32 && blk[i] <= 126 && sIdx < 16) {
              chipSecret[sIdx++] = (char)blk[i];
            }
          }
          chipSecret[sIdx] = 0;
          chipAuthOk = (sIdx > 0);
        }
      } else if (uidLength == 7) {
        uint8_t pg[16];
        if (nfc.mifareultralight_ReadPage(targetBlock, pg)) {
          int sIdx = 0;
          for (int i = 0; i < 16; i++) {
            if (pg[i] >= 32 && pg[i] <= 126 && sIdx < 16) {
              chipSecret[sIdx++] = (char)pg[i];
            }
          }
          chipSecret[sIdx] = 0;
          chipAuthOk = (sIdx > 0);
        }
      }

      Serial.printf("[auth-2fa] Card UID: %s | Block 4 Secret: \"%s\" (Auth: %s)\n",
                    lastScannedUid, chipSecret, chipAuthOk ? "AUTHENTICATED" : "UNENCODED");

      if (amountLen == 0) {
        amountBuf[0] = '1'; amountBuf[1] = 0;
        amountLen = 1;
      }

      char amountDec[16];
      getAmountDecimal(amountDec, sizeof(amountDec));

      lastTxHash[0] = 0;
      lastExplorerUrl[0] = 0;
      isLiveOnChainTx = false;

      verifyStartMs = millis();
      lastVerifyStage = 255;
      lastVerifyAnimMs = 0;

      verifyStageMsg[0] = "Connecting to PaidX API";
      verifyStageMsg[1] = "Signing Sepolia Transfer";
      verifyStageMsg[2] = "Settling on Ethereum";

      Serial.printf("[payment] Card recognized (%s). Entering verification...\n", lastScannedUid);
      enterScreen(SCR_VERIFYING);

      // Real on-chain broadcast to Ethereum Sepolia via PaidX Backend
      if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("[payment] Dispatching on-chain sale: %s ETH for Card %s ...\n", amountDec, lastDenseUid);
        paymentApproved = executeCardSaleHttp(lastDenseUid, chipSecret, amountDec);
        verifyDurationMs = 1500; // Smooth dwell to show progress completion
        verifyStartMs = millis();
      } else {
        paymentApproved = false;
        verifyDurationMs = 2000;
        verifyStartMs = millis();
        strncpy(opFailReason, "WiFi offline", sizeof(opFailReason) - 1);
        Serial.println(F("[payment] WiFi offline! Cannot process on-chain sale."));
      }
    }
  }
}

// ===========================================================================
//  SERIAL COMMAND INTERPRETER (115200 BAUD)
// ===========================================================================
static char serialBuf[64];
static uint8_t serialIdx = 0;

static void pollSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r' || c == '\n') {
      if (serialIdx > 0) {
        serialBuf[serialIdx] = 0;
        char* p = serialBuf;
        while (*p == ' ') p++;
        if (strlen(p) > 0) {
          Serial.printf("[cmd] Received: %s\n", p);

          if (strcasecmp(p, "register") == 0 || strcasecmp(p, "reset") == 0) {
            hasRegisteredCard = false;
            cardJustRegistered = false;
            SPIFFS.remove(CARD_FILE);
            enterScreen(SCR_REGISTER);
          } else if (strcasecmp(p, "wifi") == 0) {
            startWifiConnect();
            enterScreen(SCR_WIFI);
          } else if (strcasecmp(p, "read") == 0 || strcasecmp(p, "inspect") == 0) {
            inputMode = MODE_DOC_READ;
            enterScreen(SCR_READ_WAIT);
          } else if (strcasecmp(p, "write") == 0 || strcasecmp(p, "encode") == 0) {
            inputMode = MODE_DOC_WRITE;
            enterScreen(SCR_WRITE_MENU);
          } else if (strncasecmp(p, "WRITE:", 6) == 0 || strncasecmp(p, "WRITE ", 6) == 0) {
            const char* val = p + 6;
            while (*val == ' ') val++;
            strncpy(writePayload, val, sizeof(writePayload) - 1);
            writePayload[sizeof(writePayload) - 1] = 0;
            Serial.printf("[encoder] Payload set to: \"%s\"\n", writePayload);
            inputMode = MODE_DOC_WRITE;
            enterScreen(SCR_WRITE_CONFIRM);
          } else if (strcasecmp(p, "format") == 0 || strcasecmp(p, "erase") == 0) {
            memset(writePayload, 0, sizeof(writePayload));
            Serial.println(F("[encoder] Payload set to all 0x00 (Erase mode)"));
            inputMode = MODE_DOC_WRITE;
            enterScreen(SCR_WRITE_CONFIRM);
          } else if (strncasecmp(p, "SET:", 4) == 0 || strncasecmp(p, "SET ", 4) == 0) {
            registerCard(p + 4);
          } else {
            Serial.println(F("Commands available:"));
            Serial.println(F("  WIFI          - Re-open WiFi connection screen"));
            Serial.println(F("  READ          - Enter card inspection mode"));
            Serial.println(F("  WRITE:<text>  - Set custom text and open write confirmation"));
            Serial.println(F("  FORMAT        - Clear Block 4 to 0x00"));
            Serial.println(F("  REGISTER      - Re-enter terminal card activation"));
          }
        }
        serialIdx = 0;
      }
    } else if (serialIdx < sizeof(serialBuf) - 1) {
      serialBuf[serialIdx++] = c;
    }
  }
}

// ===========================================================================
//  TOUCH
// ===========================================================================
static void onTouch(uint16_t tx, uint16_t ty) {
  switch (screen) {

  case SCR_LOGO:
    return;

  case SCR_WIFI:
    if (wifiConnected) {
      if (hit(btnWifiContinue, tx, ty)) {
        flashBtn = &btnWifiContinue;
        flashBorder = TFT_GREEN; flashFg = TFT_GREEN;
        flashUntil = millis() + FLASH_MS;
        Serial.println(F("[ui] CONTINUE tapped -> Proceeding to Station"));
        proceedPastWifi();
        return;
      }
    } else {
      if (hit(btnWifiSkip, tx, ty)) {
        flashBtn = &btnWifiSkip;
        flashBorder = TFT_DARKGREY; flashFg = TFT_WHITE;
        flashUntil = millis() + FLASH_MS;
        Serial.println(F("[ui] SKIP tapped -> Proceeding offline"));
        proceedPastWifi();
        return;
      }
    }
    return;

  case SCR_REGISTER:
    if (hasRegisteredCard) {
      enterScreen(SCR_HOME);
    }
    return;

  case SCR_HOME:
    if (hit(btnMenuRead, tx, ty)) {
      flashBtn = &btnMenuRead;
      flashBorder = TFT_CYAN; flashFg = TFT_WHITE;
      flashUntil = millis() + FLASH_MS;
      inputMode = MODE_DOC_READ;
      enterScreen(SCR_READ_WAIT);
      return;
    }
    if (hit(btnMenuWrite, tx, ty)) {
      flashBtn = &btnMenuWrite;
      flashBorder = TFT_GREEN; flashFg = TFT_GREEN;
      flashUntil = millis() + FLASH_MS;
      inputMode = MODE_DOC_WRITE;
      enterScreen(SCR_WRITE_MENU);
      return;
    }
    if (hit(btnMenuPay, tx, ty)) {
      flashBtn = &btnMenuPay;
      flashBorder = TFT_WHITE; flashFg = TFT_WHITE;
      flashUntil = millis() + FLASH_MS;
      beginSale(MODE_CARD_PAY);
      return;
    }
    if (hit(btnMenuQr, tx, ty)) {
      flashBtn = &btnMenuQr;
      flashBorder = TFT_YELLOW; flashFg = TFT_YELLOW;
      flashUntil = millis() + FLASH_MS;
      beginSale(MODE_QR);
      return;
    }
    return;

  case SCR_READ_WAIT:
    if (hit(btnBack, tx, ty)) {
      flashBtn = &btnBack;
      flashBorder = TFT_DARKGREY; flashFg = TFT_WHITE;
      flashUntil = millis() + FLASH_MS;
      goHome();
    }
    return;

  case SCR_READ_RESULT:
    if (hit(btnHome, tx, ty)) {
      flashBtn = &btnHome;
      flashBorder = TFT_CYAN; flashFg = TFT_CYAN;
      flashUntil = millis() + FLASH_MS;
      goHome();
    }
    return;

  case SCR_WRITE_MENU:
    if (hit(btnBack, tx, ty)) {
      flashBtn = &btnBack;
      flashBorder = TFT_DARKGREY; flashFg = TFT_WHITE;
      flashUntil = millis() + FLASH_MS;
      goHome();
      return;
    }
    if (hit(btnPayPreset1, tx, ty)) {
      flashBtn = &btnPayPreset1;
      flashBorder = TFT_GREEN; flashFg = TFT_WHITE;
      flashUntil = millis() + FLASH_MS;
      strncpy(writePayload, "PAIDX-CARD-001", sizeof(writePayload) - 1);
      enterScreen(SCR_WRITE_CONFIRM);
      return;
    }
    if (hit(btnPayPreset2, tx, ty)) {
      flashBtn = &btnPayPreset2;
      flashBorder = TFT_CYAN; flashFg = TFT_WHITE;
      flashUntil = millis() + FLASH_MS;
      strncpy(writePayload, "0xC8C1b0BE0b1D", sizeof(writePayload) - 1);
      enterScreen(SCR_WRITE_CONFIRM);
      return;
    }
    if (hit(btnPayPreset3, tx, ty)) {
      flashBtn = &btnPayPreset3;
      flashBorder = TFT_RED; flashFg = TFT_WHITE;
      flashUntil = millis() + FLASH_MS;
      memset(writePayload, 0, sizeof(writePayload));
      enterScreen(SCR_WRITE_CONFIRM);
      return;
    }
    return;

  case SCR_WRITE_CONFIRM:
    if (hit(btnWriteConfirm, tx, ty)) {
      flashBtn = &btnWriteConfirm;
      flashBorder = TFT_GREEN; flashFg = TFT_GREEN;
      flashUntil = millis() + FLASH_MS;
      enterScreen(SCR_WRITE_WAIT);
    } else if (hit(btnCancel, tx, ty)) {
      flashBtn = &btnCancel;
      flashBorder = TFT_RED; flashFg = TFT_RED;
      flashUntil = millis() + FLASH_MS;
      enterScreen(SCR_WRITE_MENU);
    }
    return;

  case SCR_WRITE_WAIT:
    if (hit(btnBack, tx, ty)) {
      flashBtn = &btnBack;
      flashBorder = TFT_DARKGREY; flashFg = TFT_WHITE;
      flashUntil = millis() + FLASH_MS;
      enterScreen(SCR_WRITE_MENU);
    }
    return;

  case SCR_KEYPAD:
    noteBuf[0] = 0;
    for (int i = 0; i < 12; i++) {
      if (!hit(keypad[i], tx, ty)) continue;
      flashBtn = &keypad[i];
      flashBorder = TFT_DARKGREY; flashFg = TFT_WHITE;
      flashUntil = millis() + FLASH_MS;

      const char key = keypad[i].id;
      if (key >= '0' && key <= '9') {
        if (amountLen < AMOUNT_MAX_DIGITS) {
          amountBuf[amountLen++] = key;
          amountBuf[amountLen] = 0;
        }
        redrawAmount();
      } else if (key == 'C') {
        amountLen = 0; amountBuf[0] = 0;
        redrawAmount();
      } else if (key == 'O') {
        if (amountLen == 0) {
          amountBuf[0] = '1'; amountBuf[1] = 0;
          amountLen = 1;
        }
        enterScreen(SCR_CONFIRM);
      }
      return;
    }
    if (hit(btnBack, tx, ty)) {
      flashBtn = &btnBack;
      flashBorder = TFT_DARKGREY; flashFg = TFT_WHITE;
      flashUntil = millis() + FLASH_MS;
      goHome();
    }
    return;

  case SCR_CONFIRM:
    if (hit(btnConfirm, tx, ty)) {
      flashBtn = &btnConfirm;
      flashBorder = TFT_GREEN; flashFg = TFT_GREEN;
      flashUntil = millis() + FLASH_MS;
      fetchStart = millis();
      enterScreen(SCR_FETCHING);
    } else if (hit(btnCancel, tx, ty)) {
      flashBtn = &btnCancel;
      flashBorder = TFT_RED; flashFg = TFT_RED;
      flashUntil = millis() + FLASH_MS;
      enterScreen(SCR_KEYPAD);
    }
    return;

  case SCR_FETCHING:
    goHome();
    return;

  case SCR_PENDING:
    if (inputMode == MODE_QR) {
      if (hit(btnQrClose, tx, ty)) {
        flashBtn = &btnQrClose;
        flashBorder = TFT_GREEN; flashFg = TFT_GREEN;
        flashUntil = millis() + FLASH_MS;
        strncpy(opResultTitle, "SUCCESS", sizeof(opResultTitle) - 1);
        strncpy(opResultMsg, "QR Paid", sizeof(opResultMsg) - 1);
        enterScreen(SCR_RECEIPT);
        return;
      }
      if (hit(btnQrCancel, tx, ty)) {
        flashBtn = &btnQrCancel;
        flashBorder = TFT_DARKGREY; flashFg = TFT_WHITE;
        flashUntil = millis() + FLASH_MS;
        goHome();
        return;
      }
    } else {
      goHome();
    }
    return;

  case SCR_VERIFYING:
    return;

  case SCR_RECEIPT:
    if (hit(btnHome, tx, ty)) {
      flashBtn = &btnHome;
      flashBorder = TFT_CYAN; flashFg = TFT_CYAN;
      flashUntil = millis() + FLASH_MS;
      goHome();
    }
    return;

  case SCR_FAIL:
    if (hit(btnHome, tx, ty)) {
      flashBtn = &btnHome;
      flashBorder = TFT_RED; flashFg = TFT_RED;
      flashUntil = millis() + FLASH_MS;
    }
    goHome();
    return;
  }
}

static void updateFlash() {
  if (!flashBtn) return;
  if ((int32_t)(millis() - flashUntil) < 0) return;
  drawKey(*flashBtn, flashBorder, flashFg);
  flashBtn = nullptr;
}

static void updateNote() {
  if (noteBuf[0] == 0) return;
  const bool onKeypad = (screen == SCR_KEYPAD);

  if ((int32_t)(millis() - noteUntil) >= 0) {
    if (onKeypad) redrawAmount();
    else          paintScreen(screen);
    noteBuf[0] = 0;
    return;
  }

  if (onKeypad) {
    tft.fillRect(0, 28, 320, 26, TFT_BLACK);
    tft.setTextColor(TFT_YELLOW, TFT_BLACK);
    centre(noteBuf, 160, 41, 2);
  } else {
    tft.fillRect(0, 206, 320, 34, TFT_BLACK);
    tft.setTextColor(TFT_YELLOW, TFT_BLACK);
    centre(noteBuf, 160, 222, 2);
  }
}

// ===========================================================================
//  SETUP / LOOP
// ===========================================================================
void setup() {
  Serial.begin(115200);
  randomSeed(esp_random());
  Serial.println();
  Serial.println(F("======================================================="));
  Serial.println(F("  PaidX NFC Doctor & Card Read/Write Station (WiFi)"));
  Serial.println(F("======================================================="));

  if (!SPIFFS.begin(true)) {
    Serial.println(F("[paidx] SPIFFS mount failed"));
  }

  loadRegisteredCard();

  tft.init();
  tft.setRotation(1);              // Landscape 320x240
  tft.setSwapBytes(false);
  tft.invertDisplay(false);
  tft.setTouch(calData);           // Proven touch calibration
  Serial.printf("[paidx] Touch calibration: {%u,%u,%u,%u,0x%02X}\n",
                calData[0], calData[1], calData[2], calData[3], calData[4]);

  report("BOOT", "TFT up, calibration ready");

  initNFC();

  screen = SCR_LOGO;
  paintScreen(SCR_LOGO);
  logoStart = millis();
  touchReleased  = false;
  touchMaskUntil = logoStart + TOUCH_MASK_MS;
}

void loop() {
  uint32_t now = millis();

  // ---- THE 3-GATE TOUCH STACK -----------------------------------------
  uint16_t tx = 0;
  uint16_t ty = 0;
  const bool touching = tft.getTouch(&tx, &ty, 350);

  if (!touching) {
    touchReleased = true;
  }

  if (touching && !touchContact) {
    Serial.printf("!TOUCH,x=%u,y=%u\n", (unsigned)tx, (unsigned)ty);
  }
  touchContact = touching;

  if (touching && touchReleased &&
      (int32_t)(now - touchMaskUntil) >= 0 &&
      (uint32_t)(now - lastTouchMs) > TOUCH_DEBOUNCE_MS) {
    lastTouchMs = now;
    if (tx < 320 && ty < 240) {
      touchReleased = false;
      onTouch(tx, ty);
    }
  }

  now = millis();

  // ---- SCR_LOGO -> SCR_WIFI (INITIAL SCREEN BEFORE NFC STATION) -------
  if (screen == SCR_LOGO && (uint32_t)(now - logoStart) >= SPLASH_MS) {
    startWifiConnect();
    enterScreen(SCR_WIFI);
    touchMaskUntil = millis() + 400; // Mask touch for 400ms to ignore boot noise
    touchReleased  = false;
  }

  // ---- SCR_WIFI CONNECTION STATE MACHINE ------------------------------
  if (screen == SCR_WIFI) {
    if (WiFi.status() == WL_CONNECTED) {
      if (!wifiConnected) {
        wifiConnected = true;
        wifiConnectedAt = now;
        strncpy(wifiIpStr, WiFi.localIP().toString().c_str(), sizeof(wifiIpStr) - 1);
        wifiRssi = WiFi.RSSI();
        Serial.printf("[wifi] Connected to %s! IP: %s | RSSI: %d dBm\n", PAIDX_WIFI_SSID, wifiIpStr, wifiRssi);
        drawWifiSuccess();
      } else if ((uint32_t)(now - wifiConnectedAt) >= WIFI_SUCCESS_MS) {
        proceedPastWifi();
      }
    } else {
      // Stay on screen indefinitely until Wi-Fi connects.
      // Re-trigger connection attempt every 8 seconds in case AP was booted late.
      if ((uint32_t)(now - lastWifiRetryMs) >= 8000) {
        lastWifiRetryMs = now;
        Serial.printf("[wifi] Re-issuing connection request to '%s'...\n", PAIDX_WIFI_SSID);
        WiFi.begin(PAIDX_WIFI_SSID, PAIDX_WIFI_PASSWORD);
      }

      // Continuous animated scanning indicator bar (ping-pong sweep across 226px)
      uint32_t cycleMs = now % 2400;
      int barW = 0;
      if (cycleMs < 1200) {
        barW = (int)((cycleMs * 226) / 1200);
      } else {
        barW = (int)(((2400 - cycleMs) * 226) / 1200);
      }
      if (barW < 6) barW = 6;
      if (barW > 226) barW = 226;

      tft.fillRect(47, 140, barW, 4, TFT_GREEN);
      tft.fillRect(47 + barW, 140, 226 - barW, 4, TFT_BLACK);

      // Rotate status messages every 2.5s with animated ellipsis dots
      uint8_t stage = (now / 2500) % 4;
      if (stage != lastWifiStage || (uint32_t)(now - lastWifiAnimMs) >= 280) {
        lastWifiStage = stage;
        lastWifiAnimMs = now;
        uint8_t dots = (now / 350) % 4;
        char statusText[40];
        snprintf(statusText, sizeof(statusText), "%s%.*s", wifiStageMsg[stage], dots, "...");

        tft.fillRect(28, 106, 264, 26, TFT_BLACK);
        tft.setTextColor(TFT_YELLOW, TFT_BLACK);
        centre(statusText, 160, 118, 2);
      }
    }
  }

  // ---- SCR_REGISTER auto-proceed if already registered -----------------
  if (screen == SCR_REGISTER && hasRegisteredCard && !cardJustRegistered &&
      (uint32_t)(now - regStartMs) >= REG_AUTO_PASS_MS) {
    enterScreen(SCR_HOME);
  }

  // ---- SCR_REGISTER confirmation hold -> SCR_HOME ---------------------
  if (screen == SCR_REGISTER && cardJustRegistered && (uint32_t)(now - regConfirmStart) >= REG_SUCCESS_MS) {
    cardJustRegistered = false;
    enterScreen(SCR_HOME);
  }

  // ---- mock quote steps -----------------------------------------------
  if (screen == SCR_FETCHING && (uint32_t)(now - fetchStart) >= MOCK_QUOTE_MS) {
    pendStart = now;
    enterScreen(SCR_PENDING);
  }

  // ---- SCR_VERIFYING realistic progress bar & 3-stage animated dots ----
  if (screen == SCR_VERIFYING) {
    uint32_t elapsed = (uint32_t)(now - verifyStartMs);
    if (elapsed >= verifyDurationMs) {
      if (paymentApproved) {
        Serial.println(F("[op] Verification COMPLETE -> SUCCESS"));
        enterScreen(SCR_RECEIPT);
      } else {
        Serial.println(F("[op] Verification COMPLETE -> DECLINED / FAILED"));
        enterScreen(SCR_FAIL);
      }
    } else {
      int barW = (int)((elapsed * 216) / verifyDurationMs);
      if (barW > 216) barW = 216;
      if (barW > 0) {
        tft.fillRect(52, 184, barW, 4, TFT_GREEN);
      }

      uint8_t stage = 0;
      if (elapsed >= (verifyDurationMs * 2) / 3) stage = 2;
      else if (elapsed >= verifyDurationMs / 3)   stage = 1;

      if (stage != lastVerifyStage || (uint32_t)(now - lastVerifyAnimMs) >= 250) {
        lastVerifyStage = stage;
        lastVerifyAnimMs = now;
        uint8_t dots = (elapsed / 250) % 4;
        char statusText[40];
        snprintf(statusText, sizeof(statusText), "%s%.*s", verifyStageMsg[stage], dots, "...");

        tft.fillRect(34, 142, 252, 28, TFT_BLACK);
        tft.setTextColor(TFT_YELLOW, TFT_BLACK);
        centre(statusText, 160, 156, 2);
      }
    }
  }

  // ---- non-blocking feedback ------------------------------------------
  updateFlash();
  updateNote();

  // ---- hardware polling -----------------------------------------------
  pollNFC();
  pollSerial();
}


