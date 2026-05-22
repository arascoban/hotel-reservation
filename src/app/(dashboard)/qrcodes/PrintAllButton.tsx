'use client'

export default function PrintAllButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition-colors"
    >
      🖨️ Alle drucken
    </button>
  )
}
