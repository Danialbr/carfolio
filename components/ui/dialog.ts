/**
 * DIALOGS, ON BOTH PLATFORMS.
 *
 * react-native's `Alert` does not exist on the web: `Alert.alert` with buttons
 * is a silent no-op there. That is not a cosmetic gap — it meant "Restore from
 * a backup?" never appeared and the restore path was simply dead in the
 * installed web app, while every error message the app tried to show was
 * swallowed. Both were invisible until the flow was driven in a real browser.
 *
 * So dialogs go through here instead of through Alert directly, and the web
 * build swaps in dialog.web.ts. Two functions, because two things are ever
 * needed: tell the user something, or ask them to confirm something.
 */

import { Alert } from 'react-native';

/** Tell the user something. Resolves when they dismiss it. */
export function notify(title: string, message?: string): Promise<void> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [{ text: 'OK', onPress: () => resolve() }], {
      onDismiss: () => resolve(),
    });
  });
}

/**
 * Ask before doing something that cannot be undone. Resolves true only if the
 * user actively confirms — dismissing counts as no.
 */
export function confirm(options: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      options.title,
      options.message,
      [
        { text: options.cancelLabel ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        {
          text: options.confirmLabel ?? 'Continue',
          style: options.destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { onDismiss: () => resolve(false) },
    );
  });
}
