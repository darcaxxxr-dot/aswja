/**
 * ASWJA Brand Configuration
 * ------------------------
 * Untuk ganti icon, letakkan file icon di `public/icons/` (SVG/PNG)
 * dan update `icon` di bawah. Path relatif ke `public/`.
 *
 * Ukuran icon yang direkomendasikan:
 * - SVG: scalable (icon utama)
 * - PNG: 192x192 dan 512x512 (maskable)
 * - favicon: 32x32
 */

export interface BrandConfig {
  name: string;
  shortName: string;
  fullName: string;
  /** Tegas: displayed below the brand name as a strong subtitle */
  tagline: string;
  description: string;
  icon: string;
  favicon: string;
  appleTouchIcon: string;
  maskableIcon: string;
  themeColor: string;
  credit: {
    team: string;
  };
}

export const BRAND: BrandConfig = {
  name: 'ASWJA',
  shortName: 'ASWJA',
  fullName: 'ASWJA - Absensi Sholat Wajib Berjamaah',
  tagline: 'Absensi Sholat Wajib Berjamaah',
  description: 'ASWJA - Absensi Sholat Wajib Berjamaah MAN IC Kota Palangkaraya',
  icon: '/icons/icon.svg',
  favicon: '/icons/favicon-32.png',
  appleTouchIcon: '/icons/apple-touch-icon.png',
  maskableIcon: '/icons/icon-maskable-512.png',
  themeColor: '#0ea572',
  credit: {
    team: 'ICPky-OPTR Team'
  }
};
