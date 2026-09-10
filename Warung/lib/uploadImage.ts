'use client';

import { createClient } from '@/lib/supabase/client';

const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4MB

export async function uploadProductImage(file: File, productId: string): Promise<{ url: string | null; error?: string }> {
  if (!file.type.startsWith('image/')) {
    return { url: null, error: 'File harus berupa gambar (JPG/PNG/WebP).' };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { url: null, error: 'Ukuran gambar maksimal 4MB.' };
  }

  const supabase = createClient();
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${productId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from('product-images').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (uploadError) {
    return { url: null, error: 'Gagal upload gambar: ' + uploadError.message };
  }

  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  const url = data.publicUrl;

  const { error: updateError } = await supabase.from('products').update({ image_url: url }).eq('id', productId);
  if (updateError) {
    return { url: null, error: 'Gambar terupload tapi gagal disimpan ke produk: ' + updateError.message };
  }

  return { url };
}
