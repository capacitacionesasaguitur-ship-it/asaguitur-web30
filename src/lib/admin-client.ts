// Solo para scripts del navegador del panel de la Junta.
import { createClient } from '@supabase/supabase-js';

export async function postJson<T = any>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? 'No se pudo completar la acción.');
  return out;
}

/** Sube el archivo directo a Supabase Storage con una URL firmada de un solo uso (sin pasar por Netlify: sin límite de 6 MB). */
export async function uploadFile(bucket: 'documents' | 'boletin', file: File) {
  const meta = await postJson<{ id: string; path: string; token: string; publicUrl: string | null }>(
    '/api/admin/upload-url', { bucket, contentType: file.type, size: file.size });
  const sb = createClient(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.PUBLIC_SUPABASE_ANON_KEY);
  const { error } = await sb.storage.from(bucket).uploadToSignedUrl(meta.path, meta.token, file, { contentType: file.type });
  if (error) throw new Error('No se pudo subir el archivo. Inténtalo de nuevo.');
  return meta;
}

/** Sube el comprobante del banco al bucket privado "comprobantes" y devuelve su ruta. */
export async function uploadComprobante(file: File): Promise<string> {
  const meta = await postJson<{ path: string; token: string }>('/api/admin/finanzas/upload-url', { contentType: file.type, size: file.size });
  const sb = createClient(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.PUBLIC_SUPABASE_ANON_KEY);
  const { error } = await sb.storage.from('comprobantes').uploadToSignedUrl(meta.path, meta.token, file, { contentType: file.type });
  if (error) throw new Error('No se pudo subir el comprobante. Inténtalo de nuevo.');
  return meta.path;
}

export function initTabs() {
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  const ids = tabs.map((t) => t.dataset.tab!);
  function show(id: string, focus = false) {
    for (const t of tabs) {
      const on = t.dataset.tab === id;
      t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
      document.getElementById(`tab-${t.dataset.tab}`)!.hidden = !on;
      if (on && focus) t.focus();
    }
    history.replaceState(null, '', `#${id}`);
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t.dataset.tab!));
    t.addEventListener('keydown', (e) => {
      const k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (k) { e.preventDefault(); show(ids[(i + k + ids.length) % ids.length], true); }
    });
  });
  const initial = location.hash.slice(1);
  show(ids.includes(initial) ? initial : ids[0]);
}
