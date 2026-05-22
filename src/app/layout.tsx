import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Jägerstieg Hotel & Pension',
  description: 'Hotel Management System',
  manifest: '/manifest.json',
  themeColor: '#0f172a',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Jägerstieg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body>{children}</body>
    </html>
  )
}
