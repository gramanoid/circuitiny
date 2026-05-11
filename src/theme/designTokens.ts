// Spacing tokens in rem use a standard 0.25rem-based scale (4px at the default
// 16px root); semantic aliases point to the same scale.
export const spacing = {
  '2xs': '0.25rem',
  xs: '0.5rem',
  small: '0.75rem',
  medium: '1rem',
  large: '1.25rem',
  xl: '1.5rem',
} as const

export const SPACING_2XS = spacing['2xs']
export const SPACING_XS = spacing.xs
export const SPACING_SMALL = spacing.small
export const SPACING_MEDIUM = spacing.medium
export const SPACING_LARGE = spacing.large
export const SPACING_XL = spacing.xl

export const SPACING_CONTROL_Y = SPACING_2XS
export const SPACING_CARD_Y = SPACING_XS
export const SPACING_FIELD = SPACING_XS
export const SPACING_BUTTON_X = SPACING_SMALL

// Border radius tokens in px for cards, buttons, inputs, and thumbnails.
export const borderRadius = {
  small: 4,
  medium: 8,
  large: 12,
} as const

export const BORDER_RADIUS_SMALL = borderRadius.small
export const BORDER_RADIUS_MEDIUM = borderRadius.medium
export const BORDER_RADIUS_LARGE = borderRadius.large
// BORDER_WIDTH_ACCENT is intentionally 3px for an optical highlight that reads lighter than a full 4px layout unit.
export const BORDER_WIDTH_ACCENT = 3

// UI typography tokens for dense controls, labels, and captions rather than long body copy.
// At the default 16px browser root: caption=13px, label=14px, value=16px.
// rem units preserve those proportions while respecting user-configured root font sizes.
export const fontSize = {
  caption: '0.8125rem',
  label: '0.875rem',
  value: '1rem',
} as const

export const FONT_SIZE_CAPTION = fontSize.caption
export const FONT_SIZE_LABEL = fontSize.label
export const FONT_SIZE_VALUE = fontSize.value

export type SpacingToken = keyof typeof spacing
export type BorderRadiusToken = keyof typeof borderRadius
export type FontSizeToken = keyof typeof fontSize

// Layout dimensions in rem for responsive panels and photo thumbnails.
// These preserve accessible root-font scaling while keeping the intended
// default 16px-root geometry visible to reviewers and designers.
export const layoutDimensions = {
  // 150px: compact empty panels stay readable without dominating the workbench.
  sectionMinHeight: '9.375rem',
  // 300px: recipe/catalog cards keep two useful text columns on desktop.
  gridMinColumnWidth: '18.75rem',
  // 56px x 42px: uploaded build photos remain identifiable in dense panels.
  photoThumbWidth: '3.5rem',
  photoThumbHeight: '2.625rem',
  // 54px: observation notes show multiple beginner-friendly lines by default.
  textareaMinHeight: '3.375rem',
} as const

export const SECTION_MIN_HEIGHT = layoutDimensions.sectionMinHeight
export const GRID_MIN_COLUMN_WIDTH = layoutDimensions.gridMinColumnWidth
export const PHOTO_THUMB_WIDTH = layoutDimensions.photoThumbWidth
export const PHOTO_THUMB_HEIGHT = layoutDimensions.photoThumbHeight
export const TEXTAREA_MIN_HEIGHT = layoutDimensions.textareaMinHeight

export type LayoutDimensionToken = keyof typeof layoutDimensions
