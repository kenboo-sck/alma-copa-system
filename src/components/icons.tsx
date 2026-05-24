import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

function baseProps(size = 24): IconProps {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
}

export function TrophyIcon(props: IconProps) {
  const { size = 24, ...svgProps } = props;

  return (
    <svg {...baseProps(size)} {...svgProps}>
      <path d="M8 5h8v2a4 4 0 0 1-8 0V5Z" />
      <path d="M7 7H5a2 2 0 0 0 2 2" />
      <path d="M17 7h2a2 2 0 0 1-2 2" />
      <path d="M12 11v3" />
      <path d="M9 19h6" />
      <path d="M10 14h4l1 5H9l1-5Z" />
    </svg>
  );
}

export function GiIcon(props: IconProps) {
  const { size = 24, ...svgProps } = props;

  return (
    <svg {...baseProps(size)} {...svgProps}>
      <path d="M8 4h8l2 4-3 2v10H9V10L6 8l2-4Z" />
      <path d="M9 4 8 8" />
      <path d="M15 4 16 8" />
      <path d="M12 8v12" />
      <path d="M10 10h4" />
      <path d="M9 14h6" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  const { size = 24, ...svgProps } = props;

  return (
    <svg {...baseProps(size)} {...svgProps}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 9h16" />
      <path d="M8 13h3M13 13h3M8 16h3" />
    </svg>
  );
}

export function LocationIcon(props: IconProps) {
  const { size = 24, ...svgProps } = props;

  return (
    <svg {...baseProps(size)} {...svgProps}>
      <path d="M12 21s6-4.5 6-10a6 6 0 1 0-12 0c0 5.5 6 10 6 10Z" />
      <circle cx="12" cy="11" r="2.2" />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  const { size = 24, ...svgProps } = props;

  return (
    <svg {...baseProps(size)} {...svgProps}>
      <path d="M16 18v-1.5a3.5 3.5 0 0 0-3.5-3.5h-1A3.5 3.5 0 0 0 8 16.5V18" />
      <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M17 10a2.5 2.5 0 1 0 0-5" />
      <path d="M17 18v-1a3 3 0 0 0-2-2.83" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  const { size = 24, ...svgProps } = props;

  return (
    <svg {...baseProps(size)} {...svgProps}>
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  const { size = 24, ...svgProps } = props;

  return (
    <svg {...baseProps(size)} {...svgProps}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  const { size = 24, ...svgProps } = props;

  return (
    <svg {...baseProps(size)} {...svgProps}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  const { size = 24, ...svgProps } = props;

  return (
    <svg {...baseProps(size)} {...svgProps}>
      <path d="m4 11 8-7 8 7" />
      <path d="M6 10v10h12V10" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  const { size = 24, ...svgProps } = props;

  return (
    <svg {...baseProps(size)} {...svgProps}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  const { size = 24, ...svgProps } = props;

  return (
    <svg {...baseProps(size)} {...svgProps}>
      <path d="M12 3 19 6v5c0 4.5-2.7 7.8-7 10-4.3-2.2-7-5.5-7-10V6l7-3Z" />
      <path d="m9.5 12 1.9 1.9L15 10.3" />
    </svg>
  );
}

export function PaymentIcon(props: IconProps) {
  const { size = 24, ...svgProps } = props;

  return (
    <svg {...baseProps(size)} {...svgProps}>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M4 10h16" />
      <path d="M8 14h3" />
      <path d="M14 14h2" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  const { size = 24, ...svgProps } = props;

  return (
    <svg {...baseProps(size)} {...svgProps}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

export function CheckCircleIcon(props: IconProps) {
  const { size = 24, ...svgProps } = props;

  return (
    <svg {...baseProps(size)} {...svgProps}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.8 12.2 2.1 2.1 4.6-4.8" />
    </svg>
  );
}
