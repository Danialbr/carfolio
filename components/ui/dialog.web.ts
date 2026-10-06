/**
 * The web half. Deliberately the browser's own dialogs rather than a custom
 * modal: they are the one thing on a page that cannot be missed, they work
 * before React has finished anything, and on an installed iOS web app they
 * render as native sheets.
 *
 * `confirm` is synchronous under the hood, which matters — a dialog that awaits
 * a real Promise would lose the user gesture, and the file picker behind it
 * would silently fail to open on Safari.
 */

export function notify(title: string, message?: string): Promise<void> {
  window.alert(message ? `${title}\n\n${message}` : title);
  return Promise.resolve();
}

export function confirm(options: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const text = options.message ? `${options.title}\n\n${options.message}` : options.title;
  return Promise.resolve(window.confirm(text));
}
