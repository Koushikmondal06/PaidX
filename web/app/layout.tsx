import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';

export const metadata: Metadata = {
  title: 'PaidX — In-Store Crypto Point-of-Sale Systems',
  description:
    'Accept Bitcoin, Ethereum, and USDC stablecoins in-person with QR checkout and NFC tap-to-pay. Instant zero-volatility fiat settlement on Base L2.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/logo.svg',
  },
  keywords: [
    'Crypto POS',
    'Point of Sale',
    'Base L2',
    'USDC payments',
    'In-store crypto',
    'Tap to pay crypto',
    'PaidX',
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased selection:bg-brand-blue selection:text-white dark:selection:bg-brand-cyan dark:selection:text-[#050B1B]">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
