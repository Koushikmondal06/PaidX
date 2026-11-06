# PaidX Design System & Console Redesign Blueprint

> **Skill / Reference Guide**: This document serves as the master specification for the PaidX design language. Use this blueprint to redesign the **PaidX Merchant Console** (`/dashboard`) so that it seamlessly inherits the exact visual quality, typography, spacing, border radii, and component architecture established on the PaidX landing page.

---

## 1. Design Philosophy: Refined Fintech Modernism

The PaidX visual language is inspired by high-performance fintech platforms (such as Stripe, Linear, and Apple Pay). It abandons dark, retro-terminal aesthetics and heavy neon cyberpunk styling in favor of:

1. **Airy, Clean Whitespace**: Generous margins and structured hierarchy over cramped data density.
2. **Restrained Color Accents**: Neutral grayscale foundation (`#FFFFFF`, `#111111`, `#334155`, `#E2E8F0`) with intentional, high-impact hits of **Royal Blue (`#2045E8`)** and **Success Green (`#10B981`)**.
3. **The "Split Panel & Inner Card" Motif**: Large soft lavender-blue visual panels (`#ECEEFF`) encasing pure white (`#FFFFFF`) elevated cards.
4. **Disciplined Geometry**: Precise, deliberate border radii hierarchy (from 28–32px outer containers down to 12px interactive controls, and strict 0px for logos).
5. **Modern Type Posture**: Medium/semibold headings in **Archivo** with tightened tracking, paired with relaxed, readable body copy.

---

## 2. Border Radius Hierarchy

Consistency in rounded corners creates visual rhythm. Never use arbitrary radius values.

| Element Tier | Radius Value | Tailwind Class | Application in Console / App |
|---|---|---|---|
| **Logo & Brand Glyphs** | `0px` | `rounded-none` | **Strict requirement**: Official PaidX square logo, favicon, and token marks |
| **Outer Section Containers**| `28px – 32px` | `rounded-[28px] sm:rounded-[32px]` | Main hero modules, split-view panels, large onboarding containers |
| **Feature / Dashboard Cards**| `20px – 24px` | `rounded-[20px] sm:rounded-[24px]` | Metric stat cards, chart containers, transaction table panels, Virtual POS register |
| **Inner Mockup Cards** | `16px – 20px` | `rounded-[18px] sm:rounded-[20px]` | Cards nested inside larger panels, checkout previews, wallet cards |
| **Interactive Controls** | `12px` | `rounded-xl` | Buttons, text inputs, search bars, dropdown select triggers, tabs |
| **Pills & Status Badges** | `9999px` (Full) | `rounded-full` | Status badges ("Settled", "Pending"), category tags, step indicators |

---

## 3. Elevation, Borders & Shadows

PaidX avoids heavy drop shadows and harsh black borders. Shadows must feel atmospheric and diffuse.

### Shadows
- **Card Floating Shadow**:
  ```css
  box-shadow: 0 4px 20px -2px rgba(17, 24, 39, 0.05), 0 2px 6px -1px rgba(17, 24, 39, 0.02);
  ```
  *Tailwind*: `shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05),0_2px_6px_-1px_rgba(17,24,39,0.02)]` or `shadow-sm`
- **Elevated Hero / Mockup Shadow**:
  ```css
  box-shadow: 0 16px 45px rgba(31, 45, 88, 0.08);
  ```
  *Tailwind*: `shadow-[0_16px_45px_rgba(31,45,88,0.08)]`
- **Button Shadow**:
  *Tailwind*: `shadow-sm active:scale-[0.98]`

### Borders
- **Standard Card / Divider Border**: `#E2E8F0` (Dark: `rgba(255, 255, 255, 0.10)`)
- **Lavender Panel Perimeter**: `#DFE3F8` (Dark: `rgba(255, 255, 255, 0.12)`)
- **Input Border (Resting)**: `#E2E8F0`
- **Input Border (Focused)**: `#2045E8` with `ring-1 ring-[#2045E8]`

---

## 4. Layout Architecture & Spacing Tokens

