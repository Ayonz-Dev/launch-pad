// Shared visual constants for the login shell and app chrome, so every app on
// the platform reads the same. Kept as plain constants (not CSS variables) so
// the shell components are self contained and do not depend on any app's
// globals.css.
//
// Australian English. No em dashes.

export const theme = {
  paper: '#E8E9E3',
  panel: '#FBFBF8',
  ink: '#191C1F',
  ink2: '#5C605C',
  line: '#CFD0C8',
  teal: '#0F5257',
  amber: '#B67A1E',
  neg: '#A83227',
  mono: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace',
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
} as const;
