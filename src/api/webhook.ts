import { Hono } from "hono";
import { Env, MisskeyWebhook } from "../types";

const app = new Hono<{ Bindings: Env }>();

app.post("/", async (c) => {
  const mkFollowURL = new URL("/api/following/create", c.env.MK_URL as string);
  const reqSecret = c.req.header("X-Misskey-Hook-Secret") ?? "";
  if (reqSecret !== c.env.MK_HOOK_SECRET) {
    return c.json({ msg: "invalid secret" }, 401);
  }

  const reqBody: MisskeyWebhook = await c.req.json();
  console.log(reqBody);

  switch (reqBody.type) {
    case "mention":
    case "reply": {
      // フォローしてと言われたらフォローする
      const regex = /(フォローして|follow me)/i;
      const noteText =
        (reqBody as MisskeyWebhook<"mention" | "reply">).body.note.text ?? "";

      if (!regex.test(noteText)) {
        return c.json({ msg: "no match" }, 200);
      }

      const userId = (reqBody as MisskeyWebhook<"mention" | "reply">).body.note
        .userId;

      const res = await fetch(mkFollowURL.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          i: c.env.MK_TOKEN,
          userId,
        }),
      });
      console.log(await res.json());

      break;
    }

    case "followed": {
      // フォローされたらフォローする
      const followee = (reqBody as MisskeyWebhook<"followed">).body.user.id;

      const res = await fetch(mkFollowURL.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          i: c.env.MK_TOKEN,
          userId: followee,
        }),
      });
      console.log(await res.json());

      break;
    }

    default:
      return c.json({ msg: "unsupported hook" }, 400);
  }

  return c.json({ msg: "followed" }, 200);
});

export const webhook = app;
