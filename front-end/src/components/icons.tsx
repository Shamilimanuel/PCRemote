import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

/**
 * Line icons drawn on a 24x24 grid so they share stroke weight and optical
 * size. Emoji were rendering as full-colour glyphs on Android and flat
 * outlines on iOS, which made the action grid look mismatched.
 */
export type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

function Icon({ size = 26, color = '#FFFFFF', strokeWidth = 1.8, children }: IconProps & { children: React.ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

export function PowerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Path d="M12 3v9" />
      <Path d="M18.36 7.64a9 9 0 1 1-12.73 0" />
    </Icon>
  );
}

export function PowerOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Path d="M18.36 7.64A9 9 0 0 1 20.3 16.2" />
      <Path d="M6.7 6.7a9 9 0 0 0 11.1 13.9" />
      <Path d="M12 3v6" />
      <Line x1="3" y1="3" x2="21" y2="21" />
    </Icon>
  );
}

export function RestartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Path d="M3 12a9 9 0 0 1 9-9 9.7 9.7 0 0 1 6.7 2.8L21 8" />
      <Path d="M21 3v5h-5" />
      <Path d="M21 12a9 9 0 0 1-9 9 9.7 9.7 0 0 1-6.7-2.8L3 16" />
      <Path d="M3 21v-5h5" />
    </Icon>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z" />
    </Icon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
      <Path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </Icon>
  );
}

export function AbortIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Circle cx="12" cy="12" r="9" />
      <Line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
    </Icon>
  );
}

export function NetworkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Rect x="9" y="3" width="6" height="6" rx="1.4" />
      <Rect x="2.5" y="15" width="6" height="6" rx="1.4" />
      <Rect x="15.5" y="15" width="6" height="6" rx="1.4" />
      <Path d="M12 9v3H5.5v3" />
      <Path d="M12 12h6.5v3" />
    </Icon>
  );
}

export function ChipIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Rect x="5" y="5" width="14" height="14" rx="2" />
      <Rect x="9.5" y="9.5" width="5" height="5" rx="0.5" />
      <Path d="M9 2v3M15 2v3M9 19v3M15 19v3" />
      <Path d="M2 9h3M2 15h3M19 9h3M19 15h3" />
    </Icon>
  );
}

/**
 * A solid cog rather than an outline. The outlined version read as a sun --
 * the teeth need mass to be recognisable at 20px, and a filled shape sits
 * better against clay anyway. The hole comes from the even-odd fill rule.
 */
const GEAR_PATH =
  'M12.92 2.65 L14.73 3.00 L15.30 5.83 L16.44 6.59 L19.27 6.04 L20.29 7.57 L18.70 9.97 L18.97 11.31 L21.35 12.92 L21.00 14.73 L18.17 15.30 L17.41 16.44 L17.96 19.27 L16.43 20.29 L14.03 18.70 L12.69 18.97 L11.08 21.35 L9.27 21.00 L8.70 18.17 L7.56 17.41 L4.73 17.96 L3.71 16.43 L5.30 14.03 L5.03 12.69 L2.65 11.08 L3.00 9.27 L5.83 8.70 L6.59 7.56 L6.04 4.73 L7.57 3.71 L9.97 5.30 L11.31 5.03 Z M12 8.6 a3.4 3.4 0 1 0 0 6.8 a3.4 3.4 0 1 0 0-6.8 Z';

export function GearIcon({ size = 26, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={GEAR_PATH} fill={color} fillRule="evenodd" strokeLinejoin="round" />
    </Svg>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Circle cx="12" cy="12" r="9.5" />
      <Path d="M9.2 9.3a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.4-2.8 4" />
      <Line x1="12" y1="17.6" x2="12" y2="17.6" />
    </Icon>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Path d="M12 4.5 21 20H3l9-15.5Z" />
      <Line x1="12" y1="10" x2="12" y2="14" />
      <Line x1="12" y1="17" x2="12" y2="17" />
    </Icon>
  );
}

/**
 * The machine icons, for telling one saved device from another at a glance.
 *
 * Shape only, never an operating system: a laptop running Linux is still a
 * laptop, and an icon that claimed otherwise would be wrong half the time. The
 * OS is a separate thing the agent reports.
 */

export function DesktopIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Rect x="3.5" y="4" width="17" height="11.5" rx="1.6" />
      <Line x1="9" y1="19.5" x2="15" y2="19.5" />
      <Line x1="12" y1="15.5" x2="12" y2="19.5" />
    </Icon>
  );
}

export function LaptopIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Path d="M5.5 5.5h13v9h-13z" />
      <Path d="M2.5 18.5h19" />
      <Path d="M4 14.5 2.5 18.5M20 14.5l1.5 4" />
    </Icon>
  );
}

export function ServerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Rect x="3.5" y="3.5" width="17" height="7" rx="1.5" />
      <Rect x="3.5" y="13.5" width="17" height="7" rx="1.5" />
      <Line x1="7" y1="7" x2="7" y2="7" />
      <Line x1="7" y1="17" x2="7" y2="17" />
    </Icon>
  );
}

export function MiniPcIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Rect x="5.5" y="6.5" width="13" height="11" rx="2" />
      <Line x1="9" y1="10.5" x2="9" y2="10.5" />
      <Line x1="9" y1="13.5" x2="15" y2="13.5" />
    </Icon>
  );
}
