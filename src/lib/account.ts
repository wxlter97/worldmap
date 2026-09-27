// Operaciones de cuenta: contraseña, verificación de correo y borrado completo.
import {
  EmailAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
  sendEmailVerification,
  updatePassword,
  type User,
} from 'firebase/auth'
import { collection, doc, getDoc, getDocs, writeBatch } from 'firebase/firestore'
import { deleteObject, listAll, ref } from 'firebase/storage'
import { db, storage } from './firebase'
import { t } from './i18n'

/** Firebase exige haber iniciado sesión hace poco para operaciones sensibles: se pide la contraseña actual. */
async function reauth(user: User, password: string) {
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email!, password))
}

export async function changePassword(user: User, current: string, next: string) {
  await reauth(user, current)
  await updatePassword(user, next)
}

export function sendVerification(user: User) {
  return sendEmailVerification(user)
}

/** Borra fotos, entradas, viajes, link compartido y perfil; al final, la cuenta de Auth. */
export async function deleteAccount(user: User, password: string, onProgress?: (step: string) => void) {
  await reauth(user, password)
  const uid = user.uid

  onProgress?.(t('Borrando fotos…'))
  const photos = await listAll(ref(storage, `users/${uid}/photos`)).catch(() => null)
  await Promise.all((photos?.items ?? []).map((item) => deleteObject(item).catch(() => undefined)))

  onProgress?.(t('Borrando lugares y viajes…'))
  for (const name of ['entries', 'trips', 'notes', 'plans']) {
    const snap = await getDocs(collection(db, 'users', uid, name))
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db)
      for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref)
      await batch.commit()
    }
  }

  onProgress?.(t('Borrando perfil…'))
  const profile = await getDoc(doc(db, 'users', uid))
  const batch = writeBatch(db)
  const token = profile.data()?.sharing?.token as string | undefined
  if (token) batch.delete(doc(db, 'shares', token))
  for (const t of Object.values((profile.data()?.tripShares ?? {}) as Record<string, string>)) batch.delete(doc(db, 'shares', t))
  batch.delete(doc(db, 'users', uid))
  await batch.commit()

  onProgress?.(t('Cerrando la cuenta…'))
  await deleteUser(user)
}
