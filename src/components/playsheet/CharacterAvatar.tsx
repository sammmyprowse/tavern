"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { setCharacterAvatar } from "@/app/characters/actions";

interface CharacterAvatarProps {
  characterId: string;
  initialAvatarUrl: string | null;
  name: string;
  isOwner: boolean;
}

const MAX_BYTES = 5 * 1024 * 1024;

export default function CharacterAvatar({
  characterId,
  initialAvatarUrl,
  name,
  isOwner,
}: CharacterAvatarProps) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image is too large (max 5MB).");
      return;
    }

    setUploading(true);
    setError(null);

    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setError("You need to sign in to do that.");
      setUploading(false);
      return;
    }

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${userData.user.id}/${characterId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const freshUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

    const result = await setCharacterAvatar(characterId, freshUrl);
    if (!result.success) {
      setError(result.error ?? "Couldn't save the new photo.");
      setUploading(false);
      return;
    }

    setAvatarUrl(freshUrl);
    setUploading(false);
  }

  async function handleRemove() {
    setUploading(true);
    setError(null);
    const result = await setCharacterAvatar(characterId, null);
    if (!result.success) {
      setError(result.error ?? "Couldn't remove the photo.");
      setUploading(false);
      return;
    }
    setAvatarUrl(null);
    setUploading(false);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => isOwner && fileInputRef.current?.click()}
        disabled={!isOwner || uploading}
        className={`flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-tavern-gold/60 bg-tavern-card sm:h-28 sm:w-28 ${
          isOwner ? "cursor-pointer hover:border-tavern-gold" : "cursor-default"
        }`}
        title={isOwner ? "Change photo" : undefined}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="font-heading text-3xl font-bold text-tavern-gold-light">
            {name.charAt(0).toUpperCase() || "?"}
          </span>
        )}
      </button>

      {isOwner && (
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-xs text-tavern-gold-light hover:text-tavern-gold disabled:opacity-50"
          >
            {uploading ? "Working…" : avatarUrl ? "Change Photo" : "Add Photo"}
          </button>
          {avatarUrl && !uploading && (
            <button
              type="button"
              onClick={handleRemove}
              className="text-xs text-tavern-muted hover:text-tavern-oxblood-light"
            >
              Remove
            </button>
          )}
        </div>
      )}
      {error && <span className="max-w-[10rem] text-center text-xs text-tavern-oxblood-light">{error}</span>}
    </div>
  );
}
