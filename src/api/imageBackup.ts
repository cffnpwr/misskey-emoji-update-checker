import { Hono } from "hono";
import { Env } from "../types";

const app = new Hono<{Bindings: Env}>();

app.get("/:file", async (c) => {
  console.log(c.req.url);
  const fileName = c.req.param("file");
  const file = await c.env.BUCKET.get(fileName);
  if (!file) {
    return c.html("<h1>Oops! File not found.</h1>", 404);
  }

  return c.body(await file.arrayBuffer());
});

export const imageBackup = app;
