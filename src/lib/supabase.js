import { createClient } from '@supabase/supabase-js'

// These values come from the .env file (see .env.example).
// The anon/publishable key is safe for the browser: Row Level Security
// (supabase/schema.sql) decides what each user can read or change.
// Never put the service_role / secret key in frontend code.
// Use the BASE project URL, e.g. https://abcd1234.supabase.co (a pasted "/rest/v1" or
// trailing slash is removed automatically).
const url = (import.meta.env.VITE_SUPABASE_URL || '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/(rest|auth|storage)\/v1$/, '')
// The publishable key (sb_publishable_...) or the legacy "anon public" key.
// VITE_SUPABASE_PUBLISHABLE_KEY is accepted as an alternative name.
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()

export const isSupabaseConfigured = Boolean(
  url && anonKey && /^https?:\/\//.test(url) && !url.includes('your-project'),
)

export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null

// Supabase Storage bucket for item photos (created by supabase/schema.sql)
export const IMAGE_BUCKET = 'item-images'
