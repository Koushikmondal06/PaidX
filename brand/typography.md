# PaidX Typography System

This document defines the typography standards for the **PaidX** ecosystem (landing page & merchant console).

---

## 1. Font Family

PaidX exclusively utilizes **Archivo** as its primary typeface.

```css
font-family: var(--font-archivo), "Archivo", "Archivo Placeholder", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```

- **Google Fonts Import**:
  ```html
  <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  ```
- **Monospace Stack** (for transaction hashes, wallet addresses, EIP-681 payloads, execution latency metrics):
  ```css
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  ```

---

## 2. Type Scale & Hierarchy

| Level | Size (Desktop) | Size (Mobile) | Weight | Line Height | Tracking | Color (Light / Dark) | Usage |
|---|---|---|---|---|---|---|---|
| **Display / Hero H1** | `56px – 64px` | `34px – 38px` | `500` / `600` (Medium/Semibold) | `1.12` | `-0.02em` | `#111111` / `#F5F8FF` | Main hero value statement |
| **Section Heading H2** | `36px – 40px` | `26px – 30px` | `500` / `600` (Medium/Semibold) | `1.22` | `-0.015em` | `#111111` / `#F5F8FF` | Major section titles (Why PaidX, How It Works, Features, Settlement, FAQ) |
| **Card Heading H3** | `22px – 26px` | `18px – 20px` | `500` / `600` (Medium/Semibold) | `1.30` | `-0.01em` | `#111111` / `#F5F8FF` | Feature card titles, modal titles, checkout preview headers |
| **Subheading H4** | `17px – 18px` | `16px – 17px` | `500` / `600` (Medium/Semibold) | `1.40` | `-0.005em`| `#111111` / `#F5F8FF` | Accordion question, stat item title, terminal hardware spec title |
| **Lead Subtitle** | `17px – 18px` | `15px – 16px` | `400` (Regular) | `1.60` | `0` | `#64748B` / `#94A3B8` | Section sub-headers, hero support copy |
| **Standard Body Copy** | `15px – 16px` | `14px – 15px` | `400` (Regular) | `1.65` | `0` | `#334155` / `#A9B9D5` | Descriptive paragraphs, feature explanations, accordion answers |
| **Button / Nav Links** | `14px – 15px` | `14px` | `500` (Medium) | `1.00` | `-0.005em`| `#334155` / `#F5F8FF` | Primary button text, navbar menu items, footer links |
| **Micro Labels / Badges**| `11px – 13px` | `11px – 12px` | `600` (Semibold) | `1.00` | `0.05em` (Caps) | `#64748B` or `#2045E8` | Eyebrow labels, "INSTANT DEPOSIT", table headers, counter pills |
| **Data / Hash (Mono)** | `12px – 14px` | `11px – 13px` | `500` (Medium) | `1.40` | `0` | `#111111` / `#F5F8FF` | Ethereum addresses, block heights, execution time `< 1.2s` |

---

## 3. Core Typography Rules

1. **Avoid Excessively Bold Headings**:
   - ❌ Never use `font-black` (900) or heavy `font-extrabold` (800) for regular section titles.
   - ✅ Always use `font-medium` (500) or `font-semibold` (600). This provides an elegant, modern fintech appearance (similar to Stripe or Linear).

2. **Negative Letter Spacing on Headings**:
   - Apply `tracking-[-0.015em]` or `tracking-[-0.02em]` on large headings (H1, H2, H3) to tighten character kerning and give titles a compact, confident posture.

3. **Generous Line Height on Body Paragraphs**:
   - Paragraphs must never feel crammed. Use `leading-[1.6]` to `leading-[1.65]` (`leading-relaxed`) with `#334155` color for comfortable, effortless reading.

4. **Never Use Pure Black `#000000` for Headings**:
   - Light mode headings must use `#111111` (or `#080808` / `#090B12`). It retains strong contrast without looking harsh against pure white backdrops.

5. **Uppercase Small Eyebrows**:
   - Small category tags (e.g., `COUNTER CHECKOUT`, `INSTANT DEPOSIT`, `FOR BUSINESSES`) should be set in uppercase with `text-[11px] sm:text-[12px] font-semibold tracking-wider font-mono` or `font-archivo`.

---

## 4. Tailwind CSS Utility Examples

```tsx
// Section Heading
<h2 className="font-archivo font-medium sm:font-semibold text-2xl sm:text-3xl lg:text-[38px] text-[#111111] dark:text-[#F5F8FF] leading-[1.25] tracking-[-0.015em]">
  Section Title
</h2>

// Section Subtitle
<p className="font-archivo text-[17px] sm:text-[18px] text-[#64748B] dark:text-[#94A3B8] leading-relaxed max-w-2xl mx-auto">
  Subtitle text explaining the section functionality.
</p>

// Body Paragraph
<p className="font-archivo text-[15px] sm:text-[16px] text-[#334155] dark:text-[#A9B9D5] leading-[1.65]">
  Detailed description copy.
</p>

// Primary Button
<button className="font-archivo font-medium text-sm sm:text-[15px] text-white bg-[#2045E8] hover:bg-[#1A38BE] px-5 py-2.5 rounded-xl transition-all">
  Launch Console
</button>

// Small Monospace Eyebrow
<span className="font-mono text-[11px] font-semibold tracking-wider uppercase text-[#64748B] dark:text-[#94A3B8]">
  BASE L2 EXECUTION (&lt; 1.2S)
</span>
```
