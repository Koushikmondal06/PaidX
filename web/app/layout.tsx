import type { Metadata } from 'next';
import { Archivo } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';

const archivo = Archivo({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-archivo',
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'PaidX — Contactless In-Store Crypto Point-of-Sale on Base',
  description:
    'Buy a cup of chai with crypto as easily as tapping a card. Physical NFC tap-to-pay cards, ESP32 hardware terminal, and instant USDC settlement on Base L2.',
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
    <html lang="en" suppressHydrationWarning className={archivo.variable}>
      <body className={`${archivo.className} antialiased selection:bg-brand-blue selection:text-white dark:selection:bg-brand-cyan dark:selection:text-[#050B1B]`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
