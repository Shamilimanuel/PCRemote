import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Automations, Device, Schedule, ScheduleAction } from '../../types/device';
import { clearWhenFinished, getAutomations, saveSchedules, setWhenFinished } from '../../lib/api';
import { explain } from '../../lib/errors';
import { useTheme } from '../../theme/ThemeContext';
import { RADIUS, raised, sunken, filled } from '../../theme/clay';
import { play } from '../../lib/sound';
import { tapFeedback, successFeedback, failureFeedback } from '../../lib/haptics';
import type { Strings } from '../../i18n';
import { ClayButton, ClaySwitch } from '../Clay';
import Segmented from '../Segmented';
import Sheet from '../Sheet';

/**
 * The two things the PC can do by itself: shut down once it has gone quiet,
 * and shut down (or restart, or sleep) at set times. Both are kept on the PC,
 * so they happen with the phone off; this only shows and changes them.
 */

const QUIET_CHOICES = [5, 10, 15, 30];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

export function actionWord(action: ScheduleAction | 'shutdown' | 'sleep', t: Strings): string {
  return action === 'restart' ? t.restart : action === 'sleep' ? t.sleep : t.shutDown;
}

export function daysLabel(days: number[], t: Strings): string {
  const set = [...days].sort().join(',');
  if (set === '0,1,2,3,4,5,6') return t.everyDay;
  if (set === '1,2,3,4,5') return t.weekdays;
  if (set === '0,6') return t.weekends;
  return [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => t.dayNames[d]).join(' ');
}

/** "today at 23:30", "tomorrow at 07:00", "Sat at 10:00". */
export function whenLabel(iso: string, t: Strings): string {
  const at = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const today = new Date();
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((dayStart(at) - dayStart(today)) / 86400000);
  if (days <= 0) return t.todayAt(time);
  if (days === 1) return t.tomorrowAt(time);
  return t.dayAt(t.dayNames[at.getDay()], time);
}

function dateKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function TimersSheet({
  device,
  visible,
  onClose,
  onChanged,
}: {
  device: Device;
  visible: boolean;
  onClose: () => void;
  /** So the control screen's summary catches up at once. */
  onChanged: () => void;
}) {
  const { theme, t } = useTheme();
  const [data, setData] = useState<Automations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);

  const [action, setAction] = useState<'shutdown' | 'sleep'>('shutdown');
  const [watch, setWatch] = useState<'cpu' | 'network' | 'both'>('both');
  const [quiet, setQuiet] = useState(10);

  const load = useCallback(() => {
    getAutomations(device)
      .then(({ data: next }) => {
        setData(next);
        setError(null);
        if (!next.supports.network) setWatch('cpu');
      })
      .catch((err) => setError(explain(err, t).message));
  }, [device, t]);

  useEffect(() => {
    if (!visible) {
      setEditing(null);
      return;
    }
    setData(null);
    load();
    // While open, the "quiet for so far" figure keeps up.
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [visible, load]);

  async function apply(work: () => Promise<{ data: Automations }>) {
    setBusy(true);
    try {
      const { data: next } = await work();
      setData(next);
      setError(null);
      play('done');
      successFeedback();
      onChanged();
      return true;
    } catch (err) {
      setError(explain(err, t).message);
      play('fail');
      failureFeedback();
      return false;
    } finally {
      setBusy(false);
    }
  }

  const schedules = data?.schedules ?? [];
  const save = (list: Schedule[]) => apply(() => saveSchedules(device, list));

  return (
    <Sheet visible={visible} title={t.timersTitle} subtitle={device.name} onClose={onClose}>
      {data === null && !error ? (
        <ActivityIndicator color={theme.dusk} style={styles.spinner} />
      ) : (
        <>
          {/* ------------------------------------------- when it's finished -- */}
          <Text style={[styles.section, { color: theme.ink }]}>{t.whenFinishedTitle}</Text>
          <Text style={[styles.hint, { color: theme.ink2 }]}>{t.whenFinishedHint}</Text>

          {data?.whenFinished ? (
            <View style={[styles.card, sunken(theme, 0.6)]}>
              <Text style={[styles.cardTitle, { color: theme.ink }]}>
                {t.watchingFor(actionWord(data.whenFinished.action, t), data.whenFinished.quietMinutes)}
              </Text>
              <Text style={[styles.cardLine, { color: data.whenFinished.quietForSeconds > 0 ? theme.moss : theme.ink3 }]}>
                {data.whenFinished.quietForSeconds > 0
                  ? t.quietSoFar(Math.floor(data.whenFinished.quietForSeconds / 60))
                  : t.stillBusy}
              </Text>
              <ClayButton label={t.stopWatching} tone="quiet" voice="cancel" busy={busy} onPress={() => apply(() => clearWhenFinished(device))} />
            </View>
          ) : (
            <View style={styles.form}>
              <Label text={t.then} />
              <Segmented
                value={action}
                onChange={setAction}
                options={[{ value: 'shutdown', label: t.shutDown }, { value: 'sleep', label: t.sleep }]}
              />
              <Label text={t.waitFor} />
              <Segmented
                value={watch}
                onChange={setWatch}
                options={[
                  { value: 'network', label: t.waitNetwork, disabled: !data?.supports.network },
                  { value: 'cpu', label: t.waitCpu },
                  { value: 'both', label: t.waitBoth, disabled: !data?.supports.network },
                ]}
              />
              <Label text={t.quietFor} />
              <Segmented value={quiet} onChange={setQuiet} options={QUIET_CHOICES.map((m) => ({ value: m, label: t.minutes(m) }))} />
              <ClayButton
                label={t.startWatching}
                tone="accent"
                busy={busy}
                onPress={() => apply(() => setWhenFinished(device, { action, watch, quietMinutes: quiet }))}
              />
            </View>
          )}

          {/* ------------------------------------------------------ schedule -- */}
          <Text style={[styles.section, styles.sectionGap, { color: theme.ink }]}>{t.scheduleTitle}</Text>
          <Text style={[styles.hint, { color: theme.ink2 }]}>{t.scheduleHint}</Text>

          {schedules.map((s) =>
            editing?.id === s.id ? (
              <ScheduleEditor
                key={s.id}
                initial={editing}
                busy={busy}
                onCancel={() => setEditing(null)}
                onSave={async (next) => {
                  if (await save(schedules.map((x) => (x.id === next.id ? next : x)))) setEditing(null);
                }}
              />
            ) : (
              <View key={s.id} style={[styles.card, sunken(theme, 0.6)]}>
                <View style={styles.scheduleTop}>
                  <Text style={[styles.time, { color: s.enabled ? theme.ink : theme.ink3 }]}>{s.time}</Text>
                  <View style={styles.scheduleText}>
                    <Text style={[styles.cardTitle, { color: s.enabled ? theme.ink : theme.ink3 }]} numberOfLines={1}>
                      {actionWord(s.action, t)}
                    </Text>
                    <Text style={[styles.cardLine, { color: theme.ink3 }]} numberOfLines={1}>{daysLabel(s.days, t)}</Text>
                  </View>
                  <ClaySwitch
                    label={actionWord(s.action, t)}
                    value={s.enabled}
                    onChange={(on) => save(schedules.map((x) => (x.id === s.id ? { ...x, enabled: on } : x)))}
                  />
                </View>
                {s.enabled && (
                  <Text style={[styles.cardLine, { color: s.skip ? theme.waking : theme.ink2 }]}>
                    {s.skip ? t.skipping : s.next ? t.nextScheduled(actionWord(s.action, t), whenLabel(s.next, t)) : ''}
                  </Text>
                )}
                <View style={styles.links}>
                  {s.enabled && (
                    <Link
                      text={s.skip ? t.undoSkip : t.skipNext}
                      onPress={() =>
                        save(schedules.map((x) =>
                          x.id === s.id ? { ...x, skip: s.skip ? null : s.next ? dateKey(new Date(s.next)) : null } : x
                        ))
                      }
                    />
                  )}
                  <Link text={t.editSchedule} onPress={() => setEditing(s)} />
                  <Link text={t.deleteSchedule} danger onPress={() => save(schedules.filter((x) => x.id !== s.id))} />
                </View>
              </View>
            )
          )}

          {editing && !schedules.some((s) => s.id === editing.id) ? (
            <ScheduleEditor
              initial={editing}
              busy={busy}
              onCancel={() => setEditing(null)}
              onSave={async (next) => {
                if (await save([...schedules, next])) setEditing(null);
              }}
            />
          ) : (
            !editing &&
            schedules.length < (data?.supports.maxSchedules ?? 12) && (
              <ClayButton
                label={t.addSchedule}
                tone="quiet"
                onPress={() =>
                  setEditing({ id: `s${Date.now().toString(36)}`, time: '23:00', days: EVERY_DAY, action: 'shutdown', enabled: true, skip: null })
                }
              />
            )
          )}
        </>
      )}

      {error && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}
    </Sheet>
  );
}

/** A time, the days, and what to do -- with buttons rather than a clock face,
 *  which needs a native picker this app does not have. */
