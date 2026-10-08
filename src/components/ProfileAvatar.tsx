import { useState } from 'react';
import './avatar.css';

function trustedPhotoUrl(value?: string): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'blob:' && value.startsWith(`blob:${window.location.origin}/`)) return value;
    const project = new URL(import.meta.env.VITE_SUPABASE_URL);
    return url.protocol === 'https:' && url.origin === project.origin && !url.username && !url.password
      && /^\/storage\/v1\/object\/public\/avatars\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:webp|png|jpeg)$/i.test(url.pathname) ? value : null;
  } catch { return null; }
}

export function ProfileAvatar({ name, photoUrl, size = 44, className = '', decorative = false }: {
  name: string; photoUrl?: string; size?: number; className?: string; decorative?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const source = trustedPhotoUrl(photoUrl);
  const initials = name.trim().split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toLocaleUpperCase('pt-BR') || '?';
  return <span className={`profile-avatar ${className}`} style={{ width: size, height: size, fontSize: Math.max(13, Math.round(size * 0.32)) }}
    aria-hidden={decorative || undefined} role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : `Foto de ${name || 'perfil'}`}>
    {source && source !== failedUrl ? <img src={source} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(source)} /> : <span>{initials}</span>}
  </span>;
}

export default ProfileAvatar;
