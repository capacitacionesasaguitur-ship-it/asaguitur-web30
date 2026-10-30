export const WA_MESSAGE =
  'Hola, vi tu perfil en el directorio oficial de ASAGUITUR y deseo información sobre tus servicios como guía turístico.';

export function whatsappUrl(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(WA_MESSAGE)}`;
}
