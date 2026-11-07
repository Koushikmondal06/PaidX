# PaidX Brand Color System

This document outlines the complete color system established for the **PaidX** platform (landing page & merchant console). All values are provided in HEX, RGB/RGBA, and their corresponding Tailwind CSS utility classes and design tokens.

---

## 1. Primary & Brand Colors

The PaidX visual identity is anchored by a high-clarity electric royal blue, supported by clean success greens and balanced slate neutrals.

| Token Name | Light Mode HEX | Dark Mode HEX | Tailwind Utility | Purpose / Application |
|---|---|---|---|---|
| **Primary Brand Blue** | `#2045E8` | `#5B8EFF` | `text-[#2045E8]` / `bg-[#2045E8]` | Main CTAs, active links, primary icons, process indicators, key brand elements |
| **Primary Hover Blue** | `#1A38BE` | `#709EFF` | `hover:bg-[#1A38BE]` | Interactive hover state for primary buttons and CTAs |
| **Active / Focus Ring** | `rgba(32, 69, 232, 0.25)` | `rgba(91, 142, 255, 0.3)` | `ring-[#2045E8]/25` | Focus outlines on interactive controls, inputs, and buttons |
| **Soft Lavender-Blue** | `#ECEEFF` | `#0C1838` | `bg-[#ECEEFF]` | Large visual illustration containers, split panels, badge backings, icon pill wrappers |
| **Lavender Container Border** | `#DFE3F8` | `rgba(255, 255, 255, 0.1)` | `border-[#DFE3F8]` | Subtle perimeter border specifically paired with `#ECEEFF` visual panels |

---

## 2. Neutral Palette (Backgrounds & Surfaces)

PaidX avoids heavy gradients and dark muddy shades in light mode. It emphasizes airy white space and restrained slate contrast.

| Token Name | Light Mode HEX | Dark Mode HEX | Tailwind Utility | Purpose / Application |
|---|---|---|---|---|
| **Base Background** | `#FFFFFF` | `#050B1B` | `bg-white dark:bg-[#050B1B]` | Page root, main background, navbar backing |
| **Secondary Background** | `#F6F7FC` | `#09152D` | `bg-[#F6F7FC] dark:bg-[#09152D]` | Subtle alternating section backgrounds, stats section |
| **Elevated Card Surface** | `#FFFFFF` | `#09152D` (or `#101F3B`) | `bg-white dark:bg-[#09152D]` | Mockup cards, feature cards, inner settlement cards, widget containers |
| **Control / Field Background**| `#F8FAFC` | `rgba(255, 255, 255, 0.05)` | `bg-[#F8FAFC] dark:bg-white/5` | Input fields, search bars, toggle track backgrounds |
| **Hover Surface** | `#F1F5F9` | `rgba(255, 255, 255, 0.04)` | `hover:bg-[#F1F5F9]` | Dropdown row hover, secondary button hover, table row highlight |

---

## 3. Typography & Text Colors

PaidX text colors are calibrated for high legibility, avoiding harsh 100% black (`#000000`).

| Token Name | Light Mode HEX | Dark Mode HEX | Tailwind Utility | Purpose / Application |
|---|---|---|---|---|
| **Primary Heading** | `#111111` | `#F5F8FF` | `text-[#111111] dark:text-[#F5F8FF]` | H1, H2, H3 headings, bold card titles, main metric digits |
| **Body Text** | `#334155` | `#A9B9D5` | `text-[#334155] dark:text-[#A9B9D5]` | Standard paragraph copy, feature descriptions, checklist item text |
| **Subtitle / Muted Text**| `#64748B` | `#94A3B8` | `text-[#64748B] dark:text-[#94A3B8]` | Section subtitles, accordion answer helper text, footer copyright, table headers |
| **Placeholder / Disabled** | `#94A3B8` | `#64748B` | `text-[#94A3B8] placeholder:text-[#94A3B8]`| Form field placeholder text, inactive asset indicators |

---

## 4. Semantic & Functional Colors

Used for transactional feedback, settlement indicators, hardware status, and network badges.

| Semantic Role | HEX Value | Background / Badge Tint | Tailwind Class | Usage in PaidX |
|---|---|---|---|---|
| **Success / Instant Deposit** | `#10B981` (Emerald) | `#ECFDF5` (`bg-emerald-50`) | `text-[#10B981]` / `bg-[#10B981]` | Instant Deposit card, Base L2 fast settlement checkmarks, connected hardware |
| **Execution / Processing** | `#2045E8` (Royal Blue)| `#ECEEFF` (`bg-[#ECEEFF]`) | `text-[#2045E8]` / `bg-[#2045E8]` | Execution pill (`< 1.2s`), NFC counter checkout, pending transaction |
| **Error / Alert / Unsupported**| `#EF4444` (Red) | `#FEF2F2` (`bg-red-50`) | `text-[#EF4444]` / `bg-[#EF4444]` | Unsupported asset tag (e.g. Solana devnet), transaction failed, card decline |
| **Warning / Notice** | `#F59E0B` (Amber) | `#FFFBEB` (`bg-amber-50`) | `text-[#F59E0B]` / `bg-[#F59E0B]` | Session limit threshold caution, terminal offline warning |

---

## 5. Borders & Dividers

Borders are razor-thin, subtle, and intentional to create structural separation without visual clutter.

| Border Type | Light Mode Value | Dark Mode Value | Tailwind Class | Application |
|---|---|---|---|---|
| **Standard Subtle Border** | `#E2E8F0` | `rgba(255, 255, 255, 0.10)` | `border-[#E2E8F0] dark:border-white/10` | Section dividers, accordion rows, card outlines, table borders |
| **Panel Border** | `#DFE3F8` | `rgba(255, 255, 255, 0.12)` | `border-[#DFE3F8]` | Split-panel outer containers, illustration frames |
| **Card Border** | `#E2E8F0` | `rgba(255, 255, 255, 0.08)` | `border-[#E2E8F0]` | Product UI mockups, inner stat cards |
| **Input Focus Border** | `#2045E8` | `#5B8EFF` | `focus:border-[#2045E8]` | Focused inputs, selected dropdown item |

---

## 6. Official Cryptocurrency Asset Colors

Used in the Supported Assets selector and transaction receipts:

- **USD Coin (USDC)**: `#2775CA`
- **Base Network**: `#0052FF`
- **Ethereum (ETH)**: `#627EEA`
- **Solana (SOL)**: `#9945FF` to `#14F195` (gradient)

---

## 7. Tailwind CSS Configuration Snippet

To standardize these colors in `tailwind.config.ts` across both the landing page and the merchant console:

```typescript
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#2045E8',
          'blue-hover': '#1A38BE',
          'blue-light': '#5B8EFF',
          lavender: '#ECEEFF',
          'lavender-border': '#DFE3F8',
        },
        paidx: {
          heading: '#111111',
          body: '#334155',
          muted: '#64748B',
          border: '#E2E8F0',
          success: '#10B981',
          danger: '#EF4444',
          warning: '#F59E0B',
        },
      },
    },
  },
};
```
