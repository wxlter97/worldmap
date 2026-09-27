// Preferencias de interfaz por dispositivo (no se sincronizan). Sin almacenamiento, se usan los valores por defecto.
export function readPref(key: string): boolean {
  try {
    return localStorage.getItem(`wm:${key}`) === '1'
  } catch {
    return false
  }
}

export function writePref(key: string, value: boolean) {
  try {
    localStorage.setItem(`wm:${key}`, value ? '1' : '0')
  } catch {
    // modo privado o almacenamiento bloqueado: la preferencia no se recuerda
  }
}
