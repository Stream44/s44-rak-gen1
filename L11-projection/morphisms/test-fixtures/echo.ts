export default (x: unknown): unknown => x;
export const named = (x: unknown): unknown => ({ tagged: x });
