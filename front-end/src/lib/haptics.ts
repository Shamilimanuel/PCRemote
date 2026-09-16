import * as Haptics from 'expo-haptics';

/**
 * Sound only lands if the volume is up, which on a phone it usually isn't.
 * The buzz is what makes a press feel answered the rest of the time.
 */

let enabled = true;

export function setHapticsEnabled(on: boolean) {
  enabled = on;
}

export function tapFeedback() {
  if (!enabled) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function successFeedback() {
  if (!enabled) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function failureFeedback() {
  if (!enabled) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}

export function warningFeedback() {
  if (!enabled) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}
