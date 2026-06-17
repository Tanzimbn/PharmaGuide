// Client for the stateless extraction service (mobile.md §6 Option B).
// Uploads a picked PDF and returns per-page text + table blocks. This is the one
// network hop in ingestion; everything after (chunk/embed/store) is on-device.
import { EXTRACT_BASE_URL } from "./config";
import { ExtractResponse } from "./types";

/** POST the PDF at `uri` to /extract; returns parsed pages. Throws on HTTP error. */
export async function extractPdf(uri: string, filename: string): Promise<ExtractResponse> {
  const form = new FormData();
  // React Native FormData file part: { uri, name, type }.
  form.append("file", {
    uri,
    name: filename,
    type: "application/pdf",
  } as unknown as Blob);

  let resp: Response;
  try {
    resp = await fetch(`${EXTRACT_BASE_URL}/extract`, { method: "POST", body: form });
  } catch (e) {
    throw new Error(
      `Extraction service unreachable at ${EXTRACT_BASE_URL}. ` +
        `Is it running and is EXTRACT_BASE_URL your laptop's LAN IP? (${String(e)})`,
    );
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Extraction failed (HTTP ${resp.status}): ${detail}`);
  }
  return (await resp.json()) as ExtractResponse;
}
