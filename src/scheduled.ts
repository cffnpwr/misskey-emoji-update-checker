import { api as MisskeyApi } from "misskey-js";
import { checkEmojiUpdate } from "./service/checkEmojiUpdate";
import { Env } from "./types";

export const scheduled = async (
  _event: ScheduledEvent,
  env: Env,
  _ctx: ExecutionContext,
) => {
  // 最終更新日時を取得
  const lastUpdated = await env.KV.get("last-updated");
  if (!lastUpdated) {
    console.error("Not initialized!!");

    return;
  }

  // Misskey APIクライアントを作成
  const mkApiClient = new MisskeyApi.APIClient({
    origin: env.MK_URL.replace(/\/$/, ""),
    credential: env.MK_TOKEN,
  });
  console.log("Misskey API client created");

  // 絵文字の更新をチェック
  await checkEmojiUpdate(
    mkApiClient,
    env.DB,
    env.BUCKET,
    env.IMAGE_BACKUP_BASE_URL,
    env.IMAGE_BACKUP_PATH,
    env.ENV === "dev",
  );

  env.KV.put("last-updated", new Date().toISOString());
};
