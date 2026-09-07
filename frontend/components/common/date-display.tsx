import type { HTMLAttributes } from "react";

import {
  formatThaiDate,
  formatThaiDateTime,
  formatThaiTime,
  type DateLike,
} from "@/lib/date-format";

type DateDisplayProps = HTMLAttributes<HTMLSpanElement> & {
  value?: DateLike;
  fallback?: string;
};

type DateRangeDisplayProps = HTMLAttributes<HTMLSpanElement> & {
  from?: DateLike;
  to?: DateLike;
  fallback?: string;
  separator?: string;
};

function joinClassName(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

export function DateDisplay({
  value,
  fallback = "-",
  className,
  ...props
}: DateDisplayProps) {
  const text = formatThaiDate(value);

  return (
    <span
      className={joinClassName("whitespace-nowrap tabular-nums", className)}
      {...props}
    >
      {text === "-" ? fallback : text}
    </span>
  );
}

export function DateTimeDisplay({
  value,
  fallback = "-",
  className,
  ...props
}: DateDisplayProps) {
  const text = formatThaiDateTime(value);

  return (
    <span
      className={joinClassName("whitespace-nowrap tabular-nums", className)}
      {...props}
    >
      {text === "-" ? fallback : text}
    </span>
  );
}

export function TimeDisplay({
  value,
  fallback = "-",
  className,
  ...props
}: DateDisplayProps) {
  const text = formatThaiTime(value);

  return (
    <span
      className={joinClassName("whitespace-nowrap tabular-nums", className)}
      {...props}
    >
      {text === "-" ? fallback : text}
    </span>
  );
}

export function DateRangeDisplay({
  from,
  to,
  fallback = "-",
  separator = " - ",
  className,
  ...props
}: DateRangeDisplayProps) {
  const fromText = formatThaiDate(from);
  const toText = formatThaiDate(to);

  let text = fallback;

  if (fromText !== "-" && toText !== "-") {
    text = `${fromText}${separator}${toText}`;
  } else if (fromText !== "-") {
    text = fromText;
  } else if (toText !== "-") {
    text = toText;
  }

  return (
    <span
      className={joinClassName("whitespace-nowrap tabular-nums", className)}
      {...props}
    >
      {text}
    </span>
  );
}