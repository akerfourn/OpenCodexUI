/**
 * Categories supported by i18next's locale-aware plural resolution.
 */
export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

type StringKey<T> = Extract<keyof T, string>;

type PluralVariantKey = `${string}_${PluralCategory}`;

type PluralVariantKeys<T> = Extract<StringKey<T>, PluralVariantKey>;

type PluralFamilyForKey<Key extends string> = Key extends `${infer Base}_${PluralCategory}`
  ? Base
  : never;

type PluralFamilies<T> = PluralFamilyForKey<PluralVariantKeys<T>>;

type OrdinaryKeys<T> = Exclude<StringKey<T>, PluralVariantKeys<T>>;

type TranslationShapeNode<T, RequiredPluralCategories extends PluralCategory> = {
  [Key in OrdinaryKeys<T>]: T[Key] extends string
    ? string
    : TranslationShapeNode<T[Key], RequiredPluralCategories>;
} & {
  [Base in PluralFamilies<T> as `${Base}_${RequiredPluralCategories}`]: string;
} & {
  [Base in PluralFamilies<T> as `${Base}_${Exclude<PluralCategory, RequiredPluralCategories>}`]?: string;
};

/**
 * Preserves ordinary translation keys and plural families while widening string leaves.
 *
 * Every family requires the categories in `RequiredPluralCategories`; all other
 * i18next categories remain optional for that family.
 */
export type TranslationShape<
  T,
  RequiredPluralCategories extends PluralCategory = "one" | "other"
> = T extends string ? string : TranslationShapeNode<T, RequiredPluralCategories>;
