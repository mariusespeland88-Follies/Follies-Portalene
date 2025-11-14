const envDefaults = {
  NEXT_PUBLIC_SUPABASE_URL: 'stub:SUPABASE_URL',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub:SUPABASE_ANON_KEY',
  SUPABASE_SERVICE_ROLE_KEY: 'stub:SUPABASE_SERVICE_ROLE_KEY',
};

for (const [key, value] of Object.entries(envDefaults)) {
  if (!process.env[key] || process.env[key] === 'undefined') {
    process.env[key] = value;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { allowedOrigins: ['*'] } },
};
export default nextConfig;
