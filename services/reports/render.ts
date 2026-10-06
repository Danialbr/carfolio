/**
 * The only impure part of reporting: HTML → PDF → share sheet.
 *
 * Kept separate from templates.ts so the templates stay snapshot-testable in
 * plain node. Everything here touches the device and nothing here decides what
 * a report says.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export { safeFilename } from './templates';

export interface RenderResult {
  ok: boolean;
  uri: string | null;
  error: string | null;
}

export async function renderAndShare(html: string, filename: string): Promise<RenderResult> {
  try {
    const { uri } = await Print.printToFileAsync({ html, base64: false });

    if (!(await Sharing.isAvailableAsync())) {
      // Still a success — the file exists, it just cannot be handed off here.
      return { ok: true, uri, error: null };
    }

    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: filename,
      UTI: 'com.adobe.pdf',
    });
    return { ok: true, uri, error: null };
  } catch (error) {
    return {
      ok: false,
      uri: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
