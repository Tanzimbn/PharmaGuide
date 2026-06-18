// PDF picker helper. Extracted from the M1 harness so screens share one path.
import * as DocumentPicker from "expo-document-picker";

export interface PickedPdf {
  uri: string;
  name: string;
  size: number;
}

/** Open the system picker for a single PDF. Returns null if cancelled. */
export async function pickPdf(): Promise<PickedPdf | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  return { uri: a.uri, name: a.name ?? "document.pdf", size: a.size ?? 0 };
}
