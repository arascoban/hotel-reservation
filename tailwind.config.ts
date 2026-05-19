import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Reservation source colors (also defined in reservations.ts)
        source: {
          booking_com: '#3b82f6', // blue-500
          expedia:     '#8b5cf6', // violet-500
          airbnb:      '#ef4444', // red-500
          walk_in:     '#22c55e', // green-500
          phone:       '#f59e0b', // amber-500
          website:     '#f97316', // orange-500
          other:       '#94a3b8', // slate-400
        },
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
    },
  },
  plugins: [],
}

export default config
