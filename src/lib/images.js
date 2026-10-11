/**
 * Photo upload helpers.
 * Every photo is validated, then re-encoded in the browser as a JPEG (max
 * 1200 px, <= 2 MB). Re-encoding also strips EXIF metadata such as GPS
 * location, which protects the reporter's privacy.
 * The Supabase bucket enforces the same limits again on the server
 * (2 MB, image/jpeg|png|webp only) — see supabase/schema.sql.
 */

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024 // 10 MB before compression
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 // 2 MB after compression (bucket limit)

/** Returns an error message, or '' when the file is acceptable. Works without a browser. */
export function validateImageFile(file) {
  if (!file) return 'No file selected.'
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return 'Please choose a JPG, PNG or WEBP image.'
  if (file.size > MAX_ORIGINAL_BYTES) return 'That photo is larger than 10 MB. Please choose a smaller one.'
  if (file.size === 0) return 'That file is empty.'
  return ''
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image. Try a different photo.'))
    }
    img.src = url
  })
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the image.'))), 'image/jpeg', quality),
  )
}

/** Validate + compress. Resolves to { blob, previewUrl } (JPEG). */
export async function prepareImage(file) {
  const problem = validateImageFile(file)
  if (problem) throw new Error(problem)
  const img = await loadImage(file)
  let maxSide = 1200
  let quality = 0.8
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff' // transparent PNGs become white, not black
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await canvasToBlob(canvas, quality)
    if (blob.size <= MAX_UPLOAD_BYTES) return { blob, previewUrl: URL.createObjectURL(blob) }
    maxSide = Math.round(maxSide * 0.8)
    quality = Math.max(0.5, quality - 0.1)
  }
  throw new Error('Could not compress that photo below 2 MB. Please choose a smaller one.')
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read the image.'))
    reader.readAsDataURL(blob)
  })
}
