
import { createClient } from '@supabase/supabase-js';

const BASE = 'https://developers.cjdropshipping.com/api2.0/v1';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    CJ_API_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    VITE_SUPABASE_URL
  } = process.env;

  if (!CJ_API_KEY || !SUPABASE_SERVICE_ROLE_KEY || !VITE_SUPABASE_URL) {
    return res.status(503).json({
      error: 'CJ or Supabase server configuration is missing.'
    });
  }

  try {
    const jwt = (req.headers.authorization || '')
      .replace(/^Bearer /i, '');

    if (!jwt) {
      return res.status(401).json({ error: 'Sign in required' });
    }

    const supabase = createClient(
      VITE_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    const { data: userData, error: authError } =
      await supabase.auth.getUser(jwt);

    if (authError || !userData?.user) {
      return res.status(401).json({ error: 'Invalid login session' });
    }

    const { data: staff, error: roleError } = await supabase
      .from('staff_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (roleError || staff?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const keyword = String(req.query.keyword || '').trim().slice(0, 100);

    if (keyword.length < 2) {
      return res.status(400).json({
        error: 'Enter at least two characters'
      });
    }

    // Obtain CJ access token server-side.
    const authResponse = await fetch(
      `${BASE}/authentication/getAccessToken`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: CJ_API_KEY })
      }
    );

    const authData = await authResponse.json();

    if (!authResponse.ok || !authData?.data?.accessToken) {
      throw new Error(
        `CJ authentication failed: ${authData.message || authResponse.status}`
      );
    }

    const accessToken = authData.data.accessToken;

    // Search CJ product catalog using Product List V2.
    const url = new URL(`${BASE}/product/listV2`);
    url.searchParams.set('page', '1');
    url.searchParams.set('size', '20');
    url.searchParams.set('keyWord', keyword);

    const response = await fetch(url.toString(), {
      headers: { 'CJ-Access-Token': accessToken }
    });

    const result = await response.json();

    if (!response.ok || result.result === false) {
      throw new Error(
        `CJ search failed: ${result.message || response.status}`
      );
    }

    // Correct CJ Product List V2 response format:
    // data.content[].productList[]
    const groups = Array.isArray(result.data?.content)
      ? result.data.content
      : [];

    const products = groups.flatMap(group =>
      Array.isArray(group.productList) ? group.productList : []
    );

    const items = products.map(product => ({
      pid: product.id,
      sku: product.sku || product.spu || '',
      name: product.nameEn || 'Unnamed product',
      image: product.bigImage || '',
      supplierPrice: product.sellPrice || product.nowPrice || '0',
      category: product.threeCategoryName || ''
    }));

    return res.status(200).json({
      items,
      warning: 'Supplier prices exclude shipping. Verify variants, availability, and freight before publishing.'
    });

  } catch (error) {
    return res.status(502).json({
      error: error.message || 'Unable to search CJ products'
    });
  }
}
