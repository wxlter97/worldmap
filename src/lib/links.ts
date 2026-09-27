/** Enlace al mapa con parámetros; respeta el prefijo de la vista compartida (/s/{token}). */
export const mapLink = (basePath: string, query: string) => `${basePath || '/'}?${query}`
