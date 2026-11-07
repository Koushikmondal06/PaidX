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
  title: 'PaidX Console — In-Store Crypto Payments & Smart Accounts',
  description: 'Merchant and user terminal portal for contactless crypto payments, ERC-7715 daily spending session limits, and Base L2 settlement.',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon.png', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={archivo.variable}>
      <body className={`${archivo.className} min-h-screen bg-[#F6F7FC] dark:bg-[#050B1B] text-[#334155] dark:text-[#A9B9D5] antialiased selection:bg-[#1749F5]/10 selection:text-[#1749F5]`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
