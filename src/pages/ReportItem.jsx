import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createItem, getItem, updateItem } from '../lib/api'
import { CATEGORIES, COLORS } from '../lib/constants'
import { todayISO } from '../lib/utils'
import { prepareImage, ALLOWED_IMAGE_TYPES } from '../lib/images'
import { useToast } from '../context/ToastContext'
import Icon from '../components/Icon'
import { BackLink, EmptyState, ErrorBox, Spinner } from '../components/ui'

const COPY = {
  lost: {
    title: 'Report a lost item',
    subtitle: 'Describe what you lost. FindBack will instantly compare it with every found report.',
    dateLabel: 'Date lost',
    locationLabel: 'Where did you last see it?',
    locationPlaceholder: 'e.g. Central Library, 2nd floor',
    descPlaceholder: 'Describe unique details: stickers, scratches, case colour, contents, wallpaper…',
    button: 'Submit lost report',
    btnClass: 'btn-lost',
    accent: 'bg-rose-600',
  },
  found: {
    title: 'Report a found item',
    subtitle: 'Thank you for helping! Post what you found and we will look for the owner.',
    dateLabel: 'Date found',
    locationLabel: 'Where did you find it?',
    locationPlaceholder: 'e.g. Canteen, near the counter',
    descPlaceholder: 'Describe it, but keep one or two secret details so you can verify the real owner.',
    button: 'Submit found report',
    btnClass: 'btn-found',
    accent: 'bg-emerald-600',
  },
}

const EMPTY = { title: '', category: '', description: '', color: '', brand: '', location: '', date: todayISO() }

const FORM_FIELDS = Object.keys(EMPTY)

