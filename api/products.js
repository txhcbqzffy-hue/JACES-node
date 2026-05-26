const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  const { data: products } = await supabase.from('produits').select('');
  const { data: images } = await supabase.from('images_produit').select('');

  const mapped = products.map((product) => {
    const productImages = images
      .filter((img) => img.produit_id === product.identifiant)
      .sort((a, b) => a.position - b.position);

    return {
      ...product,
      image_url: productImages[0]?.url || '',
      hover_image_url: productImages[1]?.url || productImages[0]?.url || ''
    };
  });

  res.status(200).json(mapped);
};
