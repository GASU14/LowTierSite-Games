/**
 * Resizes an image down to max 300x300 resolution and converts it
 * to WebP (or compressed JPEG fallback) for maximum storage efficiency.
 */
export async function optimizeImageTo300x300(fileOrBlob: Blob | File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const maxDim = 300;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context unavailable'));
          return;
        }

        // High quality rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Try WebP first with 0.8 quality for optimal compression and clarity
        try {
          const webpData = canvas.toDataURL('image/webp', 0.8);
          if (webpData.startsWith('data:image/webp')) {
            resolve(webpData);
            return;
          }
        } catch (err) {
          // WebP not supported in browser
        }

        // Fallback to JPEG
        const jpegData = canvas.toDataURL('image/jpeg', 0.8);
        resolve(jpegData);
      };
      img.onerror = () => reject(new Error('Failed to load image for optimization'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(fileOrBlob);
  });
}
