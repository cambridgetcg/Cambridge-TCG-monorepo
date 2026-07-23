import { useId } from "react";

import styles from "./ChoiceCardGroup.module.css";

export interface ChoiceCardOption<T extends string = string> {
  value: T;
  label: string;
  description: string;
}

export interface ChoiceCardSection<T extends string = string> {
  heading: string;
  options: readonly ChoiceCardOption<T>[];
}

interface ChoiceCardGroupBaseProps<T extends string> {
  legend: string;
  name: string;
  value: T;
  onChange: (value: T) => void;
}

type ChoiceCardGroupProps<T extends string> = ChoiceCardGroupBaseProps<T> &
  (
    | {
        options: readonly ChoiceCardOption<T>[];
        sections?: never;
      }
    | {
        options?: never;
        sections: readonly ChoiceCardSection<T>[];
      }
  );

/**
 * A native radio group with a large, card-shaped pointer target.
 *
 * Sections remain visual categories inside one fieldset so every radio with
 * the shared name also belongs to the same programmatic group.
 */
export function ChoiceCardGroup<T extends string>({
  legend,
  name,
  value,
  onChange,
  ...choices
}: ChoiceCardGroupProps<T>) {
  const idPrefix = useId();
  const sections: readonly ChoiceCardSection<T>[] =
    "sections" in choices && choices.sections
      ? choices.sections
      : [{ heading: "", options: choices.options }];

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.sections}>
        {sections.map((section, sectionIndex) => (
          <div
            className={styles.section}
            key={section.heading || `choices-${sectionIndex}`}
          >
            {section.heading ? (
              <h3 className={styles.sectionHeading}>{section.heading}</h3>
            ) : null}
            <div className={styles.grid}>
              {section.options.map((option) => {
                const optionId = `${idPrefix}-${option.value}`;
                const labelId = `${optionId}-label`;
                const descriptionId = `${optionId}-description`;
                const isSelected = value === option.value;

                return (
                  <div
                    className={styles.choice}
                    data-selected={isSelected}
                    key={option.value}
                  >
                    <input
                      aria-describedby={descriptionId}
                      aria-labelledby={labelId}
                      checked={isSelected}
                      className={styles.input}
                      id={optionId}
                      name={name}
                      onChange={() => onChange(option.value)}
                      type="radio"
                      value={option.value}
                    />
                    <div className={styles.surface}>
                      <span className={styles.indicator} aria-hidden="true" />
                      <span className={styles.copy}>
                        <span className={styles.label} id={labelId}>
                          {option.label}
                        </span>
                        <span className={styles.description} id={descriptionId}>
                          {option.description}
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
