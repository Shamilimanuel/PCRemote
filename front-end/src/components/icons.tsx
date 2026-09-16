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

export function GearIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Circle cx="12" cy="12" r="3.3" />
      <Path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5" />
      <Path d="M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9L5.3 5.3" />
    </Icon>
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
