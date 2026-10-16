export * from "./generated/api";
export * from "./generated/types";
// Routes with both path and query parameters get a Zod schema and a type with
// the same name; the Zod schema (path parameters) wins here.
export { GetProfilePostsParams } from "./generated/api";