export default function ReportItem({ type, existing = null }) {
  const copy = COPY[type]
  const isEdit = Boolean(existing)
  const { user } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(() =>
    existing ? Object.fromEntries(FORM_FIELDS.map((f) => [f, existing[f] ?? ''])) : { ...EMPTY, date: todayISO() },
  )
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [saving, setSaving] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  // photo state: the new compressed photo (if any) and whether the old one should be removed
  const [image, setImage] = useState({ blob: null, preview: existing?.image_url || '', removed: false })
  const toast = useToast()

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  function validate() {
    const e = {}
    if (form.title.trim().length < 3) e.title = 'Please enter a short title (at least 3 characters).'
    if (!form.category) e.category = 'Choose a category.'
    if (form.description.trim().length < 10) e.description = 'Add a few more details (at least 10 characters).'
    if (form.location.trim().length < 2) e.location = 'Where was it? This helps matching a lot.'
    if (!form.date) e.date = 'Pick a date.'
    else if (form.date > todayISO()) e.date = 'Date cannot be in the future.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleImage(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageBusy(true)
    setServerError('')
    try {
      const { blob, previewUrl } = await prepareImage(file)
      setImage({ blob, preview: previewUrl, removed: false })
    } catch (err) {
      setServerError(err.message)
    } finally {
      setImageBusy(false)
      e.target.value = ''
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (saving || imageBusy) return
    if (!validate()) return
    setSaving(true)
    setServerError('')
    try {
      if (isEdit) {
        await updateItem(existing.id, form, user, {
          imageBlob: image.blob,
          removeImage: image.removed && !image.blob,
          previous: existing,
        })
        toast.success('Changes saved. Matches were recalculated.')
        navigate(`/items/${existing.id}`, { replace: true })
      } else {
        const item = await createItem({ ...form, type }, user, { imageBlob: image.blob })
        navigate(`/items/${item.id}?new=1`)
      }
    } catch (err) {
      setServerError(err.message || 'Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  const fieldError = (name) => errors[name] && <p className="mt-1 text-xs font-medium text-rose-600">{errors[name]}</p>

  return (
    <div className="container-page max-w-3xl py-8 sm:py-10">
      <BackLink />
      <div className="card overflow-hidden">
        <div className={`h-1.5 ${copy.accent}`} />
        <div className="p-5 sm:p-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            {isEdit ? `Edit ${type} report` : copy.title}
          </h1>
          <p className="mt-1 text-slate-500">
            {isEdit ? 'Update the details. Matches are recalculated automatically.' : copy.subtitle}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            <div>
              <label htmlFor="title" className="label">
                Item name *
              </label>
              <input
                id="title"
                className="input"
                placeholder="e.g. Black iPhone 13 with blue case"
                value={form.title}
                onChange={update('title')}
                maxLength={120}
              />
              {fieldError('title')}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="category" className="label">
                  Category *
                </label>
                <select id="category" className="input" value={form.category} onChange={update('category')}>
                  <option value="">Select a category</option>
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                {fieldError('category')}
              </div>
              <div>
                <label htmlFor="date" className="label">
                  {copy.dateLabel} *
                </label>
                <input id="date" type="date" className="input" value={form.date} max={todayISO()} onChange={update('date')} />
                {fieldError('date')}
              </div>
            </div>

            <div>
              <label htmlFor="description" className="label">
                Description *
              </label>
              <textarea
                id="description"
                rows={4}
                className="input resize-y"
                placeholder={copy.descPlaceholder}
                value={form.description}
                onChange={update('description')}
                maxLength={1000}
              />
              {fieldError('description')}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="color" className="label">
                  Main colour
                </label>
                <select id="color" className="input" value={form.color} onChange={update('color')}>
                  <option value="">Not sure</option>
                  {COLORS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="brand" className="label">
                  Brand
                </label>
                <input id="brand" className="input" placeholder="e.g. Apple, Casio" value={form.brand} onChange={update('brand')} />
              </div>
            </div>

            <div>
              <label htmlFor="location" className="label">
                {copy.locationLabel} *
              </label>
              <input
                id="location"
                className="input"
                placeholder={copy.locationPlaceholder}
                value={form.location}
                onChange={update('location')}
              />
              {fieldError('location')}
            </div>

            <div>
              <span className="label">Photo (optional)</span>
              {image.preview ? (
                <div className="flex items-center gap-4">
                  <img src={image.preview} alt="Preview" className="h-24 w-24 rounded-xl object-cover" />
                  <div className="space-y-1">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setImage({ blob: null, preview: '', removed: true })}
                    >
                      Remove photo
                    </button>
                    {image.blob && (
                      <p className="text-xs text-slate-500">Compressed to {Math.max(1, Math.round(image.blob.size / 1024))} KB · location data removed</p>
                    )}
                  </div>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 transition hover:border-indigo-400 hover:bg-indigo-50/40">
                  <Icon name="image" className="h-7 w-7 text-slate-400" />
                  <span>
                    {imageBusy ? 'Processing…' : <><strong className="text-indigo-600">Click to upload</strong> a photo</>}
                  </span>
                  <span className="text-xs text-slate-400">JPG, PNG or WEBP · up to 10 MB · auto-compressed</span>
                  <input type="file" accept={ALLOWED_IMAGE_TYPES.join(',')} className="sr-only" onChange={handleImage} />
                </label>
              )}
            </div>

            <ErrorBox message={serverError} />

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
                Cancel
              </button>
              <button type="submit" className={copy.btnClass} disabled={saving || imageBusy}>
                {saving ? 'Saving…' : isEdit ? 'Save changes' : copy.button}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

/** /items/:id/edit — loads the report and only lets its author edit it. */
export function EditReport() {
  const { id } = useParams()
  const { user } = useAuth()
  const [item, setItem] = useState(undefined)
  const [error, setError] = useState('')

  useEffect(() => {
    getItem(id)
      .then(setItem)
      .catch((err) => setError(err.message))
  }, [id])

  if (error) return <div className="container-page py-10"><ErrorBox message={error} /></div>
  if (item === undefined) return <Spinner />
  if (!item || item.user_id !== user.id)
    return (
      <div className="container-page py-10">
        <EmptyState
          icon="shield"
          title="You can't edit this report"
          text="Only the person who posted a report can edit it."
          action={<Link to="/browse" className="btn-primary">Browse reports</Link>}
        />
      </div>
    )
  return <ReportItem key={item.id} type={item.type} existing={item} />
}