### Global Page Shell
- **Max Width**: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` (for dashboards, `px-6 lg:px-10 py-8`)
- **Navbar / Header Height**: `72px – 76px` (slim, fixed or sticky with `backdrop-blur-md bg-white/90 dark:bg-[#050B1B]/90 border-b border-[#E2E8F0] dark:border-white/10`)
- **Section Spacing**: `py-16 sm:py-20 md:py-24`

### Padding Inside Cards & Panels
- **Large Outer Panel**: `p-6 sm:p-10 lg:p-12`
- **Standard Metric / Table Card**: `p-6 sm:p-8`
- **Inner Nested Card**: `p-4 sm:p-6`
- **Table Cells**: `py-4 px-4 sm:px-6`

---

## 5. Console UI Component Specifications

### 5.1 Navigation & Console Header
- **Height**: Exactly `72px` (matching the slim navbar redesign).
- **Logo**: Square `w-8 h-8 rounded-none` with `PaidX` in `font-archivo font-extrabold text-2xl tracking-tight text-[#111111] dark:text-white`.
- **Nav Links / Breadcrumbs**: `font-archivo text-[14px] sm:text-[15px] font-medium text-[#334155] dark:text-[#A9B9D5] hover:text-[#2045E8]`.
- **Active Navigation Item**: Text `#2045E8` (`dark:#5B8EFF`), subtle indicator line or background `#ECEEFF` (`dark:bg-white/5`).
- **Store / Merchant Selector**: Rounded-xl dropdown trigger, `#F8FAFC` bg, `#E2E8F0` border.

### 5.2 Stat & Metric Cards (Dashboard Overview)
```tsx
<div className="bg-white dark:bg-[#09152D] rounded-[24px] border border-[#E2E8F0] dark:border-white/10 p-6 sm:p-8 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)]">
  <div className="flex items-center justify-between">
    <span className="font-archivo text-xs sm:text-[13px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
      Today's Volume
    </span>
    <div className="w-10 h-10 rounded-xl bg-[#ECEEFF] dark:bg-white/10 text-[#2045E8] dark:text-[#5B8EFF] flex items-center justify-center">
      {/* Icon */}
    </div>
  </div>
  <div className="mt-4">
    <h3 className="font-archivo font-semibold text-3xl sm:text-4xl text-[#111111] dark:text-[#F5F8FF] tracking-tight">
      $12,480.50
    </h3>
    <div className="flex items-center gap-2 mt-2">
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#ECFDF5] text-[#10B981]">
        +14.2%
      </span>
      <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">vs yesterday</span>
    </div>
  </div>
</div>
```

### 5.3 Buttons
- **Primary Action (Deposit, Launch POS, New Transaction)**:
  `bg-[#2045E8] hover:bg-[#1A38BE] text-white font-archivo font-medium text-sm sm:text-[15px] px-5 py-2.5 rounded-xl transition-all shadow-sm active:scale-[0.98]`
- **Secondary Action (Export CSV, Filter, Docs)**:
  `bg-white dark:bg-transparent border border-[#E2E8F0] dark:border-white/15 text-[#334155] dark:text-[#F5F8FF] hover:bg-[#F8FAFC] dark:hover:bg-white/5 font-archivo font-medium text-sm px-4 py-2.5 rounded-xl transition-all`
- **Ghost Action (Table Actions, Pagination)**:
  `text-[#334155] dark:text-[#A9B9D5] hover:text-[#2045E8] hover:bg-[#ECEEFF] dark:hover:bg-white/5 font-archivo font-medium text-sm px-3 py-1.5 rounded-lg transition-colors`
- **Destructive Action (Revoke Key, Disconnect Device)**:
  `bg-[#EF4444] hover:bg-[#DC2626] text-white font-archivo font-medium text-sm px-4 py-2 rounded-xl transition-all shadow-sm`

### 5.4 Form Inputs & Search Fields
```tsx
<div className="relative w-full max-w-sm">
  <input
    type="text"
    placeholder="Search transaction hash, card ID..."
    className="w-full bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/15 rounded-xl px-4 py-2.5 text-sm font-archivo text-[#111111] dark:text-white placeholder:text-[#94A3B8] focus:outline-none focus:border-[#2045E8] focus:ring-1 focus:ring-[#2045E8] transition-colors"
  />
</div>
```

### 5.5 Transaction Table & Data Grids
- **Container**: `bg-white dark:bg-[#09152D] rounded-[24px] border border-[#E2E8F0] dark:border-white/10 overflow-hidden shadow-sm`
- **Table Header**: `bg-[#F8FAFC] dark:bg-white/[0.02] border-b border-[#E2E8F0] dark:border-white/10 text-[12px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8] py-3.5 px-6`
- **Table Rows**: `border-b border-[#E2E8F0]/70 dark:border-white/5 py-4 px-6 text-sm text-[#334155] dark:text-[#A9B9D5] hover:bg-[#F8FAFC]/80 dark:hover:bg-white/[0.02] transition-colors`
- **Hashes & Addresses**: `font-mono text-xs sm:text-[13px] text-[#111111] dark:text-[#F5F8FF]`
- **Status Pills**:
  - **Settled / Confirmed (Base L2)**:
    `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#ECFDF5] text-[#10B981] dark:bg-emerald-950/40 dark:text-emerald-300`
  - **Processing / In Progress**:
    `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#ECEEFF] text-[#2045E8] dark:bg-blue-950/40 dark:text-blue-300`
  - **Failed / Reverted**:
    `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FEF2F2] text-[#EF4444] dark:bg-red-950/40 dark:text-red-300`

### 5.6 Hardware Terminal Device Card (ESP32)
```tsx
<div className="bg-[#ECEEFF] dark:bg-[#0C1838] border border-[#DFE3F8] dark:border-white/10 rounded-[28px] p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
  <div className="flex items-center gap-4">
    <div className="w-14 h-14 rounded-2xl bg-white dark:bg-[#09152D] border border-[#E2E8F0] flex items-center justify-center text-[#2045E8] shadow-sm">
      {/* Radio / NFC Reader Icon */}
    </div>
    <div>
      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-[#ECFDF5] text-[#10B981]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse"></span>
        ONLINE & READY
      </div>
      <h4 className="font-archivo font-semibold text-lg sm:text-xl text-[#111111] dark:text-[#F5F8FF] mt-1">
        Countertop Terminal #01 (ESP32-PN532)
      </h4>
      <p className="font-archivo text-xs sm:text-sm text-[#64748B] dark:text-[#94A3B8]">
        Firmware v2.4.1 • Wi-Fi 98% • Tap latency &lt; 1.2s
      </p>
    </div>
  </div>
  <button className="bg-[#2045E8] hover:bg-[#1A38BE] text-white font-archivo font-medium text-sm px-5 py-2.5 rounded-xl transition-all shadow-sm">
    Provision Card
  </button>
</div>
```

---

## 6. Console Redesign Migration Playbook

When migrating the console codebase (`PaidX/dashboard`), apply these steps:

### Step 1: Update `tailwind.config.ts`
Replace the old colors (`#071013`, `#0B161B`, `#1A2E38`, `#5465FF`) with the PaidX brand palette (`#FFFFFF`, `#050B1B`, `#2045E8`, `#ECEEFF`, `#E2E8F0`). Add the `Archivo` font family.

### Step 2: Update `globals.css`
Import Archivo Google Font at the top of CSS:
```css
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&display=swap');
```
Set `font-family: var(--font-archivo), "Archivo", sans-serif;` on `body`.

### Step 3: Replace Heavy Dark Surfaces with Crisp Cards
- Replace dark canvas `#071013` with `bg-[#F6F7FC]` (light mode default) or `#FFFFFF`, and `dark:bg-[#050B1B]`.
- Replace dark cards `#0B161B` with `bg-white dark:bg-[#09152D] rounded-[24px] border border-[#E2E8F0] dark:border-white/10 shadow-sm`.
- Convert key hero/summary blocks into `#ECEEFF` lavender containers with `rounded-[28px] border border-[#DFE3F8]`.

### Step 4: Standardize Typography
- Replace `JetBrains Mono` everywhere with `font-archivo` (reserve monospace strictly for wallet addresses, transaction hashes, and latency numbers).
- Demote harsh `font-bold` to `font-medium` (500) and `font-semibold` (600) on headings.
- Set headings to `#111111` (dark: `#F5F8FF`) and body copy to `#334155` (dark: `#A9B9D5`).

### Step 5: Buttons & Interactive Elements
- Replace old `#5465FF` buttons with `#2045E8` (`hover:bg-[#1A38BE]`) and `rounded-xl` (`12px`).
- Ensure all logos and favicons have `rounded-none`.

---

## 7. Quality Assurance Checklist

Before finalizing any console redesign view, verify:
- [ ] No pure black `#000000` text is used (headings are `#111111`, body is `#334155`).
- [ ] No bold font weights above 600 (`font-semibold`) are applied to titles.
- [ ] Cards have `rounded-[20px]` to `rounded-[24px]` corners and `#E2E8F0` borders.
- [ ] Buttons use `rounded-xl` (`12px`) and `#2045E8` primary royal blue.
- [ ] Visual containers use `#ECEEFF` soft lavender with `#DFE3F8` border.
- [ ] PaidX logos use strict `rounded-none` (0px radius).
- [ ] Both light and dark modes render with high contrast and zero clipped elements.
- [ ] Full responsiveness across desktop (1280px+), tablet (768px), and mobile (390px).
