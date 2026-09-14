export default function handler(_request, response) {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return response.status(500).json({
      error: 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Vercel.'
    });
  }

  response.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  return response.status(200).json({ url, publishableKey });
}
