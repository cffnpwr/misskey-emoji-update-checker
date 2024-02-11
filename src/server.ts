import { Hono } from "hono";
import { imageBackup } from "./api/imageBackup";
import { redirect } from "./api/redirect";
import { webhook } from "./api/webhook";
import { Env } from "./types";

const app = new Hono<{ Bindings: Env }>({
  getPath: (req, opts) => {
    if (
      opts?.env &&
      req.url
        .replace(/^https?:\/\/[^/]+(\/[^?]*)/, "$1")
        .startsWith(opts.env.IMAGE_BACKUP_PATH)
    ) {
      const fileName = req.url
        .replace(/^https?:\/\/[^/]+(\/[^?]*)/, "$1")
        .replace(opts.env.IMAGE_BACKUP_PATH, "");
      return `/image-backup/${fileName}`;
    }

    return req.url.replace(
      /^(([^:/?#]+):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/,
      "$5",
    );
  },
});

app.route("/redirect", redirect);
app.route("/hook", webhook);
app.route("/image-backup", imageBackup);

export const fetch = app.fetch;
