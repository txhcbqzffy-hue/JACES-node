require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.get('/test', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/images-test', async (req, res) => {
  const { data, error } = await supabase.from('product_images').select('*');
  if (error) return res.status(500).json(error);
  res.json(data);
});

app.get('/api/products', async (req, res) => {
  const { data: products, error: productsError } = await supabase.from('products').select('*');
  if (productsError) return res.status(500).json(productsError);

  const { data: images, error: imagesError } = await supabase.from('product_images').select('*');
  if (imagesError) return res.status(500).json(imagesError);

  const mapped = products.map((product) => {
    const productImages = images
      .filter((img) => img.product_id === product.id)
      .sort((a, b) => a.position - b.position);

    const uniqueUrls = [...new Set(productImages.map((img) => img.url))];

    return {
      ...product,
      images: productImages,
      image_url: uniqueUrls[0] || '',
      hover_image_url: uniqueUrls[1] || uniqueUrls[0] || ''
    };
  });

  res.json(mapped);
});

const staticRoot = path.join(__dirname, '..');
app.use(express.static(staticRoot));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(staticRoot, 'index.html'));
});

app.listen(3000, () => {
  console.log('Server running on 3000');
});
