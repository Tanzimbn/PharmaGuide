// Monochrome line icons (react-native-svg) — replaces the emoji glyphs so the UI
// matches the design's thin-stroke icon language. One <Icon name=…/> component
// drawn from SVG primitives; color/size/stroke are props so buttons and the tab
// bar can tint them. Plus a brand <Logo/> (capsule mark) for the splash.
import { Circle, Line, Path, Polyline, Rect, Svg } from "react-native-svg";

import { colors } from "./theme";

export type IconName =
  | "library"
  | "ask"
  | "settings"
  | "plus"
  | "refresh"
  | "trash"
  | "send"
  | "save"
  | "folder"
  | "alert";

export function Icon({
  name,
  size = 22,
  color = colors.text,
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const p = { stroke: color, strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "library" && (
        <>
          <Path d="M12 6c-1.6-1-4.2-1.3-7-.8v13c2.8-.5 5.4-.2 7 .8 1.6-1 4.2-1.3 7-.8v-13c-2.8-.5-5.4-.2-7 .8Z" {...p} />
          <Line x1={12} y1={6} x2={12} y2={19} {...p} />
        </>
      )}
      {name === "ask" && (
        <Path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16h-9l-4 3v-3H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 5Z" {...p} />
      )}
      {name === "settings" && (
        <>
          <Line x1={4} y1={7} x2={20} y2={7} {...p} />
          <Line x1={4} y1={12} x2={20} y2={12} {...p} />
          <Line x1={4} y1={17} x2={20} y2={17} {...p} />
          <Circle cx={9} cy={7} r={2} {...p} fill={colors.surface} />
          <Circle cx={15} cy={12} r={2} {...p} fill={colors.surface} />
          <Circle cx={8} cy={17} r={2} {...p} fill={colors.surface} />
        </>
      )}
      {name === "plus" && (
        <>
          <Line x1={12} y1={5} x2={12} y2={19} {...p} />
          <Line x1={5} y1={12} x2={19} y2={12} {...p} />
        </>
      )}
      {name === "refresh" && (
        <>
          <Path d="M20 11.5A8 8 0 0 0 6 6.3L4 8" {...p} />
          <Polyline points="4 3.5 4 8 8.5 8" {...p} />
          <Path d="M4 12.5A8 8 0 0 0 18 17.7L20 16" {...p} />
          <Polyline points="20 20.5 20 16 15.5 16" {...p} />
        </>
      )}
      {name === "trash" && (
        <>
          <Line x1={4} y1={7} x2={20} y2={7} {...p} />
          <Path d="M6 7v12a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V7" {...p} />
          <Path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2" {...p} />
          <Line x1={10} y1={11} x2={10} y2={16} {...p} />
          <Line x1={14} y1={11} x2={14} y2={16} {...p} />
        </>
      )}
      {name === "send" && (
        <>
          <Line x1={12} y1={19} x2={12} y2={5} {...p} />
          <Polyline points="6 11 12 5 18 11" {...p} />
        </>
      )}
      {name === "save" && (
        <>
          <Path d="M5 4h11l3 3v12.5A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5V4Z" {...p} />
          <Path d="M8 4h6v4H8z" {...p} />
          <Rect x={8} y={13} width={8} height={5} rx={1} {...p} />
        </>
      )}
      {name === "folder" && (
        <Path d="M4 7a1.5 1.5 0 0 1 1.5-1.5H9l2 2h7.5A1.5 1.5 0 0 1 20 9v8.5A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5V7Z" {...p} />
      )}
      {name === "alert" && (
        <>
          <Path d="M12 4 22 20H2L12 4Z" {...p} />
          <Line x1={12} y1={10} x2={12} y2={15} {...p} />
          <Circle cx={12} cy={17.6} r={0.6} fill={color} stroke={color} />
        </>
      )}
    </Svg>
  );
}

// Brand mark — a capsule pill, used on the splash. Lime fill on the teal canvas.
export function Logo({ size = 84 }: { size?: number }) {
  const s = size / 48;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Rect
        x={9}
        y={18}
        width={30}
        height={12}
        rx={6}
        fill={colors.accent}
        stroke={colors.white}
        strokeWidth={2.4 / s}
        transform="rotate(-42 24 24)"
      />
      <Line
        x1={24}
        y1={14.6}
        x2={24}
        y2={33.4}
        stroke={colors.white}
        strokeWidth={2.4 / s}
        strokeLinecap="round"
        transform="rotate(-42 24 24)"
      />
    </Svg>
  );
}
