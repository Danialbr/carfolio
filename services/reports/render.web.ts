/**
 * REPORTS — the web half.
 *
 * There is no expo-print in a browser, and there does not need to be: the
 * templates already produce a complete HTML document, and every browser can
 * turn one into a PDF. The report is opened in a hidden frame and sent to the
 * print dialog, where iOS offers "Save to Files" and Safari on the desktop
 * offers "Save as PDF".
 *
 * Same templates, same numbers, same filename rules as the native path — only
 * the last step differs.
 */

export { safeFilename } from './templates';

export interface RenderResult {
  ok: boolean;
  uri: string | null;
  error: string | null;
}

export async function renderAndShare(html: string, filename: string): Promise<RenderResult> {
  try {
    const frame = document.createElement('iframe');
    // Off-screen rather than display:none — a hidden frame does not always get
    // laid out, and an unlaid-out document prints blank.
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
    document.body.appendChild(frame);

    const doc = frame.contentDocument;
    if (!doc || !frame.contentWindow) throw new Error('The report could not be prepared.');

    doc.open();
    doc.write(html);
    // The print dialog uses the document title as the suggested filename, so
    // the saved PDF is named the same way it would be on the phone.
    doc.title = filename.replace(/\.pdf$/i, '');
    doc.close();

    // One frame for layout and web fonts before the dialog opens.
    await new Promise((resolve) => setTimeout(resolve, 350));

    frame.contentWindow.focus();
    frame.contentWindow.print();

    // The dialog is modal but not awaitable; the frame is cleared once it can
    // no longer be in use.
    setTimeout(() => frame.remove(), 60_000);

    return { ok: true, uri: null, error: null };
  } catch (error) {
    return {
      ok: false,
      uri: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
