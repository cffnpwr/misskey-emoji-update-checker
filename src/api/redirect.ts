import { Hono } from "hono";
import { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => {
  console.log(c.req.url);
  const to = c.req.query("to");
  if (!to) {
    return c.html("<h1>Oops! Redirect URL not found.</h1>", 404);
  }

  return c.redirect(to);
});

export const redirect = app;
