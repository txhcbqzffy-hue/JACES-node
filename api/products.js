const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://uxhzrobxhumreuntxrzw.supabase.co',
  'sb_publishable_VsHXPk-y4UTt4R7aAbidXg_MtIbEAhp'
);

module.exports = async function handler(req, res) {
  try {
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*');

    if (productsError) {
      return res.status(500).json({
        source: 'products',
        error: productsError.message
      });
    }

    const { data: images, error: imagesError } = await supabase
      .from('product_images')
      .select('*');

    if (imagesError) {
      return res.status(500).json({
        source: 'product_images',
        error: imagesError.message
      });
    }

    const mapped = products.map((product) => {
      const productImages = images
        .filter((img) => String(img.product_id) === String(product.identifiant))
        .sort((a, b) => a.position - b.position);

      return {
        ...product,
        image_url: productImages[0]?.url || '',
        hover_image_url: productImages[1]?.url || productImages[0]?.url || ''
      };
    });

    return res.status(200).json(mapped);
  } catch (error) {
    return res.status(500).json({
      source: 'API crashed',
      error: error.message
    });
  }
};