import type { Decimal } from "decimal.js";
import { Money } from "~/lib/money";
import styles from "./admin.module.css";

/**
 * A buyer's tier and its cashback rate, as "Gold 5%": navy text on teal with
 * a navy edge (spec 4.1). The percent is shown as stored, without trailing
 * zeros, so 5.00 reads 5%. The space between the two is for screen readers;
 * the flex gap spaces them on screen.
 */
export function TierChip({ name, percent }: { name: string; percent: Decimal | number | string }) {
  return (
    <span className={styles.tierChip}>
      <span>{name}</span>{" "}
      <span>{new Money(percent).toString()}%</span>
    </span>
  );
}
