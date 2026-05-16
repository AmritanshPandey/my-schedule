import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "@/lib/firebase";

function pdfRef(uid: string, strategyId: string) {
  if (!storage) throw new Error("Firebase Storage not initialized");
  return ref(storage, `users/${uid}/strategies/${strategyId}.pdf`);
}

export async function uploadStrategyPdf(
  uid: string,
  strategyId: string,
  bytes: Uint8Array,
): Promise<string> {
  const r = pdfRef(uid, strategyId);
  await uploadBytes(r, bytes, { contentType: "application/pdf" });
  return getDownloadURL(r);
}

export async function deleteStrategyPdf(uid: string, strategyId: string): Promise<void> {
  if (!storage) return;
  try {
    await deleteObject(pdfRef(uid, strategyId));
  } catch {
    // File may not exist (guest upload or already deleted) — safe to ignore.
  }
}
