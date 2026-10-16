import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, Loader2, Image as ImageIcon } from 'lucide-react';
import {
  useCreateProjectPhoto,
  useUpdateProjectPhoto,
  useDeleteProjectPhoto,
  useRequestUploadUrl,
  getGetProjectQueryKey
} from '@workspace/api-client-react';

export function ProjectPhotos({ project }: { project: any }) {
  const client = useQueryClient();
  const create = useCreateProjectPhoto();
  const update = useUpdateProjectPhoto();
  const remove = useDeleteProjectPhoto();
  const upload = useRequestUploadUrl();

  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCaption, setEditCaption] = useState('');

  const photos = [...(project.photos || [])].sort((a, b) => a.position - b.position);

  const invalidate = () => {
    client.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const res = await upload.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type } });
        const uploaded = await fetch(res.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!uploaded.ok) throw new Error(`Failed to upload ${file.name}`);

        const url = `/api/storage/objects/${res.objectPath.replace(/^\/objects\//, '')}`;
        await create.mutateAsync({
          projectId: project.id,
          data: {
            url,
            fileName: file.name,
            position: photos.length + i,
            caption: ''
          }
        });
      }
      invalidate();
    } catch (err: any) {
      alert(`Upload error: ${err.message}`);
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleSaveCaption = () => {
    if (!editingId) return;
    update.mutate(
      {
        projectId: project.id,
        photoId: editingId,
        data: { caption: editCaption.trim() }
      },
      {
        onSuccess: () => {
          setEditingId(null);
          invalidate();
        }
      }
    );
  };

  const handleDelete = (photoId: number) => {
    if (window.confirm('Delete this photo?')) {
      remove.mutate(
        { projectId: project.id, photoId },
        { onSuccess: invalidate }
      );
    }
  };

  return (
    <div className="studio-card rounded-xl p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="font-display text-2xl text-[#302621]">Progress Photos</h2>
          <p className="mt-1 text-sm text-[#79675c]">Document the journey.</p>
        </div>
        <div>
          <label className="btn btn-line cursor-pointer">
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {uploading ? 'Uploading…' : 'Add photos'}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
              data-testid="input-upload-photos"
            />
          </label>
        </div>
      </div>

      {photos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d4c5b0] bg-[#fbf6ed] py-16 text-center">
          <ImageIcon className="mx-auto text-[#d4c5b0]" size={32} />
          <p className="mt-3 text-sm text-[#887566]">No photos added yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <div key={photo.id} className="group relative overflow-hidden rounded-lg bg-[#e7d9c5]">
              <img
                src={photo.url}
                alt={photo.caption || 'Progress photo'}
                className="h-48 w-full object-cover"
              />

              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/20 to-transparent p-3 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <div className="absolute right-2 top-2 flex gap-2">
                  <button
                    onClick={() => { setEditCaption(photo.caption || ''); setEditingId(photo.id); }}
                    data-testid={`edit-photo-${photo.id}`}
                    className="grid h-11 w-11 sm:h-8 sm:w-8 place-items-center rounded-full bg-white/20 text-white backdrop-blur hover:bg-white/40"
                    aria-label="Edit caption"
                  >
                    <Edit2 size={18} className="sm:w-3.5 sm:h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(photo.id)}
                    data-testid={`delete-photo-${photo.id}`}
                    className="grid h-11 w-11 sm:h-8 sm:w-8 place-items-center rounded-full bg-[#9d443f]/80 text-white backdrop-blur hover:bg-[#9d443f]"
                    aria-label="Delete photo"
                  >
                    <Trash2 size={18} className="sm:w-3.5 sm:h-3.5" />
                  </button>
                </div>

                {editingId === photo.id ? (
                  <div className="flex gap-2 relative z-10 pt-8 sm:pt-0">
                    <input
                      autoFocus
                      value={editCaption}
                      onChange={(e) => setEditCaption(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveCaption();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onBlur={handleSaveCaption}
                      data-testid={`input-caption-${photo.id}`}
                      className="w-full rounded border-none bg-white/90 px-3 py-2 text-base sm:text-xs text-[#302621] outline-none"
                      placeholder="Add a caption…"
                    />
                  </div>
                ) : (
                  <p
                    className="text-sm sm:text-xs text-white text-shadow mt-auto pr-16 sm:pr-0"
                    onDoubleClick={() => { setEditCaption(photo.caption || ''); setEditingId(photo.id); }}
                  >
                    {photo.caption || <span className="italic opacity-70"><span className="hidden sm:inline">Double-click to add caption</span><span className="sm:hidden">Tap edit to add caption</span></span>}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
