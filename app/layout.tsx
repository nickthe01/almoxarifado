import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Almoxarifado — Colégio Eleve',
  description: 'Controle de estoque de materiais do almoxarifado',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
