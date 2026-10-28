/** Backend text sometimes carries em dashes; the UI reads better with commas. */
export function tidy(text: string) {
  return text.replace(/\s*—\s*/g, ", ");
}
