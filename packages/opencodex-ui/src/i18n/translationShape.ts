/**
 * Preserves translation keys while widening every string leaf.
 */
export type TranslationShape<T> = {
  [Key in keyof T]: T[Key] extends string
    ? string
    : TranslationShape<T[Key]>;
};
