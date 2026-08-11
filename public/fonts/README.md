# Fonts for the vector invoice PDF

Liberation Sans / Serif, SIL Open Font License 1.1 — free to bundle and
redistribute. Chosen because they are metrically compatible with Arial and
Times, which is what the browser renders the invoice with, and because they
cover everything a guest name might need: German umlauts and ß, Turkish
ğ ş ı İ ç, and the € sign.

Loaded by src/lib/invoicePdfDoc.tsx. @react-pdf/renderer cannot read woff2,
so these are plain TTF.
