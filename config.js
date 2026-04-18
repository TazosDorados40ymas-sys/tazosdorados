/**
 * TAZOS DORADOS — Configuración
 * ================================
 * Todas las llaves aquí son PÚBLICAS por diseño:
 * - Supabase publishable key: protegida por RLS
 * - Cloudinary cloud name + preset: protegidas por validaciones del preset
 *
 * NUNCA pongas aquí:
 * - sb_secret_... (secret key de Supabase)
 * - API Secret de Cloudinary
 */
window.APP_CONFIG = {
  supabaseUrl: 'https://oirpwykyadndfmonuswg.supabase.co',
  supabasePublishableKey: 'sb_publishable_gyxq3xB1AZr1z_qYLtp0Cw_xeYZsdSp',
  cloudinaryCloudName: 'dmbxlwcyg',
  cloudinaryUploadPreset: 'tazos_unsigned_2026'
};
