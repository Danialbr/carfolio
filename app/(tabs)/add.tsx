import { Redirect } from 'expo-router';

/**
 * Slot for the centre tab button.
 *
 * The tab bar's `tabBarButton` intercepts the press and navigates, so this
 * screen is never shown. The redirect only covers someone reaching the route
 * directly through a deep link.
 */
export default function AddSlot() {
  return <Redirect href="/vehicle/new" />;
}
