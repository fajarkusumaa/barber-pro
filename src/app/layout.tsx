import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'BarberBot — Dashboard',
  description: 'Dashboard admin dan perangkat cabang BarberBot untuk mengelola booking, kapster, dan walk-in.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0b0f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={cn("dark", "font-sans", geist.variable)} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
