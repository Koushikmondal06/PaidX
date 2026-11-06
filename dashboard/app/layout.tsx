import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PaidX — Contactless Crypto Payments on Ethereum Sepolia',
  description: 'Non-custodial cryptocurrency payments platform with smart accounts, NFC cards, and hardware POS terminals.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#071013] text-[#DFE0E2] antialiased">
        {children}
      </body>
    </html>
  );
}
