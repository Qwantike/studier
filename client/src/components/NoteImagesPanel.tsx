import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { api } from '../api/client'
interface Image {
  id: string
  original_name: string
  width: number
  height: number
  byte_size: number
}
interface Usage {
  bytes: number
  count: number
  account_limit: number
  count_limit: number
}
const mib = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)
export default function NoteImagesPanel() {
  const cache = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const usage = useQuery({
    queryKey: ['note-images-usage'],
    queryFn: () => api<Usage>('/note-images/usage'),
  })
  const images = useQuery({
    queryKey: ['note-images'],
    queryFn: () => api<Image[]>('/note-images'),
    enabled: expanded,
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/note-images/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['note-images'] }),
        cache.invalidateQueries({ queryKey: ['note-images-usage'] }),
      ])
    },
  })
  return (
    <div className="space-y-3 text-sm">
      <p>
        PNG, JPEG, WebP ou GIF : 4 Mio par import, 20 millions de pixels
        maximum. Les images sont redimensionnées à 2 560 px ; les animations
        deviennent une image fixe.
      </p>
      {usage.data && (
        <p>
          {mib(usage.data.bytes)} / {mib(usage.data.account_limit)} Mio ·{' '}
          {usage.data.count} / {usage.data.count_limit} images
        </p>
      )}
      <button
        type="button"
        className="rounded border px-3 py-2"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'Masquer les images' : 'Gérer les images'}
      </button>
      {(usage.error || images.error || remove.error) && (
        <p role="alert" className="text-red-600">
          {(remove.error ?? images.error ?? usage.error)?.message}
        </p>
      )}
      {expanded && images.isPending && <p>Chargement…</p>}
      {expanded && images.data?.length === 0 && <p>Aucune image importée.</p>}
      {expanded &&
        images.data?.map((image) => (
          <div key={image.id} className="flex items-center gap-3 border-t pt-3">
            <img
              loading="lazy"
              src={`/api/note-images/${image.id}`}
              alt={image.original_name}
              className="h-16 w-16 rounded object-contain"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate">{image.original_name}</p>
              <p className="text-xs text-zinc-500">
                {image.width} × {image.height} · {mib(image.byte_size)} Mio
              </p>
            </div>
            <button
              type="button"
              className="text-red-600 disabled:opacity-50"
              disabled={remove.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    'Supprimer ce fichier ? Les images encore utilisées dans une note sont protégées.',
                  )
                )
                  remove.mutate(image.id)
              }}
            >
              Supprimer
            </button>
          </div>
        ))}
      <p className="text-xs text-zinc-500">
        Retirer une image d’une note ne supprime pas le fichier. Enregistrez les
        notes puis supprimez ici les images inutilisées pour libérer de la
        place.
      </p>
    </div>
  )
}