function ScheduleEditor({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: Schedule;
  busy: boolean;
  onSave: (next: Schedule) => void;
  onCancel: () => void;
}) {
  const { theme, t } = useTheme();
  const [hours, setHours] = useState(Number(initial.time.slice(0, 2)));
  const [minutes, setMinutes] = useState(Number(initial.time.slice(3, 5)));
  const [days, setDays] = useState<number[]>(initial.days);
  const [action, setAction] = useState<ScheduleAction>(initial.action);
  const pad = (n: number) => String(n).padStart(2, '0');

  // Monday first, the way the week reads to most people here.
  const order = [1, 2, 3, 4, 5, 6, 0];

  return (
    <View style={[styles.card, raised(theme, 0.6)]}>
      <Label text={t.at} />
      <View style={styles.clock}>
        <Stepper label="−" onPress={() => setHours((h) => (h + 23) % 24)} accessibility={t.hourDown} />
        <Text style={[styles.clockText, { color: theme.ink }]}>{pad(hours)}:{pad(minutes)}</Text>
        <Stepper label="+" onPress={() => setHours((h) => (h + 1) % 24)} accessibility={t.hourUp} />
      </View>
      <View style={styles.minuteRow}>
        {[0, 15, 30, 45].map((m) => (
          <Pressable
            key={m}
            onPress={() => { setMinutes(m); tapFeedback(); }}
            style={[styles.minute, minutes === m ? filled(theme, theme.dusk, 'rgba(0,0,0,0.2)') : sunken(theme, 0.5)]}
          >
            <Text style={[styles.minuteText, { color: minutes === m ? theme.onFill : theme.ink2 }]}>:{pad(m)}</Text>
          </Pressable>
        ))}
      </View>

      <Label text={t.on} />
      <View style={styles.days}>
        {order.map((d) => {
          const on = days.includes(d);
          return (
            <Pressable
              key={d}
              onPress={() => {
                tapFeedback();
                setDays((current) => (on ? current.filter((x) => x !== d) : [...current, d]));
              }}
              style={[styles.day, on ? filled(theme, theme.dusk, 'rgba(0,0,0,0.2)') : sunken(theme, 0.5)]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.dayText, { color: on ? theme.onFill : theme.ink2 }]}>{t.dayNames[d]}</Text>
            </Pressable>
          );
        })}
      </View>

      <Label text={t.then} />
      <Segmented
        value={action}
        onChange={setAction}
        options={[
          { value: 'shutdown', label: t.shutDown },
          { value: 'restart', label: t.restart },
          { value: 'sleep', label: t.sleep },
        ]}
      />

      <View style={styles.editorButtons}>
        <ClayButton label={t.neverMind} tone="quiet" voice="cancel" onPress={onCancel} style={styles.flex} />
        <ClayButton
          label={t.save}
          tone="accent"
          busy={busy}
          dimmed={days.length === 0}
          onPress={() => {
            if (days.length === 0) return;
            onSave({ ...initial, time: `${pad(hours)}:${pad(minutes)}`, days: [...days].sort(), action, skip: null });
          }}
          style={styles.flex}
        />
      </View>
    </View>
  );
}

function Label({ text }: { text: string }) {
  const { theme } = useTheme();
  return <Text style={[styles.label, { color: theme.ink3 }]}>{text}</Text>;
}

function Link({ text, onPress, danger }: { text: string; onPress: () => void; danger?: boolean }) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={() => { play('tap'); tapFeedback(); onPress(); }} hitSlop={8} accessibilityRole="button">
      <Text style={[styles.link, { color: danger ? theme.danger : theme.dusk }]}>{text}</Text>
    </Pressable>
  );
}

function Stepper({ label, onPress, accessibility }: { label: string; onPress: () => void; accessibility: string }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => { play('tap'); tapFeedback(); onPress(); }}
      style={[styles.stepper, raised(theme, 0.5)]}
      accessibilityRole="button"
      accessibilityLabel={accessibility}
    >
      <Text style={[styles.stepperText, { color: theme.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  spinner: { marginVertical: 24 },
  section: { fontSize: 16, fontWeight: '800' },
  sectionGap: { marginTop: 14 },
  hint: { fontSize: 12.5, fontWeight: '600', lineHeight: 18, marginTop: -6 },
  form: { gap: 10 },
  label: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: -4 },
  card: { borderRadius: RADIUS.field, padding: 14, gap: 10 },
  cardTitle: { fontSize: 14.5, fontWeight: '800' },
  cardLine: { fontSize: 12.5, fontWeight: '700' },
  scheduleTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scheduleText: { flex: 1, minWidth: 0 },
  time: { fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  link: { fontSize: 13, fontWeight: '800' },
  clock: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  clockText: { fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  stepper: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  stepperText: { fontSize: 24, fontWeight: '800', lineHeight: 28 },
  minuteRow: { flexDirection: 'row', gap: 8 },
  minute: { flex: 1, borderRadius: 14, paddingVertical: 9, alignItems: 'center' },
  minuteText: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  days: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  dayText: { fontSize: 12, fontWeight: '800' },
  editorButtons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  flex: { flex: 1 },
  error: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
