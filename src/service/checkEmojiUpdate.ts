import { type Endpoints, api as MisskeyApi } from "misskey-js";
import {
  type DBEmoji,
  type DBEmojis,
  EmojiRepository,
} from "../repository/emoji";

type MkEmojis = Endpoints["emojis"]["res"]["emojis"];

export const checkEmojiUpdate = async (
  apiClient: MisskeyApi.APIClient,
  d1: D1Database,
  R2Bucket: R2Bucket,
  imageBackupBaseURL: string,
  imageBackupPath: string,
  isDev: boolean,
) => {
  const updatedAtMs = Date.now();
  const updatedAt = new Date(updatedAtMs);
  const emojiRepository = new EmojiRepository(d1);
  const imageBackupURL = new URL(imageBackupPath, imageBackupBaseURL);
  const toRedirectURL = (url: string) =>
    new URL(`/redirect?to=${encodeURI(url)}`, imageBackupBaseURL).toString();

  // Misskeyのカスタム絵文字を取得
  const mkEmojis = (await apiClient.request("emojis", {})).emojis;
  mkEmojis.map((emoji, emojiIndex) => {
    mkEmojis[emojiIndex].aliases = emoji.aliases.filter(
      (alias) => alias.trim().length > 0,
    );
  });
  console.log("Misskey emojis fetched");

  // DBから絵文字の情報を取得
  const dbEmojis = await emojiRepository.list();
  console.log("DB emojis fetched");

  // カスタム絵文字の更新をチェック
  const added: MkEmojis = [];
  const deleted = [];
  const updated = [];

  for (const emoji of mkEmojis) {
    const index = dbEmojis.findIndex((e) => e.name === emoji.name);
    if (index === -1) {
      added.push(emoji);

      continue;
    }

    const dbEmoji = dbEmojis[index];
    dbEmojis.splice(index, 1);
    if (
      dbEmoji.url !== emoji.url ||
      dbEmoji.category !== emoji.category ||
      dbEmoji.aliases.sort().toString() !== emoji.aliases.sort().toString()
    ) {
      updated.push({ old: dbEmoji, new: emoji });
    }
  }
  deleted.push(...dbEmojis);
  if (added.length === 0 && deleted.length === 0 && updated.length === 0) {
    return;
  }
  console.log("Emoji update checked");

  // DBに反映
  const dbResult = await Promise.all([
    ...added.map((emoji) => emojiRepository.save({ ...emoji, updatedAt })),
    ...deleted.map((emoji) => emojiRepository.delete(emoji.name)),
    ...updated.map(({ new: newEmoji }) =>
      emojiRepository.save({ ...newEmoji, updatedAt }),
    ),
  ]);
  if (dbResult.some((result) => result.result === "err")) {
    for (const result of dbResult) {
      if (result.result === "err") {
        console.error(result.error);
      }
    }

    return;
  }
  console.log("Emoji update saved");

  // R2Bucketに画像を保存
  await Promise.all([
    ...added.map(async (emoji) => {
      const res = await fetch(emoji.url);
      const buf = await res.arrayBuffer();

      R2Bucket.put(`${emoji.name}-${updatedAtMs}`, buf);
    }),
    ...updated
      .filter(
        ({ old: oldEmoji, new: newEmoji }) => oldEmoji.url !== newEmoji.url,
      )
      .map(async ({ new: emoji }) => {
        const res = await fetch(emoji.url);
        const buf = await res.arrayBuffer();

        R2Bucket.put(`${emoji.name}-${updatedAtMs}`, buf);
      }),
  ]);
  console.log("Emoji images saved");

  // Misskeyで通知
  const messages = buildMessages(
    toRedirectURL,
    imageBackupURL,
    added,
    deleted,
    updated,
  );

  await Promise.all(
    messages.map(async (msg) => {
      await apiClient.request("notes/create", {
        text: msg,
        visibility: isDev ? "specified" : "public",
      });
    }),
  );

  console.log("Notifications sent");
};

const buildMessages = (
  toRedirectURL: (url: string) => string,
  imageBackupURL: URL,
  added: MkEmojis,
  deleted: DBEmojis,
  updated: { old: DBEmoji; new: MkEmojis[number] }[],
) => {
  const addedMessages = added.map(
    (emoji) =>
      `【絵文字追加】\n$[x2 :${emoji.name}:]\n\`:${
        emoji.name
      }:\`\n\nカテゴリ: ${emoji.category}\nエイリアス: ${
        emoji.aliases.length > 0 ? emoji.aliases.join(", ") : "[なし]"
      }\n?[画像](${toRedirectURL(emoji.url)})`,
  );

  const deletedMessages = deleted.map((emoji) => {
    const emojiBackupURL = new URL(
      `${emoji.name}-${emoji.updatedAt.toString().replaceAll(":", "-")}`,
      imageBackupURL,
    );

    return `【絵文字削除】\n\`:${emoji.name}:\`\n\nカテゴリ: ${
      emoji.category
    }\nエイリアス: ${
      emoji.aliases.length > 0 ? emoji.aliases.join(", ") : "[なし]"
    }\n?[画像](${toRedirectURL(
      emoji.url,
    )})\n画像が見れない場合はこちら: ?[画像バックアップ](${emojiBackupURL.toString()})`;
  });

  const updatedMessages = updated.map(({ old: oldEmoji, new: newEmoji }) => {
    let message = `【絵文字更新】\n$[x2 :${newEmoji.name}:]\n\`:${newEmoji.name}:\`\n\n`;
    if (oldEmoji.category !== newEmoji.category) {
      message += `カテゴリ: ${oldEmoji.category} → ${newEmoji.category}\n`;
    }
    if (
      oldEmoji.aliases.sort().toString() !== newEmoji.aliases.sort().toString()
    ) {
      message += `エイリアス: ${
        oldEmoji.aliases.length > 0 ? oldEmoji.aliases.join(", ") : "[なし]"
      } → ${
        newEmoji.aliases.length > 0 ? newEmoji.aliases.join(", ") : "[なし]"
      }\n`;
    }
    if (oldEmoji.url !== newEmoji.url) {
      const emojiBackupURL = new URL(
        `${oldEmoji.name}-${oldEmoji.updatedAt
          .toString()
          .replaceAll(":", "-")}`,
        imageBackupURL,
      );

      message += `?[旧画像](${toRedirectURL(
        oldEmoji.url,
      )}) → ?[画像](${toRedirectURL(
        newEmoji.url,
      )})\n旧画像が見れない場合はこちら: ?[旧画像バックアップ](${emojiBackupURL.toString()})`;
    }

    return message;
  });

  return [...addedMessages, ...deletedMessages, ...updatedMessages];
};
